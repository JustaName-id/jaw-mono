import {
  decodeFunctionResult,
  encodeFunctionData,
  ethAddress,
  formatUnits,
  type Address,
  type Client,
  type Hex,
} from 'viem';
import { getBlockNumber, simulateBlocks, simulateCalls } from 'viem/actions';
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
 * ERC-20 declares `decimals()` as `uint8`, so this is the largest value a compliant token can
 * report — but viem decodes the return word as `uint256` and hands back `Number(...)` of it, so
 * the number that reaches here is whatever the contract chose to put in 32 bytes.
 *
 * Past a byte it stops being a formatting question. `formatUnits` pads the value out to
 * `decimals` digits and does it quadratically: 10_000 costs 45ms, 100_000 costs 4.5s, 1_000_000
 * runs for minutes, and `Number(2n ** 200n)` throws `RangeError: Out of memory`. All of that is
 * on the thread rendering a dialog someone is mid-signature on, and a batch only has to *touch*
 * such a contract for it to be measured and formatted. So an out-of-range `decimals` is read the
 * way an unreadable one is: no usable unit, and the row is dropped rather than rendered.
 */
const MAX_DECIMALS = 255;

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
    const reported = c.token.decimals;
    const usable = reported !== undefined && Number.isInteger(reported) && reported >= 0 && reported <= MAX_DECIMALS;
    const decimals = isNative ? 18 : isNft ? 0 : usable ? reported : undefined;

    if (decimals === undefined) continue;
    if (!isNative && !symbol) continue;

    const magnitude = diff < 0n ? -diff : diff;
    out.push({
      address: c.token.address,
      symbol,
      decimals,
      diff,
      direction: diff < 0n ? 'out' : 'in',
      amountFormatted: formatUnits(magnitude, decimals),
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

/** One entry of a `simulateBlocks` block, narrowed to what a probe reads. */
type ProbeResult = { status: 'success' | 'failure'; data?: Hex } | undefined;

/**
 * Decode one probe's answer, or `null` when the contract had none: it reverted, it has no code
 * (empty return data), or it answered with bytes the ABI cannot read. All three are the contract
 * answering, and — this is the point — all three are *local to that call*. A failure of the
 * request rejects `simulateBlocks` before anything reaches here, so a node error or a proxy 5xx
 * can never be read as "not an NFT, decimals unknown" and quietly shorten a signing preview.
 *
 * That separation is why the probes go through `simulateBlocks` rather than N `readContract`s.
 * `readContract` collapses both into a thrown error, and on a client with `batch.multicall` the
 * two are genuinely indistinguishable: a per-call revert and a revert of the whole `aggregate3`
 * both surface as `ExecutionRevertedError`, so classifying by error type has to either swallow a
 * batch-wide failure or reject on a token that merely lacks `decimals()`. viem's `multicall`
 * action does not help — under `allowFailure` it reports a rejected request as a per-call
 * failure too (see `multicall.js`). `eth_simulateV1` reports per-call status structurally, which
 * is the distinction this needs.
 */
function probeAnswer<T>(call: ProbeResult, decode: (data: Hex) => T): T | null {
  if (!call || call.status !== 'success' || !call.data || call.data === '0x') return null;
  try {
    return decode(call.data);
  } catch {
    return null;
  }
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
 * nothing extra. When it does ask, every probe rides in one `eth_simulateV1` — one request
 * whatever the candidate count — simulated on top of the block the balances were measured
 * against, with nothing ahead of it in that block to move state.
 *
 * A suspect viem reported as `1` is asked only the interface question. Its `1` is either a real
 * `decimals()` reading or viem's `?? 1` standing in for an NFT whose `tokenURI` answered, and
 * re-reading `decimals()` would tell the two apart — but acting on that is not worth it. ERC-721
 * mandates ERC-165, so the gap is limited to non-compliant NFTs, while treating a silent
 * `decimals()` as proof of one would restate a genuine 1-decimal ERC-20's amount by 10x. A
 * misread NFT count is a wrong row; a misread ERC-20 is a wrong number on a signing screen.
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

  const unknownDecimals = suspects.filter((c) => c.token.decimals === undefined);
  const supportsInterfaceData = encodeFunctionData({
    abi: erc165Abi,
    functionName: 'supportsInterface',
    args: [ERC721_INTERFACE_ID],
  });
  const decimalsData = encodeFunctionData({ abi: erc20DecimalsAbi, functionName: 'decimals' });
  // Raw calldata rather than `simulateBlocks`' `abi` shortcut: that shortcut decodes inside the
  // action, where a throw escapes as a node error and takes every other probe with it.
  const [block] = await simulateBlocks(client, {
    blockNumber,
    blocks: [
      {
        calls: [
          ...suspects.map((c) => ({ to: c.token.address as Address, data: supportsInterfaceData })),
          ...unknownDecimals.map((c) => ({ to: c.token.address as Address, data: decimalsData })),
        ],
      },
    ],
  });

  const erc721 = new Set<string>();
  const recovered = new Map<string, number>();
  suspects.forEach((c, i) => {
    const address = c.token.address.toLowerCase();
    const isErc721 = probeAnswer(block.calls[i], (data) =>
      decodeFunctionResult({ abi: erc165Abi, functionName: 'supportsInterface', data })
    );
    if (isErc721) {
      erc721.add(address);
      return;
    }
    const j = unknownDecimals.indexOf(c);
    if (j === -1) return;
    const read = probeAnswer(block.calls[suspects.length + j], (data) =>
      decodeFunctionResult({ abi: erc20DecimalsAbi, functionName: 'decimals', data })
    );
    if (read !== null) recovered.set(address, read);
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
 * Costs `N + 5` requests for `N` discovered candidates — a block number, three
 * `eth_simulateV1`s (viem's discovery, viem's measurement, our metadata probes), and one
 * `eth_call` per pre-balance probe, viem's probes carrying a `from` and a state override so
 * they cannot fold into a Multicall3. Four of those are *serial*, up from two, and that depth
 * is what the confirm screen waits on — the `N` pre-balance probes are parallel and nearly
 * free by comparison. Shrinking it is upstream's; what is ours is resolving the block once and
 * handing it to viem, so nothing here refetches it and the metadata probes read the same state
 * the balances were measured against.
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
  // Left to itself viem resolves this internally and keeps it private, so the follow-up metadata
  // probes would read `latest` — a different block than the balances. `cacheTime: 0` matches what
  // viem passes; the client's default would be its 4s polling interval, which is a long time to
  // simulate against a stale block on a screen that is about to spend money.
  const blockNumber = await getBlockNumber(client, { cacheTime: 0 });
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
