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
  amount?: string;
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
 * Sum a payer's settled and attempted payments since an ISO instant (its whole
 * history when `since` is omitted).
 *
 * The single definition of what counts against a spend cap. Reading it from the
 * ledger rather than an in-memory counter is what makes a cap survive a process
 * restart, which an agent could otherwise relaunch its way past. Every caller
 * that enforces or reports a cap must go through here: three copies of this rule
 * had already drifted apart from each other by hand.
 */
export function sumSpentSince(payerAddress: string, since?: string): bigint {
  const payer = payerAddress.toLowerCase();
  return readX402Log().reduce((total, entry) => {
    // 'failed' counts too: the authorization was signed and sent, so in pull
    // mode the facilitator may have broadcast the transfer anyway. Counting it
    // can only under-spend the cap, never breach it.
    if ((entry.status !== 'paid' && entry.status !== 'failed') || !entry.amount) return total;
    if (entry.payer?.toLowerCase() !== payer) return total;
    if (since && entry.at < since) return total;
    try {
      return total + BigInt(entry.amount);
    } catch {
      return total; // a hand-edited amount must not take the cap down
    }
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
