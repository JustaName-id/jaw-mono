/**
 * Chain clients store for managing blockchain RPC clients
 * Simplified version without Viem dependency for core package
 */

import { createStore, type Store } from '../../store/store.js';

export type ChainConfig = {
  id: number;
  rpcUrl: string;
  name?: string;
  nativeCurrency?: {
    name?: string;
    symbol?: string;
    decimals?: number;
  };
};

export type ChainClientState = {
  chains: Record<number, ChainConfig>;
};

const defaultState: ChainClientState = {
  chains: {},
};

/**
 * Store for chain configurations
 */
export const chainClientStore: Store<ChainClientState> = createStore(
  'chain-clients',
  defaultState
);

/**
 * Chain clients manager
 */
export const ChainClients = {
  /**
   * Get all chain configurations
   */
  getAll: (): Record<number, ChainConfig> => {
    return chainClientStore.get().chains;
  },

  /**
   * Get a specific chain configuration
   */
  get: (chainId: number): ChainConfig | undefined => {
    return chainClientStore.get().chains[chainId];
  },

  /**
   * Set chain configurations
   */
  set: (chains: ChainConfig[]): void => {
    const chainsMap = chains.reduce(
      (acc, chain) => {
        acc[chain.id] = chain;
        return acc;
      },
      {} as Record<number, ChainConfig>
    );
    chainClientStore.set({ chains: chainsMap });
  },

  /**
   * Add a single chain configuration
   */
  add: (chain: ChainConfig): void => {
    const current = chainClientStore.get().chains;
    chainClientStore.set({
      chains: { ...current, [chain.id]: chain },
    });
  },

  /**
   * Remove a chain configuration
   */
  remove: (chainId: number): void => {
    const current = chainClientStore.get().chains;
    const { [chainId]: _, ...rest } = current;
    chainClientStore.set({ chains: rest });
  },

  /**
   * Clear all chain configurations
   */
  clear: (): void => {
    chainClientStore.clear();
  },

  /**
   * Check if a chain exists
   */
  has: (chainId: number): boolean => {
    return chainId in chainClientStore.get().chains;
  },
};

