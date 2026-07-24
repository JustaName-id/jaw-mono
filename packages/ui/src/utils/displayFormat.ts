// ============================================================================
// Shared value formatting for signing UIs.
// ----------------------------------------------------------------------------
// One home for the "make an integer human" rules so the raw EIP-712 tree and the
// clear-signed card render numbers, dates, and "unlimited"/"no expiry" sentinels
// identically. Core-free (viem only).
// ============================================================================

import { maxUint160, maxUint256 } from 'viem';

// Plausible unix-timestamp window (2000-01-01 .. 2100-01-01) for date detection.
export const TS_MIN = 946684800n;
export const TS_MAX = 4102444800n;

/** Thousands-separate a decimal number string ("1000000.5" → "1,000,000.5"), sign-aware. */
export function groupNumber(s: string): string {
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  const [intPart, fracPart] = body.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + (fracPart ? `${grouped}.${fracPart}` : grouped);
}

/** Largest value a `uint<bits>` can hold — used to spot "unlimited"/"no expiry" sentinels. */
export function maxUintFor(type: string): bigint | null {
  const m = /^uint(\d*)$/.exec(type);
  if (!m) return null;
  const bits = m[1] ? Number(m[1]) : 256;
  return (1n << BigInt(bits)) - 1n;
}

/** True when a raw amount is a common "unlimited approval" sentinel (uint256 / uint160 max). */
export function isUnlimitedAmount(raw: string | bigint | undefined | null): boolean {
  if (raw === undefined || raw === null || raw === '') return false;
  try {
    const v = typeof raw === 'bigint' ? raw : BigInt(raw);
    return v === maxUint256 || v === maxUint160;
  } catch {
    return false;
  }
}

/** True when a value plausibly encodes a unix-seconds timestamp. */
export function isUnixTimestamp(n: bigint): boolean {
  return n >= TS_MIN && n <= TS_MAX;
}

export type DateTone = 'expired' | 'far' | 'normal';

// A deadline more than ~1 year out is "far" — a soft warning for unusually long-lived
// approvals/permits (a max-uint sentinel is handled separately as "No expiry").
const ONE_YEAR_SECONDS = 31_536_000n;

/**
 * Classify a unix-seconds deadline relative to now:
 *  - `expired` — already in the past (a signature with this deadline is unexecutable → warn)
 *  - `far`     — more than a year out (soft warn)
 *  - `normal`  — within the next year
 */
export function dateTone(raw: string | bigint): DateTone {
  let n: bigint;
  try {
    n = typeof raw === 'bigint' ? raw : BigInt(raw);
  } catch {
    return 'normal';
  }
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (n < now) return 'expired';
  if (n > now + ONE_YEAR_SECONDS) return 'far';
  return 'normal';
}

/** Format unix seconds as "1 Jan 2030" (day-first, abbreviated month). Falls back to the grouped integer. */
export function formatUnixDate(raw: string | bigint): string {
  let n: bigint;
  try {
    n = typeof raw === 'bigint' ? raw : BigInt(raw);
  } catch {
    return String(raw);
  }
  const d = new Date(Number(n) * 1000);
  if (Number.isNaN(d.getTime())) return groupNumber(n.toString());
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
