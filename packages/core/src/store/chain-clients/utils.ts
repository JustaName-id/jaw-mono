import { createPublicClient, defineChain, http, PublicClient } from 'viem';
import { getGasPrice } from 'viem/actions';
import { BundlerClient, createBundlerClient, createPaymasterClient } from 'viem/account-abstraction';

import { ChainClients } from './store.js';
import { RPCResponseNativeCurrency } from '../../messages/rpcMessage.js';
import { JAW_RPC_URL } from '../../constants.js';
import { getSupportedChains } from '../../account/smartAccount.js';
import { store } from '../store.js';

export type SDKChain = {
  id: number;
  rpcUrl?: string;
  nativeCurrency?: RPCResponseNativeCurrency;
  paymasterUrl?: string;
};

/**
 * Creates clients (PublicClient and BundlerClient) for a single chain.
 * This is used for lazy loading - clients are only created when first accessed.
 * If the chain has a paymasterUrl configured, the BundlerClient will include paymaster support.
 *
 * @param chain - The chain configuration to create clients for
 * @returns Object containing the PublicClient and BundlerClient, or undefined if no rpcUrl
 */
function createClientForChain(chain: SDKChain): { client: PublicClient; bundlerClient: BundlerClient } | undefined {
  if (!chain.rpcUrl) {
    return undefined;
  }

  const viemchain = defineChain({
    id: chain.id,
    rpcUrls: {
      default: {
        http: [chain.rpcUrl],
      },
    },
    name: chain.nativeCurrency?.name ?? '',
    nativeCurrency: {
      name: chain.nativeCurrency?.name ?? '',
      symbol: chain.nativeCurrency?.symbol ?? '',
      decimals: chain.nativeCurrency?.decimal ?? 18,
    },
  });

  const client = createPublicClient({
    chain: viemchain,
    transport: http(chain.rpcUrl),
  });

  // If no paymaster URL, return bundler client without paymaster
  if (!chain.paymasterUrl) {
    const bundlerClient = createBundlerClient({
      chain: viemchain,
      client,
      transport: http(chain.rpcUrl),
    });
    return { client, bundlerClient };
  }

  const paymasterClient = createPaymasterClient({
    transport: http(chain.paymasterUrl)
  });

  // Use custom paymaster functions to ensure gas prices are fetched first
  // This is required because Pimlico (and ERC-7677 compliant paymasters)
  // require maxFeePerGas and maxPriorityFeePerGas in pm_getPaymasterStubData
  const bundlerClient = createBundlerClient({
    chain: viemchain,
    client,
    paymaster: {
      async getPaymasterStubData(userOperation) {
        // Fetch gas prices if not already present
        let maxFeePerGas = userOperation.maxFeePerGas;
        let maxPriorityFeePerGas = userOperation.maxPriorityFeePerGas;

        if (!maxFeePerGas || !maxPriorityFeePerGas) {
          const gasPrice = await getGasPrice(client);
          maxFeePerGas = maxFeePerGas || gasPrice;
          maxPriorityFeePerGas = maxPriorityFeePerGas || gasPrice;
        }

        const stubData = await paymasterClient.getPaymasterStubData({
          ...userOperation,
          maxFeePerGas,
          maxPriorityFeePerGas,
          chainId: chain.id,
          entryPointAddress: userOperation.entryPointAddress,
        });

        console.log('📦 Paymaster stub data response:', stubData);

        // Ensure paymaster gas limits are set (required for EntryPoint v0.8)
        // Default to reasonable values if not returned by paymaster
        // Use Object.assign to avoid TypeScript spread inference issues
        const result = Object.assign({}, stubData, {
          paymasterVerificationGasLimit: stubData.paymasterVerificationGasLimit || 100000n,
          paymasterPostOpGasLimit: stubData.paymasterPostOpGasLimit || 50000n,
        });
        return result as typeof stubData;
      },
      async getPaymasterData(userOperation) {
        // Fetch gas prices if not already present
        let maxFeePerGas = userOperation.maxFeePerGas;
        let maxPriorityFeePerGas = userOperation.maxPriorityFeePerGas;

        if (!maxFeePerGas || !maxPriorityFeePerGas) {
          const gasPrice = await getGasPrice(client);
          maxFeePerGas = maxFeePerGas || gasPrice;
          maxPriorityFeePerGas = maxPriorityFeePerGas || gasPrice;
        }

        const paymasterData = await paymasterClient.getPaymasterData({
          ...userOperation,
          maxFeePerGas,
          maxPriorityFeePerGas,
          chainId: chain.id,
          entryPointAddress: userOperation.entryPointAddress,
        });

        console.log('📦 Paymaster data response:', paymasterData);

        // Ensure paymaster gas limits are set (required for EntryPoint v0.8)
        // Use the gas limits from stub data estimation or fallback to defaults
        // Use Object.assign to avoid TypeScript spread inference issues
        const result = Object.assign({}, paymasterData, {
          paymasterVerificationGasLimit: paymasterData.paymasterVerificationGasLimit || userOperation.paymasterVerificationGasLimit || 100000n,
          paymasterPostOpGasLimit: paymasterData.paymasterPostOpGasLimit || userOperation.paymasterPostOpGasLimit || 50000n,
        });
        return result as typeof paymasterData;
      }
    },
    transport: http(chain.rpcUrl),
  });

  return { client, bundlerClient };
}

