import { erc20Abi, Address } from 'viem';

import { getPublicClient } from './publicClient';

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
 * Fetches the balance of a token for a given wallet address.
 * Supports both native ETH (address = 0x0...0 or 0xeee...eee) and ERC-20 tokens.
 *
 * Callers typically fan out over a token list with `Promise.all`. Pass `chainId`
 * so the shared client can fold those ERC-20 reads into a single Multicall3
 * request instead of one per token — see {@link getPublicClient}. Native
 * balances use `eth_getBalance`, which is not an eth_call and so stays a
 * request of its own.
 */
export async function fetchTokenBalance(
  tokenAddress: string,
  walletAddress: string,
  rpcUrl: string,
  chainId?: number
): Promise<bigint> {
  const client = getPublicClient(chainId ?? 0, rpcUrl);

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
