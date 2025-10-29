import { createPublicClient, defineChain, http, PublicClient } from 'viem';
import { BundlerClient, createBundlerClient } from 'viem/account-abstraction';

import { ChainClients } from './store.js';
import { RPCResponseNativeCurrency } from '../../messages/rpcMessage.js';
import { JAW_RPC_URL } from '../../constants.js';

export type SDKChain = {
  id: number;
  rpcUrl?: string;
  nativeCurrency?: RPCResponseNativeCurrency;
  paymasterUrl?: string;
};

export function createClients(chains: SDKChain[]) {
  chains.forEach((c) => {
    if (!c.rpcUrl) {
      return;
    }
    const viemchain = defineChain({
      id: c.id,
      rpcUrls: {
        default: {
          http: [c.rpcUrl],
        },
      },
      name: c.nativeCurrency?.name ?? '',
      nativeCurrency: {
        name: c.nativeCurrency?.name ?? '',
        symbol: c.nativeCurrency?.symbol ?? '',
        decimals: c.nativeCurrency?.decimal ?? 18,
      },
    });

    const client = createPublicClient({
      chain: viemchain,
      transport: http(c.rpcUrl),
    });
    const bundlerClient = createBundlerClient({
      client,
      transport: http(c.rpcUrl),
    });


    ChainClients.setState({
      [c.id]: {
        client,
        bundlerClient,
      },
    });
  });
}

export function getClient(chainId: number): PublicClient | undefined {
  return ChainClients.getState()[chainId]?.client;
}

export function getBundlerClient(chainId: number): BundlerClient | undefined {
  return ChainClients.getState()[chainId]?.bundlerClient;
}

/**
 * Creates initial chains with RPC URLs based on chain IDs and API key.
 * RPC URLs are constructed as: {JAW_RPC_URL}?chainId={chainId}&api-key={apiKey}
 *
 * @param chainIds - Array of chain IDs to create
 * @param apiKey - API key for authentication
 * @param paymasterUrls - Optional mapping of chain IDs to paymaster URLs
 * @returns Array of SDKChain objects with constructed RPC URLs
 *
 * @example
 * const chains = createInitialChains([1, 137], 'my-api-key', { 1: 'https://paymaster.example.com' });
 * // Returns:
 * // [
 * //   { id: 1, rpcUrl: 'https://api.justaname.id/proxy/v2/rpc?chainId=1&api-key=my-api-key', paymasterUrl: 'https://paymaster.example.com' },
 * //   { id: 137, rpcUrl: 'https://api.justaname.id/proxy/v2/rpc?chainId=137&api-key=my-api-key' }
 * // ]
 */
export function createInitialChains(
  chainIds: number[],
  apiKey: string,
  paymasterUrls?: Record<number, string>
): SDKChain[] {
  return chainIds.map((chainId) => ({
    id: chainId,
    rpcUrl: `${JAW_RPC_URL}?chainId=${chainId}&api-key=${apiKey}`,
    ...(paymasterUrls?.[chainId] ? { paymasterUrl: paymasterUrls[chainId] } : {}),
  }));
}