import { USDC_BY_NETWORK } from './asset-registry.js';
import { parseBigInt, parseNonNegativeBigInt } from './amount.js';
import { describePeriod, normalizePeriod, type PeriodUnit } from './period.js';
import type { X402PaymentRequirement } from './types.js';
import type { GrantedSpend } from '../lib/session-config.js';

/** The period a granted allowance resets over, carried into the policy. */
export interface GrantedPeriod {
  unit: PeriodUnit;
  multiplier: number;
  /** ISO timestamp the periods are anchored at. */
  anchor: string;
}

/**
 * Tool-level x402 limits (from `~/.jaw/config.json`'s `x402` block). An agent
 * holding a signing key must be fenced in: no single payment above the cap, no
 * cumulative overspend, and only allow-listed assets/networks/recipients. In
 * pull mode these sit alongside the session-EOA's own balance; in push mode the
 * on-chain permission is the hard ceiling and these are the inner guardrails.
 */
export interface X402Policy {
  /** Max base units for a single payment. */
  maxAmountPerPayment?: string;
  /**
   * Max cumulative base units across the whole session. Not a per-process cap:
   * the running total is rebuilt from the payment ledger since the session was
   * created, so it survives restarts. User-configured only, never seeded from
   * the grant (see `maxPerPeriod` for that).
   */
  maxTotalPerSession?: string;
  /**
   * Max base units within one period of the on-chain grant, seeded from it and
   * resetting every period exactly as the permission does. This is the field
   * that mirrors the chain; `maxTotalPerSession` is the user's own ceiling on
   * top. Set together with `period`.
   */
  maxPerPeriod?: string;
  /** The window `maxPerPeriod` resets over. Absent when no grant seeded it. */
  period?: GrantedPeriod;
  /** Allowed asset contract addresses (case-insensitive). Empty/undefined = any. */
  allowedAssets?: string[];
  /** Allowed CAIP-2 networks. Empty/undefined = any. */
  allowedNetworks?: string[];
  /** Allowed resource hostnames. Empty/undefined = any. */
  allowedHosts?: string[];
  /** Allowed `payTo` addresses (case-insensitive). Empty/undefined = any. */
  allowedPayTo?: string[];
  /**
   * Flow 2b: refill target (base units) for the session payer when a top-up
   * runs. Unset = top up exactly the shortfall. Bounded on-chain by the
   * permission either way.
   */
  topUpFloat?: string;
}

/**
 * Conservative caps applied when the user has not configured `x402` limits, so a
 * fresh setup is never unbounded: capped amounts, and only the registry's USDC
 * deployments on their known networks (any other asset a server asks for is
 * refused). USDC has 6 decimals: 1_000_000 = 1 USDC. Override per field via
 * `jaw config set x402.*`.
 */
export const DEFAULT_X402_POLICY: X402Policy = {
  maxAmountPerPayment: '1000000', // 1 USDC per payment
  maxTotalPerSession: '10000000', // 10 USDC per process
  allowedAssets: Object.values(USDC_BY_NETWORK).map((asset) => asset.address),
  allowedNetworks: Object.keys(USDC_BY_NETWORK),
};

/**
 * Pull the USDC spend limit out of a granted permission's `spends` so the policy
 * can be seeded from it. Matches the granted entry against the registry USDC for
 * the session chain (case-insensitive); the allowance is a hex string on the wire,
 * returned as base-units decimal. Returns undefined when the permission grants no
 * registry-USDC spend (nothing to seed, defaults hold). Stores the registry's
 * canonical address, not the permission's literal token string: they match
 * case-insensitively and the allowlist this seeds compares addresses that way too.
 */
export function extractGrantedSpend(
  spends: ReadonlyArray<{ token: string; allowance: string; unit?: string; multiplier?: number }> | undefined,
  chainId: number,
  anchor: Date = new Date()
): GrantedSpend | undefined {
  const usdc = Object.values(USDC_BY_NETWORK).find((a) => a.chainId === chainId);
  if (!usdc) return undefined;
  const spend = spends?.find((s) => s.token.toLowerCase() === usdc.address.toLowerCase());
  if (!spend) return undefined;
  let allowance: string;
  try {
    const parsed = BigInt(spend.allowance);
    // A negative allowance (BigInt('-0x100') parses fine) would seed a negative
    // cap and make checkPolicy reject or misbehave — treat it as no grant.
    if (parsed < 0n) return undefined;
    allowance = parsed.toString();
  } catch {
    return undefined; // malformed allowance: fall back to defaults rather than a bad cap
  }
  // Keep the period alongside the number. An allowance without its unit is
  // dimensionless, and reading a per-period figure as a per-session one caps a
  // multi-period grant at a single period's worth for its whole life.
  // Normalised the way the SDK normalises it before encoding, so `year` lands on
  // the same month-based window the permission actually enforces. An unrecognised
  // unit records no period rather than guessing, falling back to session-wide.
  const period = normalizePeriod(spend.unit, spend.multiplier);
  return {
    token: usdc.address,
    allowance,
    network: usdc.wireNetwork,
    ...(period ? { unit: period.unit, multiplier: period.multiplier, periodAnchor: anchor.toISOString() } : {}),
  };
}

