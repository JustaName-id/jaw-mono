import { formatUsdc } from './status-report.js';
import { usdcForNetwork } from './asset-registry.js';
import type { X402LogEntry } from './ledger.js';

/**
 * Rendering for `jaw x402 log`, kept apart from the command so the accounting in
 * the summary can be tested without a ledger file on disk.
 */

/** Scale by the network the entry was denominated in, not a global assumption. */
export function decimalsOf(entry: X402LogEntry): number {
  return (entry.network ? usdcForNetwork(entry.network)?.decimals : undefined) ?? 6;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function renderEntry(entry: X402LogEntry): string {
  const when = entry.at.replace('T', ' ').slice(0, 19);
  const amount = entry.amount ? formatUsdc(entry.amount, decimalsOf(entry)) : '';
  const head = `  ${when}  ${entry.status.padEnd(7)}  ${amount.padStart(12)}  ${hostOf(entry.url)}`;

  const detail: string[] = [];
  // A top-up moved user funds through the permission. Always visible, even on an
  // attempt that then failed, since that money left the account regardless.
  if (entry.topUpAmount) {
    detail.push(`topped up ${formatUsdc(entry.topUpAmount, decimalsOf(entry))}`);
  }
  if (entry.txHash) detail.push(entry.txHash);
  // A failed settlement may still have been broadcast: the nonce is what makes
  // it reconcilable on chain, so surface it exactly where it is ambiguous.
  if (entry.status === 'failed' && entry.nonce) detail.push(`nonce ${entry.nonce}`);
  if (entry.reason) detail.push(entry.reason);

  return detail.length > 0 ? `${head}\n${' '.repeat(24)}${detail.join('  ')}` : head;
}

export function renderSummary(entries: X402LogEntry[]): string {
  const counts = { paid: 0, failed: 0, refused: 0 };
  // Only settled and attempted payments count as money out; a refusal never
  // signed anything. Same rule the spend caps use.
  let spent = 0n;
  for (const entry of entries) {
    counts[entry.status] += 1;
    if ((entry.status === 'paid' || entry.status === 'failed') && entry.amount) {
      try {
        spent += BigInt(entry.amount);
      } catch {
        /* a hand-edited amount must not break the summary */
      }
    }
  }

  const decimals = entries.map(decimalsOf).at(-1) ?? 6;
  const parts = [`${counts.paid} paid`];
  if (counts.failed > 0) parts.push(`${counts.failed} failed`);
  if (counts.refused > 0) parts.push(`${counts.refused} refused`);
  return `  ${parts.join(', ')}, ${formatUsdc(spent.toString(), decimals)} out`;
}
