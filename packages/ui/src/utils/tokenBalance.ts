import { createPublicClient, http, erc20Abi, type Address, type Chain, type PublicClient } from 'viem';
import { SUPPORTED_CHAINS } from '@jaw.id/core';

// Common native token addresses used by various protocols
const NATIVE_TOKEN_ADDRESSES = [
  '0x0000000000000000000000000000000000000000', // Zero address
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', // Common ERC-20 convention for native
];

/**
 * Checks if a token address represents the native token (ETH)
 */
export function isNativeToken(tokenAddress: string): boolean {
  return NATIVE_TOKEN_ADDRESSES.includes(tokenAddress.toLowerCase());
}

/**
 * Public clients keyed by (chainId, rpcUrl).
 *
 * Balance reads used to build a client per token, which threw away viem's
 * per-client caches (eth_chainId among them) on every single read. These
 * clients hold no account or session state, so sharing them is safe.
 */
const clientCache = new Map<string, PublicClient>();

function getPublicClient(rpcUrl: string, chainId?: number): PublicClient {
  const cacheKey = `${chainId ?? ''}|${rpcUrl}`;
  const cached = clientCache.get(cacheKey);
  if (cached) return cached;

  // Resolving the viem chain is what makes multicall available: the multicall3
  // address lives on the chain definition, and a client built without one has
  // to fall back to individual reads.
  const chain =
    chainId !== undefined ? (SUPPORTED_CHAINS.find((c) => c.id === chainId) as Chain | undefined) : undefined;
  const client = createPublicClient({ chain, transport: http(rpcUrl) }) as PublicClient;
  clientCache.set(cacheKey, client);
  return client;
}

/**
 * Fetches the balance of a token for a given wallet address.
 * Supports both native ETH (address = 0x0...0 or 0xeee...eee) and ERC-20 tokens.
 *
 * Prefer {@link fetchTokenBalances} when reading more than one token: it folds
 * the ERC-20 reads into a single multicall instead of one request per token.
 */
export async function fetchTokenBalance(
  tokenAddress: string,
  walletAddress: string,
  rpcUrl: string,
  chainId?: number
): Promise<bigint> {
  const client = getPublicClient(rpcUrl, chainId);

  // Native token (ETH) - check common native addresses
  if (isNativeToken(tokenAddress)) {
    return client.getBalance({ address: walletAddress as Address });
  }

  // ERC-20 token
  return client.readContract({
    address: tokenAddress as Address,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [walletAddress as Address],
  });
}

/** Reads ERC-20 balances, preferring one multicall and degrading to per-token reads. */
async function readErc20Balances(
  client: PublicClient,
  tokenAddresses: readonly string[],
  walletAddress: string
): Promise<(bigint | null)[]> {
  const contracts = tokenAddresses.map(
    (address) =>
      ({
        address: address as Address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [walletAddress as Address],
      }) as const
  );

  if (client.chain?.contracts?.multicall3) {
    try {
      // allowFailure keeps one bad token (not a contract, reverting balanceOf)
      // from taking down the whole batch, matching the per-token isolation
      // callers already rely on.
      const results = await client.multicall({ contracts, allowFailure: true });
      return results.map((r) => (r.status === 'success' ? (r.result as bigint) : null));
    } catch (error) {
      // Multicall3 missing at that address, or the RPC rejecting the call: fall
      // through to individual reads rather than reporting every balance as
      // unavailable, which would render every fee token unselectable.
      console.warn('[fetchTokenBalances] multicall failed, falling back to individual reads:', error);
    }
  }

  const settled = await Promise.allSettled(contracts.map((contract) => client.readContract(contract)));
  return settled.map((r) => (r.status === 'fulfilled' ? (r.value as bigint) : null));
}

/**
 * Fetches balances for several tokens at once, returned in the order requested.
 *
 * ERC-20 balances go out as a single multicall with the native balance fetched
 * alongside it, so a fee-token list costs about one round trip instead of one
 * per token — and that list sits directly between the transaction dialog
 * opening and its Confirm button unlocking.
 *
 * A token whose balance cannot be read resolves to `null`, so callers can tell
 * "unknown" from "zero" exactly as the previous per-token try/catch did.
 */
export async function fetchTokenBalances(
  tokenAddresses: readonly string[],
  walletAddress: string,
  rpcUrl: string,
  chainId?: number
): Promise<(bigint | null)[]> {
  if (tokenAddresses.length === 0) return [];

  const client = getPublicClient(rpcUrl, chainId);
  const balances: (bigint | null)[] = new Array(tokenAddresses.length).fill(null);

  const nativeIndexes: number[] = [];
  const erc20Indexes: number[] = [];
  tokenAddresses.forEach((address, index) => {
    (isNativeToken(address) ? nativeIndexes : erc20Indexes).push(index);
  });

  await Promise.all([
    nativeIndexes.length > 0
      ? client
          .getBalance({ address: walletAddress as Address })
          .then((balance) => {
            for (const index of nativeIndexes) balances[index] = balance;
          })
          .catch((error) => {
            console.warn('[fetchTokenBalances] native balance read failed:', error);
          })
      : Promise.resolve(),
    erc20Indexes.length > 0
      ? readErc20Balances(
          client,
          erc20Indexes.map((index) => tokenAddresses[index]),
          walletAddress
        ).then((results) => {
          erc20Indexes.forEach((index, position) => {
            balances[index] = results[position];
          });
        })
      : Promise.resolve(),
  ]);

  return balances;
}
