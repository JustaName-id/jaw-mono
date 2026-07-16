import type { X402PaymentRequirement } from './types.js';

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
  /** Max cumulative base units across the process/session. */
  maxTotalPerSession?: string;
  /** Allowed asset contract addresses (case-insensitive). Empty/undefined = any. */
  allowedAssets?: string[];
  /** Allowed CAIP-2 networks. Empty/undefined = any. */
  allowedNetworks?: string[];
  /** Allowed resource hostnames. Empty/undefined = any. */
  allowedHosts?: string[];
  /** Allowed `payTo` addresses (case-insensitive). Empty/undefined = any. */
  allowedPayTo?: string[];
}

export interface PolicyContext {
  /** Hostname of the resource being paid for (for `allowedHosts`). */
  host?: string;
  /** Base units already spent this session (for `maxTotalPerSession`). */
  spentThisSession?: bigint;
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

  let amount: bigint;
  try {
    amount = BigInt(requirement.amount);
  } catch {
    return { ok: false, reason: `invalid amount: ${requirement.amount}` };
  }
  if (amount < 0n) {
    return { ok: false, reason: `negative amount: ${requirement.amount}` };
  }

  if (policy.maxAmountPerPayment !== undefined) {
    let cap: bigint;
    try {
      cap = BigInt(policy.maxAmountPerPayment);
    } catch {
      return { ok: false, reason: `invalid maxAmountPerPayment in config: ${policy.maxAmountPerPayment}` };
    }
    if (amount > cap) {
      return {
        ok: false,
        reason: `amount ${requirement.amount} exceeds maxAmountPerPayment ${policy.maxAmountPerPayment}`,
      };
    }
  }

  if (policy.maxTotalPerSession !== undefined) {
    let cap: bigint;
    try {
      cap = BigInt(policy.maxTotalPerSession);
    } catch {
      return { ok: false, reason: `invalid maxTotalPerSession in config: ${policy.maxTotalPerSession}` };
    }
    const spent = ctx.spentThisSession ?? 0n;
    if (spent + amount > cap) {
      return {
        ok: false,
        reason: `payment ${requirement.amount} would exceed maxTotalPerSession ${policy.maxTotalPerSession} (already spent ${spent})`,
      };
    }
  }

  return { ok: true };
}
