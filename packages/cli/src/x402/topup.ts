import { encodeFunctionData, erc20Abi } from 'viem';
import { usdcForNetwork, type UsdcAsset } from './asset-registry.js';
import { publicClientFor, usdcBalance, type BalanceReader } from './balance.js';
import { PERMIT2_ADDRESS } from './permit2.js';
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
  /**
   * Approve Permit2 to move `token` on the payer's own behalf, returning the
   * batch id. Deliberately narrow and deliberately separate from `request`: it
   * is the one call the session makes outside its permission, so it takes a
   * token and nothing else, and it cannot be used to send anything but that
   * approval. Optional so an executor that never pays `upto` need not have it.
   */
  approvePermit2?: GrantApproval;
}

/**
 * Grant Permit2 the allowance, returning the batch id. Named because the
 * allowance check hands it back once it has established the session can do it,
 * which keeps the caller from having to assert it a second time.
 */
export type GrantApproval = (token: `0x${string}`) => Promise<string>;

/** Reads an ERC-20 allowance. Injected for tests. */
export type AllowanceReader = (asset: UsdcAsset, owner: `0x${string}`, spender: `0x${string}`) => Promise<bigint>;

const readAllowance: AllowanceReader = (asset, owner, spender) =>
  publicClientFor(asset.chainId).readContract({
    address: asset.address,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner, spender],
  });

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
  allowanceReader?: AllowanceReader;
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
  /**
   * Batch id of the Permit2 approval, when one was granted. Its own field
   * because it is a real userOp charged to the payer's USDC and it can happen
   * with no top-up beside it, so folding it into `batchId` would either erase
   * it or make a top-up look like it ran. It moves no principal, so nothing
   * that totals topped-up base units may read it.
   */
  approvalBatchId?: string;
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

  // Whether Permit2 still needs an allowance is read here, before the balance,
  // because the answer changes how much the payer needs. Granting it is a
  // userOp the payer pays for out of its own USDC, so it has to happen AFTER
  // the top-up, not before: the top-up is lazy, a payer that has not paid yet
  // sits at zero, and approving first meant the approval could not be priced
  // and the payment was refused without ever reaching the funding that would
  // have covered it.
  let grantApproval: GrantApproval | null = null;
  if (requirement.scheme === 'upto') {
    const status = await permit2ApprovalStatus(asset, payerAddress, price, executor, opts);
    if (!status.ok) return { ok: false, reason: status.reason };
    grantApproval = status.grant;
  }

  const read = opts.balanceReader;
  const balance = read
    ? await read(asset, payerAddress)
    : BigInt((await usdcBalance(requirement.network, payerAddress)).raw);

  // A payer holding exactly the price can pay it and nothing else, so when an
  // approval is still owed the bar is the price plus something to be charged
  // against. The reserve is 0.1 USDC against roughly 0.01 an operation, so one
  // covers the approval with room to spare.
  const needed = grantApproval ? price + gasReserve(asset) : price;

  if (balance >= needed) {
    if (grantApproval) {
      const granted = await grantPermit2Allowance(asset, grantApproval, executor, opts);
      // `skipped` says no principal moved, which stays true, but the approval
      // is a userOp the user paid for and it belongs in the trace either way.
      if (!granted.ok) return { ok: false, reason: granted.reason, approvalBatchId: granted.batchId };
      return { ok: true, skipped: true, approvalBatchId: granted.batchId };
    }
    return { ok: true, skipped: true };
  }

  const shortfall = needed - balance;
  const target = opts.floatTarget !== undefined && opts.floatTarget > needed ? opts.floatTarget : needed;
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

  const confirmed = await awaitCall(executor, batchId, opts, {
    subject: 'top-up',
    onChainFailure: 'top-up transaction failed on-chain (spending cap reached, or permission expired/revoked)',
  });
  if (!confirmed.ok) {
    return { ok: false, reason: confirmed.reason, amount: amount.toString(), batchId };
  }

  // Past this line the transfer landed, so the refusal below still carries the
  // trace: the caller writes its audit row from these fields, and money that
  // moved has to reach the ledger whatever happens next.
  let approvalBatchId: string | undefined;
  if (grantApproval) {
    const granted = await grantPermit2Allowance(asset, grantApproval, executor, opts);
    approvalBatchId = granted.batchId;
    if (!granted.ok) {
      return { ok: false, reason: granted.reason, amount: amount.toString(), batchId, approvalBatchId };
    }
  }

  return { ok: true, amount: amount.toString(), batchId, approvalBatchId };
}

