/**
 * How much a spend limit can move over the whole life of a permission.
 *
 * The grant screen shows a rate: "10 USDC /day". That is not what is being
 * approved. What is being approved is that rate for as long as the permission
 * lives, and the grant carries its own expiry, so a 30-day one authorises 300.
 * The larger figure appears nowhere in the product, which is why a permission
 * asking for a million reads as tidily as one asking for ten.
 */

/**
 * Window lengths in seconds, matching `PeriodUnit` in `JustaPermissionManager`.
 *
 * A month there is a calendar month, so 28 to 31 days. The shortest one fits the
 * most windows into a grant, and a figure that bounds what can be spent has to
 * round in that direction: understating it is the failure this exists to fix.
 *
 * The chain has no year. The SDK rewrites one into twelve months before
 * encoding, so it is measured as twelve of the same conservative month.
 */
const PERIOD_SECONDS: Record<string, number> = {
  minute: 60,
  hour: 3_600,
  day: 86_400,
  week: 604_800,
  month: 28 * 86_400,
  year: 12 * 28 * 86_400,
};

export interface SpendExposureArgs {
  /** Base units the limit allows per window. */
  allowance: bigint;
  unit: string;
  multiplier: number;
  /** Unix seconds the permission ends at. */
  expiry: number;
  /** Unix seconds. A grant starts when it is signed, so this is its start. */
  now: number;
}

export interface SpendExposure {
  /** Windows the permission's life touches. */
  periods: number;
  /** The most the limit can move across all of them, in base units. */
  total: bigint;
}

/**
 * The exposure of one spend limit, or null when it cannot be sized.
 *
 * Null rather than a guess for a unit we do not recognise or an expiry already
 * past: a total the screen cannot stand behind is worse than no total, because
 * the user reads it as the bound.
 */
export function spendExposure({ allowance, unit, multiplier, expiry, now }: SpendExposureArgs): SpendExposure | null {
  if (allowance < 0n) return null;

  const key = unit?.trim().toLowerCase();
  // One allowance for the entire permission, so the rate is already the total.
  if (key === 'forever') return { periods: 1, total: allowance };

  // Own keys only. `unit` is whatever the requester wrote in the grant request, and
  // a plain index answers `constructor` with a function: truthy, so it passes the
  // guard below, and then `BigInt(NaN)` throws inside the render of the screen the
  // user approves on. Same reason `usdcForNetwork` in the CLI guards its lookup.
  const window = key && Object.hasOwn(PERIOD_SECONDS, key) ? PERIOD_SECONDS[key] : undefined;
  if (!window || !Number.isFinite(multiplier) || multiplier < 1) return null;

  const life = expiry - now;
  if (!Number.isFinite(life) || life <= 0) return null;

  const periods = Math.ceil(life / (window * multiplier));
  return { periods, total: allowance * BigInt(periods) };
}
