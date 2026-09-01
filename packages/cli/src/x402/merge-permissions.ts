import { toFunctionSelector } from 'viem';
import type { GrantedPermission } from '../lib/session-config.js';
import type { PermissionsConfig } from '../lib/types.js';

/**
 * The union of what a session already grants and what is being added.
 *
 * A session holds one permission, and `session setup` replaces it. An agent
 * that has a scoped session and then discovers it needs to pay had no way to
 * add that: re-running setup revokes the grant it is working under, so it loses
 * its other capabilities mid-task, and the only way to have both was to
 * hand-write the union as one `--permissions` document.
 *
 * The union is computable now only because the granted permission is stored as
 * the contract holds it. Before that the CLI kept a USDC spend limit and
 * nothing else, so the existing scope could not be reconstructed to merge
 * against.
 */

/**
 * A call is the same call when it targets the same function on the same
 * contract.
 *
 * The selector is derived from the signature when that is all an entry carries,
 * which is how the x402 preset writes them while the stored permission carries
 * selectors. Comparing the two forms directly matched nothing, so
 * `session add --x402` was never a no-op: every run re-granted, revoked, cost
 * two browser approvals, and left another copy of the same call on the
 * permission.
 */
function callKey(call: { target: string; selector?: string; functionSignature?: string }): string | null {
  const selector = call.selector ?? (call.functionSignature ? safeSelector(call.functionSignature) : undefined);
  return selector ? `${call.target.toLowerCase()}:${selector.toLowerCase()}` : null;
}

function safeSelector(signature: string): string | undefined {
  try {
    return toFunctionSelector(signature);
  } catch {
    // A signature the SDK will reject later. Left unkeyed rather than thrown on:
    // this is a merge, and the grant is where a bad signature belongs refused.
    return undefined;
  }
}

/**
 * Two spend limits collide when they meter the same token over the same window.
 * The contract keys its counter by the hash of the whole `SpendLimit`, so two
 * entries differing only in allowance are two independent budgets, and it
 * rejects two that are identical outright.
 */
function spendKey(spend: { token: string; unit: string; multiplier?: number }): string {
  return `${spend.token.toLowerCase()}:${spend.unit}:${spend.multiplier ?? 1}`;
}

export function mergePermissions(existing: GrantedPermission, addition: PermissionsConfig): PermissionsConfig {
  // Typed as the wider config shape: an addition may name a call by signature
  // instead of selector, which is what the x402 preset does.
  const calls: NonNullable<PermissionsConfig['calls']> = existing.calls.map((call) => ({
    target: call.target,
    selector: call.selector,
  }));
  const seenCalls = new Set(existing.calls.map(callKey));
  for (const call of addition.calls ?? []) {
    const key = callKey(call);
    if (key && seenCalls.has(key)) continue;
    if (key) seenCalls.add(key);
    calls.push(call);
  }

  const spends = existing.spends.map((spend) => ({
    token: spend.token,
    // Normalised out of the hex the grant response carries, so the merged
    // document reads the way a hand-written one does.
    allowance: BigInt(spend.allowance).toString(),
    unit: spend.unit,
    multiplier: spend.multiplier,
  }));
  const byKey = new Map(spends.map((spend, index) => [spendKey(spend), index]));
  for (const spend of addition.spends ?? []) {
    const key = spendKey(spend);
    const existingIndex = byKey.get(key);
    if (existingIndex === undefined) {
      spends.push({
        token: spend.token,
        allowance: BigInt(spend.allowance).toString(),
        unit: spend.unit,
        multiplier: spend.multiplier ?? 1,
      });
      byKey.set(key, spends.length - 1);
      continue;
    }
    // Same token, same window: the limit just named wins rather than being
    // added to the old one. `session add x402 --limit 10/day` over a session
    // already allowing 5/day reads as asking for 10, not for 15, and adding
    // them would raise a budget the user did not name. Leaving both entries in
    // would do the same thing more quietly, since the contract meters each
    // `SpendLimit` on its own counter.
    spends[existingIndex] = {
      ...spends[existingIndex],
      allowance: BigInt(spend.allowance).toString(),
    };
  }

  // Absent rather than empty. The validator rejects a `spends: []` outright,
  // and a calls-only session merged with a calls-only addition produces exactly
  // that, so every such add threw after the browser had already been opened.
  return {
    ...(calls.length > 0 ? { calls } : {}),
    ...(spends.length > 0 ? { spends } : {}),
  };
}

/** One line per change, for the summary printed before the browser opens. */
export function describeMerge(existing: GrantedPermission, merged: PermissionsConfig): string[] {
  const lines: string[] = [];
  const hadCalls = new Set(existing.calls.map(callKey));
  for (const call of merged.calls ?? []) {
    const key = callKey(call);
    if (key && hadCalls.has(key)) continue;
    lines.push(`  + call    ${call.target} ${call.selector ?? call.functionSignature ?? ''}`.trimEnd());
  }

  const before = new Map(existing.spends.map((spend) => [spendKey(spend), BigInt(spend.allowance)]));
  for (const spend of merged.spends ?? []) {
    const was = before.get(spendKey(spend));
    const now = BigInt(spend.allowance);
    if (was === undefined) {
      lines.push(`  + spend   ${spend.allowance} of ${spend.token} per ${spend.unit}`);
    } else if (was !== now) {
      lines.push(`  ~ spend   ${spend.token} per ${spend.unit}: ${was} to ${now}`);
    }
  }

  return lines;
}
