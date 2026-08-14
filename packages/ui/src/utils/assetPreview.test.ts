import { describe, expect, it } from 'vitest';
import {
  ExecutionRevertedError,
  HttpRequestError,
  RawContractError,
  ethAddress,
  type Address,
  type Client,
} from 'viem';
import { formatAssetAmount, mapAssetChanges, resolveTokenUnits, type RawAssetChange } from './assetPreview';

/** A viem `assetChanges` entry, in the shape `simulateCalls` returns. */
function change(
  address: string,
  diff: bigint,
  token: { decimals?: number; symbol?: string } = {},
  pre = 0n
): RawAssetChange {
  return { token: { address, ...token }, value: { pre, post: pre + diff, diff } };
}

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
// Two shapes an ERC-721 arrives in, named for the Base contracts they were observed on: viem
// reports the first as `decimals: 1` (its `tokenURI` answers, so it falls into `decimals() ?? 1`)
// and the second as `undefined` (both probes revert). The addresses are only fixtures — nothing
// here reaches a chain, so treat them as "a token shaped like this", not as a verified claim.
const BRZ = '0xa360c63e8e4e7ce584d8f41fb071bc80b56a3e93';
const AERO_POS = '0x827922686190790b37229fd06084350e74485b72';
// A token whose `decimals()` returns 0, which viem's `tokenURI_ || decimals_` guard reads as
// falsy and reports as `undefined`.
const ZERO_DEC = '0x0000000000000000000000000000000000000d00';

describe('mapAssetChanges', () => {
  it('splits a swap into an outgoing and an incoming row', () => {
    const deltas = mapAssetChanges([
      change(ethAddress, -5_000_000_000_000_000n, { decimals: 18, symbol: 'ETH' }),
      change(USDC, 12_500_000n, { decimals: 6, symbol: 'USDC' }),
    ]);

    expect(deltas).toEqual([
      expect.objectContaining({ symbol: 'ETH', direction: 'out', amountFormatted: '0.005', isNative: true }),
      expect.objectContaining({ symbol: 'USDC', direction: 'in', amountFormatted: '12.5', isNative: false }),
    ]);
  });

  it('drops assets the batch left untouched', () => {
    // viem returns a row per candidate, diff included — a preview must not list a 0 change.
    expect(mapAssetChanges([change(USDC, 0n, { decimals: 6, symbol: 'USDC' }, 1_000_000n)])).toEqual([]);
  });

  it('renders a confirmed ERC-721 as a whole-token count, not "0.1"', () => {
    const [delta] = mapAssetChanges([change(BRZ, -1n, { decimals: 1, symbol: 'BRZ' })], new Set([BRZ.toLowerCase()]));

    expect(delta).toMatchObject({ decimals: 0, direction: 'out', amountFormatted: '1' });
  });

  it('keeps an ERC-721 whose decimals viem could not read at all', () => {
    const changes = [change(AERO_POS, 1n, { symbol: 'AERO-CL-POS' })];

    // Unconfirmed it has no usable unit, so it cannot be rendered as an amount...
    expect(mapAssetChanges(changes)).toEqual([]);
    // ...but ERC-165 makes it a count.
    expect(mapAssetChanges(changes, new Set([AERO_POS.toLowerCase()]))).toEqual([
      expect.objectContaining({ decimals: 0, direction: 'in', amountFormatted: '1' }),
    ]);
  });

  it('matches the ERC-721 set case-insensitively', () => {
    // viem lowercases every candidate today, but `mapAssetChanges` is an exported helper and
    // callers pass their own rows — the set lookup must not depend on which casing arrives.
    const [delta] = mapAssetChanges(
      [change(BRZ.toUpperCase().replace('0X', '0x'), -1n, { decimals: 1, symbol: 'BRZ' })],
      new Set([BRZ.toLowerCase()])
    );

    expect(delta.decimals).toBe(0);
  });

  it('drops an ERC-20 with no symbol', () => {
    // A bytes32 `symbol()` (MKR-style) fails viem's decode and arrives undefined.
    expect(mapAssetChanges([change(USDC, 1_000_000n, { decimals: 6 })])).toEqual([]);
  });

  it('treats the native pseudo-address as native whatever viem reports', () => {
    const [delta] = mapAssetChanges([change(ethAddress.toUpperCase().replace('0X', '0x'), 1n)]);

    expect(delta).toMatchObject({ isNative: true, decimals: 18, symbol: 'ETH' });
  });
});

const SUPPORTS_INTERFACE = '0x01ffc9a7';
const DECIMALS = '0x313ce567';
const BLOCK = 31_337n;

const word = (n: number) => `0x${n.toString(16).padStart(64, '0')}` as const;

interface Probe {
  to: Address;
  data: `0x${string}`;
  blockNumber?: bigint;
}

/**
 * A client stubbed at the `call` seam `readContract` dispatches through (viem's `getAction`
 * prefers `client.call` over the tree-shakable action), so the probes still run their real
 * ABI encode/decode and their real error classification — only the transport is fake.
 *
 * `answer` receives the 4-byte selector and returns either return data or an error to throw.
 */
