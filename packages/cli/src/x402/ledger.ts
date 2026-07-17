import * as fs from 'node:fs';
import { PATHS } from '../lib/paths.js';
import { ensureDir } from '../lib/config.js';

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
  /** Reason for a refused/failed attempt. */
  reason?: string;
}

/** Append one entry. Never throws — logging must not break a payment. */
export function appendX402Log(entry: X402LogEntry): void {
  try {
    ensureDir(PATHS.root);
    fs.appendFileSync(PATHS.x402Log, JSON.stringify(entry) + '\n', { encoding: 'utf-8', mode: 0o600 });
  } catch {
    /* ignore — an unwritable ledger must not fail the payment */
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
