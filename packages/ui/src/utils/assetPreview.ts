import { createPublicClient, ethAddress, formatUnits, http, type Address } from 'viem';
import { simulateCalls } from 'viem/actions';
import { JAW_RPC_URL, type TransactionCall } from '@jaw.id/core';

export interface RawAssetChange {
  token: { address: string; decimals?: number; symbol?: string };
  value: { pre: bigint; post: bigint; diff: bigint };
}

export interface AssetDelta {
  address: string;
  symbol?: string;
  decimals: number;
  diff: bigint;
  direction: 'in' | 'out';
  amountFormatted: string;
  isNative: boolean;
}

/**
 * Normalize viem's `assetChanges` into the rows the UI renders.
 * Drops zero-diff entries and non-native entries without a usable symbol/decimals.
 * Addresses in `erc721` are rendered as whole-token counts (viem reports NFT decimals
 * as `1` or `undefined`, which would otherwise show as "0.1" or be dropped).
 */
export function mapAssetChanges(
  changes: readonly RawAssetChange[],
  erc721: ReadonlySet<string> = new Set()
): AssetDelta[] {
  const out: AssetDelta[] = [];
  for (const c of changes) {
    const diff = c.value.diff;
    if (diff === 0n) continue;

    const isNative = c.token.address.toLowerCase() === ethAddress;
    const isNft = erc721.has(c.token.address.toLowerCase());
    const symbol = isNative ? (c.token.symbol ?? 'ETH') : c.token.symbol;
    const decimals = isNative ? 18 : isNft ? 0 : c.token.decimals;

    if (!isNative && !isNft && decimals === undefined) continue;
    if (!isNative && !symbol) continue;

    const resolvedDecimals = decimals ?? 18;
    const magnitude = diff < 0n ? -diff : diff;
    out.push({
      address: c.token.address,
      symbol,
      decimals: resolvedDecimals,
      diff,
      direction: diff < 0n ? 'out' : 'in',
      amountFormatted: formatUnits(magnitude, resolvedDecimals),
      isNative,
    });
  }
  return out;
}

// Intl avoids scientific notation for large magnitudes and caps display at 4 decimals.
const amountFormatter = new Intl.NumberFormat('en-US', { useGrouping: false, maximumFractionDigits: 4 });

/** Format a formatUnits string for display: at most 4 decimals, sub-0.0001 dust floored to "<0.0001". */
export function formatAssetAmount(amountFormatted: string): string {
  const n = Number(amountFormatted);
  if (n > 0 && n < 0.0001) return '<0.0001';
  return amountFormatter.format(n);
}

function jawRpcUrl(chainId: number, apiKey?: string): string {
  return apiKey ? `${JAW_RPC_URL}?chainId=${chainId}&api-key=${apiKey}` : `${JAW_RPC_URL}?chainId=${chainId}`;
}

const clientCache = new Map<string, ReturnType<typeof createPublicClient>>();
function getClient(chainId: number, apiKey?: string) {
  const key = `${chainId}:${apiKey ?? ''}`;
  let client = clientCache.get(key);
  if (!client) {
    client = createPublicClient({ transport: http(jawRpcUrl(chainId, apiKey)) });
    clientCache.set(key, client);
  }
  return client;
}

const ERC721_INTERFACE_ID = '0x80ac58cd' as const;
const erc165Abi = [
  {
    type: 'function',
    name: 'supportsInterface',
    stateMutability: 'view',
    inputs: [{ name: 'interfaceID', type: 'bytes4' }],
    outputs: [{ type: 'bool' }],
  },
] as const;

/**
 * Confirm which of `addresses` are ERC-721 via ERC-165 `supportsInterface`. One `eth_call`
 * per address; failures (no ERC-165 support, e.g. a real ERC-20) resolve to `false`.
 * Returns the confirmed addresses lowercased.
 */
async function detectErc721(client: ReturnType<typeof createPublicClient>, addresses: string[]): Promise<Set<string>> {
  const confirmed = new Set<string>();
  if (addresses.length === 0) return confirmed;

  const checks = await Promise.all(
    addresses.map((address) =>
      client
        .readContract({
          address: address as Address,
          abi: erc165Abi,
          functionName: 'supportsInterface',
          args: [ERC721_INTERFACE_ID],
        })
        .catch(() => false)
    )
  );

  addresses.forEach((address, i) => {
    if (checks[i] === true) confirmed.add(address.toLowerCase());
  });
  return confirmed;
}

/**
 * Simulate the batch against current chain state and return the net per-asset balance
 * changes for `account`. Throws on simulation failure — the caller owns the fallback.
 */
export async function simulateAssetChanges({
  chainId,
  apiKey,
  account,
  calls,
}: {
  chainId: number;
  apiKey?: string;
  account: Address;
  calls: TransactionCall[];
}): Promise<AssetDelta[]> {
  const client = getClient(chainId, apiKey);
  const normalizedCalls = calls.map((c) => ({
    to: c.to as Address,
    value: c.value === undefined ? undefined : typeof c.value === 'string' ? BigInt(c.value) : c.value,
    data: c.data,
  }));
  const { assetChanges } = await simulateCalls(client, {
    account,
    calls: normalizedCalls,
    traceAssetChanges: true,
  });
  const raw = assetChanges as readonly RawAssetChange[];

  // viem reports NFT decimals as `1` or `undefined`; probe only those entries (the common
  // ERC-20/native path has real decimals and is skipped) so confirmed ERC-721s render as
  // whole-token counts instead of "0.1" or being dropped.
  const candidates = [
    ...new Set(
      raw
        .filter(
          (c) =>
            c.value.diff !== 0n &&
            c.token.address.toLowerCase() !== ethAddress &&
            (c.token.decimals === undefined || c.token.decimals === 1)
        )
        .map((c) => c.token.address)
    ),
  ];
  const erc721 = await detectErc721(client, candidates);
  return mapAssetChanges(raw, erc721);
}