function stubClient(answer: (selector: string, to: string) => `0x${string}` | Error) {
  const probes: Probe[] = [];
  const client = {
    call: async (params: Probe) => {
      probes.push(params);
      const result = answer(params.data.slice(0, 10), params.to.toLowerCase());
      if (result instanceof Error) throw result;
      return { data: result };
    },
  };
  return { client: client as unknown as Client, probes };
}

/** What a contract missing the function returns through Multicall3's `allowFailure`. */
const reverted = () => new RawContractError({ data: '0x' });

describe('resolveTokenUnits', () => {
  it('confirms an ERC-721 that viem guessed at decimals 1', async () => {
    const { client, probes } = stubClient(() => word(1));
    const changes = [change(BRZ, -1n, { decimals: 1, symbol: 'BRZ' })];

    const units = await resolveTokenUnits(client, changes, BLOCK);

    expect(units.erc721).toEqual(new Set([BRZ.toLowerCase()]));
    expect(units.changes).toEqual(changes);
    // A `1` is already a usable unit, so only the interface question goes out.
    expect(probes.map((p) => p.data.slice(0, 10))).toEqual([SUPPORTS_INTERFACE]);
  });

  it('recovers a 0-decimal ERC-20 that viem reported as undefined', async () => {
    const { client } = stubClient((selector) => (selector === SUPPORTS_INTERFACE ? reverted() : word(0)));
    const changes = [change(ZERO_DEC, 42n, { symbol: 'ZERO' })];

    const units = await resolveTokenUnits(client, changes, BLOCK);

    expect(units.erc721.size).toBe(0);
    expect(units.changes[0].token.decimals).toBe(0);
    // Without the recovery the row is dropped outright — a transfer missing from a signing screen.
    expect(mapAssetChanges(units.changes, units.erc721)).toEqual([
      expect.objectContaining({ symbol: 'ZERO', decimals: 0, direction: 'in', amountFormatted: '42' }),
    ]);
    expect(mapAssetChanges(changes)).toEqual([]);
  });

  it('lets ERC-165 outrank a decimals() answer', async () => {
    // A contract can answer both. A confirmed NFT is a count whatever `decimals()` claims.
    const { client } = stubClient((selector) => (selector === SUPPORTS_INTERFACE ? word(1) : word(6)));

    const units = await resolveTokenUnits(client, [change(AERO_POS, 1n, { symbol: 'POS' })], BLOCK);

    expect(units.erc721).toEqual(new Set([AERO_POS.toLowerCase()]));
    expect(units.changes[0].token.decimals).toBeUndefined();
  });

  it('issues every probe in one tick so they fold into a single Multicall3', async () => {
    const { client, probes } = stubClient(() => word(1));

    const pending = resolveTokenUnits(client, [change(AERO_POS, 1n, { symbol: 'POS' })], BLOCK);

    // viem's multicall scheduler only batches calls made on one client within a tick, so both
    // questions must be asked before either answer is awaited.
    expect(probes.map((p) => p.data.slice(0, 10))).toEqual([SUPPORTS_INTERFACE, DECIMALS]);
    await pending;
  });

  it('reads the probes at the block the balances were measured against', async () => {
    const { client, probes } = stubClient(() => word(1));

    await resolveTokenUnits(client, [change(BRZ, -1n, { decimals: 1, symbol: 'BRZ' })], BLOCK);

    expect(probes.every((p) => p.blockNumber === BLOCK)).toBe(true);
  });

  it('rejects when the request fails, rather than reading that as "not an NFT"', async () => {
    // The probes share one Multicall3 request, which rejects wholesale — swallowing this would
    // drop every NFT in the batch from the preview and show no error for it.
    const { client } = stubClient(
      () => new HttpRequestError({ details: 'Service Unavailable', status: 503, url: 'https://rpc.jaw.id' })
    );

    await expect(resolveTokenUnits(client, [change(BRZ, -1n, { decimals: 1 })], BLOCK)).rejects.toThrow();
  });

  it('reads a decimals() past the safe-integer range as no answer', async () => {
    // viem decodes `uint8` by reading the whole 32-byte word and range-checking it only
    // against `Number.MAX_SAFE_INTEGER`, so a hostile token can throw from *decoding*. That
    // is still the contract answering: rejecting would empty the preview for every other
    // asset in the batch, and accepting the number would hand `formatUnits` a 10^60 padStart.
    const huge = `0x${(2n ** 200n).toString(16).padStart(64, '0')}` as const;
    const { client } = stubClient((selector) => (selector === SUPPORTS_INTERFACE ? reverted() : huge));

    const units = await resolveTokenUnits(client, [change(ZERO_DEC, 42n, { symbol: 'HUGE' })], BLOCK);

    expect(units.changes[0].token.decimals).toBeUndefined();
    expect(mapAssetChanges(units.changes, units.erc721)).toEqual([]);
  });

  it('reads return data short of a word as no answer', async () => {
    // Not the same shape as `0x`: there are bytes, just not 32 of them.
    const { client } = stubClient(() => `0x${'00'.repeat(16)}` as const);

    const units = await resolveTokenUnits(client, [change(AERO_POS, 1n, { symbol: 'POS' })], BLOCK);

    expect(units.erc721.size).toBe(0);
    expect(units.changes[0].token.decimals).toBeUndefined();
  });

  it('reads empty return data as no answer', async () => {
    // A candidate with no code: Multicall3 reports success with `0x`, which viem surfaces as
    // `ContractFunctionZeroDataError` rather than as a revert.
    const { client } = stubClient(() => '0x');

    const units = await resolveTokenUnits(client, [change(AERO_POS, 1n, { symbol: 'POS' })], BLOCK);

    expect(units.erc721.size).toBe(0);
    expect(units.changes[0].token.decimals).toBeUndefined();
  });

  it('reads a node-level execution revert as no answer', async () => {
    // The unbatched path: on a chain with no Multicall3 address viem issues plain eth_calls,
    // so a revert arrives as `ExecutionRevertedError` instead of through `allowFailure`.
    const { client } = stubClient(() => new ExecutionRevertedError({}));
    const changes = [change(BRZ, -1n, { decimals: 1, symbol: 'BRZ' })];

    const units = await resolveTokenUnits(client, changes, BLOCK);

    expect(units.erc721.size).toBe(0);
    expect(units.changes).toEqual(changes);
  });

  it('reads a non-boolean supportsInterface answer as "not an NFT"', async () => {
    const { client } = stubClient((selector) => (selector === SUPPORTS_INTERFACE ? word(2) : word(6)));

    const units = await resolveTokenUnits(client, [change(AERO_POS, 1n, { symbol: 'POS' })], BLOCK);

    expect(units.erc721.size).toBe(0);
    expect(units.changes[0].token.decimals).toBe(6);
  });

  it('probes only what viem could have guessed wrong', async () => {
    const { client, probes } = stubClient(() => reverted());

    await resolveTokenUnits(
      client,
      [
        change(USDC, 5n, { decimals: 6, symbol: 'USDC' }), // readable decimals
        change(BRZ, 0n, { decimals: 1, symbol: 'BRZ' }), // ambiguous, but the batch left it alone
        change(ethAddress, 5n, {}), // native is measured directly, never probed
        change(AERO_POS, 1n, { decimals: 1, symbol: 'POS' }), // the only suspect
      ],
      BLOCK
    );

    expect(probes.map((p) => p.to.toLowerCase())).toEqual([AERO_POS.toLowerCase()]);
  });

  it('treats decimals 1 as ambiguous and 2 as an answer', async () => {
    // Pins *our* reading of viem's `decimals() ?? 1` fallback, not the fallback itself: the
    // stub answers below `readContract` and never reaches `simulateCalls`, so nothing here
    // can catch upstream moving that sentinel. Nothing in this suite can. A release inside
    // `^2.55.16` that changed it would silently render every NFT as "0.1" again, which is why
    // `resolveTokenUnits` spells out the expression it depends on.
    const { client, probes } = stubClient(() => reverted());

    await resolveTokenUnits(
      client,
      [change(BRZ, 1n, { decimals: 1, symbol: 'ONE' }), change(USDC, 1n, { decimals: 2, symbol: 'TWO' })],
      BLOCK
    );

    expect(probes.map((p) => p.to.toLowerCase())).toEqual([BRZ.toLowerCase()]);
  });

  it('asks nothing when every token reported readable decimals', async () => {
    const { client, probes } = stubClient(() => word(1));
    const changes = [change(USDC, 5n, { decimals: 6, symbol: 'USDC' })];

    const units = await resolveTokenUnits(client, changes, BLOCK);

    expect(probes).toHaveLength(0);
    expect(units.changes).toEqual(changes);
    expect(units.erc721.size).toBe(0);
  });
});

describe('formatAssetAmount', () => {
  it('caps display at 4 decimals', () => {
    expect(formatAssetAmount('1.23456789')).toBe('1.2346');
  });

  it('keeps large amounts out of scientific notation and ungrouped', () => {
    expect(formatAssetAmount('1000000000000')).toBe('1000000000000');
  });

  it('goes approximate past 2^53 — `Number` is the ceiling on this path', () => {
    // Recorded, not endorsed: the input is a `formatUnits` string but it is parsed with
    // `Number`, so a quadrillion-supply token renders with the tail zeroed. Fixing it means
    // formatting from the string's own digits (with carry) instead of via a double.
    expect(formatAssetAmount('123456789012345678901234.5678')).toBe('123456789012345690000000');
  });

  it('floors sub-0.0001 dust to a subscript form instead of "0"', () => {
    expect(formatAssetAmount('0.000000123')).toBe('0.0₆123');
  });

  it('leaves a plain zero alone', () => {
    expect(formatAssetAmount('0')).toBe('0');
  });
});
