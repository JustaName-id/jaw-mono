import { describe, expect, it } from 'vitest';
import { ANY_FN_SEL, ANY_TARGET, EMPTY_CALLDATA_FN_SEL, PERMISSIONS_MANAGER_ADDRESS } from '@jaw.id/core';
import {
  isBlockingPermissionProblem,
  isWildcard,
  PERMISSION_PROBLEM_TEXT,
  validatePermissionExecution,
  type ExecutionPermission,
  type PermissionProblem,
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
