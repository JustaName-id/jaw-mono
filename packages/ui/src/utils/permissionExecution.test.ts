import { describe, expect, it } from 'vitest';
import { ANY_FN_SEL, ANY_TARGET } from '@jaw.id/core';
import { isWildcard, validatePermissionExecution, type ExecutionPermission } from './permissionExecution';

const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const SPENDER = '0x000000000000000000000000000000000000dEaD';
const GRANTER = '0x1111111111111111111111111111111111111111';
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

  it('reports self-delegation ahead of a spender mismatch', () => {
    expect(check(permission({ account: SPENDER }), [transferCall], GRANTER)).toBe('self-delegated');
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
    expect(check(permission(), [{ to: GRANTER, data: `${TRANSFER}00` }])).toBe('call-not-allowed');
  });

  it('flags a batch where only one call is disallowed', () => {
    expect(check(permission(), [transferCall, { to: USDC, data: `${APPROVE}00` }])).toBe('call-not-allowed');
  });

  it('flags a bare value transfer when no selector is permitted', () => {
    expect(check(permission(), [{ to: USDC }])).toBe('call-not-allowed');
  });

  it('allows any selector on a permitted contract under a selector wildcard', () => {
    const p = permission({ calls: [{ target: USDC, selector: ANY_FN_SEL }] });
    expect(check(p, [{ to: USDC, data: `${APPROVE}00` }])).toBeNull();
  });

  it('allows a permitted selector on any contract under a target wildcard', () => {
    const p = permission({ calls: [{ target: ANY_TARGET, selector: TRANSFER }] });
    expect(check(p, [{ to: GRANTER, data: `${TRANSFER}00` }])).toBeNull();
  });

  it('reports the chain mismatch first when several checks fail', () => {
    const p = permission({ chainId: '0x1', end: NOW - 1, spender: GRANTER });
    expect(check(p)).toBe('chain-mismatch');
  });

  it('skips the spender check when the signer is unknown', () => {
    expect(check(permission(), [transferCall], undefined)).toBeNull();
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
