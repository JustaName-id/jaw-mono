import { describe, expect, it } from 'vitest';
import { mapAssetChanges, type RawAssetChange } from './assetPreview';

const ETH = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

function change(address: string, diff: bigint, decimals?: number, symbol?: string): RawAssetChange {
  return { token: { address, decimals, symbol }, value: { pre: 0n, post: diff, diff } };
}

describe('mapAssetChanges', () => {
  it('maps native outgoing as direction "out" with formatted magnitude and isNative', () => {
    const [d] = mapAssetChanges([change(ETH, -2_000_000_000_000_000_000n, 18, 'ETH')]);
    expect(d).toEqual({
      address: ETH,
      symbol: 'ETH',
      decimals: 18,
      diff: -2_000_000_000_000_000_000n,
      direction: 'out',
      amountFormatted: '2',
      isNative: true,
    });
  });

  it('maps ERC-20 incoming as direction "in" using token decimals', () => {
    const [d] = mapAssetChanges([change(USDC, 1_500_000n, 6, 'USDC')]);
    expect(d.direction).toBe('in');
    expect(d.amountFormatted).toBe('1.5');
    expect(d.symbol).toBe('USDC');
    expect(d.isNative).toBe(false);
  });

  it('drops zero-diff entries', () => {
    expect(mapAssetChanges([change(USDC, 0n, 6, 'USDC')])).toEqual([]);
  });

  it('drops non-native entries missing a symbol', () => {
    expect(mapAssetChanges([change(USDC, 5n, 6, undefined)])).toEqual([]);
  });

  it('drops non-native entries missing decimals', () => {
    expect(mapAssetChanges([change(USDC, 5n, undefined, 'USDC')])).toEqual([]);
  });

  it('preserves order and keeps both directions', () => {
    const out = mapAssetChanges([
      change(ETH, -1_000_000_000_000_000_000n, 18, 'ETH'),
      change(USDC, 3_000_000n, 6, 'USDC'),
    ]);
    expect(out.map((d) => d.direction)).toEqual(['out', 'in']);
  });
});
