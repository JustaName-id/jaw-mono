import { describe, it, expect, beforeEach } from 'vitest';

import { sdkstore, account, chains, keys, config, store } from './store.js';
import { SDK_VERSION } from '../sdk-info.js';

describe('store', () => {
  beforeEach(() => {
    // Reset store state before each test - use replace to fully reset
    sdkstore.setState(
      {
        chains: [],
        keys: {},
        account: {},
        config: { version: SDK_VERSION },
      },
      true
    );
  });

  describe('account actions', () => {
    it('should initialize with empty account', () => {
      const state = account.get();
      expect(state).toEqual({});
    });

    it('should set account data', () => {
      account.set({
        accounts: ['0x1234567890123456789012345678901234567890'],
      });

      const state = account.get();
      expect(state.accounts).toBeDefined();
      expect(state.accounts?.length).toBe(1);
      expect(state.accounts?.[0]).toBe('0x1234567890123456789012345678901234567890');
    });

    it('should merge account data on set', () => {
      account.set({
        accounts: ['0x1234567890123456789012345678901234567890'],
      });

      account.set({
        capabilities: { test: true },
      });

      const state = account.get();
      expect(state.accounts?.length).toBe(1);
      expect(state.capabilities).toEqual({ test: true });
    });

    it('should set chain data in account', () => {
      account.set({
        chain: {
          id: 1,
          rpcUrl: 'https://eth.example.com',
        },
      });

      const state = account.get();
      expect(state.chain).toBeDefined();
      expect(state.chain?.id).toBe(1);
    });

    it('should clear account data', () => {
      account.set({
        accounts: ['0x1234567890123456789012345678901234567890'],
        capabilities: { test: true },
      });

      account.clear();

      const state = account.get();
      expect(state).toEqual({});
    });
  });

  describe('chains actions', () => {
    it('should initialize with empty chains array', () => {
      const state = chains.get();
      expect(state).toEqual([]);
    });

    it('should set single chain', () => {
      chains.set([
        {
          id: 1,
          rpcUrl: 'https://eth.example.com',
        },
      ]);

      const state = chains.get();
      expect(state.length).toBe(1);
      expect(state[0].id).toBe(1);
    });

    it('should set multiple chains', () => {
      chains.set([
        {
          id: 1,
          rpcUrl: 'https://eth.example.com',
        },
        {
          id: 11155111,
          rpcUrl: 'https://sepolia.example.com',
          nativeCurrency: {
            name: 'Sepolia Ether',
            symbol: 'ETH',
            decimal: 18,
          },
        },
      ]);

      const state = chains.get();
      expect(state.length).toBe(2);
      expect(state[0].id).toBe(1);
      expect(state[1].id).toBe(11155111);
      expect(state[1].nativeCurrency?.symbol).toBe('ETH');
    });

    it('should replace chains on set', () => {
      chains.set([{ id: 1 }]);
      chains.set([{ id: 2 }]);

      const state = chains.get();
      expect(state.length).toBe(1);
      expect(state[0].id).toBe(2);
    });

    it('should clear chains', () => {
      chains.set([
        { id: 1 },
        { id: 2 },
      ]);

      chains.clear();

      const state = chains.get();
      expect(state).toEqual([]);
    });
  });

  describe('keys actions', () => {
    it('should initialize with empty keys object', () => {
      const key = keys.get('test');
      expect(key).toBeUndefined();
    });

    it('should set a key-value pair', () => {
      keys.set('myKey', 'myValue');

      const value = keys.get('myKey');
      expect(value).toBe('myValue');
    });

    it('should set multiple keys', () => {
      keys.set('key1', 'value1');
      keys.set('key2', 'value2');
      keys.set('key3', 'value3');

      expect(keys.get('key1')).toBe('value1');
      expect(keys.get('key2')).toBe('value2');
      expect(keys.get('key3')).toBe('value3');
    });

    it('should set key to null', () => {
      keys.set('myKey', 'myValue');
      keys.set('myKey', null);

      const value = keys.get('myKey');
      expect(value).toBeNull();
    });

    it('should override existing key', () => {
      keys.set('myKey', 'oldValue');
      keys.set('myKey', 'newValue');

      const value = keys.get('myKey');
      expect(value).toBe('newValue');
    });

    it('should return undefined for non-existent key', () => {
      const value = keys.get('nonExistent');
      expect(value).toBeUndefined();
    });

    it('should clear all keys', () => {
      keys.set('key1', 'value1');
      keys.set('key2', 'value2');

      keys.clear();

      expect(keys.get('key1')).toBeUndefined();
      expect(keys.get('key2')).toBeUndefined();
    });

    it('should preserve other keys when setting one', () => {
      keys.set('key1', 'value1');
      keys.set('key2', 'value2');
      keys.set('key3', 'value3');

      expect(keys.get('key1')).toBe('value1');
      expect(keys.get('key2')).toBe('value2');
    });
  });

  describe('config actions', () => {
    it('should initialize with SDK version', () => {
      const state = config.get();
      expect(state.version).toBe(SDK_VERSION);
    });

    it('should set config metadata', () => {
      config.set({
        metadata: {
          appName: 'Test App',
          appLogoUrl: 'https://example.com/logo.png',
          appChainIds: [1, 11155111],
        },
      });

      const state = config.get();
      expect(state.metadata?.appName).toBe('Test App');
      expect(state.metadata?.appChainIds).toEqual([1, 11155111]);
    });

    it('should set config preference', () => {
      config.set({
        preference: {
          mode: 'cross-platform',
          keysUrl: 'https://keys.example.com',
        },
      });

      const state = config.get();
      expect(state.preference?.mode).toBe('cross-platform');
      expect(state.preference?.keysUrl).toBe('https://keys.example.com');
    });

    it('should merge config on set', () => {
      config.set({
        metadata: {
          appName: 'Test App',
          appLogoUrl: null,
          appChainIds: [1],
        },
      });

      config.set({
        deviceId: 'device-123',
      });

      const state = config.get();
      expect(state.metadata?.appName).toBe('Test App');
      expect(state.deviceId).toBe('device-123');
      expect(state.version).toBe(SDK_VERSION);
    });

    it('should set paymaster URLs', () => {
      config.set({
        paymasterUrls: {
          1: 'https://paymaster-mainnet.example.com',
          11155111: 'https://paymaster-sepolia.example.com',
        },
      });

      const state = config.get();
      expect(state.paymasterUrls?.[1]).toBe('https://paymaster-mainnet.example.com');
      expect(state.paymasterUrls?.[11155111]).toBe('https://paymaster-sepolia.example.com');
    });

    it('should preserve version when setting other config', () => {
      const initialVersion = config.get().version;

      config.set({
        metadata: {
          appName: 'Test App',
          appLogoUrl: null,
          appChainIds: [1],
        },
      });

      const state = config.get();
      expect(state.version).toBe(initialVersion);
    });
  });

  describe('store integration', () => {
    it('should export combined store with actions', () => {
      expect(store.account).toBeDefined();
      expect(store.chains).toBeDefined();
      expect(store.keys).toBeDefined();
      expect(store.config).toBeDefined();
      expect(store.getState).toBeDefined();
      expect(store.setState).toBeDefined();
      expect(store.subscribe).toBeDefined();
    });

    it('should allow direct state access via sdkstore', () => {
      chains.set([{ id: 1 }]);
      account.set({ accounts: ['0x1234567890123456789012345678901234567890'] });

      const state = sdkstore.getState();
      expect(state.chains.length).toBe(1);
      expect(state.account.accounts?.length).toBe(1);
    });

    it('should support subscriptions', () => {
      let callCount = 0;
      const unsubscribe = sdkstore.subscribe(() => {
        callCount++;
      });

      chains.set([{ id: 1 }]);
      account.set({ accounts: ['0x1234567890123456789012345678901234567890'] });

      expect(callCount).toBeGreaterThan(0);
      unsubscribe();
    });

    it('should maintain data consistency across different action APIs', () => {
      // Set data using action APIs
      chains.set([{ id: 1 }]);
      keys.set('test', 'value');

      // Read using direct store access
      const state = store.getState();
      expect(state.chains[0].id).toBe(1);
      expect(state.keys.test).toBe('value');

      // Verify using action APIs
      expect(chains.get()[0].id).toBe(1);
      expect(keys.get('test')).toBe('value');
    });
  });

  describe('state isolation', () => {
    it('should not affect other slices when updating one', () => {
      chains.set([{ id: 1 }]);
      keys.set('key1', 'value1');
      account.set({ accounts: ['0x1234567890123456789012345678901234567890'] });

      // Update only chains
      chains.set([{ id: 2 }]);

      // Other slices should remain unchanged
      expect(keys.get('key1')).toBe('value1');
      expect(account.get().accounts?.length).toBe(1);
    });

    it('should clear only targeted slice', () => {
      chains.set([{ id: 1 }]);
      keys.set('key1', 'value1');
      account.set({ accounts: ['0x1234567890123456789012345678901234567890'] });

      // Clear only keys
      keys.clear();

      // Keys should be empty
      expect(keys.get('key1')).toBeUndefined();

      // Other slices should remain
      expect(chains.get().length).toBe(1);
      expect(account.get().accounts?.length).toBe(1);
    });
  });
});

