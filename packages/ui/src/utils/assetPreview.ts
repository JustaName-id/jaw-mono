import {
  createPublicClient,
  decodeFunctionResult,
  encodeFunctionData,
  ethAddress,
  formatUnits,
  hexToBigInt,
  http,
  zeroAddress,
  type Address,
} from 'viem';
import { simulateBlocks, simulateCalls } from 'viem/actions';
import { JAW_RPC_URL, type TransactionCall } from '@jaw.id/core';
import { deriveTransferDeltas, type SimulatedLog } from './transferDeltas';

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

export interface AssetSimulationResult {
  deltas: AssetDelta[];
  /** True when any call in the batch reverted during simulation — the batch would fail on-chain. */
  willRevert: boolean;
}

const erc20MetadataAbi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
] as const;

/**
 * Simulate the batch against current chain state and return the net per-asset balance
 * changes for `account`. Throws on simulation failure — the caller owns the fallback.
 *
 * Candidate assets are every contract that emitted a log during the batch, and changes
 * are measured as actual `balanceOf` diffs probed before/after the batch in a second
 * simulation (native ETH via `traceTransfers` pseudo-logs). This replaces viem's
 * `traceAssetChanges`, whose per-call `eth_createAccessList` discovery runs each call
 * against *current* state — in dependent batches (approve → swap) the swap probe reverts
 * at the allowance check, which both loses the output token and, as of viem 2.55,
 * rejects the whole simulation.
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
}): Promise<AssetSimulationResult> {
  const client = getClient(chainId, apiKey);
  const normalizedCalls = calls.map((c) => ({
    to: c.to as Address,
    value: c.value === undefined ? undefined : typeof c.value === 'string' ? BigInt(c.value) : c.value,
    data: c.data,
  }));
  const { results } = await simulateCalls(client, {
    account,
    calls: normalizedCalls,
    traceTransfers: true,
  });
  if (results.some((r) => r.status !== 'success')) return { deltas: [], willRevert: true };

  const logs = results.flatMap((r) => (r.logs ?? []) as SimulatedLog[]);

  // The simulation charges no gas, so the account's ETH delta is exactly the net of the
  // traceTransfers pseudo-logs (emitted from viem's ETH pseudo-address).
  const ethEntries: RawAssetChange[] = deriveTransferDeltas(logs, account)
    .filter((d) => d.address === ethAddress)
    .map((d) => ({
      token: { address: ethAddress, decimals: 18, symbol: 'ETH' },
      value: { pre: 0n, post: d.diff, diff: d.diff },
    }));

  const candidates = [...new Set(logs.map((l) => l.address.toLowerCase()))].filter((a) => a !== ethAddress);
  if (candidates.length === 0) return { deltas: mapAssetChanges(ethEntries), willRevert: false };

  // Probe balances before/after the batch, plus metadata and ERC-165, all as extra blocks
  // of ONE simulation — the whole preview costs exactly two RPC requests regardless of
  // candidate count. Non-token contracts fail the probes and are skipped.
  type SimCall = { to: Address; data?: `0x${string}`; value?: bigint; from: Address; nonce?: number };
  const probeBlock = (data: `0x${string}`) => ({
    calls: candidates.map((address, i): SimCall => ({ to: address as Address, data, from: zeroAddress, nonce: i })),
    stateOverrides: [{ address: zeroAddress, nonce: 0 }],
  });
  const balanceOfBlock = probeBlock(
    encodeFunctionData({ abi: erc20MetadataAbi, functionName: 'balanceOf', args: [account] })
  );
  const batchCalls: SimCall[] = normalizedCalls.map((c) => ({ ...c, from: account }));
  const [preBlock, batchBlock, postBlock, decimalsBlock, symbolsBlock, erc165Block] = await simulateBlocks(client, {
    blocks: [
      balanceOfBlock,
      { calls: batchCalls },
      balanceOfBlock,
      probeBlock(encodeFunctionData({ abi: erc20MetadataAbi, functionName: 'decimals' })),
      probeBlock(encodeFunctionData({ abi: erc20MetadataAbi, functionName: 'symbol' })),
      probeBlock(
        encodeFunctionData({ abi: erc165Abi, functionName: 'supportsInterface', args: [ERC721_INTERFACE_ID] })
      ),
    ],
  });
  // Chain state can move between the two simulations; if the batch reverts in this run,
  // the balance diffs are meaningless and the run-1 deltas would be stale.
  if (batchBlock.calls.some((c) => c.status !== 'success')) return { deltas: [], willRevert: true };

  const probeData = (block: typeof preBlock | undefined, i: number): `0x${string}` | null => {
    const call = block?.calls[i];
    return call?.status === 'success' && call.data && call.data !== '0x' ? call.data : null;
  };
  const toBigInt = (data: `0x${string}` | null): bigint | null => (data === null ? null : hexToBigInt(data));

  const erc721 = new Set<string>();
  const tokenEntries: RawAssetChange[] = [];
  candidates.forEach((address, i) => {
    const pre = toBigInt(probeData(preBlock, i));
    const post = toBigInt(probeData(postBlock, i));
    if (pre === null || post === null || pre === post) return;

    const rawDecimals = toBigInt(probeData(decimalsBlock, i));
    const decimals = rawDecimals === null ? undefined : Number(rawDecimals);
    const symbolData = probeData(symbolsBlock, i);
    let symbol: string | undefined;
    try {
      if (symbolData)
        symbol = decodeFunctionResult({ abi: erc20MetadataAbi, functionName: 'symbol', data: symbolData });
    } catch {
      symbol = undefined;
    }
    // A balanceOf diff on an ERC-721 is a whole-token count; confirm via ERC-165 (checked
    // only when decimals are missing/1) so NFTs render as counts instead of being dropped.
    if ((decimals === undefined || decimals === 1) && toBigInt(probeData(erc165Block, i)) === 1n) erc721.add(address);

    tokenEntries.push({ token: { address, symbol, decimals }, value: { pre, post, diff: post - pre } });
  });

  return { deltas: mapAssetChanges([...ethEntries, ...tokenEntries], erc721), willRevert: false };
}
