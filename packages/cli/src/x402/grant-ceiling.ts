import { parseUnits } from 'viem';
import { parseLimit, type LimitPeriod } from './grant-preset.js';
import { USDC_BY_NETWORK } from './asset-registry.js';
import { formatUsdc } from './status-report.js';
import type { PermissionsConfig } from '../lib/types.js';

/**
 * The most a grant made from this machine may ask for, set by a human.
 *
 * The flow worth having is an agent that hits a 402, asks for a budget, and a
 * human approves it in the browser. It already works, and it works by accident:
 * an agent with shell access runs `jaw session setup --x402 --limit <whatever it
 * likes>`, and the browser screen is the only thing standing between that number
 * and an approval. That makes a grant screen the entire security boundary, and
 * screens get clicked through.
 *
 * A ceiling moves the decision to where it belongs. The human names the most
 * they are willing to grant, once, at a terminal; the agent can ask for that or
 * less, and the browser confirms a number that was already bounded. It is the
 * same split the x402 caps already use: `maxPerPeriod` and the rest are
 * deliberately unreachable from the MCP tools, because an agent must not raise
 * its own spending caps.
 *
 * Unset means no ceiling, which is what every install has today.
 */

/** Shortest a period can be, used for the grant's own period. */
const MIN_SECONDS: Record<LimitPeriod, number> = {
  minute: 60,
  hour: 3600,
  day: 86400,
  week: 604800,
  month: 28 * 86400,
  year: 365 * 86400,
  forever: Number.POSITIVE_INFINITY,
};

/** Longest a period can be, used for the ceiling's period. */
const MAX_SECONDS: Record<LimitPeriod, number> = {
  ...MIN_SECONDS,
  month: 31 * 86400,
  year: 366 * 86400,
};

function periodSeconds(table: Record<LimitPeriod, number>, unit: string, multiplier: number): number | null {
  if (!Object.hasOwn(table, unit)) return null;
  return table[unit as LimitPeriod] * Math.max(1, Math.floor(multiplier));
}

/**
 * Why the grant is more than the ceiling allows, or null when it is not.
 *
 * Two conditions, both conservative in the same direction: the allowance may not
 * exceed the ceiling's, and the period may not be shorter than the ceiling's. A
 * shorter period is more money over the same time even at the same allowance, so
 * `10/hour` is not under a `10/day` ceiling. Together they are stricter than
 * comparing rates, and they can be said in one sentence, which matters for a
 * refusal someone reads while they are trying to get work done.
 *
 * Checked against the resolved permission rather than the `--limit` string, so a
 * hand-written `--permissions` is bounded by the same number. That is the whole
 * point: a bypass an agent can reach is not a ceiling.
 */
export function whyGrantExceedsCeiling(
  permissions: PermissionsConfig,
  chainId: number,
  ceiling: string | undefined
): string | null {
  if (!ceiling) return null;

  let parsed: { amount: string; period: LimitPeriod };
  try {
    parsed = parseLimit(ceiling);
  } catch {
    // A hand-edited ceiling must not become a way past it, and must not take
    // down every setup either. Refuse the grant and say which is which.
    return `The grant ceiling in your config is not a valid limit: ${ceiling}. Fix it with \`jaw config set grantCeiling <amount>/<period>\`, or remove it.`;
  }

  const usdc = Object.values(USDC_BY_NETWORK).find((asset) => asset.chainId === chainId);
  if (!usdc) return null; // no registry asset here, so nothing to price the ceiling in

  const maxAllowance = parseUnits(parsed.amount, usdc.decimals);
  const ceilingSeconds = periodSeconds(MAX_SECONDS, parsed.period, 1);
  if (ceilingSeconds === null) return null;

  for (const spend of permissions.spends ?? []) {
    if (spend.token.toLowerCase() !== usdc.address.toLowerCase()) {
      // The ceiling is an amount of USDC. A spend on anything else cannot be
      // measured against it, and letting it through unmeasured would be a way
      // around the ceiling rather than an exception to it.
      return `The grant ceiling is set to ${ceiling}, and this permission spends ${spend.token}, which cannot be measured against it. Grant USDC, or remove the ceiling with \`jaw config set grantCeiling ""\`.`;
    }

    let allowance: bigint;
    try {
      allowance = BigInt(spend.allowance);
    } catch {
      return `This permission asks for an allowance that cannot be read: ${spend.allowance}.`;
    }

    if (allowance > maxAllowance) {
      return `This grant asks for ${formatUsdc(allowance.toString(), usdc.decimals)} per period, over the ${ceiling} ceiling set on this machine. Lower it, or raise the ceiling with \`jaw config set grantCeiling <amount>/<period>\`.`;
    }

    const grantSeconds = periodSeconds(MIN_SECONDS, spend.unit, spend.multiplier ?? 1);
    if (grantSeconds === null) {
      return `This permission uses a spend period this CLI does not recognise: ${spend.unit}.`;
    }
    if (grantSeconds < ceilingSeconds) {
      return `This grant resets its allowance every ${describe(spend.unit, spend.multiplier ?? 1)}, which is more often than the ${ceiling} ceiling set on this machine allows. A shorter period is more money over the same time, even at the same allowance.`;
    }
  }

  return null;
}

function describe(unit: string, multiplier: number): string {
  const n = Math.max(1, Math.floor(multiplier));
  return n === 1 ? unit : `${n} ${unit}s`;
}
