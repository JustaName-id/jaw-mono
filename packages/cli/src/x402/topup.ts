import { encodeFunctionData } from 'viem';
import { usdcForNetwork } from './asset-registry.js';
import { usdcBalance, type BalanceReader } from './balance.js';
import type { X402PaymentRequirement } from './types.js';

/**
 * Permission top-up (flow 2b): when the session payer EOA can't cover a
 * payment, refill it from the user's account through the granted on-chain
 * permission, then let the normal EIP-3009 payment run.
 *
 * The transfer executes as the session smart account via
 * `wallet_sendCalls(permissionId)` — `JustaPermissionManager` enforces the
 * per-token, per-period cap on-chain and the paymaster covers gas, so the
 * user's keys and wallet are never involved: the agent only ever receives
 * what the permission releases.
 */

/** The slice of the session auto-mode bridge the funder needs. */
export interface TopUpExecutor {
  request(method: string, params?: unknown): Promise<unknown>;
}

export interface TopUpOptions {
  /**
   * The chain the session (and its permission) lives on. When set, a payment
   * on any other chain refuses to top up instead of executing a transfer on
   * the wrong chain — an ERC-20 call to an address with no code there would
   * "succeed" without moving anything.
   */
  sessionChainId?: number;
  /**
   * Refill target in base units. When set, a needed top-up brings the payer
   * balance up to this float (fewer on-chain hops for bursts of payments);
   * when unset, the top-up is exactly the shortfall (minimum idle funds).
   */
  floatTarget?: bigint;
  /** Poll interval for the call status, ms. */
  pollMs?: number;
  /** Give up waiting for confirmation after this long, ms. */
  timeoutMs?: number;
  /** Injected for tests. */
  balanceReader?: BalanceReader;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface TopUpOutcome {
  ok: boolean;
  /** True when the balance already covered the price and nothing ran. */
  skipped?: boolean;
  /** Base units transferred, when a top-up ran. */
  amount?: string;
  /** wallet_sendCalls batch id, when a top-up ran. */
  batchId?: string;
  /** Human-readable refusal when ok=false. Never throws for policy-shaped failures. */
  reason?: string;
}

const ERC20_TRANSFER_ABI = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

interface CallStatus {
  status?: number | string;
}

function isFinalStatus(s: CallStatus): 'ok' | 'failed' | 'pending' {
  const v = s.status;
  // EIP-5792: 100 = pending, 200 = confirmed, >= 400 = failure.
  if (v === 200 || v === '200' || v === 'CONFIRMED') return 'ok';
  if (v === 100 || v === '100' || v === 'PENDING' || v === undefined) return 'pending';
  return 'failed';
}

/**
 * Ensure the payer EOA can cover `requirement.amount`, topping it up through
 * the on-chain permission when it can't. Designed as the `ensureFunds` hook of
 * `payAndFetch`: runs after the policy approved the requirement and before the
 * payment is signed.
 */
export async function ensurePayerFunds(
  requirement: X402PaymentRequirement,
  payerAddress: `0x${string}`,
  executor: TopUpExecutor,
  opts: TopUpOptions = {}
): Promise<TopUpOutcome> {
  const asset = usdcForNetwork(requirement.network);
  if (!asset) {
    // Unsupported networks are the scheme validator's problem, not the funder's.
    return { ok: true, skipped: true };
  }

  if (requirement.asset && requirement.asset.toLowerCase() !== asset.address.toLowerCase()) {
    // The requirement wants a token we don't know how to fund; let the scheme
    // validation refuse it rather than topping up the wrong asset.
    return { ok: true, skipped: true };
  }

  if (opts.sessionChainId !== undefined && opts.sessionChainId !== asset.chainId) {
    return {
      ok: false,
      reason:
        `session is on chain ${opts.sessionChainId} but the payment needs chain ${asset.chainId}; ` +
        `run \`jaw session setup --chain ${asset.chainId}\` to pay on this network`,
    };
  }

  let price: bigint;
  try {
    price = BigInt(requirement.amount);
  } catch {
    return { ok: false, reason: `non-numeric payment amount: ${requirement.amount}` };
  }

  const read = opts.balanceReader;
  const balance = read
    ? await read(asset, payerAddress)
    : BigInt((await usdcBalance(requirement.network, payerAddress)).raw);

  if (balance >= price) {
    return { ok: true, skipped: true };
  }

  const shortfall = price - balance;
  const target = opts.floatTarget !== undefined && opts.floatTarget > price ? opts.floatTarget : price;
  const amount = target - balance > shortfall ? target - balance : shortfall;

  const data = encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: 'transfer',
    args: [payerAddress, amount],
  });

  let batchId: string;
  try {
    // Account.sendCalls resolves to `{ id, chainId }` (EIP-5792 shape); accept
    // a bare string too so the funder doesn't couple to one bridge version.
    const sent = await executor.request('wallet_sendCalls', [
      { calls: [{ to: asset.address, data }] },
    ]);
    const id = typeof sent === 'string' ? sent : (sent as { id?: string } | null)?.id;
    if (!id) {
      return { ok: false, reason: 'top-up submitted but no call id returned; cannot confirm it' };
    }
    batchId = id;
  } catch (err) {
    // The permission is the security boundary: an execution revert here is,
    // in practice, the on-chain cap or an expired/revoked permission saying no.
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `top-up refused on-chain: ${msg}` };
  }

  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const pollMs = opts.pollMs ?? 2_000;
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const deadline = now() + timeoutMs;

  for (;;) {
    let status: CallStatus;
    try {
      status = (await executor.request('wallet_getCallsStatus', batchId)) as CallStatus;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, reason: `top-up status check failed: ${msg}`, batchId };
    }

    const final = isFinalStatus(status);
    if (final === 'ok') {
      return { ok: true, amount: amount.toString(), batchId };
    }
    if (final === 'failed') {
      return {
        ok: false,
        reason: 'top-up transaction failed on-chain (spending cap reached, or permission expired/revoked)',
        batchId,
      };
    }
    if (now() >= deadline) {
      return { ok: false, reason: `top-up not confirmed after ${timeoutMs}ms`, batchId };
    }
    await sleep(pollMs);
  }
}