/**
 * Turn the USDC spend limit the user granted on-chain into policy fields, so the
 * local caps agree with the grant by construction rather than being configured
 * separately. The granted token and network become the allowlists, and the
 * allowance becomes `maxPerPeriod`: a cap that resets every period, matching what
 * the permission actually enforces.
 *
 * It deliberately does not touch `maxTotalPerSession`. That field accumulates
 * over the entire session, so seeding it with one period's allowance stranded
 * multi-period grants: a 5-USDC/day grant with a 7-day expiry permits 35 on
 * chain but capped the session at 5 forever. The two are different dimensions
 * and are now kept apart.
 */
export function policyFromGrant(grant?: GrantedSpend): X402Policy {
  if (!grant) return {};
  return {
    allowedAssets: [grant.token],
    allowedNetworks: [grant.network],
    // Without a recorded period the allowance cannot be placed on a window, so
    // it stays session-wide, which is what pre-period configs already meant.
    ...(grant.unit && grant.periodAnchor
      ? {
          maxPerPeriod: grant.allowance,
          period: { unit: grant.unit, multiplier: grant.multiplier ?? 1, anchor: grant.periodAnchor },
        }
      : { maxTotalPerSession: grant.allowance }),
  };
}

/**
 * Layer the policy: safe defaults < the on-chain grant < the user's config. The
 * grant seeds the allowlists and the per-period cap from what was actually
 * approved; an explicit `jaw config set x402.*` wins per field, so a user can
 * tighten further.
 *
 * Nothing is clamped. An earlier revision pinned `maxTotalPerSession` to the
 * grant, which was only needed because the grant's per-period allowance was
 * being written into that session-wide field: config had to be prevented from
 * raising a cap that was already wrong. Now that the grant lands on
 * `maxPerPeriod` instead, the two caps measure different things and cannot
 * contradict each other, so config is free to set its own session ceiling. The
 * per-period cap keeps mirroring the chain regardless of what config says, and
 * `maxPerPeriod` is not settable from the CLI.
 */
export function resolveX402Policy(configPolicy?: X402Policy, grantPolicy?: X402Policy): X402Policy {
  const merged: X402Policy = { ...DEFAULT_X402_POLICY, ...(grantPolicy ?? {}), ...(configPolicy ?? {}) };
  // The default session cap is the guardrail for an unconfigured setup that has
  // no grant to bound it. Once a grant supplies a per-period cap, that cap is
  // what the user approved on chain, and leaving the 10-USDC default sitting on
  // top of it would strand a longer grant well short of its own limit: a
  // 5-per-day grant over 7 days permits 35, and the default would stop it at 10.
  // A session cap the user set explicitly still applies on top.
  if (grantPolicy?.maxPerPeriod !== undefined && configPolicy?.maxTotalPerSession === undefined) {
    delete merged.maxTotalPerSession;
  }
  return merged;
}

/**
 * Resolve the policy for a live session. Every front end goes through this, so
 * `jaw x402 pay`, `jaw x402 status` and the MCP tool all enforce and report the
 * same caps. Resolving from config alone is what let them drift: the CLI paid
 * under the 10-USDC defaults on every registry network while the MCP tool
 * refused at the granted per-period allowance, and status printed a session cap
 * that the grant had already deleted.
 */
export function resolveSessionX402Policy(
  configPolicy?: X402Policy,
  session?: { grantedSpend?: GrantedSpend } | null
): X402Policy {
  return resolveX402Policy(configPolicy, policyFromGrant(session?.grantedSpend));
}

/**
 * The most a single top-up may move into the payer: the smallest cap that
 * actually binds, never a preferred one. Preferring the per-period cap let a
 * 5-USDC/day grant pre-fund 5 USDC into a session the user had explicitly capped
 * at 1, which is the idle-funds-at-risk case `TopUpOptions.maxTopUp` exists to
 * prevent. Undefined when neither cap is set, meaning the on-chain permission is
 * the only bound.
 *
 * What is left of each cap, not the whole cap: a 10/day grant with 9 already
 * spent has 1 to give, and pulling 10 through the permission reverts on chain.
 * With `topUpFloat` set near the cap that revert is a refused payment whose
 * price fit comfortably, so the remaining spend has to be subtracted here.
 */
export function topUpCeiling(
  policy: X402Policy,
  spent: { spentThisPeriod?: bigint; spentThisSession?: bigint } = {}
): bigint | undefined {
  const left = (cap: string | undefined, alreadySpent = 0n): bigint | undefined => {
    const parsed = parseNonNegativeBigInt(cap);
    if (parsed === undefined) return undefined;
    return parsed > alreadySpent ? parsed - alreadySpent : 0n;
  };
  const caps = [
    left(policy.maxPerPeriod, spent.spentThisPeriod),
    left(policy.maxTotalPerSession, spent.spentThisSession),
  ].filter((cap): cap is bigint => cap !== undefined);
  return caps.length > 0 ? caps.reduce((a, b) => (a < b ? a : b)) : undefined;
}

