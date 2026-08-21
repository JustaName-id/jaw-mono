import { encodeFunctionData, erc20Abi } from 'viem';
import { usdcForNetwork } from './asset-registry.js';
import { usdcBalance, type BalanceReader } from './balance.js';
import { parseBigInt } from './amount.js';
import { gasReserve } from './gas-reserve.js';
import { errorMessage } from '../lib/errors.js';
import type { X402PaymentRequirement } from './types.js';

/**
 * Permission top-up (flow 2b): when the session payer EOA can't cover a
 * payment, refill it from the user's account through the granted on-chain
 * permission, then let the normal EIP-3009 payment run.
 *
 * The transfer executes as the session smart account via
 * `wallet_sendCalls(permissionId)`. `JustaPermissionManager` enforces the
 * per-token, per-period cap on-chain, so the user's keys and wallet are never
 * involved: the agent only ever receives what the permission releases.
 *
 * Gas for that transfer is charged by the ERC-20 paymaster to whoever sends the
 * userOp, which is the permission's spender, and the spender is the payer: a
 * session is one address. So every refill carries `gasReserve` on top of what
 * the payment needs, leaving the fee something to come out of and the next
 * refill something to be charged for. The first one is covered by the grant,
 * which sends the same amount to the session when the permission is approved.
 *
 * The reserve doubles as a float, since payments spend it too. A long run of
 * prices well under it can drain it, and the refill that follows is charged
 * like any other: there is nothing left that would sponsor it instead.
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
   * Upper bound on a single top-up (base units) — what is left of the tightest
   * spend cap. The payer must never be pre-funded with more than the session
   * could still spend: that would be idle funds at risk with no benefit,
   * weakening the blast-radius guarantee. Only the float is clamped to it; the
   * shortfall goes through even when the remaining cap is below it, so a
   * near-exhausted period never turns an affordable price into a refusal.
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

function isFinalStatus(s: CallStatus | undefined): 'ok' | 'failed' | 'pending' {
  // The bridge resolves to `undefined` when the in-memory store misses and the
  // receipt lookup throws (Account.getCallStatus). This runs after the transfer
  // is already broadcast, so a TypeError here loses the audit row that meters
  // the period cap, and the next ceiling stays permissive.
  if (!s) return 'pending';
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
  // The payer is the account this userOp is sent from, so it is the one the
  // ERC-20 paymaster charges, in postOp and right after this transfer lands.
  // Pulling only what the payment costs leaves nothing for the fee, so the fee
  // comes out of the payment and the payment itself lands short. The reserve
  // rides along and stays behind, so the next refill has something to be
  // charged against.
  let amount = (target - balance > shortfall ? target - balance : shortfall) + gasReserve(asset);
  // Never pre-fund the payer past what the caps still allow, and never let that
  // clamp cut into the shortfall: pulling a float the permission would reject
  // turns an affordable payment into a refusal, so only the float excess goes.
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
      // Broadcast already happened, so carry the amount even with no id to
      // confirm it by: the caller gates its audit row on having one or the
      // other, and funds that moved have to reach the ledger.
      return {
        ok: false,
        reason: 'top-up submitted but no call id returned; cannot confirm it',
        amount: amount.toString(),
      };
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
