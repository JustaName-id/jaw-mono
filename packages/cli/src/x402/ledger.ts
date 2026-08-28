import * as fs from 'node:fs';
import { PATHS } from '../lib/paths.js';
import { ensureDir } from '../lib/config.js';
import { errorMessage } from '../lib/errors.js';

/**
 * One line of the append-only x402 payment ledger (`~/.jaw/x402-log.jsonl`).
 * Every payment attempt an agent makes is recorded so spend is auditable and an
 * ambiguous settlement can be reconciled by nonce/txHash after the fact.
 */
export interface X402LogEntry {
  /** ISO timestamp of the attempt. */
  at: string;
  url: string;
  /** The paying EOA. */
  payer: string;
  /** paid = settled; failed = signed+sent but settlement failed; refused = never signed. */
  status: 'paid' | 'failed' | 'refused';
  /**
   * What actually left the payer. Under `exact` that is the amount signed for.
   * Under `upto` the server chooses it at settlement, anywhere from zero up to
   * `authorized`, and the receipt is the only place it exists.
   */
  amount?: string;
  /**
   * The ceiling the signature authorized, which is what a live authorization is
   * worth to whoever holds it. Equal to `amount` under `exact`. Absent on
   * entries written before the field existed, where `amount` was both.
   */
  authorized?: string;
  /**
   * When the authorization expires. Recorded but not yet read: reconciling a
   * failed payment means proving its nonce was never consumed and its deadline
   * has passed, and that check cannot be written against entries that never
   * stored the deadline.
   */
  deadline?: string;
  asset?: string;
  network?: string;
  payTo?: string;
  nonce?: string;
  txHash?: string;
  /** Base units refilled into the payer through the permission, when a top-up ran. */
  topUpAmount?: string;
  /** wallet_sendCalls id of that top-up, for on-chain reconciliation. */
  topUpBatchId?: string;
  /** Reason for a refused/failed attempt. */
  reason?: string;
}

/**
 * Append one entry. Never throws — logging must not break a payment.
 *
 * The newline is a PREFIX, not a suffix: a torn write (crash/ENOSPC mid-append)
 * then leaves an incomplete line that the NEXT append starts on a fresh line
 * instead of concatenating onto, so one bad write loses at most its own record,
 * never the following one too.
 *
 * A write failure is surfaced to stderr (not thrown): the caller's payment
 * still succeeds, but the operator needs to know the audit trail — and the
 * restart-time spend-cap seed that reads it — just lost an entry.
 */
export function appendX402Log(entry: X402LogEntry): void {
  try {
    ensureDir(PATHS.root);
    fs.appendFileSync(PATHS.x402Log, '\n' + JSON.stringify(entry), { encoding: 'utf-8', mode: 0o600 });
  } catch (err) {
    const msg = errorMessage(err);
    process.stderr.write(`[jaw] warning: failed to write x402 ledger (${msg}); spend audit/cap may undercount\n`);
  }
}

/**
 * Read the ledger, oldest first. `limit` returns only the most recent N entries.
 * Malformed lines are skipped; a missing file is an empty log.
 */
export function readX402Log(limit?: number): X402LogEntry[] {
  let raw: string;
  try {
    raw = fs.readFileSync(PATHS.x402Log, 'utf-8');
  } catch {
    return [];
  }
  const entries = raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      try {
        return JSON.parse(line) as X402LogEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is X402LogEntry => e !== null);
  return limit && limit > 0 ? entries.slice(-limit) : entries;
}

/**
 * What one row contributes to a spend cap.
 *
 * The single definition of the rule, exported because more than one place needs
 * it and the three copies that existed before this had already drifted apart by
 * hand. `jaw x402 log` reports against it, and the caps enforce against it, so
 * the number a user reads and the number that refuses their next payment are
 * the same number.
 *
 * A settled payment costs what settled. A failed one costs the ceiling it
 * authorized, because an authorization that was signed and sent stays spendable
 * up to that ceiling until its nonce is consumed or its deadline passes, and
 * nothing yet proves either. Under `exact` the two figures are equal and this
 * is the rule that has always applied.
 *
 * Every parse failure reads as zero and the failed case takes the larger of the
 * two, so one unparseable field cannot shrink an enforced cap: a torn write or a
 * hand edit can only ever leave the cap where it was or higher. Negatives clamp
 * for the same reason, since `BigInt('-5')` parses fine and would otherwise
 * subtract.
 */
export function spendFigureOf(entry: X402LogEntry): bigint {
  if (entry.status !== 'paid' && entry.status !== 'failed') return 0n;
  const parse = (value?: string): bigint => {
    if (!value) return 0n;
    try {
      const parsed = BigInt(value);
      return parsed > 0n ? parsed : 0n;
    } catch {
      return 0n;
    }
  };
  if (entry.status === 'paid') return parse(entry.amount);
  const ceiling = parse(entry.authorized);
  const charge = parse(entry.amount);
  return ceiling > charge ? ceiling : charge;
}

/**
 * Sum a payer's settled and attempted payments since an ISO instant (its whole
 * history when `since` is omitted).
 *
 * Reading it from the ledger rather than an in-memory counter is what makes a
 * cap survive a process restart, which an agent could otherwise relaunch its way
 * past. What each row costs is `spendFigureOf`.
 */
export function sumSpentSince(payerAddress: string, since?: string): bigint {
  const payer = payerAddress.toLowerCase();
  return readX402Log().reduce((total, entry) => {
    if (entry.payer?.toLowerCase() !== payer) return total;
    if (since && entry.at < since) return total;
    return total + spendFigureOf(entry);
  }, 0n);
}

/**
 * Sum what a payer pulled through the permission since an ISO instant (its whole
 * history when `since` is omitted).
 *
 * Distinct from `sumSpentSince` because the two meter different things: the
 * on-chain allowance is drawn down by the top-up, not by the payment it later
 * funds. With a `topUpFloat` the two run apart by whatever is still sitting in
 * the payer, so measuring the granted per-period cap by payments reads a
 * permission as having more left than it does.
 *
 * Every status counts, refusals included: the pull settled on-chain before the
 * payment it was for was ever attempted, so the allowance is gone either way.
 */
export function sumToppedUpSince(payerAddress: string, since?: string): bigint {
  const payer = payerAddress.toLowerCase();
  return readX402Log().reduce((total, entry) => {
    if (!entry.topUpAmount) return total;
    if (entry.payer?.toLowerCase() !== payer) return total;
    if (since && entry.at < since) return total;
    try {
      return total + BigInt(entry.topUpAmount);
    } catch {
      return total; // a hand-edited amount must not take the cap down
    }
  }, 0n);
}
