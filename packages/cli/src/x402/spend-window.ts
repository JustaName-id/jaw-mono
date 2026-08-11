import { currentPeriodWindow, type PeriodWindow } from './period.js';
import { sumSpentSince } from './ledger.js';
import type { X402Policy } from './policy.js';

export interface PeriodSpend {
  /** The grant period containing `now`, clamped at the permission's expiry. */
  window: PeriodWindow;
  /** Base units the payer already spent inside that window. */
  spent: bigint;
}

/**
 * Locate the grant period containing now and total what the payer already spent
 * inside it. Null when the policy carries no period (no grant, or a grant whose
 * unit was not recorded), in which case only the session cap applies.
 *
 * Shared rather than computed per front end: a path that resolved a per-period
 * cap but skipped this checked every payment against a fresh allowance, which is
 * no cap at all once the first period's spend is on the ledger. Re-read on every
 * call, never cached, for the same reason the session total is: another process
 * holding the payment lock may have spent inside this window too.
 */
export function currentPeriodSpend(
  policy: X402Policy,
  payerAddress: string,
  session: { expiry: number } | null | undefined,
  now: Date = new Date()
): PeriodSpend | null {
  if (!session || !policy.period || policy.maxPerPeriod === undefined) return null;
  const anchorMs = Date.parse(policy.period.anchor);
  // A hand-edited anchor must degrade to "no period window", never throw and
  // take down every payment.
  if (Number.isNaN(anchorMs)) return null;
  const window = currentPeriodWindow({
    anchor: Math.floor(anchorMs / 1000),
    unit: policy.period.unit,
    multiplier: policy.period.multiplier,
    now: Math.floor(now.getTime() / 1000),
    permissionEnd: session.expiry,
  });
  return {
    window,
    spent: sumSpentSince(payerAddress, new Date(window.start * 1000).toISOString()),
  };
}
