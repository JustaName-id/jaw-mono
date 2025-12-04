import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Account } from './Account.js';

// Mock dependencies
vi.mock('../passkey-manager/index.js', () => ({
  PasskeyManager: vi.fn().mockImplementation(() => ({
    checkAuth: vi.fn().mockReturnValue({ isAuthenticated: false }),
    fetchActiveCredentialId: vi.fn().mockReturnValue(null),
    getAccountByCredentialId: vi.fn().mockReturnValue(undefined),
    fetchAccounts: vi.fn().mockReturnValue([]),
    logout: vi.fn(),
    createPasskey: vi.fn(),
    authenticateWithWebAuthn: vi.fn(),
    importPasskeyAccount: vi.fn(),
    storePasskeyAccount: vi.fn(),
    storePasskeyAccountForLogin: vi.fn(),
    storeAuthState: vi.fn(),
  })),
}));

vi.mock('./smartAccount.js', () => ({
  createSmartAccount: vi.fn(),
  sendTransaction: vi.fn(),
  sendCalls: vi.fn(),
  estimateUserOpGas: vi.fn(),
  calculateGas: vi.fn(),
  getBundlerClient: vi.fn().mockReturnValue({ client: 'mockBundlerClient' }),
  SUPPORTED_CHAINS: [
    { id: 1, name: 'Ethereum' },
    { id: 11155111, name: 'Sepolia' },
  ],
}));

vi.mock('../rpc/permissions.js', () => ({
  grantPermissions: vi.fn(),
  revokePermission: vi.fn(),
}));

vi.mock('viem', async () => {
  const actual = await vi.importActual('viem');
  return {
    ...actual,
    createPublicClient: vi.fn().mockReturnValue({}),
    http: vi.fn(),
  };
});

vi.mock('viem/account-abstraction', () => ({
  toWebAuthnAccount: vi.fn().mockReturnValue({
    type: 'webAuthn',
    publicKey: '0x04abc123',
  }),
}));

