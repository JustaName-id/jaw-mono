import {
  AbiDecodingDataSizeTooSmallError,
  BaseError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  ExecutionRevertedError,
  IntegerOutOfRangeError,
  InvalidBytesBooleanError,
  ethAddress,
  formatUnits,
  type Address,
  type Client,
} from 'viem';
import { getBlockNumber, readContract, simulateCalls } from 'viem/actions';
import { type TransactionCall } from '@jaw.id/core';
import { getJawPublicClient } from './publicClient';
import { subscriptDecimal } from './displayFormat';
import { classifyRevert, type RevertCause } from './transactionFailure';

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
  if (n > 0 && n < 0.0001) return subscriptDecimal(n);
  return amountFormatter.format(n);
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
const erc20DecimalsAbi = [
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
] as const;

export interface AssetSimulationResult {
  deltas: AssetDelta[];
  /** True when any call in the batch reverted during simulation — the batch would fail on-chain. */
  willRevert: boolean;
  /** Set only when `willRevert` — why it reverted, as far as the revert reason reveals. */
  revertCause?: RevertCause;
}

/**
 * Whether a probe failed because the *contract* answered "no" rather than because the
 * *request* did. A contract without the function reverts, one without code returns empty
 * data, and one that answers with bytes the ABI cannot read has still answered — all three
 * are answers. A node error or a proxy 5xx is not one, and must never be read as one: these
 * probes share a Multicall3 batch, which rejects wholesale (see `publicClient.ts`), so
 * swallowing a transport failure would mark every candidate as "not an NFT, decimals
 * unknown" and silently drop them from a signing preview.
 *
 * The malformed-data arm matters because viem wraps *every* failure — transport included —
 * in a `ContractFunctionExecutionError`, so the cause is the only thing separating "this
 * token returned junk" from "the request never landed". Without it a single token whose
 * `decimals()` exceeds `Number.MAX_SAFE_INTEGER` rejects the shared `Promise.all` and empties
 * the preview for every other asset in the batch — the exact failure this guard exists to
 * prevent, arriving from the other direction.
 *
 * The list stays explicit rather than "anything that is not a transport error" so an error
 * shape neither we nor viem anticipated still fails loudly. Showing an error beats showing a
 * confidently short list of assets on a screen someone is about to sign.
 */
function isContractAnswer(error: unknown): boolean {
  return (
    error instanceof BaseError &&
    Boolean(
      error.walk(
        (e) =>
          e instanceof ContractFunctionRevertedError ||
          e instanceof ContractFunctionZeroDataError ||
          e instanceof ExecutionRevertedError ||
          // Return data that decodes to nothing usable: a word short of 32 bytes, a
          // `decimals` past the safe-integer range, a `bool` that is neither 0 nor 1.
          e instanceof AbiDecodingDataSizeTooSmallError ||
          e instanceof IntegerOutOfRangeError ||
          e instanceof InvalidBytesBooleanError
      )
    )
  );
}

/** Read a contract's "no" as `fallback`; let a failed request reject and take the preview with it. */
function answerOr<T>(fallback: T) {
  return (error: unknown): T => {
    if (isContractAnswer(error)) return fallback;
    throw error;
  };
}

export interface ResolvedTokenUnits {
  /** `changes`, with the decimals viem left `undefined` filled in wherever they could be read. */
  changes: RawAssetChange[];
  /** Lowercased addresses confirmed as ERC-721, whose diffs read as whole-token counts. */
  erc721: Set<string>;
}

/**
 * Repair the token metadata viem could not pin down, for the two shapes where it renders wrong.
 *
 * viem infers `decimals` as `Number(decimals() ?? 1)` when either `decimals()` or `tokenURI(0)`
 * answers, and `undefined` when both revert. That misses:
 *
 * - **ERC-721s**, which arrive as `1` (one NFT would render as "0.1") or as `undefined`, which
 *   `mapAssetChanges` drops. ERC-165 separates them from a genuine 1-decimal ERC-20.
 * - **0-decimal ERC-20s**, which arrive as `undefined` because viem's `tokenURI_ || decimals_`
 *   guard reads a `0n` result as falsy — so a real transfer vanishes from the preview. Reading
 *   `decimals()` ourselves recovers it.
 *
 * Only those two shapes are suspects, so a batch of tokens with readable non-1 decimals asks
 * nothing extra. When it does ask, every probe is issued in one tick against the block the
 * simulation measured, so they share the cached client's single Multicall3 request.
 *
 * Note the ERC-165 answer is the token's own claim, so a contract can opt into being counted in
 * whole units. That only rescales a row for a token the batch already touches, and `symbol` is
 * equally the token's word — the preview reports what the batch moves, not whether to trust it.
 */
