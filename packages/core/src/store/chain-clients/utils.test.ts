import { describe, it, expect, beforeEach } from 'vitest';
import { sepolia, optimismSepolia } from 'viem/chains';

import { ChainClients } from './store.js';
import { createClients, getClient, getBundlerClient } from './utils.js';

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

  it('should return undefined for missing clients', () => {
    const client = getClient(999);
    const bundlerClient = getBundlerClient(999);

    expect(client).toBeUndefined();
    expect(bundlerClient).toBeUndefined();
  });

  it('should properly configure client with chain details', () => {
    const testChain = {
      id: sepolia.id,
      rpcUrl: sepolia.rpcUrls.default.http[0],
      nativeCurrency: {
        name: 'Sepolia Ether',
        symbol: 'ETH',
        decimal: 18,
      },
    };

    createClients([testChain]);

    const client = getClient(sepolia.id);
    expect(client?.chain).toBeDefined();
    expect(client?.chain?.id).toBe(testChain.id);
    expect(client?.chain?.name).toBe(testChain.nativeCurrency.name);
    expect(client?.chain?.nativeCurrency.symbol).toBe(testChain.nativeCurrency.symbol);
    expect(client?.chain?.nativeCurrency.decimals).toBe(testChain.nativeCurrency.decimal);
  });

  it('should accumulate clients when called multiple times with different chains', () => {
    // First call with sepolia
    createClients([
      {
        id: sepolia.id,
        rpcUrl: sepolia.rpcUrls.default.http[0],
      },
    ]);

    let state = ChainClients.getState();
    expect(Object.keys(state).length).toBe(1);
    expect(state[sepolia.id]).toBeDefined();

    // Second call with optimismSepolia - should ADD to existing state
    createClients([
      {
        id: optimismSepolia.id,
        rpcUrl: optimismSepolia.rpcUrls.default.http[0],
      },
    ]);

    state = ChainClients.getState();
    expect(Object.keys(state).length).toBe(2);
    expect(state[sepolia.id]).toBeDefined();
    expect(state[optimismSepolia.id]).toBeDefined();
  });

  it('should replace client when called multiple times with same chain', () => {
    const firstRpcUrl = sepolia.rpcUrls.default.http[0];
    const secondRpcUrl = 'https://different-rpc-url.com';

    // First call
    createClients([
      {
        id: sepolia.id,
        rpcUrl: firstRpcUrl,
      },
    ]);

    const firstClient = getClient(sepolia.id);
    expect(firstClient).toBeDefined();

    // Second call with same chain but different RPC URL
    createClients([
      {
        id: sepolia.id,
        rpcUrl: secondRpcUrl,
      },
    ]);

    const secondClient = getClient(sepolia.id);
    expect(secondClient).toBeDefined();
    // Client should be replaced (different instance)
    expect(secondClient).not.toBe(firstClient);
    
    // Should still only have one chain in state
    const state = ChainClients.getState();
    expect(Object.keys(state).length).toBe(1);
  });
});