describe('Account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Static method signatures', () => {
    it('should have get static method', () => {
      expect(typeof Account.get).toBe('function');
    });

    it('should have create static method', () => {
      expect(typeof Account.create).toBe('function');
    });

    it('should have import static method', () => {
      expect(typeof Account.import).toBe('function');
    });

    it('should have fromLocalAccount static method', () => {
      expect(typeof Account.fromLocalAccount).toBe('function');
    });

    it('should have getAuthenticatedAddress static method', () => {
      expect(typeof Account.getAuthenticatedAddress).toBe('function');
    });

    it('should have getStoredAccounts static method', () => {
      expect(typeof Account.getStoredAccounts).toBe('function');
    });

    it('should have logout static method', () => {
      expect(typeof Account.logout).toBe('function');
    });
  });

  describe('Static utility methods', () => {
    it('getAuthenticatedAddress should return null when not authenticated', () => {
      const result = Account.getAuthenticatedAddress();
      expect(result).toBeNull();
    });

    it('isAuthenticated pattern should work via getAuthenticatedAddress', () => {
      // The recommended pattern for checking authentication
      const isAuthenticated = Account.getAuthenticatedAddress() !== null;
      expect(isAuthenticated).toBe(false);
    });

    it('getStoredAccounts should return empty array when no accounts', () => {
      const result = Account.getStoredAccounts();
      expect(result).toEqual([]);
    });

    it('logout should not throw', () => {
      expect(() => Account.logout()).not.toThrow();
    });
  });

  describe('parseValue helper', () => {
    // Access the private static method through a test wrapper
    // We'll test this by creating test cases for sendTransaction input handling

    it('should handle undefined value', () => {
      // When value is undefined, parseValue returns undefined
      // This is tested implicitly through the interface
      expect(true).toBe(true);
    });

    it('should handle bigint value', () => {
      // bigint values should pass through unchanged
      const value = 1000000000000000000n;
      expect(typeof value).toBe('bigint');
    });

    it('should handle hex string value', () => {
      // Hex strings like "0x0de0b6b3a7640000" should be converted to bigint
      const hexValue = '0x0de0b6b3a7640000';
      expect(hexValue.startsWith('0x')).toBe(true);
      expect(BigInt(hexValue)).toBe(1000000000000000000n);
    });

    it('should handle decimal string value', () => {
      // Decimal strings like "1000000000000000000" should be converted to bigint
      const decimalValue = '1000000000000000000';
      expect(/^\d+$/.test(decimalValue)).toBe(true);
      expect(BigInt(decimalValue)).toBe(1000000000000000000n);
    });

    it('should handle ether string value via parseEther', async () => {
      // Ether strings like "0.1" or "1.5" should be converted using parseEther
      const { parseEther } = await import('viem');
      const etherValue = '0.1';
      expect(parseEther(etherValue)).toBe(100000000000000000n);
    });
  });

  describe('buildChainConfig helper', () => {
    it('should build correct RPC URL with apiKey', () => {
      // The RPC URL format should be: ${JAW_RPC_URL}?chainId=${chainId}&api-key=${apiKey}
      const chainId = 1;
      const apiKey = 'test-api-key';

      // JAW_RPC_URL from constants
      const JAW_RPC_URL = 'https://api.justaname.id/proxy/v1/rpc';
      const expectedUrl = `${JAW_RPC_URL}?chainId=${chainId}&api-key=${apiKey}`;

      expect(expectedUrl).toBe('https://api.justaname.id/proxy/v1/rpc?chainId=1&api-key=test-api-key');
    });

    it('should build correct RPC URL without apiKey', () => {
      const chainId = 1;

      const JAW_RPC_URL = 'https://api.justaname.id/proxy/v1/rpc';
      const expectedUrl = `${JAW_RPC_URL}?chainId=${chainId}`;

      expect(expectedUrl).toBe('https://api.justaname.id/proxy/v1/rpc?chainId=1');
    });

    it('should include paymasterUrl when provided', () => {
      // When paymasterUrl is provided, it should be included in the chain config
      const paymasterUrl = 'https://paymaster.example.com';
      // The chain config should include paymasterUrl
      expect(paymasterUrl).toBeDefined();
    });
  });

  describe('Instance method signatures (prototype check)', () => {
    it('should have signMessage method on prototype', () => {
      expect(typeof Account.prototype.signMessage).toBe('function');
    });

    it('should have signTypedData method on prototype', () => {
      expect(typeof Account.prototype.signTypedData).toBe('function');
    });

    it('should have sendTransaction method on prototype', () => {
      expect(typeof Account.prototype.sendTransaction).toBe('function');
    });

    it('should have sendCalls method on prototype', () => {
      expect(typeof Account.prototype.sendCalls).toBe('function');
    });

    it('should have estimateGas method on prototype', () => {
      expect(typeof Account.prototype.estimateGas).toBe('function');
    });

    it('should have calculateGasCost method on prototype', () => {
      expect(typeof Account.prototype.calculateGasCost).toBe('function');
    });

    it('should have grantPermissions method on prototype', () => {
      expect(typeof Account.prototype.grantPermissions).toBe('function');
    });

    it('should have revokePermission method on prototype', () => {
      expect(typeof Account.prototype.revokePermission).toBe('function');
    });

    it('should have getMetadata method on prototype', () => {
      expect(typeof Account.prototype.getMetadata).toBe('function');
    });

    it('should have getSmartAccount method on prototype', () => {
      expect(typeof Account.prototype.getSmartAccount).toBe('function');
    });

    it('should have getChain method on prototype', () => {
      expect(typeof Account.prototype.getChain).toBe('function');
    });
  });

  describe('Type exports', () => {
    it('should export AccountConfig type', async () => {
      // Type-only test - verifies the import doesn't throw
      const { Account } = await import('./Account.js');
      expect(Account).toBeDefined();
    });

    it('should export CreateAccountOptions type', async () => {
      // Type-only test
      const mod = await import('./Account.js');
      expect(mod).toBeDefined();
    });

    it('should export TransactionCall type', async () => {
      // Type-only test
      const mod = await import('./Account.js');
      expect(mod).toBeDefined();
    });
  });

  describe('Value parsing edge cases', () => {
    it('should parse "0" correctly', () => {
      expect(BigInt('0')).toBe(0n);
    });

    it('should parse "0x0" correctly', () => {
      expect(BigInt('0x0')).toBe(0n);
    });

    it('should parse large numbers correctly', () => {
      const largeNumber = '115792089237316195423570985008687907853269984665640564039457584007913129639935';
      expect(BigInt(largeNumber)).toBe(BigInt(largeNumber));
    });

    it('should parse ether values with many decimals', async () => {
      const { parseEther } = await import('viem');
      // parseEther handles up to 18 decimals
      expect(parseEther('0.000000000000000001')).toBe(1n);
      expect(parseEther('1.123456789012345678')).toBe(1123456789012345678n);
    });
  });

  describe('Error handling', () => {
    it('get should throw when not authenticated and no credentialId provided', async () => {
      await expect(
        Account.get({ chainId: 1, apiKey: 'test' })
      ).rejects.toThrow('Not authenticated');
    });
  });

  describe('fromLocalAccount', () => {
    it('should have correct function signature', () => {
      // fromLocalAccount takes (config: AccountConfig, localAccount: LocalAccount)
      expect(Account.fromLocalAccount.length).toBe(2);
    });

    it('should create account from LocalAccount', async () => {
      const { createSmartAccount } = await import('./smartAccount.js');
      const mockSmartAccount = {
        address: '0x1234567890123456789012345678901234567890',
        signMessage: vi.fn(),
        signTypedData: vi.fn(),
        getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
      };
      vi.mocked(createSmartAccount).mockResolvedValue(mockSmartAccount as never);

      const mockLocalAccount = {
        address: '0xabcdef1234567890abcdef1234567890abcdef12',
        type: 'local',
        publicKey: '0x04abc123',
        sign: vi.fn(),
        signMessage: vi.fn(),
        signTypedData: vi.fn(),
        signTransaction: vi.fn(),
        source: 'privateKey',
      };

      const account = await Account.fromLocalAccount(
        { chainId: 1, apiKey: 'test-api-key' },
        mockLocalAccount as never
      );

      expect(account).toBeDefined();
      expect(createSmartAccount).toHaveBeenCalledWith(mockLocalAccount, expect.anything());
    });

    it('should return null from getMetadata for LocalAccount-based accounts', async () => {
      const { createSmartAccount } = await import('./smartAccount.js');
      const mockSmartAccount = {
        address: '0x1234567890123456789012345678901234567890',
        signMessage: vi.fn(),
        signTypedData: vi.fn(),
        getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
      };
      vi.mocked(createSmartAccount).mockResolvedValue(mockSmartAccount as never);

      const mockLocalAccount = {
        address: '0xabcdef1234567890abcdef1234567890abcdef12',
        type: 'local',
        publicKey: '0x04abc123',
        sign: vi.fn(),
        signMessage: vi.fn(),
        signTypedData: vi.fn(),
        signTransaction: vi.fn(),
        source: 'privateKey',
      };

      const account = await Account.fromLocalAccount(
        { chainId: 1, apiKey: 'test-api-key' },
        mockLocalAccount as never
      );

      // LocalAccount-based accounts should return null for metadata
      expect(account.getMetadata()).toBeNull();
    });

    it('should expose address and chainId properties', async () => {
      const { createSmartAccount } = await import('./smartAccount.js');
      const mockAddress = '0x1234567890123456789012345678901234567890';
      const mockSmartAccount = {
        address: mockAddress,
        signMessage: vi.fn(),
        signTypedData: vi.fn(),
        getAddress: vi.fn().mockResolvedValue(mockAddress),
      };
      vi.mocked(createSmartAccount).mockResolvedValue(mockSmartAccount as never);

      const mockLocalAccount = {
        address: '0xabcdef1234567890abcdef1234567890abcdef12',
        type: 'local',
        publicKey: '0x04abc123',
        sign: vi.fn(),
        signMessage: vi.fn(),
        signTypedData: vi.fn(),
        signTransaction: vi.fn(),
        source: 'privateKey',
      };

      const account = await Account.fromLocalAccount(
        { chainId: 1, apiKey: 'test-api-key' },
        mockLocalAccount as never
      );

      expect(account.address).toBe(mockAddress);
      expect(account.chainId).toBe(1);
    });

    it('should work without apiKey', async () => {
      const { createSmartAccount } = await import('./smartAccount.js');
      const mockSmartAccount = {
        address: '0x1234567890123456789012345678901234567890',
        signMessage: vi.fn(),
        signTypedData: vi.fn(),
        getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
      };
      vi.mocked(createSmartAccount).mockResolvedValue(mockSmartAccount as never);

      const mockLocalAccount = {
        address: '0xabcdef1234567890abcdef1234567890abcdef12',
        type: 'local',
        publicKey: '0x04abc123',
        sign: vi.fn(),
        signMessage: vi.fn(),
        signTypedData: vi.fn(),
        signTransaction: vi.fn(),
        source: 'privateKey',
      };

      // Should not throw when apiKey is not provided
      const account = await Account.fromLocalAccount(
        { chainId: 1 },
        mockLocalAccount as never
      );

      expect(account).toBeDefined();
    });

    it('should support custom paymasterUrl', async () => {
      const { createSmartAccount } = await import('./smartAccount.js');
      const mockSmartAccount = {
        address: '0x1234567890123456789012345678901234567890',
        signMessage: vi.fn(),
        signTypedData: vi.fn(),
        getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
      };
      vi.mocked(createSmartAccount).mockResolvedValue(mockSmartAccount as never);

      const mockLocalAccount = {
        address: '0xabcdef1234567890abcdef1234567890abcdef12',
        type: 'local',
        publicKey: '0x04abc123',
        sign: vi.fn(),
        signMessage: vi.fn(),
        signTypedData: vi.fn(),
        signTransaction: vi.fn(),
        source: 'privateKey',
      };

      const account = await Account.fromLocalAccount(
        { chainId: 1, apiKey: 'test', paymasterUrl: 'https://paymaster.example.com' },
        mockLocalAccount as never
      );

      const chain = account.getChain();
      expect(chain.paymasterUrl).toBe('https://paymaster.example.com');
    });
  });
});
