import { createPublicClient, http, erc20Abi, Address } from 'viem';

const NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Fetches the balance of a token for a given wallet address.
 * Supports both native ETH (address = 0x0...0) and ERC-20 tokens.
 */
export async function fetchTokenBalance(
  tokenAddress: string,
  walletAddress: string,
  rpcUrl: string
): Promise<bigint> {
  const client = createPublicClient({
    transport: http(rpcUrl),
  });

  // Native token (ETH) - address is zero
  if (tokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS) {
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

/**
 * Checks if a token address is the native token (ETH)
 */
export function isNativeToken(tokenAddress: string): boolean {
  return tokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS;
}