export async function resolveTokenUnits(
  client: Client,
  changes: readonly RawAssetChange[],
  blockNumber: bigint
): Promise<ResolvedTokenUnits> {
  const suspects = changes.filter(
    (c) =>
      c.value.diff !== 0n &&
      c.token.address.toLowerCase() !== ethAddress &&
      (c.token.decimals === undefined || c.token.decimals === 1)
  );
  if (suspects.length === 0) return { changes: [...changes], erc721: new Set() };

  const [isErc721, readDecimals] = await Promise.all([
    Promise.all(
      suspects.map((c) =>
        readContract(client, {
          address: c.token.address as Address,
          abi: erc165Abi,
          functionName: 'supportsInterface',
          args: [ERC721_INTERFACE_ID],
          blockNumber,
        }).catch(answerOr(false))
      )
    ),
    Promise.all(
      suspects.map((c) =>
        // A `1` is already a usable unit; it is only wrong if the token turns out to be an NFT.
        c.token.decimals !== undefined
          ? Promise.resolve(undefined)
          : readContract(client, {
              address: c.token.address as Address,
              abi: erc20DecimalsAbi,
              functionName: 'decimals',
              blockNumber,
            }).catch(answerOr(undefined))
      )
    ),
  ]);

  const erc721 = new Set<string>();
  const recovered = new Map<string, number>();
  suspects.forEach((c, i) => {
    const address = c.token.address.toLowerCase();
    if (isErc721[i]) erc721.add(address);
    else if (readDecimals[i] !== undefined) recovered.set(address, readDecimals[i]);
  });

  return {
    erc721,
    changes: changes.map((c) => {
      const decimals = recovered.get(c.token.address.toLowerCase());
      return decimals === undefined ? c : { ...c, token: { ...c.token, decimals } };
    }),
  };
}

/**
 * Simulate the batch against current chain state and return the net per-asset balance
 * changes for `account`. Throws on simulation failure — the caller owns the fallback.
 *
 * viem's `traceAssetChanges` owns the measurement: it discovers candidates from the logs of
 * the batch simulated *as a whole*, so dependent batches (approve → swap) report the output
 * token, and it pins both of its simulations to one block. Only the metadata repair is ours —
 * see `resolveTokenUnits`.
 *
 * Requires viem >= 2.55.16. Before that, discovery ran one `eth_createAccessList` per call
 * against *current* state, which both lost the output token of a dependent batch and threw
 * on the reverting probe, taking the whole preview with it.
 *
 * Costs `N + 4` requests for `N` discovered candidates — a block number, two
 * `eth_simulateV1`s, and one `eth_call` per pre-balance probe, viem's probes carrying a
 * `from` and a state override so they cannot fold into a Multicall3. That is up from the two
 * flat requests the hand-rolled version took, and it is upstream's to shrink; what is ours is
 * resolving the block once and handing it to viem, so nothing here refetches it and the
 * metadata probes read the same state the balances were measured against.
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
  const client = getJawPublicClient(chainId, apiKey);
  const normalizedCalls = calls.map((c) => ({
    to: c.to as Address,
    value: c.value === undefined ? undefined : typeof c.value === 'string' ? BigInt(c.value) : c.value,
    data: c.data,
  }));
  // Left to itself viem resolves this with `cacheTime: 0`, and the number stays internal — so
  // the follow-up metadata probes would read `latest`, a different block than the balances.
  const blockNumber = await getBlockNumber(client);
  const { results, assetChanges } = await simulateCalls(client, {
    account,
    calls: normalizedCalls,
    traceAssetChanges: true,
    blockNumber,
  });
  const failed = results.find((r) => r.status !== 'success');
  if (failed) return { deltas: [], willRevert: true, revertCause: classifyRevert(failed.error) };

  const { changes, erc721 } = await resolveTokenUnits(client, assetChanges, blockNumber);
  return { deltas: mapAssetChanges(changes, erc721), willRevert: false };
}
