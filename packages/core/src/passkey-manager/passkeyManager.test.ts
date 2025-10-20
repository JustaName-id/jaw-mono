import { describe, it, expect, beforeEach } from 'vitest';
import { PasskeyManager } from './passkeyManager.js';
import { createMemoryStorage } from '../storage-manager/index.js';
import type { PasskeyAccount } from './types.js';

describe('PasskeyManager', () => {
  let manager: PasskeyManager;

  const mockAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';
  const mockCredentialId = 'MMYq3VdLd4sfsf3hHWKYAjOuc70';
  const mockUsername = 'test.justan.id';

  beforeEach(() => {
    // Use memory storage for tests to avoid localStorage side effects
    const storage = createMemoryStorage();
    manager = new PasskeyManager(storage);
  });

  describe('checkAuth', () => {
    it('should return not authenticated by default', () => {
      const result = manager.checkAuth();
      expect(result.isAuthenticated).toBe(false);
      expect(result.address).toBeUndefined();
    });

    it('should return authenticated when auth state exists', () => {
      manager.storeAuthState(mockAddress, mockCredentialId);

      const result = manager.checkAuth();
      expect(result.isAuthenticated).toBe(true);
      expect(result.address).toBe(mockAddress);
    });

    it('should return not authenticated when address is missing', () => {
      const storage = createMemoryStorage();
      storage.setItem('authState', {
        isLoggedIn: true,
        credentialId: mockCredentialId,
        timestamp: Date.now(),
        // address missing
      });
      
      const testManager = new PasskeyManager(storage);
      const result = testManager.checkAuth();
      expect(result.isAuthenticated).toBe(false);
    });

    it('should return not authenticated when isLoggedIn is false', () => {
      const storage = createMemoryStorage();
      storage.setItem('authState', {
        isLoggedIn: false,
        address: mockAddress,
        credentialId: mockCredentialId,
        timestamp: Date.now(),
      });
      
      const testManager = new PasskeyManager(storage);
      const result = testManager.checkAuth();
      expect(result.isAuthenticated).toBe(false);
    });

    it('should handle storage errors gracefully', () => {
      const brokenStorage = {
        getItem: () => {
          throw new Error('Storage error');
        },
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        setItem: () => {},
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        removeItem: () => {},
      };

      const testManager = new PasskeyManager(brokenStorage as unknown as any);
      const result = testManager.checkAuth();
      expect(result.isAuthenticated).toBe(false);
    });
  });

  describe('storeAuthState', () => {
    it('should store auth state with all required fields', () => {
      manager.storeAuthState(mockAddress, mockCredentialId);

      const result = manager.checkAuth();
      expect(result.isAuthenticated).toBe(true);
      expect(result.address).toBe(mockAddress);

      const credentialId = manager.fetchActiveCredentialId();
      expect(credentialId).toBe(mockCredentialId);
    });

    it('should overwrite existing auth state', () => {
      manager.storeAuthState(mockAddress, mockCredentialId);
      
      const newAddress = '0x123456789';
      const newCredentialId = 'newCredId123';
      manager.storeAuthState(newAddress, newCredentialId);

      const result = manager.checkAuth();
      expect(result.address).toBe(newAddress);
      expect(manager.fetchActiveCredentialId()).toBe(newCredentialId);
    });
  });

  describe('logout', () => {
    it('should clear auth state', () => {
      manager.storeAuthState(mockAddress, mockCredentialId);
      expect(manager.checkAuth().isAuthenticated).toBe(true);

      manager.logout();
      expect(manager.checkAuth().isAuthenticated).toBe(false);
    });

    it('should not affect accounts list', () => {
      manager.storePasskeyAccount(mockUsername, mockCredentialId, mockAddress);
      expect(manager.fetchAccounts().length).toBe(1);

      manager.logout();
      expect(manager.fetchAccounts().length).toBe(1);
    });

    it('should throw error if storage fails', () => {
      const brokenStorage = {
        getItem: () => null,
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        setItem: () => {},
        removeItem: () => {
          throw new Error('Storage error');
        },
      };

      const testManager = new PasskeyManager(brokenStorage as unknown as any);
      expect(() => testManager.logout()).toThrow('Storage error');
    });
  });

  describe('fetchAccounts', () => {
    it('should return empty array when no accounts exist', () => {
      const accounts = manager.fetchAccounts();
      expect(accounts).toEqual([]);
    });

    it('should return all stored accounts', () => {
      const account1: PasskeyAccount = {
        username: 'user1.justan.id',
        credentialId: 'cred1',
        creationDate: new Date().toISOString(),
        isImported: false,
      };

      const account2: PasskeyAccount = {
        username: 'user2.justan.id',
        credentialId: 'cred2',
        creationDate: new Date().toISOString(),
        isImported: true,
      };

      manager.addAccountToList(account1);
      manager.addAccountToList(account2);

      const accounts = manager.fetchAccounts();
      expect(accounts.length).toBe(2);
      expect(accounts).toContainEqual(account1);
      expect(accounts).toContainEqual(account2);
    });

    it('should handle storage errors gracefully', () => {
      const brokenStorage = {
        getItem: () => {
          throw new Error('Storage error');
        },
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        setItem: () => {},
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        removeItem: () => {},
      };

      const testManager = new PasskeyManager(brokenStorage as unknown as any);
      const accounts = testManager.fetchAccounts();
      expect(accounts).toEqual([]);
    });

    it('should handle invalid data gracefully', () => {
      const storage = createMemoryStorage();
      storage.setItem('accounts', 'invalid data');

      const testManager = new PasskeyManager(storage);
      const accounts = testManager.fetchAccounts();
      expect(accounts).toEqual([]);
    });
  });

  describe('fetchActiveCredentialId', () => {
    it('should return null when no auth state exists', () => {
      const credentialId = manager.fetchActiveCredentialId();
      expect(credentialId).toBeNull();
    });

    it('should return active credential ID', () => {
      manager.storeAuthState(mockAddress, mockCredentialId);

      const credentialId = manager.fetchActiveCredentialId();
      expect(credentialId).toBe(mockCredentialId);
    });

    it('should handle storage errors gracefully', () => {
      const brokenStorage = {
        getItem: () => {
          throw new Error('Storage error');
        },
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        setItem: () => {},
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        removeItem: () => {},
      };

      const testManager = new PasskeyManager(brokenStorage as unknown as any);
      const credentialId = testManager.fetchActiveCredentialId();
      expect(credentialId).toBeNull();
    });
  });

  describe('addAccountToList', () => {
    it('should add new account', () => {
      const account: PasskeyAccount = {
        username: mockUsername,
        credentialId: mockCredentialId,
        creationDate: new Date().toISOString(),
        isImported: false,
      };

      manager.addAccountToList(account);

      const accounts = manager.fetchAccounts();
      expect(accounts.length).toBe(1);
      expect(accounts[0]).toEqual(account);
    });

    it('should not add duplicate accounts', () => {
      const account: PasskeyAccount = {
        username: mockUsername,
        credentialId: mockCredentialId,
        creationDate: new Date().toISOString(),
        isImported: false,
      };

      manager.addAccountToList(account);
      manager.addAccountToList(account);

      const accounts = manager.fetchAccounts();
      expect(accounts.length).toBe(1);
    });

    it('should allow accounts with different credential IDs', () => {
      const account1: PasskeyAccount = {
        username: 'user1.justan.id',
        credentialId: 'cred1',
        creationDate: new Date().toISOString(),
        isImported: false,
      };

      const account2: PasskeyAccount = {
        username: 'user2.justan.id',
        credentialId: 'cred2',
        creationDate: new Date().toISOString(),
        isImported: false,
      };

      manager.addAccountToList(account1);
      manager.addAccountToList(account2);

      const accounts = manager.fetchAccounts();
      expect(accounts.length).toBe(2);
    });
  });

  describe('storePasskeyAccount', () => {
    it('should store account and set auth state', () => {
      manager.storePasskeyAccount(mockUsername, mockCredentialId, mockAddress);

      // Check auth state
      const auth = manager.checkAuth();
      expect(auth.isAuthenticated).toBe(true);
      expect(auth.address).toBe(mockAddress);

      // Check account stored
      const accounts = manager.fetchAccounts();
      expect(accounts.length).toBe(1);
      expect(accounts[0].username).toBe(mockUsername);
      expect(accounts[0].credentialId).toBe(mockCredentialId);
      expect(accounts[0].isImported).toBe(false);
    });

    it('should trim whitespace from username', () => {
      manager.storePasskeyAccount('  test.justan.id  ', mockCredentialId, mockAddress);

      const accounts = manager.fetchAccounts();
      expect(accounts[0].username).toBe('test.justan.id');
    });

    it('should set isImported to false by default', () => {
      manager.storePasskeyAccount(mockUsername, mockCredentialId, mockAddress);

      const accounts = manager.fetchAccounts();
      expect(accounts[0].isImported).toBe(false);
    });

    it('should respect isImported parameter', () => {
      manager.storePasskeyAccount(mockUsername, mockCredentialId, mockAddress, true);

      const accounts = manager.fetchAccounts();
      expect(accounts[0].isImported).toBe(true);
    });

    it('should set creation date', () => {
      const beforeTime = new Date().toISOString();
      manager.storePasskeyAccount(mockUsername, mockCredentialId, mockAddress);
      const afterTime = new Date().toISOString();

      const accounts = manager.fetchAccounts();
      const creationDate = accounts[0].creationDate;
      expect(creationDate).toBeDefined();
      expect(creationDate >= beforeTime).toBe(true);
      expect(creationDate <= afterTime).toBe(true);
    });
  });

  describe('storePasskeyAccountForLogin', () => {
    it('should store account with isImported=true', () => {
      manager.storePasskeyAccountForLogin(mockUsername, mockCredentialId, mockAddress);

      const accounts = manager.fetchAccounts();
      expect(accounts.length).toBe(1);
      expect(accounts[0].isImported).toBe(true);
    });

    it('should set auth state', () => {
      manager.storePasskeyAccountForLogin(mockUsername, mockCredentialId, mockAddress);

      const auth = manager.checkAuth();
      expect(auth.isAuthenticated).toBe(true);
      expect(auth.address).toBe(mockAddress);
    });

    it('should store username as provided', () => {
      manager.storePasskeyAccountForLogin(mockUsername, mockCredentialId, mockAddress);

      const accounts = manager.fetchAccounts();
      expect(accounts[0].username).toBe(mockUsername);
    });
  });

  describe('removeAccount', () => {
    it('should remove account by credential ID', () => {
      manager.storePasskeyAccount(mockUsername, mockCredentialId, mockAddress);
      expect(manager.fetchAccounts().length).toBe(1);

      manager.removeAccount(mockCredentialId);
      expect(manager.fetchAccounts().length).toBe(0);
    });

    it('should not affect other accounts', () => {
      manager.storePasskeyAccount('user1.justan.id', 'cred1', mockAddress);
      manager.storePasskeyAccount('user2.justan.id', 'cred2', mockAddress);

      manager.removeAccount('cred1');

      const accounts = manager.fetchAccounts();
      expect(accounts.length).toBe(1);
      expect(accounts[0].credentialId).toBe('cred2');
    });

    it('should do nothing if credential does not exist', () => {
      manager.storePasskeyAccount(mockUsername, mockCredentialId, mockAddress);

      manager.removeAccount('non-existent-id');

      expect(manager.fetchAccounts().length).toBe(1);
    });

    it('should not affect auth state', () => {
      manager.storePasskeyAccount(mockUsername, mockCredentialId, mockAddress);
      expect(manager.checkAuth().isAuthenticated).toBe(true);

      manager.removeAccount(mockCredentialId);
      expect(manager.checkAuth().isAuthenticated).toBe(true);
    });
  });

  describe('clearAll', () => {
    it('should clear auth state and accounts', () => {
      manager.storePasskeyAccount(mockUsername, mockCredentialId, mockAddress);
      manager.storePasskeyAccount('user2.justan.id', 'cred2', mockAddress);

      expect(manager.checkAuth().isAuthenticated).toBe(true);
      expect(manager.fetchAccounts().length).toBe(2);

      manager.clearAll();

      expect(manager.checkAuth().isAuthenticated).toBe(false);
      expect(manager.fetchAccounts().length).toBe(0);
    });

    it('should work when no data exists', () => {
      expect(() => manager.clearAll()).not.toThrow();
    });
  });

  describe('getAccountByCredentialId', () => {
    it('should return account when it exists', () => {
      manager.storePasskeyAccount(mockUsername, mockCredentialId, mockAddress);

      const account = manager.getAccountByCredentialId(mockCredentialId);
      expect(account).toBeDefined();
      expect(account?.username).toBe(mockUsername);
      expect(account?.credentialId).toBe(mockCredentialId);
    });

    it('should return undefined when account does not exist', () => {
      const account = manager.getAccountByCredentialId('non-existent');
      expect(account).toBeUndefined();
    });

    it('should find correct account among multiple', () => {
      manager.storePasskeyAccount('user1.justan.id', 'cred1', mockAddress);
      manager.storePasskeyAccount('user2.justan.id', 'cred2', mockAddress);

      const account = manager.getAccountByCredentialId('cred2');
      expect(account?.username).toBe('user2.justan.id');
    });
  });

  describe('hasAccount', () => {
    it('should return true when account exists', () => {
      manager.storePasskeyAccount(mockUsername, mockCredentialId, mockAddress);

      expect(manager.hasAccount(mockCredentialId)).toBe(true);
    });

    it('should return false when account does not exist', () => {
      expect(manager.hasAccount('non-existent')).toBe(false);
    });
  });

  describe('getConfig', () => {
    it('should return empty config by default', () => {
      const config = manager.getConfig();
      expect(config).toEqual({});
    });

    it('should return config passed in constructor', () => {
      const customConfig = {
        mode: 'cross-platform' as const,
        serverUrl: 'https://custom.example.com',
        apiKey: 'test-key',
      };

      const customManager = new PasskeyManager(createMemoryStorage(), customConfig);
      const config = customManager.getConfig();

      expect(config.mode).toBe('cross-platform');
      expect(config.serverUrl).toBe('https://custom.example.com');
      expect(config.apiKey).toBe('test-key');
    });

    it('should return copy of config', () => {
      const customConfig = { serverUrl: 'https://example.com' };
      const customManager = new PasskeyManager(createMemoryStorage(), customConfig);
      
      const config1 = customManager.getConfig();
      config1.serverUrl = 'modified';
      
      const config2 = customManager.getConfig();
      expect(config2.serverUrl).toBe('https://example.com');
    });
  });

  describe('updateConfig', () => {
    it('should update config', () => {
      manager.updateConfig({ serverUrl: 'https://new.example.com' });

      const config = manager.getConfig();
      expect(config.serverUrl).toBe('https://new.example.com');
    });

    it('should merge with existing config', () => {
      manager.updateConfig({ serverUrl: 'https://example.com' });
      manager.updateConfig({ apiKey: 'test-key' });

      const config = manager.getConfig();
      expect(config.serverUrl).toBe('https://example.com');
      expect(config.apiKey).toBe('test-key');
    });

    it('should overwrite existing values', () => {
      manager.updateConfig({ serverUrl: 'https://old.example.com' });
      manager.updateConfig({ serverUrl: 'https://new.example.com' });

      const config = manager.getConfig();
      expect(config.serverUrl).toBe('https://new.example.com');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete registration flow', () => {
      // Initial state
      expect(manager.checkAuth().isAuthenticated).toBe(false);
      expect(manager.fetchAccounts().length).toBe(0);

      // Register
      manager.storePasskeyAccount(mockUsername, mockCredentialId, mockAddress);

      // Verify state
      const auth = manager.checkAuth();
      expect(auth.isAuthenticated).toBe(true);
      expect(auth.address).toBe(mockAddress);

      const accounts = manager.fetchAccounts();
      expect(accounts.length).toBe(1);
      expect(accounts[0].username).toBe(mockUsername);

      const activeCredId = manager.fetchActiveCredentialId();
      expect(activeCredId).toBe(mockCredentialId);
    });

    it('should handle login flow', () => {
      manager.storePasskeyAccountForLogin(mockUsername, mockCredentialId, mockAddress);

      expect(manager.checkAuth().isAuthenticated).toBe(true);
      expect(manager.fetchAccounts()[0].isImported).toBe(true);
    });

    it('should handle logout and re-login', () => {
      // Initial login
      manager.storePasskeyAccount(mockUsername, mockCredentialId, mockAddress);
      expect(manager.checkAuth().isAuthenticated).toBe(true);

      // Logout
      manager.logout();
      expect(manager.checkAuth().isAuthenticated).toBe(false);

      // Account should still exist
      expect(manager.fetchAccounts().length).toBe(1);

      // Re-login
      manager.storeAuthState(mockAddress, mockCredentialId);
      expect(manager.checkAuth().isAuthenticated).toBe(true);
    });

    it('should handle multiple accounts', () => {
      manager.storePasskeyAccount('user1.justan.id', 'cred1', '0x111', false);
      manager.storePasskeyAccount('user2.justan.id', 'cred2', '0x222', false);
      manager.storePasskeyAccountForLogin('user3.justan.id', 'cred3', '0x333');

      const accounts = manager.fetchAccounts();
      expect(accounts.length).toBe(3);
      expect(accounts.filter(a => a.isImported).length).toBe(1);
      expect(accounts.filter(a => !a.isImported).length).toBe(2);
    });

    it('should handle account switching', () => {
      manager.storePasskeyAccount('user1.justan.id', 'cred1', '0x111');
      expect(manager.checkAuth().address).toBe('0x111');
      expect(manager.fetchActiveCredentialId()).toBe('cred1');

      manager.storeAuthState('0x222', 'cred2');
      manager.addAccountToList({
        username: 'user2.justan.id',
        credentialId: 'cred2',
        creationDate: new Date().toISOString(),
        isImported: false,
      });

      expect(manager.checkAuth().address).toBe('0x222');
      expect(manager.fetchActiveCredentialId()).toBe('cred2');
      expect(manager.fetchAccounts().length).toBe(2);
    });
  });
});

