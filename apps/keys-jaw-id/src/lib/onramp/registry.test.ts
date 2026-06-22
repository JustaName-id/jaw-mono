import { describe, it, expect } from 'vitest';
import { getOnrampProvider, listOnrampProviders } from './registry';

describe('onramp registry', () => {
  it('resolves the coinbase provider by id', () => {
    const p = getOnrampProvider('coinbase');
    expect(p.id).toBe('coinbase');
    expect(p.label).toBe('Coinbase');
    expect(p.supportedNetworks).toContain('base');
  });

  it('lists available providers as client-safe metadata', () => {
    const list = listOnrampProviders();
    expect(list.some((p) => p.id === 'coinbase')).toBe(true);
    // metadata only — no methods leak through
    expect(Object.keys(list[0]).sort()).toEqual(['id', 'label', 'supportedNetworks']);
  });

  it('throws a helpful error for an unknown provider', () => {
    expect(() => getOnrampProvider('does-not-exist')).toThrow(/Unknown onramp provider/);
  });
});
