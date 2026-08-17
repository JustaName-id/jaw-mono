import { describe, expect, it } from 'vitest';
import { ANY_FN_SEL, ANY_TARGET, EMPTY_CALLDATA_FN_SEL, PERMISSIONS_MANAGER_ADDRESS } from '@jaw.id/core';
import {
  classifyPermissionLookupFailure,
  isBlockingPermissionProblem,
  isBlockingRevocationProblem,
  isWildcard,
  PERMISSION_PROBLEM_TEXT,
  REVOCATION_PROBLEM_TEXT,
  validatePermissionExecution,
  validatePermissionRevocation,
  type ExecutionPermission,
  type PermissionProblem,
  type RevocablePermission,
  type RevocationProblem,
} from './permissionExecution';

const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const SPENDER = '0x000000000000000000000000000000000000dEaD';
const GRANTER = '0x1111111111111111111111111111111111111111';
const OTHER = '0x4444444444444444444444444444444444444444';
const TRANSFER = '0xa9059cbb';
const APPROVE = '0x095ea7b3';

const NOW = 1_800_000_000;

const permission = (overrides: Partial<ExecutionPermission> = {}): ExecutionPermission => ({
  account: GRANTER,
  spender: SPENDER,
  start: NOW - 3600,
  end: NOW + 3600,
  chainId: '0x14a34',
  calls: [{ target: USDC, selector: TRANSFER }],
  ...overrides,
});

const transferCall = { to: USDC, data: `${TRANSFER}00` };

const check = (p: ExecutionPermission, calls = [transferCall], from: string | undefined = SPENDER, chainId = 84532) =>
  validatePermissionExecution({ permission: p, from, chainId, calls, now: NOW });

