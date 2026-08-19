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

import { ANY_FN_SEL, ANY_TARGET, EMPTY_CALLDATA_FN_SEL, PERMISSIONS_MANAGER_ADDRESS } from '@jaw.id/core';

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
 * Something worth saying about a permissioned execution before the user signs. Most entries are
 * guaranteed on-chain reverts named up front rather than surfacing as "estimation failed"; see
 * `isBlockingPermissionProblem` for the two that warn without blocking.
 */
export type PermissionProblem =
  /** The relay answered 404: the permission was revoked, or never granted. */
  | 'revoked'
  /** The lookup itself failed (network, server error, missing key) — the permission may be fine. */
  | 'lookup-failed'
  /** Past its `end` timestamp. */
  | 'expired'
  /** Its `start` timestamp is still in the future. */
  | 'not-yet-valid'
  /** Granted for a different chain than the one this request targets. */
  | 'chain-mismatch'
  /**
   * The relay's stored chain id can't be read, so which network this permission belongs to is
   * unknown. Distinct from `chain-mismatch`: that one says the networks differ, this one says we
   * can't tell what the permission's network is at all.
   */
  | 'unknown-chain'
  /** The signer isn't the spender, so the manager will reject the caller. */
  | 'wrong-spender'
  /** A call targets the permission manager itself — `CannotTargetSelf` at execute time. */
  | 'targets-manager'
  /** A call targets the granting account — `CannotTargetAccount` at execute time. */
  | 'targets-account'
  /**
   * Granted by an account to itself. Verified against the deployed manager: this approves AND
   * executes (nothing on-chain compares account to spender, and JustanAccount has no reentrancy
   * guard), so it is pointless-but-valid rather than a revert. Warn, don't block.
   */
  | 'self-delegated'
  /** A call's target/selector pair isn't in the permission's allow-list. */
  | 'call-not-allowed';

/**
 * A blocking problem is a certain on-chain revert and disables Confirm. The two exceptions warn
 * and let the user proceed: `lookup-failed` is uncertainty about our own lookup, not about the
 * permission, and `self-delegated` executes fine on-chain — it is merely unusual. One predicate
 * so the dialog and the copy can never disagree on that line.
 */
export function isBlockingPermissionProblem(problem: PermissionProblem): boolean {
  // `unknown-chain` joins the warn-only set for the same reason as `lookup-failed`: it is
  // uncertainty about a check of ours, not a certain revert. The manager still enforces the chain
  // on-chain, so the execution may well succeed. On the revocation side the same finding DOES
  // block, because there the call is built from the record we couldn't read.
  return problem !== 'lookup-failed' && problem !== 'self-delegated' && problem !== 'unknown-chain';
}

