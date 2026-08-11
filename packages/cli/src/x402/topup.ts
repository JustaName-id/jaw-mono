import { encodeFunctionData, erc20Abi } from 'viem';
import { usdcForNetwork } from './asset-registry.js';
import { usdcBalance, type BalanceReader } from './balance.js';
import { parseBigInt } from './amount.js';
import { errorMessage } from '../lib/errors.js';
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
  /**
   * Upper bound on a single top-up (base units) — the session spend cap. The
   * payer must never be pre-funded with more than the whole session could ever
   * spend: that would be idle funds at risk with no benefit, weakening the
   * blast-radius guarantee. The float is clamped to this; the shortfall itself
   * can't exceed it because the payment already passed the per-payment cap.
   */
  maxTopUp?: bigint;
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

  const price = parseBigInt(requirement.amount);
  if (price === null) {
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
  let amount = target - balance > shortfall ? target - balance : shortfall;
  // Never pre-fund the payer past the session's total spend cap. The shortfall
  // is always <= this bound (the payment cleared the per-payment cap), so a
  // clamp only ever trims float excess, never the amount needed to pay.
  if (opts.maxTopUp !== undefined && amount > opts.maxTopUp) {
    amount = opts.maxTopUp > shortfall ? opts.maxTopUp : shortfall;
  }

  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [payerAddress, amount],
  });

  let batchId: string;
  try {
    // Account.sendCalls resolves to `{ id, chainId }` (EIP-5792 shape); accept
    // a bare string too so the funder doesn't couple to one bridge version.
    const sent = await executor.request('wallet_sendCalls', [{ calls: [{ to: asset.address, data }] }]);
    const id = typeof sent === 'string' ? sent : (sent as { id?: string } | null)?.id;
    if (!id) {
      return { ok: false, reason: 'top-up submitted but no call id returned; cannot confirm it' };
    }
    batchId = id;
  } catch (err) {
    // The permission is the security boundary: a revert here means it said no.
    // The two common causes read very differently to a user, so hint at both:
    // the granted permission must both allow a USDC transfer to the payer
    // (calls whitelist) and have budget left (spend allowance).
    const msg = errorMessage(err);
    return {
      ok: false,
      reason:
        `top-up refused on-chain (${msg}). The session permission must allow a USDC ` +
        `transfer to the payer and still have spend allowance this period; check the grant ` +
        `from \`jaw session setup\` or the remaining cap.`,
    };
  }

  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const pollMs = opts.pollMs ?? 2_000;
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const deadline = now() + timeoutMs;

  for (;;) {
    let status: CallStatus;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Race the status read against the remaining deadline: a hung bundler
      // socket would otherwise never let the loop reach the deadline check
      // below, wedging the payment (and, through the mutex, all payments).
      // The loser of a race is never cancelled, so the timer needs its own
      // handle and a clearTimeout: left armed it holds the event loop open,
      // and the CLI would sit for the rest of the timeout with `Paid.` already
      // on screen (oclif does not force-exit on the success path).
      const remaining = Math.max(deadline - now(), 0);
      const expired = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`status check timed out after ${timeoutMs}ms`)), remaining);
      });
      status = (await Promise.race([executor.request('wallet_getCallsStatus', batchId), expired])) as CallStatus;
    } catch (err) {
      const msg = errorMessage(err);
      return { ok: false, reason: `top-up status check failed: ${msg}`, amount: amount.toString(), batchId };
    } finally {
      clearTimeout(timer);
    }

    const final = isFinalStatus(status);
    if (final === 'ok') {
      return { ok: true, amount: amount.toString(), batchId };
    }
    if (final === 'failed') {
      return {
        ok: false,
        reason: 'top-up transaction failed on-chain (spending cap reached, or permission expired/revoked)',
        amount: amount.toString(),
        batchId,
      };
    }
    if (now() >= deadline) {
      return { ok: false, reason: `top-up not confirmed after ${timeoutMs}ms`, amount: amount.toString(), batchId };
    }
    await sleep(pollMs);
  }
}