describe('validatePermissionExecution', () => {
  it('passes a permission that covers the call', () => {
    expect(check(permission())).toBeNull();
  });

  it('flags a permission granted on another chain', () => {
    expect(check(permission({ chainId: '0x1' }))).toBe('chain-mismatch');
  });

  it('flags a permission past its expiry', () => {
    expect(check(permission({ end: NOW - 1 }))).toBe('expired');
  });

  it('treats the expiry second itself as expired', () => {
    expect(check(permission({ end: NOW }))).toBe('expired');
  });

  // The relay type says `end: number`, but the revoke path parseInts it — so both shapes arrive.
  it('reads a string expiry as a timestamp', () => {
    expect(check(permission({ end: `${NOW - 1}` as unknown as number }))).toBe('expired');
    expect(check(permission({ end: `${NOW + 1}` as unknown as number }))).toBeNull();
  });

  it('treats a zero expiry as no expiry, as a number or a string', () => {
    expect(check(permission({ end: 0 }))).toBeNull();
    expect(check(permission({ end: '0' as unknown as number }))).toBeNull();
  });

  it('ignores an unparseable expiry rather than calling it expired', () => {
    expect(check(permission({ end: 'later' as unknown as number }))).toBeNull();
  });

  it('flags a permission whose start is still in the future', () => {
    expect(check(permission({ start: NOW + 1 }))).toBe('not-yet-valid');
  });

  it('treats the start second itself as active', () => {
    expect(check(permission({ start: NOW }))).toBeNull();
  });

  it('accepts a zero or string start', () => {
    expect(check(permission({ start: 0 }))).toBeNull();
    expect(check(permission({ start: `${NOW - 1}` as unknown as number }))).toBeNull();
  });

  it('flags a permission granted to its own account', () => {
    expect(check(permission({ account: SPENDER }))).toBe('self-delegated');
  });

  it('reports a spender mismatch ahead of self-delegation — the certain revert wins', () => {
    expect(check(permission({ account: SPENDER }), [transferCall], GRANTER)).toBe('wrong-spender');
  });

  it('detects self-delegation across address casing', () => {
    expect(check(permission({ account: SPENDER.toLowerCase(), spender: SPENDER.toUpperCase() }))).toBe(
      'self-delegated'
    );
  });

  it('flags a signer that is not the spender', () => {
    expect(check(permission(), [transferCall], GRANTER)).toBe('wrong-spender');
  });

  it('accepts the spender regardless of address casing', () => {
    expect(check(permission({ spender: SPENDER.toLowerCase() }), [transferCall], SPENDER.toUpperCase())).toBeNull();
  });

  it('flags a selector outside the allow-list', () => {
    expect(check(permission(), [{ to: USDC, data: `${APPROVE}00` }])).toBe('call-not-allowed');
  });

  it('flags an allowed selector on a different contract', () => {
    expect(check(permission(), [{ to: OTHER, data: `${TRANSFER}00` }])).toBe('call-not-allowed');
  });

  it('flags a batch where only one call is disallowed', () => {
    expect(check(permission(), [transferCall, { to: USDC, data: `${APPROVE}00` }])).toBe('call-not-allowed');
  });

  it('flags a bare value transfer when no selector is permitted', () => {
    expect(check(permission(), [{ to: USDC }])).toBe('call-not-allowed');
  });

  // The docs' "Only ETH transfers" preset: any target, empty calldata only.
  it('allows a bare value transfer under the empty-calldata sentinel', () => {
    const p = permission({ calls: [{ target: ANY_TARGET, selector: EMPTY_CALLDATA_FN_SEL }] });
    expect(check(p, [{ to: OTHER }])).toBeNull();
    expect(check(p, [{ to: OTHER, data: '0x' }])).toBeNull();
    expect(check(p, [{ to: OTHER, data: '' }])).toBeNull();
  });

  it('flags a call carrying calldata when only empty calldata is permitted', () => {
    const p = permission({ calls: [{ target: ANY_TARGET, selector: EMPTY_CALLDATA_FN_SEL }] });
    expect(check(p, [{ to: USDC, data: `${TRANSFER}00` }])).toBe('call-not-allowed');
  });

  it('does not let a real selector match an empty-calldata-only grant, or vice versa', () => {
    const p = permission({ calls: [{ target: USDC, selector: TRANSFER }] });
    expect(check(p, [{ to: USDC, data: '0x' }])).toBe('call-not-allowed');
  });

  it('allows any selector on a permitted contract under a selector wildcard', () => {
    const p = permission({ calls: [{ target: USDC, selector: ANY_FN_SEL }] });
    expect(check(p, [{ to: USDC, data: `${APPROVE}00` }])).toBeNull();
  });

  it('allows a permitted selector on any contract under a target wildcard', () => {
    const p = permission({ calls: [{ target: ANY_TARGET, selector: TRANSFER }] });
    expect(check(p, [{ to: OTHER, data: `${TRANSFER}00` }])).toBeNull();
  });

  it('reports the chain mismatch first when several checks fail', () => {
    const p = permission({ chainId: '0x1', end: NOW - 1, spender: GRANTER });
    expect(check(p)).toBe('chain-mismatch');
  });

  it('skips the spender check when the signer is unknown', () => {
    expect(check(permission(), [transferCall], undefined)).toBeNull();
  });

  // The manager's execute-time target checks (JustaPermissionManager: CannotTargetSelf and
  // CannotTargetAccount), which even a wildcard allow-list can't bypass — without mirroring
  // them here these certain reverts would surface as an unnamed estimation failure.
  describe('mirrored CannotTargetSelf / CannotTargetAccount', () => {
    const wildcard = permission({ calls: [{ target: ANY_TARGET, selector: ANY_FN_SEL }] });

    it('flags a call to the permission manager itself', () => {
      expect(check(wildcard, [{ to: PERMISSIONS_MANAGER_ADDRESS }])).toBe('targets-manager');
    });

    it('flags a call to the granting account', () => {
      expect(check(wildcard, [{ to: GRANTER }])).toBe('targets-account');
    });

    it('names the target problem ahead of the allow-list check, like the contract', () => {
      // Under the non-wildcard permission this call fails BOTH checks — the target one wins.
      expect(check(permission(), [{ to: GRANTER, data: '0xdeadbeef' }])).toBe('targets-account');
    });
  });

  // Verified against the deployed manager on Base Sepolia (eth_simulateV1): a self-delegated
  // permission approves AND executes — nothing on-chain compares account to spender. So it is
  // a warning, and it must never outrank a finding that IS a certain revert.
  describe('self-delegated is a warning, not a block', () => {
    const selfDelegated = permission({ account: SPENDER });

    it('is non-blocking, unlike every revert-backed problem', () => {
      expect(isBlockingPermissionProblem('self-delegated')).toBe(false);
      expect(isBlockingPermissionProblem('lookup-failed')).toBe(false);
      const blocking: PermissionProblem[] = [
        'revoked',
        'expired',
        'not-yet-valid',
        'chain-mismatch',
        'wrong-spender',
        'targets-manager',
        'targets-account',
        'call-not-allowed',
      ];
      for (const p of blocking) expect(isBlockingPermissionProblem(p)).toBe(true);
    });

    it('never masks a certain revert: blocking findings win', () => {
      expect(check(selfDelegated, [{ to: USDC, data: `${APPROVE}00` }])).toBe('call-not-allowed');
      expect(check(selfDelegated, [{ to: SPENDER }])).toBe('targets-account');
      expect(check(selfDelegated, [transferCall], SPENDER, 1)).toBe('chain-mismatch');
    });

    it('its copy does not claim an on-chain rejection', () => {
      expect(PERMISSION_PROBLEM_TEXT['self-delegated'].detail).not.toMatch(/rejected on-chain/i);
      expect(PERMISSION_PROBLEM_TEXT['self-delegated'].detail).toMatch(/will execute/i);
    });
  });
});