/** Policy keys settable from the CLI, split by value shape. */
export const X402_SCALAR_KEYS = ['maxAmountPerPayment', 'maxTotalPerSession', 'topUpFloat'] as const;
export const X402_ARRAY_KEYS = ['allowedAssets', 'allowedNetworks', 'allowedHosts', 'allowedPayTo'] as const;
export type X402PolicyKey = (typeof X402_SCALAR_KEYS)[number] | (typeof X402_ARRAY_KEYS)[number];

export function isX402PolicyKey(key: string): key is X402PolicyKey {
  return (X402_SCALAR_KEYS as readonly string[]).includes(key) || (X402_ARRAY_KEYS as readonly string[]).includes(key);
}

export interface PolicyContext {
  /** Hostname of the resource being paid for (for `allowedHosts`). */
  host?: string;
  /** Base units already spent this session (for `maxTotalPerSession`). */
  spentThisSession?: bigint;
  /**
   * Base units already spent inside the current grant period (for
   * `maxPerPeriod`). Must be counted over the same window the policy's `period`
   * describes, which resets as the grant does.
   */
  spentThisPeriod?: bigint;
  /** When the current period ends, for a refusal message that says when it frees up. */
  periodEndsAt?: Date;
}

export interface PolicyResult {
  ok: boolean;
  reason?: string;
}

const has = (list: string[] | undefined): list is string[] => Array.isArray(list) && list.length > 0;
const eqAddr = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Decide whether a chosen payment requirement is allowed to be paid. Returns the
 * first failing reason so the caller can refuse clearly instead of overpaying.
 * Only the `exact` scheme is supported.
 */
export function checkPolicy(
  requirement: X402PaymentRequirement,
  policy: X402Policy,
  ctx: PolicyContext = {}
): PolicyResult {
  if (requirement.scheme !== 'exact') {
    return { ok: false, reason: `unsupported scheme: ${requirement.scheme}` };
  }

  if (has(policy.allowedNetworks) && !policy.allowedNetworks.includes(requirement.network)) {
    return { ok: false, reason: `network not allowed: ${requirement.network}` };
  }

  if (has(policy.allowedAssets) && !policy.allowedAssets.some((a) => eqAddr(a, requirement.asset))) {
    return { ok: false, reason: `asset not allowed: ${requirement.asset}` };
  }

  if (has(policy.allowedPayTo) && !policy.allowedPayTo.some((a) => eqAddr(a, requirement.payTo))) {
    return { ok: false, reason: `payTo not allowed: ${requirement.payTo}` };
  }

  if (has(policy.allowedHosts) && (!ctx.host || !policy.allowedHosts.includes(ctx.host))) {
    return { ok: false, reason: `host not allowed: ${ctx.host ?? '(unknown)'}` };
  }

  const amount = parseBigInt(requirement.amount);
  if (amount === null) {
    return { ok: false, reason: `invalid amount: ${requirement.amount}` };
  }
  if (amount < 0n) {
    return { ok: false, reason: `negative amount: ${requirement.amount}` };
  }

  if (policy.maxAmountPerPayment !== undefined) {
    const cap = parseBigInt(policy.maxAmountPerPayment);
    if (cap === null) {
      return { ok: false, reason: `invalid maxAmountPerPayment in config: ${policy.maxAmountPerPayment}` };
    }
    if (amount > cap) {
      return {
        ok: false,
        reason: `amount ${requirement.amount} exceeds maxAmountPerPayment ${policy.maxAmountPerPayment}`,
      };
    }
  }

  // Checked before the session cap: this is the one that mirrors the on-chain
  // permission, so when both would refuse, the reason the chain would give is
  // the more useful one to report.
  if (policy.maxPerPeriod !== undefined) {
    const cap = parseBigInt(policy.maxPerPeriod);
    if (cap === null) {
      return { ok: false, reason: `invalid maxPerPeriod from grant: ${policy.maxPerPeriod}` };
    }
    const spent = ctx.spentThisPeriod ?? 0n;
    if (spent + amount > cap) {
      const window = policy.period ? describePeriod(policy.period.unit, policy.period.multiplier) : 'period';
      const resets = ctx.periodEndsAt ? `, resets ${ctx.periodEndsAt.toISOString()}` : '';
      return {
        ok: false,
        reason:
          `payment ${requirement.amount} would exceed the granted ${policy.maxPerPeriod} per ${window} ` +
          `(already spent ${spent} this ${window}${resets})`,
      };
    }
  }

  if (policy.maxTotalPerSession !== undefined) {
    const cap = parseBigInt(policy.maxTotalPerSession);
    if (cap === null) {
      return { ok: false, reason: `invalid maxTotalPerSession in config: ${policy.maxTotalPerSession}` };
    }
    const spent = ctx.spentThisSession ?? 0n;
    if (spent + amount > cap) {
      return {
        ok: false,
        reason:
          `payment ${requirement.amount} would exceed maxTotalPerSession ${policy.maxTotalPerSession} ` +
          `(already spent ${spent} since the session was created; raise it with ` +
          `\`jaw config set x402.maxTotalPerSession <base units>\`)`,
      };
    }
  }

  return { ok: true };
}
