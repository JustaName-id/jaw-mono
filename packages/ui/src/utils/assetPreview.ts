import { createPublicClient, formatUnits, http, type Address } from 'viem';
import { simulateCalls } from 'viem/actions';
import { JAW_RPC_URL, type TransactionCall } from '@jaw.id/core';

const ETH_SENTINEL = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

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
 */
export function mapAssetChanges(changes: readonly RawAssetChange[]): AssetDelta[] {
  const out: AssetDelta[] = [];
  for (const c of changes) {
    const diff = c.value.diff;
    if (diff === 0n) continue;

    const isNative = c.token.address.toLowerCase() === ETH_SENTINEL;
    const decimals = isNative ? 18 : c.token.decimals;
    const symbol = isNative ? (c.token.symbol ?? 'ETH') : c.token.symbol;

    if (!isNative && (decimals === undefined || !symbol)) continue;

    const magnitude = diff < 0n ? -diff : diff;
    out.push({
      address: c.token.address,
      symbol,
      decimals: decimals ?? 18,
      diff,
      direction: diff < 0n ? 'out' : 'in',
      amountFormatted: formatUnits(magnitude, decimals ?? 18),
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
  return mapAssetChanges(assetChanges as readonly RawAssetChange[]);
}
