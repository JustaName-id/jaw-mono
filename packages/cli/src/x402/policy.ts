import { USDC_BY_NETWORK } from './asset-registry.js';
import { parseBigInt, parseNonNegativeBigInt } from './amount.js';
import { bindingSpendLimit, describePeriod, normalizePeriod, type PeriodUnit } from './period.js';
import type { X402PaymentRequirement } from './types.js';
import type { GrantedPermission } from '../lib/session-config.js';

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
 * The x402 policy a granted permission implies.
 *
 * Derived on read rather than stored beside the permission. The session used to
 * carry both: the struct, and a `grantedSpend` summary of one USDC limit
 * written at grant time. Two shapes for one fact, at different fidelities, and
 * every consumer had to know which one it was reading. Each of the bugs in this
 * area was a version of the two disagreeing, and the reconciliation between
 * them was itself a source of them. A value that cannot be stored out of date
 * cannot go out of date.
 *
 * The reduction is still lossy and now says so in one place: the contract
 * charges every spend limit matching a token, and `maxPerPeriod` is a single
 * number, so `bindingSpendLimit` decides which one it stands for.
 */
export function policyFromPermission(permission: GrantedPermission | undefined, chainId: number): X402Policy {
  if (!permission) return {};
  const usdc = Object.values(USDC_BY_NETWORK).find((asset) => asset.chainId === chainId);
  if (!usdc) return {};

  const forToken = permission.spends.filter((spend) => spend.token.toLowerCase() === usdc.address.toLowerCase());
  const binding = bindingSpendLimit(forToken);
  if (!binding) return {};

  let allowance: string;
  try {
    const parsed = BigInt(binding.allowance);
    // A negative allowance would seed a cap that refuses everything or worse.
    if (parsed < 0n) return {};
    allowance = parsed.toString();
  } catch {
    return {};
  }

  // Normalised the way the SDK normalises before encoding, so a `year` grant
  // lands on the same month-based window the permission actually enforces.
  const period = normalizePeriod(binding.unit, binding.multiplier);
  if (!period) return {};

  return {
    // The registry's canonical address, not the permission's literal string:
    // they match case-insensitively and this seeds an allowlist compared that
    // way.
    allowedAssets: [usdc.address],
    allowedNetworks: [usdc.wireNetwork],
    maxPerPeriod: allowance,
    period: {
      unit: period.unit,
      multiplier: period.multiplier,
      // The permission's own start, which is what the contract steps its
      // windows from. This used to be the local clock at setup.
      anchor: new Date(permission.start * 1000).toISOString(),
    },
  };
}

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
  session?: { chainId: number; permission?: GrantedPermission } | null
): X402Policy {
  return resolveX402Policy(configPolicy, policyFromPermission(session?.permission, session?.chainId ?? 0));
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
 * used has 1 to give, and pulling 10 through the permission reverts on chain.
 * With `topUpFloat` set near the cap that revert is a refused payment whose
 * price fit comfortably, so what is already used has to be subtracted here.
 *
 * Each cap is measured against what actually consumes it, which is not the same
 * meter for both. `maxPerPeriod` mirrors the on-chain allowance, and what draws
 * that down is the top-up itself, so it counts top-ups. `maxTotalPerSession` is
 * the user's own ceiling on what the session may spend, so it counts payments.
 * Reading the period cap off payments made it lag by whatever float the payer
 * still held, and the pull that overshot was refused on chain.
 */
export function topUpCeiling(
  policy: X402Policy,
  used: { toppedUpThisPeriod?: bigint; spentThisSession?: bigint } = {}
): bigint | undefined {
  const left = (cap: string | undefined, alreadyUsed = 0n): bigint | undefined => {
    const parsed = parseNonNegativeBigInt(cap);
    if (parsed === undefined) return undefined;
    return parsed > alreadyUsed ? parsed - alreadyUsed : 0n;
  };
  const caps = [
    left(policy.maxPerPeriod, used.toppedUpThisPeriod),
    left(policy.maxTotalPerSession, used.spentThisSession),
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