/** Short label for the fee row, and the tooltip detail behind it. */
export const PERMISSION_PROBLEM_TEXT: Record<PermissionProblem, { text: string; detail: string }> = {
  revoked: {
    text: 'Permission unavailable',
    detail:
      'The relay has no record of this permission — it was revoked or never granted. Executing it would be rejected on-chain.',
  },
  'lookup-failed': {
    text: 'Permission couldn’t be verified',
    detail:
      'The permission lookup failed, so its details couldn’t be checked. You can still submit, but if the permission is invalid the execution will be rejected on-chain.',
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
  'unknown-chain': {
    text: 'Permission network unreadable',
    detail:
      'The network this permission was granted on could not be read from the stored record, so it can’t be checked against this transaction. Executing it may be rejected on-chain.',
  },
  'targets-manager': {
    text: 'Calls the permission manager',
    detail:
      'This transaction calls the permission manager itself, which the manager forbids. Executing it would be rejected on-chain.',
  },
  'targets-account': {
    text: 'Calls the granting account',
    detail:
      'This transaction calls the account that granted the permission, which the manager forbids. Executing it would be rejected on-chain.',
  },
  'self-delegated': {
    text: 'Self-granted permission',
    detail:
      'This permission was granted by an account to itself. It will execute, but routing a transaction through the permission manager back to your own account is unusual and may be unintended.',
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

/**
 * The permission's own chain, or null when the relay's stored value can't be read.
 *
 * `Number` is used rather than trusting the type: the relay stores hex ('0x14a34'), the revoke path
 * parseInts it, and a decimal string reaches us too — `Number` handles all three. An unreadable
 * value must NOT fall through to the mismatch comparison: `NaN !== anything` is always true, so a
 * corrupt stored id would report "Wrong network", which describes a different problem entirely.
 */
function permissionChainId(stored: string): number | null {
  if (!stored) return null;
  const parsed = Number(stored);
  return Number.isFinite(parsed) ? parsed : null;
}

const sameAddress = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** True when the permission's allow-list covers this target/selector pair. */
function isCallAllowed(permission: ExecutionPermission, call: { to?: string; data?: string }): boolean {
  // The manager matches on the 4-byte selector; a bare value transfer carries none. Grants name
  // that case with the EMPTY_CALLDATA_FN_SEL sentinel (the docs' "Only ETH transfers" preset).
  const data = call.data ?? '0x';
  const emptyCalldata = data === '0x' || data === '';
  const selector = data.slice(0, 10).toLowerCase();
  return permission.calls.some((allowed) => {
    if (!isWildcard(allowed.target) && !sameAddress(allowed.target, call.to)) return false;
    if (isWildcard(allowed.selector)) return true;
    const allowedSelector = allowed.selector.toLowerCase();
    if (emptyCalldata) return allowedSelector === EMPTY_CALLDATA_FN_SEL;
    return allowedSelector === selector;
  });
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
 * The first thing worth saying about this execution, or null. Ordered by how fundamental the
 * mismatch is — a permission for the wrong chain or the wrong signer is worth saying before
 * picking apart individual calls — with the one non-blocking finding (`self-delegated`) last.
 */
export function validatePermissionExecution({
  permission,
  from,
  chainId,
  calls,
  now,
}: PermissionExecutionInput): PermissionProblem | null {
  const permissionChain = permissionChainId(permission.chainId);
  if (permission.chainId && permissionChain === null) return 'unknown-chain';
  if (chainId !== undefined && permissionChain !== null && permissionChain !== chainId) {
    return 'chain-mismatch';
  }
  // Coerced rather than trusted: the relay type says number, but the revoke path parseInts it,
  // and a string "0" would read as truthy-and-past where the number 0 means "no expiry".
  const end = Number(permission.end);
  if (Number.isFinite(end) && end > 0 && end <= now) return 'expired';

  const start = Number(permission.start);
  if (Number.isFinite(start) && start > now) return 'not-yet-valid';
  if (from && !sameAddress(permission.spender, from)) return 'wrong-spender';
  // The manager's own execute-time target checks, mirrored in its order: even a wildcard
  // permission cannot call the manager (CannotTargetSelf) or the granting account
  // (CannotTargetAccount) — reverts the allow-list check below would never name.
  if (calls.some((call) => sameAddress(call.to, PERMISSIONS_MANAGER_ADDRESS))) return 'targets-manager';
  if (calls.some((call) => sameAddress(call.to, permission.account))) return 'targets-account';
  if (calls.some((call) => !isCallAllowed(permission, call))) return 'call-not-allowed';
  // Last, because it is the only non-blocking finding here: it must never mask a certain revert.
  if (sameAddress(permission.account, permission.spender)) return 'self-delegated';
  return null;
}

// ============================================================================
// Revoking a granted permission (`wallet_revokePermissions`).
// ----------------------------------------------------------------------------
// The mirror of the execution checks above, for the other direction. Only the granting account can
// revoke, so the address in play is `account` rather than `spender`, and there are no calls to
// match — a revocation carries none.
//
// One deliberate difference from the execution path: an unresolved permission BLOCKS here. The
// revoke call is built from the fetched permission (`buildRevokePermissionCall`), so with no data
// there is nothing to submit — where an execution's calls come from the request and can proceed.
// ============================================================================

/**
 * Why a relay permission lookup failed, in the two terms the revoke screen distinguishes.
 *
 * Deliberately here and not in `@jaw.id/core` beside `getPermissionFromRelay`, even though the error
 * shapes below are core's: what this returns is UI vocabulary — two `RevocationProblem` members —
 * and core has no notion of a revocation problem. A message regex choosing which sentence a dialog
 * shows also has no business in the package that owns signing. Its one caller is
 * `usePermissionRevocation`, in this package.
 *
 * The status arrives three ways: directly on errors core rethrows from a structured body, on
 * `response.status` for a raw transport error, and not at all on the relay's HTTP-200-with-error-body
 * path, where `controlledAxiosPromise` throws a bare `Error(message)`. The message test covers that
 * last case; without it a permission the relay reports as missing over a 200 reads as "couldn't be
 * loaded" instead of "nothing to revoke". Both outcomes block, so a misread costs accuracy of
 * explanation, not safety.
 */
export function classifyPermissionLookupFailure(error: unknown): 'not-found' | 'lookup-failed' {
  const status =
    (error as { status?: number })?.status ?? (error as { response?: { status?: number } })?.response?.status;
  if (status === 404) return 'not-found';
  if (status !== undefined) return 'lookup-failed';
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return /not\s*found|does not exist|no such permission/i.test(message) ? 'not-found' : 'lookup-failed';
}

/** The subset of a relay permission the revoke screen needs. No calls: a revocation has none. */
export interface RevocablePermission {
  account: string;
  spender: string;
  /** Unix seconds. */
  end: number;
  /** Hex chain id, as the relay stores it. */
  chainId: string;
}

/** Something worth saying before signing a revocation. */
export type RevocationProblem =
  | 'missing-id'
  /** The relay answered 404: already revoked, or never granted. Nothing left to revoke. */
  | 'not-found'
  /** The lookup itself failed (network, server error, missing key) — the permission may be fine. */
  | 'lookup-failed'
  /** Stored against a different chain than the one this request targets. */
  | 'chain-mismatch'
  /** The stored chain id can't be read, so the revocation can't be built against a known network. */
  | 'unknown-chain'
  /** The signer isn't the granting account, so the manager will reject the caller. */
  | 'not-granter'
  /** Already past its `end`. Revoking succeeds but changes nothing — it only costs gas. */
  | 'expired'
  /** Granted by an account to itself. Unusual, but revoking it is perfectly ordinary. */
  | 'self-delegated';

/**
 * A blocking problem disables Confirm. The two exceptions warn and let the user proceed: an
 * `expired` permission revokes fine (it just achieves nothing), and `self-delegated` describes the
 * grant rather than the revocation. One predicate so the dialog and the copy can't disagree.
 */
export function isBlockingRevocationProblem(problem: RevocationProblem): boolean {
  return problem !== 'expired' && problem !== 'self-delegated';
}

/** Short label for the fee row, and the tooltip detail behind it. */
export const REVOCATION_PROBLEM_TEXT: Record<RevocationProblem, { text: string; detail: string }> = {
  'missing-id': {
    text: 'No permission specified',
    detail:
      'This request didn’t include a permission ID, so there is nothing to revoke. The app needs to pass the id of the permission it wants removed.',
  },
  'not-found': {
    text: 'Nothing to revoke',
    detail:
      'The relay has no record of this permission — it was already revoked, or never granted. There is nothing left to remove.',
  },
  'lookup-failed': {
    text: 'Permission couldn’t be loaded',
    detail:
      'The permission lookup failed, so its details couldn’t be read. The revocation is built from those details, so it can’t be submitted until the lookup succeeds — close this and try again.',
  },
  'chain-mismatch': {
    text: 'Wrong network',
    detail: 'This permission was granted on a different network than the one this request targets.',
  },
  'unknown-chain': {
    text: 'Permission network unreadable',
    detail:
      'The network this permission was granted on could not be read from the stored record. The revocation is built from that record, so it can’t be submitted — close this and try again.',
  },
  'not-granter': {
    text: 'Not the granting account',
    detail:
      'Only the account that granted a permission can revoke it, and this wallet isn’t it. Submitting would be rejected on-chain.',
  },
  expired: {
    text: 'Already expired',
    detail:
      'This permission has passed its expiry date and can no longer be used, so revoking it changes nothing — it only costs the network fee. You can still proceed if you want it cleared.',
  },
  'self-delegated': {
    text: 'Self-granted permission',
    detail:
      'This permission was granted by an account to itself. That is unusual for a grant, but revoking it works exactly like any other.',
  },
};

/**
 * The first thing worth saying about this revocation, or null. Ordered by how fundamental the
 * mismatch is, with the two non-blocking findings last so neither can mask a certain revert.
 */
export function validatePermissionRevocation({
  permission,
  from,
  chainId,
  now,
}: {
  permission: RevocablePermission;
  /** The account signing the revocation — must be the permission's granter. */
  from?: string;
  /** Chain the request targets. */
  chainId?: number;
  /** Unix seconds; injected so the expiry check is testable. */
  now: number;
}): RevocationProblem | null {
  // Both callers derive the chainId they pass from this same relay record — AppSpecificSigner
  // parseInts it, CrossPlatformSigner resolves a chain from it — so a genuine mismatch is not
  // reachable here today. The check stays for callers that supply an independent chain, and the
  // unreadable case is named for what it is rather than as a network mismatch.
  const permissionChain = permissionChainId(permission.chainId);
  if (permission.chainId && permissionChain === null) return 'unknown-chain';
  if (chainId !== undefined && permissionChain !== null && permissionChain !== chainId) {
    return 'chain-mismatch';
  }
  if (from && !sameAddress(permission.account, from)) return 'not-granter';

  // Coerced rather than trusted: the relay type says number, but the revoke path parseInts it,
  // and a string "0" would read as truthy-and-past where the number 0 means "no expiry".
  const end = Number(permission.end);
  if (Number.isFinite(end) && end > 0 && end <= now) return 'expired';
  if (sameAddress(permission.account, permission.spender)) return 'self-delegated';
  return null;
}