describe('isWildcard', () => {
  it('matches both sentinels irrespective of casing', () => {
    expect(isWildcard(ANY_TARGET.toUpperCase())).toBe(true);
    expect(isWildcard(ANY_FN_SEL)).toBe(true);
  });

  it('does not match a real address or selector', () => {
    expect(isWildcard(USDC)).toBe(false);
    expect(isWildcard(TRANSFER)).toBe(false);
    expect(isWildcard(undefined)).toBe(false);
  });
});

// ============================================================================
// Revocation
// ============================================================================

function revocable(overrides: Partial<RevocablePermission> = {}): RevocablePermission {
  return {
    account: GRANTER,
    spender: SPENDER,
    end: NOW + 3600,
    chainId: '84532',
    ...overrides,
  };
}

describe('validatePermissionRevocation', () => {
  it('finds nothing wrong with a live permission revoked by its granter', () => {
    expect(
      validatePermissionRevocation({ permission: revocable(), from: GRANTER, chainId: 84532, now: NOW })
    ).toBeNull();
  });

  it('names a chain mismatch before anything else', () => {
    expect(
      validatePermissionRevocation({
        // Also expired and not-granter — the chain is the more fundamental mismatch.
        permission: revocable({ chainId: '1', end: NOW - 1 }),
        from: SPENDER,
        chainId: 84532,
        now: NOW,
      })
    ).toBe('chain-mismatch');
  });

  it('rejects a signer that is not the granter — the spender cannot revoke', () => {
    expect(validatePermissionRevocation({ permission: revocable(), from: SPENDER, chainId: 84532, now: NOW })).toBe(
      'not-granter'
    );
  });

  it('warns on an already-expired permission', () => {
    expect(
      validatePermissionRevocation({ permission: revocable({ end: NOW - 1 }), from: GRANTER, chainId: 84532, now: NOW })
    ).toBe('expired');
  });

  it('treats end === 0 as no expiry rather than long past', () => {
    expect(
      validatePermissionRevocation({ permission: revocable({ end: 0 }), from: GRANTER, chainId: 84532, now: NOW })
    ).toBeNull();
  });

  it('coerces a string end, so "0" is not read as truthy-and-past', () => {
    expect(
      validatePermissionRevocation({
        permission: revocable({ end: '0' as unknown as number }),
        from: GRANTER,
        chainId: 84532,
        now: NOW,
      })
    ).toBeNull();
  });

  it('reports a self-granted permission, but only once nothing else is wrong', () => {
    const selfGranted = revocable({ spender: GRANTER });
    expect(validatePermissionRevocation({ permission: selfGranted, from: GRANTER, chainId: 84532, now: NOW })).toBe(
      'self-delegated'
    );
    // An expiry outranks it: expired is about the revocation, self-granted about the grant.
    expect(
      validatePermissionRevocation({
        permission: { ...selfGranted, end: NOW - 1 },
        from: GRANTER,
        chainId: 84532,
        now: NOW,
      })
    ).toBe('expired');
  });

  it('skips the granter check when the signer is unknown', () => {
    expect(validatePermissionRevocation({ permission: revocable(), chainId: 84532, now: NOW })).toBeNull();
  });

  it('is case-insensitive about the granter', () => {
    expect(
      validatePermissionRevocation({
        permission: revocable(),
        from: GRANTER.toUpperCase(),
        chainId: 84532,
        now: NOW,
      })
    ).toBeNull();
  });
});

