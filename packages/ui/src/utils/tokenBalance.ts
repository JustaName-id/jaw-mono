import { createPublicClient, http, erc20Abi, type Address, type Chain, type PublicClient } from 'viem';

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
 * Clients are reused per (chain, endpoint) rather than created per call. This is what lets viem
 * fold concurrent `balanceOf` reads into one multicall `eth_call` — batching only happens across
 * calls issued through the *same* client. A client is a transport handle, not cached data, so
 * there's nothing here to go stale.
 */
const clients = new Map<string, PublicClient>();

function clientFor(rpcUrl: string, chain?: Chain): PublicClient {
  const key = `${chain?.id ?? 0}:${rpcUrl}`;
  let client = clients.get(key);
  if (!client) {
    client = createPublicClient({
      chain,
      transport: http(rpcUrl),
      // Only when the chain actually declares multicall3; otherwise viem would fall back anyway.
      ...(chain?.contracts?.multicall3 ? { batch: { multicall: true } } : {}),
    }) as PublicClient;
    clients.set(key, client);
  }
  return client;
}

/**
 * Fetches the balance of a token for a given wallet address.
 * Supports both native ETH (address = 0x0...0 or 0xeee...eee) and ERC-20 tokens.
 *
 * Pass `chain` (a viem chain, so it carries multicall3) and concurrent calls for the same
 * endpoint collapse into a single `eth_call` instead of one request per token.
 */
export async function fetchTokenBalance(
  tokenAddress: string,
  walletAddress: string,
  rpcUrl: string,
  chain?: Chain
): Promise<bigint> {
  const client = clientFor(rpcUrl, chain);

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
