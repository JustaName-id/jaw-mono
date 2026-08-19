import { describe, expect, it, vi } from 'vitest';
import { ANY_FN_SEL, EMPTY_CALLDATA_FN_SEL } from '@jaw.id/core';
import { resolveFunctionSignature, selectVerifiedSignature, sentinelSignature } from './functionSignature';

describe('sentinelSignature', () => {
  // Neither is a real selector, so no registry can answer for them — they must resolve without a
  // lookup or the allowed-call list shows hex for a wildcard.
  it('labels the permission-manager sentinels', () => {
    expect(sentinelSignature(ANY_FN_SEL)).toBe('Any Function');
    expect(sentinelSignature(EMPTY_CALLDATA_FN_SEL)).toBe('Empty Calldata');
  });

  it('is case-insensitive', () => {
    expect(sentinelSignature(ANY_FN_SEL.toUpperCase())).toBe('Any Function');
  });

  // Everything else is the registry's job — no local copy to drift out of date.
  it('claims nothing about a real selector', () => {
    expect(sentinelSignature('0xa9059cbb')).toBeNull();
    expect(sentinelSignature('0x095ea7b3')).toBeNull();
    expect(sentinelSignature('0xdeadbeef')).toBeNull();
    expect(sentinelSignature(undefined)).toBeNull();
  });
});

describe('resolveFunctionSignature', () => {
  it('answers a sentinel without reaching the network', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(resolveFunctionSignature(ANY_FN_SEL)).resolves.toBe('Any Function');
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('rejects anything that is not a 4-byte selector without looking it up', async () => {
    for (const bad of ['0x', '0xabc', 'transfer', '0xa9059cbbaa', '']) {
      await expect(resolveFunctionSignature(bad)).resolves.toBeNull();
    }
  });

  it('returns null rather than throwing when the registry is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(resolveFunctionSignature('0x1234abcd')).resolves.toBeNull();
    vi.unstubAllGlobals();
  });
});

// Fixtures are real responses captured from api.openchain.xyz.
describe('selectVerifiedSignature', () => {
  it('accepts a single verified preimage', () => {
    expect(selectVerifiedSignature('0x617ba037', ['supply(address,uint256,address,uint16)'])).toBe(
      'supply(address,uint256,address,uint16)'
    );
  });

  // The selectors that used to be hardcoded now come from the registry — and each verifies to the
  // same string the table held, which is why the table was redundant.
  it.each([
    ['0x095ea7b3', 'approve(address,uint256)'],
    ['0xa9059cbb', 'transfer(address,uint256)'],
    ['0x23b872dd', 'transferFrom(address,address,uint256)'],
    ['0x87517c45', 'approve(address,address,uint160,uint48)'],
    ['0xcc53287f', 'lockdown((address,address)[])'],
  ])('verifies %s as the signature the table used to assert', (selector, signature) => {
    expect(selectVerifiedSignature(selector, [signature])).toBe(signature);
  });

  it('drops a candidate that does not hash to the selector', () => {
    expect(selectVerifiedSignature('0xa9059cbb', ['transfer(address,uint256)', 'notTheRightThing()'])).toBe(
      'transfer(address,uint256)'
    );
  });

  // The attack: both of these genuinely hash to 0xa22cb465, so registry order would decide what a
  // user reads. Refusing is the only honest answer — the row falls back to raw hex.
  it('refuses a farmed collision rather than trusting registry order', () => {
    const candidates = ['setApprovalForAll(address,bool)', 'niceFunctionHerePlzClick943230089(address,bool)'];
    expect(selectVerifiedSignature('0xa22cb465', candidates)).toBeNull();
    expect(selectVerifiedSignature('0xa22cb465', [...candidates].reverse())).toBeNull();
  });

  it('returns null for an empty or wholly unverifiable list', () => {
    expect(selectVerifiedSignature('0xa9059cbb', [])).toBeNull();
    expect(selectVerifiedSignature('0xa9059cbb', ['nope(', 'alsoNope()'])).toBeNull();
  });
});
