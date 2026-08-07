import { createPublicClient, http, type Chain } from 'viem';
import { JAW_RPC_URL, SUPPORTED_CHAINS } from '@jaw.id/core';

/** JAW RPC proxy URL for a chain, with the dApp's API key when one is available. */
export function jawRpcUrl(chainId: number, apiKey?: string): string {
  return apiKey ? `${JAW_RPC_URL}?chainId=${chainId}&api-key=${apiKey}` : `${JAW_RPC_URL}?chainId=${chainId}`;
}

// `chain` is widened to viem's base `Chain` on purpose: inferring it from the
// SUPPORTED_CHAINS union would give every client a 22-member chain type, and the
// resulting per-chain formatter unions make the client incompatible with actions
// typed against a plain client (simulateBlocks, readContract). The real chain
// object — formatters included — is still what gets passed at runtime.
function createClient(chainId: number, rpcUrl: string) {
  const chain: Chain | undefined = SUPPORTED_CHAINS.find((c) => c.id === chainId);
  return createPublicClient({ chain, transport: http(rpcUrl), batch: { multicall: true } });
}

const clientCache = new Map<string, ReturnType<typeof createClient>>();

/**
 * Cached public client for a chain.
 *
 * Clients are cached rather than built per call because `batch.multicall` folds
 * eth_calls into a single Multicall3 `aggregate3` only across calls issued on
 * the *same client instance* in the same tick — viem keys that scheduler by
 * `client.uid`. A fresh client per read (the previous shape of `tokenBalance`)
 * silently defeats it, so callers fanning out over N tokens must share one.
 *
 * `aggregate3` runs with `allowFailure`, so one reverting call still rejects
 * only its own caller, and every call in a group reads the same block.
 *
 * The chain definition is pulled from `SUPPORTED_CHAINS` for its Multicall3
 * address. Chains viem has no address for fall back to one request per call —
 * viem swallows that lookup failure internally, so this is always safe to set.
 *
 * Deliberately not `http(url, { batch: true })`: viem's HTTP batch scheduler is
 * a module-global map keyed by URL, so it merges requests across unrelated
 * clients sharing an RPC URL and runs the whole batch under whichever client
 * opened the window — leaking one client's timeout and retry budget onto
 * another's calls.
 */
export function getPublicClient(chainId: number, rpcUrl: string) {
  const key = `${chainId}:${rpcUrl}`;
  const cached = clientCache.get(key);
  if (cached) return cached;

  const client = createClient(chainId, rpcUrl);
  clientCache.set(key, client);
  return client;
}

/** Cached public client pointed at the JAW RPC proxy for a chain. */
export function getJawPublicClient(chainId: number, apiKey?: string) {
  return getPublicClient(chainId, jawRpcUrl(chainId, apiKey));
}