/**
 * Whether Permit2 still needs an allowance from this payer, and whether this
 * session is in a position to grant one. Split from the granting below because
 * the answer is needed before the balance branch: the approval is a userOp the
 * payer pays for, so it decides how much the top-up has to pull.
 *
 * `upto` settles through Permit2 rather than by EIP-3009, and Permit2 pulls the
 * token through the canonical ERC-20 allowance. Without it the proxy cannot
 * execute what the payer signed, so the payment fails at settlement and, by the
 * ledger's rule, reserves its whole ceiling against the cap for nothing.
 *
 * Granted lazily and not at `jaw session setup`, because most sessions never
 * touch an `upto` endpoint and a mandatory extra userOp would tax the common
 * path for a feature it will not use. Granted for the maximum, because the
 * alternative is an approval userOp before every payment, and the blast radius
 * either way is the payer's float, which the top-up already keeps small.
 *
 * It is the one call the session sends outside its permission, and it has to
 * be: `JustaPermissionManager` validates every call's selector against the
 * grant and the x402 grant permits `transfer` only, so an approval routed
 * through the permission reverts. Sent by the payer on its own balance it never
 * reaches the manager, whose approval revocation and Permit2 lockdown both act
 * on the granting account and only within their own execution.
 */
async function permit2ApprovalStatus(
  asset: UsdcAsset,
  payerAddress: `0x${string}`,
  needed: bigint,
  executor: TopUpExecutor,
  opts: TopUpOptions
): Promise<{ ok: true; grant: GrantApproval | null } | { ok: false; reason: string }> {
  const read = opts.allowanceReader ?? readAllowance;
  let allowance: bigint;
  try {
    allowance = await read(asset, payerAddress, PERMIT2_ADDRESS);
  } catch (err) {
    return { ok: false, reason: `could not read the payer's Permit2 allowance: ${errorMessage(err)}` };
  }
  if (allowance >= needed) return { ok: true, grant: null };

  // Refused here rather than after the top-up: a session that cannot grant the
  // allowance cannot pay this challenge at all, and moving funds first would
  // spend the permission's budget on a payment that was never going to happen.
  if (!executor.approvePermit2) {
    return {
      ok: false,
      reason:
        `the payer has not approved Permit2 to move ${asset.address}, and this session cannot grant it. ` +
        'Approve Permit2 once on this chain to pay upto challenges.',
    };
  }

  // Handed back rather than re-read later, so the type carries what the check
  // established: past here, granting is something this session can do.
  return { ok: true, grant: executor.approvePermit2 };
}

/** Send the approval and wait for it. Only called once the payer can pay for it. */
async function grantPermit2Allowance(
  asset: UsdcAsset,
  grant: GrantApproval,
  executor: TopUpExecutor,
  opts: TopUpOptions
): Promise<{ ok: boolean; reason?: string; batchId?: string }> {
  let batchId: string;
  try {
    batchId = await grant(asset.address);
  } catch (err) {
    return { ok: false, reason: `Permit2 approval refused: ${errorMessage(err)}` };
  }

  const confirmed = await awaitCall(executor, batchId, opts, {
    subject: 'Permit2 approval',
    onChainFailure: `Permit2 approval failed on-chain (batch ${batchId})`,
  });
  // The id rides on the refusal too: the approval was broadcast either way, and
  // a confirmation timeout is exactly when someone needs it to go looking.
  return confirmed.ok ? { ok: true, batchId } : { ok: false, reason: confirmed.reason, batchId };
}

/**
 * Poll a submitted batch to a final state.
 *
 * Shared by the top-up and the Permit2 approval because both are userOps the
 * payment cannot proceed without, and both have the same two ways of going
 * wrong. The subject is threaded through so the reason still names which one
 * failed, and the on-chain failure text is passed in because the causes differ:
 * a top-up is refused by the permission, an approval is not sent through one.
 */
async function awaitCall(
  executor: TopUpExecutor,
  batchId: string,
  opts: TopUpOptions,
  labels: { subject: string; onChainFailure: string }
): Promise<{ ok: boolean; reason?: string }> {
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
      return { ok: false, reason: `${labels.subject} status check failed: ${errorMessage(err)}` };
    } finally {
      clearTimeout(timer);
    }

    const final = isFinalStatus(status);
    if (final === 'ok') return { ok: true };
    if (final === 'failed') return { ok: false, reason: labels.onChainFailure };
    if (now() >= deadline) {
      return { ok: false, reason: `${labels.subject} not confirmed after ${timeoutMs}ms` };
    }
    await sleep(pollMs);
  }
}
