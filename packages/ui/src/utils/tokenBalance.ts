import { createPublicClient, http, erc20Abi, Address } from 'viem';

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
 */
export async function fetchTokenBalance(tokenAddress: string, walletAddress: string, rpcUrl: string): Promise<bigint> {
  const client = createPublicClient({
    transport: http(rpcUrl),
  });

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
