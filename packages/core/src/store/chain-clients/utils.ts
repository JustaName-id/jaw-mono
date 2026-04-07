import { createPublicClient, defineChain, http, PublicClient } from 'viem';
import { BundlerClient, createBundlerClient, createPaymasterClient } from 'viem/account-abstraction';

import { ChainClients } from './store.js';
import { RPCResponseNativeCurrency } from '../../messages/rpcMessage.js';
import { JAW_RPC_URL } from '../../constants.js';
import { getSupportedChains } from '../../account/smartAccount.js';
import { createPaymasterFunctions } from '../../account/paymaster.js';
import { store } from '../store.js';

/**
 * Paymaster configuration for a chain
 */
export type PaymasterConfig = {
    /** The paymaster RPC URL */
    url: string;
    /** Optional context to pass to paymaster calls (e.g., sponsorshipPolicyId for Pimlico) */
    context?: Record<string, unknown>;
};

export type SDKChain = {
    id: number;
    rpcUrl?: string;
    nativeCurrency?: RPCResponseNativeCurrency;
    /** Optional paymaster configuration for sponsored transactions */
    paymaster?: PaymasterConfig;
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
    if (!chain.paymaster?.url) {
        const bundlerClient = createBundlerClient({
            chain: viemchain,
            client,
            transport: http(chain.rpcUrl),
        });
        return { client, bundlerClient };
    }

    // Create paymaster client and wrap with custom functions that handle gas price fetching and v0.8 gas limits
    const paymasterClient = createPaymasterClient({
        transport: http(chain.paymaster.url),
    });

    const bundlerClient = createBundlerClient({
        chain: viemchain,
        client,
        paymaster: createPaymasterFunctions(client, paymasterClient, chain.id, chain.paymaster.context),
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
    const chain = chains.find((c) => c.id === chainId);
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
    if (existingClient) {
        return existingClient;
    }

    // Lazy create: find chain in store and create client
    const chains = store.getState().chains ?? [];
    const chain = chains.find((c) => c.id === chainId);
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
 * @param paymasters - Optional mapping of chain IDs to paymaster configuration
 * @param showTestnets - Whether to include testnet chains (default: false)
 * @returns Array of SDKChain objects with constructed RPC URLs for supported chains
 *
 * @example
 * ```typescript
 * const chains = createInitialChains(
 *   'api-key',
 *   {
 *     84532: {
 *       url: 'https://api.pimlico.io/v2/84532/rpc?apikey=...',
 *       context: { sponsorshipPolicyId: 'sp_my_policy' }
 *     }
 *   },
 *   true
 * );
 * ```
 */
export function createInitialChains(
    apiKey: string,
    paymasters?: Record<number, PaymasterConfig>,
    showTestnets = false
): SDKChain[] {
    const chains = getSupportedChains(showTestnets);
    return chains.map((chain) => ({
        id: chain.id,
        rpcUrl: `${JAW_RPC_URL}?chainId=${chain.id}&api-key=${apiKey}`,
        ...(paymasters?.[chain.id] ? { paymaster: paymasters[chain.id] } : {}),
    }));
}
