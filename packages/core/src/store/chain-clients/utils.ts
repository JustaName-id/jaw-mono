/**
 * Chain client utilities
 */

import { ChainClients, type ChainConfig } from './store.js';
import type { RPCResponseNativeCurrency } from '../../messages/rpcMessage.js';

/**
 * SDK Chain type
 */
export type SDKChain = {
  id: number;
  rpcUrl?: string;
  nativeCurrency?: RPCResponseNativeCurrency;
};

/**
 * Create and store chain configurations
 */
export function createChainConfigs(chains: SDKChain[]): void {
  const configs: ChainConfig[] = chains
    .filter((c) => c.rpcUrl) // Only chains with RPC URLs
    .map((c) => ({
      id: c.id,
      rpcUrl: c.rpcUrl!,
      name: c.nativeCurrency?.name,
      nativeCurrency: c.nativeCurrency
        ? {
            name: c.nativeCurrency.name,
            symbol: c.nativeCurrency.symbol,
            decimals: c.nativeCurrency.decimal ?? 18,
          }
        : undefined,
    }));

  ChainClients.set(configs);
}

/**
 * Get chain configuration by ID
 */
export function getChainConfig(chainId: number): ChainConfig | undefined {
  return ChainClients.get(chainId);
}

/**
 * Get RPC URL for a chain
 */
export function getRpcUrl(chainId: number): string | undefined {
  return ChainClients.get(chainId)?.rpcUrl;
}

/**
 * Check if a chain is configured
 */
export function hasChainConfig(chainId: number): boolean {
  return ChainClients.has(chainId);
}

/**
 * Add a single chain configuration
 */
export function addChainConfig(chain: SDKChain): void {
  if (!chain.rpcUrl) return;

  ChainClients.add({
    id: chain.id,
    rpcUrl: chain.rpcUrl,
    name: chain.nativeCurrency?.name,
    nativeCurrency: chain.nativeCurrency
      ? {
          name: chain.nativeCurrency.name,
          symbol: chain.nativeCurrency.symbol,
          decimals: chain.nativeCurrency.decimal ?? 18,
        }
      : undefined,
  });
}

/**
 * Remove a chain configuration
 */
export function removeChainConfig(chainId: number): void {
  ChainClients.remove(chainId);
}

/**
 * Get all configured chains
 */
export function getAllChainConfigs(): Record<number, ChainConfig> {
  return ChainClients.getAll();
}

/**
 * Clear all chain configurations
 */
export function clearChainConfigs(): void {
  ChainClients.clear();
}