describe('isBlockingRevocationProblem', () => {
  // An unresolved permission blocks here, unlike on the execution path: the revoke call is built
  // from the fetched permission, so with no data there is nothing to submit.
  it.each<RevocationProblem>([
    'missing-id',
    'not-found',
    'lookup-failed',
    'chain-mismatch',
    'not-granter',
    'unknown-chain',
  ])('%s blocks the revocation', (problem) => {
    expect(isBlockingRevocationProblem(problem)).toBe(true);
  });

  it.each<RevocationProblem>(['expired', 'self-delegated'])('%s only warns', (problem) => {
    expect(isBlockingRevocationProblem(problem)).toBe(false);
  });

  it('has copy for every problem, and every problem is covered here', () => {
    const all = Object.keys(REVOCATION_PROBLEM_TEXT) as RevocationProblem[];
    expect(all).toHaveLength(8);
    for (const problem of all) {
      expect(REVOCATION_PROBLEM_TEXT[problem].text.length).toBeGreaterThan(0);
      expect(REVOCATION_PROBLEM_TEXT[problem].detail.length).toBeGreaterThan(0);
    }
  });

  // The bug this guards: a revoke request with no permission id reported *no* problem, so the
  // dialog rendered an empty permission with Confirm live. Every problem must either block or be
  // one of the two deliberate warnings — there is no third "say nothing" category.
  it('classifies every problem, so none can fall through silently', () => {
    const all = Object.keys(REVOCATION_PROBLEM_TEXT) as RevocationProblem[];
    const warned: RevocationProblem[] = ['expired', 'self-delegated'];
    for (const problem of all) {
      expect(isBlockingRevocationProblem(problem)).toBe(!warned.includes(problem));
    }
  });

  it('does not claim an on-chain rejection for the non-blocking findings', () => {
    expect(REVOCATION_PROBLEM_TEXT.expired.detail).not.toMatch(/rejected on-chain/i);
    expect(REVOCATION_PROBLEM_TEXT['self-delegated'].detail).not.toMatch(/rejected on-chain/i);
  });
});

// ── An unreadable stored chain id must not masquerade as a network mismatch ──────────────────────
// Both revoke callers derive the chainId they pass from the same relay record the validator reads,
// so `NaN !== NaN` (always true) made a corrupt stored id report "Wrong network".

describe('unreadable stored chain id', () => {
  it.each(['not-a-chain', 'NaN', '0x', 'null'])('revocation names it unknown-chain, not chain-mismatch: %s', (bad) => {
    expect(
      validatePermissionRevocation({
        permission: revocable({ chainId: bad }),
        from: GRANTER,
        chainId: Number.parseInt(bad, 16),
        now: NOW,
      })
    ).toBe('unknown-chain');
  });

  it('execution names it unknown-chain too', () => {
    expect(check(permission({ chainId: 'not-a-chain' }))).toBe('unknown-chain');
  });

  it('blocks a revocation but only warns an execution', () => {
    // The revoke call is built from the record we could not read, so there is nothing to submit.
    expect(isBlockingRevocationProblem('unknown-chain')).toBe(true);
    // An execution's calls come from the request; the manager still enforces the chain on-chain.
    expect(isBlockingPermissionProblem('unknown-chain')).toBe(false);
  });

  it('a readable chain id still compares as before', () => {
    expect(
      validatePermissionRevocation({ permission: revocable({ chainId: '1' }), from: GRANTER, chainId: 84532, now: NOW })
    ).toBe('chain-mismatch');
    expect(
      validatePermissionRevocation({
        permission: revocable({ chainId: '0x14a34' }),
        from: GRANTER,
        chainId: 84532,
        now: NOW,
      })
    ).toBeNull();
  });

  it('an absent chain id is not a problem — nothing to compare', () => {
    expect(
      validatePermissionRevocation({ permission: revocable({ chainId: '' }), from: GRANTER, chainId: 84532, now: NOW })
    ).toBeNull();
  });
});

describe('classifyPermissionLookupFailure', () => {
  it('reads a 404 off the error directly', () => {
    expect(classifyPermissionLookupFailure(Object.assign(new Error('gone'), { status: 404 }))).toBe('not-found');
  });

  it('reads a 404 off response.status, the raw transport shape', () => {
    expect(classifyPermissionLookupFailure({ response: { status: 404 } })).toBe('not-found');
  });

  it.each([500, 502, 400, 403])('treats %s as our lookup failing, not a missing permission', (status) => {
    expect(classifyPermissionLookupFailure({ status })).toBe('lookup-failed');
  });

  // The relay's HTTP-200-with-error-body path: controlledAxiosPromise throws a bare Error with no
  // status at all, so a status check alone reads a missing permission as "couldn't be loaded".
  it.each(['Permission not found', 'permission NOT FOUND', 'record does not exist', 'no such permission'])(
    'falls back to the message when there is no status: %s',
    (message) => {
      expect(classifyPermissionLookupFailure(new Error(message))).toBe('not-found');
    }
  );

  it.each(['Network Error', 'timeout of 5000ms exceeded', 'Something went wrong'])(
    'a status-less error that does not read as missing stays lookup-failed: %s',
    (message) => {
      expect(classifyPermissionLookupFailure(new Error(message))).toBe('lookup-failed');
    }
  );

  it('survives a non-Error throw', () => {
    expect(classifyPermissionLookupFailure(undefined)).toBe('lookup-failed');
    expect(classifyPermissionLookupFailure('not found')).toBe('not-found');
  });
});
