// ============================================================================
// Executing calls under a granted permission (`capabilities.permissions.id`).
// ----------------------------------------------------------------------------
// The calls don't run from the connected account — they're routed through the permissions
// manager and execute as the *granter*. Two addresses are therefore in play:
//
//   spender  = the connected account, signs the userOp and pays the gas
//   account  = the granter, whose assets actually move ("on behalf of")
//
// Everything the manager checks on-chain is knowable here first, so a certain revert becomes
// a named reason instead of a failed estimation.
// ============================================================================

import { ANY_FN_SEL, ANY_TARGET } from '@jaw.id/core';

/**
 * The permission-manager sentinels standing for "unrestricted". One list so a target wildcard
 * and a selector wildcard can never be treated differently — an unbounded grant is the most
 * dangerous thing on a permission screen and must always read the same way.
 */
const WILDCARDS = [ANY_TARGET, ANY_FN_SEL].map((v) => v.toLowerCase());

export function isWildcard(value?: string): boolean {
  return !!value && WILDCARDS.includes(value.toLowerCase());
}

/** The subset of a relay permission this screen needs. */
export interface ExecutionPermission {
  account: string;
  spender: string;
  /** Unix seconds; a permission is not usable before this. */
  start: number;
  /** Unix seconds. */
  end: number;
  /** Hex chain id, as the relay stores it. */
  chainId: string;
  calls: { target: string; selector: string }[];
}

/**
 * Why a permissioned execution can't go through. Each one is a guaranteed on-chain revert that
 * we can name before the user signs, rather than letting it surface as "estimation failed".
 */
export type PermissionProblem =
  /** The relay has no such permission — never granted, or already revoked. */
  | 'not-found'
  /** Past its `end` timestamp. */
  | 'expired'
  /** Its `start` timestamp is still in the future. */
  | 'not-yet-valid'
  /** Granted for a different chain than the one this request targets. */
  | 'chain-mismatch'
  /** The signer isn't the spender, so the manager will reject the caller. */
  | 'wrong-spender'
  /** Granted to the account that granted it — storable, but not executable. */
  | 'self-delegated'
  /** A call's target/selector pair isn't in the permission's allow-list. */
  | 'call-not-allowed';

/** Short label for the fee row, and the tooltip detail behind it. */
export const PERMISSION_PROBLEM_TEXT: Record<PermissionProblem, { text: string; detail: string }> = {
  'not-found': {
    // Covers a revoked permission and a lookup that simply failed — the two are indistinguishable
    // from here, so the copy must not assert which one it was.
    text: 'Permission unavailable',
    detail: 'This permission couldn’t be loaded — it may have been revoked. Executing it would be rejected on-chain.',
  },
  'not-yet-valid': {
    text: 'Permission not active yet',
    detail: 'This permission doesn’t become valid until a later date, so executing it now would be rejected on-chain.',
  },
  expired: {
    text: 'Permission expired',
    detail: 'This permission has passed its expiry date and can no longer be used. Ask the app to request a new one.',
  },
  'chain-mismatch': {
    text: 'Wrong network',
    detail: 'This permission was granted on a different network than the one this transaction targets.',
  },
  'self-delegated': {
    text: 'Permission can’t be used',
    detail:
      'This permission was granted by an account to itself. The permissions manager can’t execute it, so it would be rejected on-chain. Grant it to a separate spender instead.',
  },
  'wrong-spender': {
    text: 'Not the spender',
    detail: 'This permission was granted to a different account, so this wallet can’t execute it.',
  },
  'call-not-allowed': {
    text: 'Call not permitted',
    detail: 'This transaction calls something the permission doesn’t allow. Executing it would be rejected on-chain.',
  },
};

const sameAddress = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** True when the permission's allow-list covers this target/selector pair. */
function isCallAllowed(permission: ExecutionPermission, call: { to?: string; data?: string }): boolean {
  // The manager matches on the 4-byte selector; a bare value transfer carries none.
  const selector = call.data?.slice(0, 10).toLowerCase() ?? '0x';
  return permission.calls.some(
    (allowed) =>
      (isWildcard(allowed.target) || sameAddress(allowed.target, call.to)) &&
      (isWildcard(allowed.selector) || allowed.selector.toLowerCase() === selector)
  );
}

export interface PermissionExecutionInput {
  permission: ExecutionPermission;
  /** The account signing the userOp — must be the permission's spender. */
  from?: string;
  /** Chain the request targets. */
  chainId?: number;
  calls: { to?: string; data?: string }[];
  /** Unix seconds; injected so the expiry check is testable. */
  now: number;
}

/**
 * The first reason this execution would be rejected, or null. Ordered by how fundamental the
 * mismatch is — a permission for the wrong chain or the wrong signer is worth saying before
 * picking apart individual calls.
 */
export function validatePermissionExecution({
  permission,
  from,
  chainId,
  calls,
  now,
}: PermissionExecutionInput): PermissionProblem | null {
  if (chainId !== undefined && permission.chainId && Number(permission.chainId) !== chainId) {
    return 'chain-mismatch';
  }
  // Coerced rather than trusted: the relay type says number, but the revoke path parseInts it,
  // and a string "0" would read as truthy-and-past where the number 0 means "no expiry".
  const end = Number(permission.end);
  if (Number.isFinite(end) && end > 0 && end <= now) return 'expired';

  const start = Number(permission.start);
  if (Number.isFinite(start) && start > now) return 'not-yet-valid';
  // Nothing stops a grant naming its own account as the spender, but routing it back through the
  // manager can't execute. Checked before the spender comparison: when both apply, the permission
  // being unusable at all is the more useful thing to say.
  if (sameAddress(permission.account, permission.spender)) return 'self-delegated';
  if (from && !sameAddress(permission.spender, from)) return 'wrong-spender';
  if (calls.some((call) => !isCallAllowed(permission, call))) return 'call-not-allowed';
  return null;
}
