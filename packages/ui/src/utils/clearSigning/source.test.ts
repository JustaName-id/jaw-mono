import { describe, expect, it } from 'vitest';
import { resolveRelativePath, mergeDescriptor, loadDescriptor } from './source';

/* eslint-disable @typescript-eslint/no-explicit-any */
// Imports from './source' directly (not the barrel), so this stays free of the
// @jaw.id/core-dependent formatter — the point of the module split.

describe('resolveRelativePath', () => {
  it('resolves ../ segments relative to the including file', () => {
    expect(
      resolveRelativePath('registry/permit/eip712-permit-usdc.json', '../../ercs/eip712-erc2612-permit.json')
    ).toBe('ercs/eip712-erc2612-permit.json');
  });

  it('handles ./ (same directory)', () => {
    expect(resolveRelativePath('a/b/c.json', './d.json')).toBe('a/b/d.json');
  });
});

describe('mergeDescriptor', () => {
  it('keeps base formats, lets local context win, merges nested objects', () => {
    const base = {
      context: { eip712: { domain: { name: 'USD Coin' } } },
      display: { formats: { 'Permit(x)': { intent: 'base intent' } } },
    } as any;
    const local = {
      context: { eip712: { deployments: [{ chainId: 1, address: '0xusdc' }] } },
      display: { formats: {} },
    } as any;

    const merged = mergeDescriptor(base, local);
    expect(merged.display.formats['Permit(x)']).toEqual({ intent: 'base intent' });
    expect(merged.context.eip712?.domain).toEqual({ name: 'USD Coin' });
    expect(merged.context.eip712?.deployments).toEqual([{ chainId: 1, address: '0xusdc' }]);
  });
});

describe('loadDescriptor', () => {
  const makeSource = (files: Record<string, unknown>) =>
    ({
      getCalldataIndex: async () => ({}),
      getEip712Index: async () => ({}),
      getDescriptor: async (p: string) => {
        if (!(p in files)) throw new Error(`404 ${p}`);
        return JSON.parse(JSON.stringify(files[p]));
      },
    }) as any;

  it('resolves an includes chain and surfaces the base formats (the Permit case)', async () => {
    const files = {
      'registry/permit/usdc.json': {
        includes: '../../ercs/permit.json',
        context: { eip712: { deployments: [{ chainId: 1, address: '0xusdc' }], domain: { name: 'USD Coin' } } },
      },
      'ercs/permit.json': {
        display: { formats: { 'Permit(address owner)': { intent: 'Authorize spending of tokens', fields: [] } } },
      },
    };
    const d = await loadDescriptor(makeSource(files), 'registry/permit/usdc.json');
    expect(d.includes).toBeUndefined();
    expect(Object.keys(d.display.formats)).toContain('Permit(address owner)');
    expect(d.context.eip712?.domain).toEqual({ name: 'USD Coin' });
    expect(d.context.eip712?.deployments).toEqual([{ chainId: 1, address: '0xusdc' }]);
  });

  it('falls back gracefully when the included file is missing', async () => {
    const files = { 'x.json': { includes: '../missing.json', display: { formats: {} } } };
    const d = await loadDescriptor(makeSource(files), 'x.json');
    expect(d.includes).toBeUndefined();
  });

  it('returns a plain descriptor unchanged when there is no include', async () => {
    const files = { 'x.json': { display: { formats: { A: { intent: 'a' } } } } };
    const d = await loadDescriptor(makeSource(files), 'x.json');
    expect(d.display.formats).toEqual({ A: { intent: 'a' } });
  });
});