/**
 * Creates clients for multiple chains.
 *
 * @param chains - Array of chains to create clients for
 */
export function createClients(chains: SDKChain[]) {
  chains.forEach((chain) => {
    const clients = createClientForChain(chain);
    if (clients) {
      ChainClients.setState({
        ...ChainClients.getState(),
        [chain.id]: clients,
      });
    }
  });
}

/**
 * Gets or creates a PublicClient for a chain.
 * If the client doesn't exist, it will be created lazily from the chain config in the store.
 *
 * @param chainId - The chain ID to get the client for
 * @returns The PublicClient, or undefined if the chain is not configured
 */
export function getClient(chainId: number): PublicClient | undefined {
  // Check if client already exists
  const existingClient = ChainClients.getState()[chainId]?.client;
  if (existingClient) {
    return existingClient;
  }

  // Lazy create: find chain in store and create client
  const chains = store.getState().chains ?? [];
  const chain = chains.find(c => c.id === chainId);
  if (!chain) {
    return undefined;
  }

  const clients = createClientForChain(chain);
  if (clients) {
    ChainClients.setState({
      ...ChainClients.getState(),
      [chainId]: clients,
    });
    return clients.client;
  }

  return undefined;
}

/**
 * Gets or creates a BundlerClient for a chain.
 * If the client doesn't exist, it will be created lazily from the chain config in the store.
 *
 * @param chainId - The chain ID to get the bundler client for
 * @returns The BundlerClient, or undefined if the chain is not configured
 */
export function getBundlerClient(chainId: number): BundlerClient | undefined {
  // Check if client already exists
  const existingClient = ChainClients.getState()?.[chainId]?.bundlerClient;
  console.log('Existing client:', existingClient);
  if (existingClient) {
    return existingClient;
  }

  // Lazy create: find chain in store and create client
  const chains = store.getState().chains ?? [];
  console.log('Chains:', chains);
  const chain = chains.find(c => c.id === chainId);
  if (!chain) {
    return undefined;
  }

  const clients = createClientForChain(chain);
  if (clients) {
    ChainClients.setState({
      ...ChainClients.getState(),
      [chainId]: clients,
    });
    return clients.bundlerClient;
  }

  return undefined;
}

/**
 * Creates initial chains with RPC URLs for all supported chains.
 * RPC URLs are constructed as: {JAW_RPC_URL}?chainId={chainId}&api-key={apiKey}
 *
 * @param apiKey - API key for authentication
 * @param paymasterUrls - Optional mapping of chain IDs to paymaster URLs
 * @param showTestnets - Whether to include testnet chains (default: false)
 * @returns Array of SDKChain objects with constructed RPC URLs for supported chains
 *
 */
export function createInitialChains(
  apiKey: string,
  paymasterUrls?: Record<number, string>,
  showTestnets = false
): SDKChain[] {
  const chains = getSupportedChains(showTestnets);
  return chains.map((chain) => ({
    id: chain.id,
    rpcUrl: `${JAW_RPC_URL}?chainId=${chain.id}&api-key=${apiKey}`,
    ...(paymasterUrls?.[chain.id] ? { paymasterUrl: paymasterUrls[chain.id] } : {}),
  }));
}