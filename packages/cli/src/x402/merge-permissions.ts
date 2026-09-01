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
 * A limit is about a token, and adding one for a token replaces whatever that
 * token had.
 *
 * Not per window, which is what this keyed on first. `_checkAndIncrementSpend`
 * walks every limit whose token matches and charges each one
 * (`JustaPermissionManager.sol:1062`, "Don't break, continue checking all
 * limits for this token"), so limits on one token are ANDed and the effective
 * cap is the tightest of them. Appending a `10/day` beside an existing `1/week`
 * therefore grants nothing: the session still cannot move more than 1 a week,
 * while the summary claims a raise and the local policy reads the old figure.
 *
 * Replacing is also what the request means. `session add --x402 --limit 10/day`
 * names the budget for that token, and the browser screen shows the scope that
 * results before anyone approves it.
 */
function tokenKey(spend: { token: string }): string {
  return spend.token.toLowerCase();
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

  // Every token the addition names, so the existing limits on those tokens can
  // be dropped rather than ANDed with the new one.
  const replaced = new Set((addition.spends ?? []).map(tokenKey));
  const spends = existing.spends
    .filter((spend) => !replaced.has(tokenKey(spend)))
    .map((spend) => ({
      token: spend.token,
      // Normalised out of the hex the grant response carries, so the merged
      // document reads the way a hand-written one does.
      allowance: BigInt(spend.allowance).toString(),
      unit: spend.unit,
      multiplier: spend.multiplier,
    }));
  for (const spend of addition.spends ?? []) {
    spends.push({
      token: spend.token,
      allowance: BigInt(spend.allowance).toString(),
      unit: spend.unit,
      multiplier: spend.multiplier ?? 1,
    });
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

  // Reported per token, because that is the unit a limit is replaced in. A
  // window that goes away has to be shown: dropping a 1-a-week limit while
  // adding 10 a day is the whole change on chain, and printing only the
  // addition would read as a raise on top of a cap that is still there.
  const describeSpend = (spend: { allowance: string; unit: string; multiplier?: number }) =>
    `${spend.allowance} per ${describe(spend.unit, spend.multiplier ?? 1)}`;
  for (const token of new Set((merged.spends ?? []).map(tokenKey))) {
    const was = existing.spends.filter((spend) => tokenKey(spend) === token);
    const now = (merged.spends ?? []).filter((spend) => tokenKey(spend) === token);
    const wasText = was.map((s) => describeSpend({ ...s, allowance: BigInt(s.allowance).toString() })).join(', ');
    const nowText = now.map(describeSpend).join(', ');
    if (wasText === nowText) continue;
    lines.push(was.length === 0 ? `  + spend   ${token} ${nowText}` : `  ~ spend   ${token} ${wasText} to ${nowText}`);
  }

  return lines;
}

function describe(unit: string, multiplier: number): string {
  const n = Math.max(1, Math.floor(multiplier));
  return n === 1 ? unit : `${n} ${unit}s`;
}
