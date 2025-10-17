import { describe, it, expect, beforeEach } from 'vitest';
import { sepolia, optimismSepolia } from 'viem/chains';

import { ChainClients } from './store.js';
import { createClients, getClient, getBundlerClient, getPaymasterClient } from './utils.js';

describe('chain-clients/utils', () => {
  beforeEach(() => {
    // Reset store state before each test - use replace to fully reset
    ChainClients.setState({}, true);
  });

  it('should create clients for a single chain', () => {
    createClients([
      {
        id: sepolia.id,
        rpcUrl: sepolia.rpcUrls.default.http[0],
        nativeCurrency: {
          name: sepolia.nativeCurrency.name,
          symbol: sepolia.nativeCurrency.symbol,
          decimal: sepolia.nativeCurrency.decimals,
        },
      },
    ]);

    const state = ChainClients.getState();
    expect(Object.keys(state).length).toBe(1);
    expect(state[sepolia.id]).toBeDefined();
    expect(state[sepolia.id].client).toBeDefined();
    expect(state[sepolia.id].bundlerClient).toBeDefined();
    expect(state[sepolia.id].paymasterClient).toBeDefined();
  });

  it('should create clients for multiple chains', () => {
    createClients([
      {
        id: sepolia.id,
        rpcUrl: sepolia.rpcUrls.default.http[0],
        nativeCurrency: {
          name: sepolia.nativeCurrency.name,
          symbol: sepolia.nativeCurrency.symbol,
          decimal: sepolia.nativeCurrency.decimals,
        },
      },
      {
        id: optimismSepolia.id,
        rpcUrl: optimismSepolia.rpcUrls.default.http[0],
        nativeCurrency: {
          name: optimismSepolia.nativeCurrency.name,
          symbol: optimismSepolia.nativeCurrency.symbol,
          decimal: optimismSepolia.nativeCurrency.decimals,
        },
      },
    ]);

    const state = ChainClients.getState();
    expect(Object.keys(state).length).toBe(2);
    
    expect(state[sepolia.id].client).toBeDefined();
    expect(state[optimismSepolia.id].client).toBeDefined();
    
    expect(state[sepolia.id].bundlerClient).toBeDefined();
    expect(state[optimismSepolia.id].bundlerClient).toBeDefined();
    
    expect(state[sepolia.id].paymasterClient).toBeDefined();
    expect(state[optimismSepolia.id].paymasterClient).toBeDefined();
  });

  it('should skip chains without rpcUrl', () => {
    createClients([
      {
        id: 1,
        // No rpcUrl
      },
      {
        id: sepolia.id,
        rpcUrl: sepolia.rpcUrls.default.http[0],
      },
    ]);

    const state = ChainClients.getState();
    expect(Object.keys(state).length).toBe(1);
    expect(state[1]).toBeUndefined();
    expect(state[sepolia.id]).toBeDefined();
  });

  it('should get public client by chain id', () => {
    createClients([
      {
        id: sepolia.id,
        rpcUrl: sepolia.rpcUrls.default.http[0],
      },
    ]);

    const client = getClient(sepolia.id);
    expect(client).toBeDefined();
    expect(client?.chain?.id).toBe(sepolia.id);
  });

  it('should return undefined for non-existent chain', () => {
    const client = getClient(999);
    expect(client).toBeUndefined();
  });

  it('should get bundler client by chain id', () => {
    createClients([
      {
        id: sepolia.id,
        rpcUrl: sepolia.rpcUrls.default.http[0],
      },
    ]);

    const bundlerClient = getBundlerClient(sepolia.id);
    expect(bundlerClient).toBeDefined();
  });

  it('should get paymaster client by chain id', () => {
    createClients([
      {
        id: sepolia.id,
        rpcUrl: sepolia.rpcUrls.default.http[0],
      },
    ]);

    const paymasterClient = getPaymasterClient(sepolia.id);
    expect(paymasterClient).toBeDefined();
  });

  it('should handle native currency with default decimals', () => {
    createClients([
      {
        id: sepolia.id,
        rpcUrl: sepolia.rpcUrls.default.http[0],
        nativeCurrency: {
          name: 'Test Token',
          symbol: 'TEST',
          // No decimal specified, should default to 18
        },
      },
    ]);

    const client = getClient(sepolia.id);
    expect(client).toBeDefined();
    expect(client?.chain?.nativeCurrency.decimals).toBe(18);
  });
});
