// A bogus domain.chainId (NaN from a failed hex parse) must fall back to the
// connected chain rather than slipping through: `typeof NaN === 'number'` used
// to short-circuit and `NaN ?? chainId` never fell back, silently disabling
// clear signing.
import { describe, it, expect, vi } from 'vitest';
vi.mock('@jaw.id/core', () => ({ SUPPORTED_CHAINS: [] }));
import { normalizeChainId } from './eip712';

describe('normalizeChainId (blocker 4: bogus chainId must fall back, not slip through)', () => {
  it('rejects NaN so the `?? connectedChain` fallback engages', () => {
    expect(normalizeChainId(NaN)).toBeUndefined();
  });
  it('rejects Infinity', () => {
    expect(normalizeChainId(Infinity)).toBeUndefined();
  });
  it('accepts a finite number', () => {
    expect(normalizeChainId(8453)).toBe(8453);
  });
  it('parses a hex-string chainId', () => {
    expect(normalizeChainId('0x2105')).toBe(8453);
  });
  it('parses a decimal-string chainId', () => {
    expect(normalizeChainId('137')).toBe(137);
  });
  it('coerces a bigint chainId', () => {
    expect(normalizeChainId(1n)).toBe(1);
  });
  it('rejects a non-numeric string', () => {
    expect(normalizeChainId('0xnothex')).toBeUndefined();
  });
  it('rejects an empty string and undefined', () => {
    expect(normalizeChainId('')).toBeUndefined();
    expect(normalizeChainId(undefined)).toBeUndefined();
  });
});
