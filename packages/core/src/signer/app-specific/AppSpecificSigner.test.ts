import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { AppSpecificSigner } from './AppSpecificSigner.js';
import { store } from '../../store/index.js';
import type { AppMetadata, ProviderEventCallback, RequestArguments } from '../../provider/interface.js';
import type { UIHandler, UIResponse } from '../../ui/interface.js';
import { UIError } from '../../ui/interface.js';
import { correlationIds } from '../../store/correlation-ids/store.js';
import { getCallStatus, getCallStatusEIP5792 } from '../../rpc/wallet_sendCalls.js';
import { fetchRPCRequest } from '../../utils/index.js';
import { getPermissionFromRelay } from '../../rpc/permissions.js';

// Mock dependencies
vi.mock('../signerStorage.js', () => ({
  clearSignerType: vi.fn(),
}));

vi.mock('../../rpc/wallet_sendCalls.js', () => ({
  getCallStatus: vi.fn(),
  getCallStatusEIP5792: vi.fn(),
  waitForReceiptInBackground: vi.fn().mockResolvedValue(undefined),
  storeCallStatus: vi.fn(),
}));

vi.mock('../../utils/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/index.js')>();
  return {
    ...actual,
    fetchRPCRequest: vi.fn(),
  };
});

vi.mock('../../rpc/permissions.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../rpc/permissions.js')>();
  return {
    ...actual,
    getPermissionFromRelay: vi.fn(),
  };
});

const mockCorrelationId = 'test-correlation-id';

describe('AppSpecificSigner', () => {
  let signer: AppSpecificSigner;
  let mockUIHandler: UIHandler;
  let mockCallback: ProviderEventCallback;
  let mockMetadata: AppMetadata;

  beforeEach(() => {
    // Setup metadata
    mockMetadata = {
      appName: 'Test App',
      appLogoUrl: 'https://test.com/logo.png',
      defaultChainId: 1,
    };

    // Setup mock UI handler
    mockUIHandler = {
      request: vi.fn(),
      init: vi.fn(),
      cleanup: vi.fn(),
    };

    // Setup callback
    mockCallback = vi.fn();

    // Setup correlation ID mock
    vi.spyOn(correlationIds, 'get').mockReturnValue(mockCorrelationId);

    // Setup store mocks
    vi.spyOn(store, 'getState').mockReturnValue({
      account: {
        accounts: [],
        chain: undefined,
        capabilities: undefined,
      },
      chains: [
        { id: 1, rpcUrl: 'https://mainnet.test.com' },
        { id: 11155111, rpcUrl: 'https://sepolia.test.com' },
      ],
      config: {
        metadata: mockMetadata,
        version: '1.0.0',
      },
      keys: {},
      callStatuses: {},
    });

    vi.spyOn(store.config, 'get').mockReturnValue({
      metadata: mockMetadata,
      version: '1.0.0',
      apiKey: 'test-api-key',
    });

    vi.spyOn(store.account, 'set').mockReturnValue(undefined);
    vi.spyOn(store.account, 'clear').mockReturnValue(undefined);
    vi.spyOn(store.account, 'get').mockReturnValue({
      accounts: undefined,
      chain: undefined,
      capabilities: undefined,
    });

    // Create signer instance
    signer = new AppSpecificSigner({
      metadata: mockMetadata,
      uiHandler: mockUIHandler,
      callback: mockCallback,
      apiKey: 'test-api-key',
      paymasterUrls: { 1: 'https://paymaster.test.com' },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize UI handler with SDK configuration', () => {
      expect(mockUIHandler.init).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        defaultChainId: 1,
        paymasterUrls: { 1: 'https://paymaster.test.com' },
        appName: 'Test App',
        appLogoUrl: 'https://test.com/logo.png',
      });
    });

    it('should not call init if uiHandler.init is undefined', () => {
      const handlerWithoutInit: UIHandler = {
        request: vi.fn(),
      };

      // Should not throw
      new AppSpecificSigner({
        metadata: mockMetadata,
        uiHandler: handlerWithoutInit,
        callback: mockCallback,
        apiKey: 'test-api-key',
      });
    });
  });

  describe('Handshake', () => {
    it('should successfully perform handshake', async () => {
      // Arrange
      const handshakeRequest: RequestArguments = {
        method: 'wallet_connect',
        params: [{ version: '1.0', capabilities: {} }],
      };

      const mockResponse: UIResponse<{ accounts: { address: string }[] }> = {
        id: 'test-response-id',
        approved: true,
        data: {
          accounts: [{ address: '0x1234567890123456789012345678901234567890' }],
        },
      };

      (mockUIHandler.request as Mock).mockResolvedValue(mockResponse);

      // Act
      await signer.handshake(handshakeRequest);

      // Assert
      expect(mockUIHandler.request).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'wallet_connect',
          correlationId: mockCorrelationId,
          data: expect.objectContaining({
            appName: 'Test App',
            appLogoUrl: 'https://test.com/logo.png',
            chainId: 1,
          }),
        })
      );
      // Only first account is emitted (matching CrossPlatformSigner behavior)
      expect(mockCallback).toHaveBeenCalledWith('accountsChanged', [
        '0x1234567890123456789012345678901234567890',
      ]);
    });

    it('should throw UIError when user rejects handshake', async () => {
      // Arrange
      const handshakeRequest: RequestArguments = {
        method: 'wallet_connect',
        params: [],
      };

      const mockResponse: UIResponse = {
        id: 'test-response-id',
        approved: false,
        error: UIError.userRejected(),
      };

      (mockUIHandler.request as Mock).mockResolvedValue(mockResponse);

      // Act & Assert
      await expect(signer.handshake(handshakeRequest)).rejects.toThrow();
    });

    it('should throw custom error when provided in rejection', async () => {
      // Arrange
      const handshakeRequest: RequestArguments = {
        method: 'wallet_connect',
        params: [],
      };

      const customError = UIError.userRejected('Custom rejection reason');
      const mockResponse: UIResponse = {
        id: 'test-response-id',
        approved: false,
        error: customError,
      };

      (mockUIHandler.request as Mock).mockResolvedValue(mockResponse);

      // Act & Assert
      await expect(signer.handshake(handshakeRequest)).rejects.toThrow('Custom rejection reason');
    });
  });

  describe('Request After Handshake', () => {
    beforeEach(async () => {
      // Perform handshake first
      const handshakeRequest: RequestArguments = {
        method: 'wallet_connect',
        params: [{ version: '1.0', capabilities: {} }],
      };

      const mockHandshakeResponse: UIResponse<{ accounts: { address: string }[] }> = {
        id: 'test-response-id',
        approved: true,
        data: {
          accounts: [{ address: '0x1234567890123456789012345678901234567890' }],
        },
      };

      (mockUIHandler.request as Mock).mockResolvedValue(mockHandshakeResponse);
      await signer.handshake(handshakeRequest);

      // Reset mock call history
      vi.clearAllMocks();
    });

    it('should return accounts for eth_accounts request', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'eth_accounts',
      };

      // Act
      const result = await signer.request(request);

      // Assert
      expect(result).toEqual(['0x1234567890123456789012345678901234567890']);
      expect(mockCallback).toHaveBeenCalledWith('connect', { chainId: '0x1' });
    });

    it('should return chain id for eth_chainId request', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'eth_chainId',
      };

      // Act
      const result = await signer.request(request);

      // Assert
      expect(result).toBe('0x1');
    });

    it('should handle personal_sign request', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'personal_sign',
        params: ['0x48656c6c6f', '0x1234567890123456789012345678901234567890'],
      };

      const mockResponse: UIResponse<string> = {
        id: 'test-response-id',
        approved: true,
        data: '0xsignature...',
      };

      (mockUIHandler.request as Mock).mockResolvedValue(mockResponse);

      // Act
      const result = await signer.request(request);

      // Assert
      expect(result).toBe('0xsignature...');
      expect(mockUIHandler.request).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'personal_sign',
          data: expect.objectContaining({
            message: '0x48656c6c6f',
            address: '0x1234567890123456789012345678901234567890',
          }),
        })
      );
    });

    it('should handle eth_signTypedData_v4 request', async () => {
      // Arrange
      const typedData = JSON.stringify({ types: {}, primaryType: 'Test', domain: {}, message: {} });
      const request: RequestArguments = {
        method: 'eth_signTypedData_v4',
        params: ['0x1234567890123456789012345678901234567890', typedData],
      };

      const mockResponse: UIResponse<string> = {
        id: 'test-response-id',
        approved: true,
        data: '0xtypedsignature...',
      };

      (mockUIHandler.request as Mock).mockResolvedValue(mockResponse);

      // Act
      const result = await signer.request(request);

      // Assert
      expect(result).toBe('0xtypedsignature...');
      expect(mockUIHandler.request).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'eth_signTypedData_v4',
          data: expect.objectContaining({
            address: '0x1234567890123456789012345678901234567890',
            typedData,
          }),
        })
      );
    });

    it('should handle wallet_sendCalls request', async () => {
      // Arrange
      const callsData = {
        version: '1.0',
        from: '0x1234567890123456789012345678901234567890',
        calls: [{ to: '0x0987654321098765432109876543210987654321', value: '0x1000', data: '0x' }],
        chainId: 1,
      };

      const request: RequestArguments = {
        method: 'wallet_sendCalls',
        params: [callsData],
      };

      const mockResponse: UIResponse<{ id: string; chainId: number }> = {
        id: 'test-response-id',
        approved: true,
        data: { id: '0xbatchId', chainId: 1 },
      };

      (mockUIHandler.request as Mock).mockResolvedValue(mockResponse);

      // Act
      const result = await signer.request(request);

      // Assert
      expect(result).toEqual({ id: '0xbatchId', chainId: 1 });
      expect(mockUIHandler.request).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'wallet_sendCalls',
          data: callsData,
        })
      );
    });

    it('should handle eth_sendTransaction request', async () => {
      // Arrange
      const txData = {
        from: '0x1234567890123456789012345678901234567890',
        to: '0x0987654321098765432109876543210987654321',
        value: '0x1000',
        data: '0x',
      };

      const request: RequestArguments = {
        method: 'eth_sendTransaction',
        params: [txData],
      };

      // eth_sendTransaction returns a transaction hash string directly
      const mockResponse: UIResponse<string> = {
        id: 'test-response-id',
        approved: true,
        data: '0xtxhash',
      };

      (mockUIHandler.request as Mock).mockResolvedValue(mockResponse);

      // Act
      const result = await signer.request(request);

      // Assert - eth_sendTransaction should return the hash
      expect(result).toBe('0xtxhash');
      expect(mockUIHandler.request).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'eth_sendTransaction',
          data: expect.objectContaining({
            from: txData.from,
            to: txData.to,
            value: txData.value,
            data: txData.data,
            chainId: 1,
          }),
        })
      );
    });

    it('should handle wallet_grantPermissions request', async () => {
      // Arrange - Using WalletGrantPermissionsRequest params structure
      const permissionData = {
        expiry: 1234567890,
        spender: '0xspender1234567890123456789012345678901234' as `0x${string}`,
        permissions: {
          spends: [{ limit: '0x1000', period: 'day' as const, token: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' as `0x${string}` }],
        },
      };

      const request: RequestArguments = {
        method: 'wallet_grantPermissions',
        params: [permissionData],
      };

      const mockResponse: UIResponse = {
        id: 'test-response-id',
        approved: true,
        data: { permissionId: '0xpermission123' },
      };

      (mockUIHandler.request as Mock).mockResolvedValue(mockResponse);

      // Act
      const result = await signer.request(request);

      // Assert
      expect(result).toEqual({ permissionId: '0xpermission123' });
      expect(mockUIHandler.request).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'wallet_grantPermissions',
          data: expect.objectContaining({
            address: '0x1234567890123456789012345678901234567890',
            chainId: 1,
            expiry: permissionData.expiry,
            spender: permissionData.spender,
            permissions: permissionData.permissions,
          }),
        })
      );
    });

    it('should handle wallet_revokePermissions request', async () => {
      // Arrange - Using WalletRevokePermissionsRequest params structure
      const revokeData = {
        id: '0xpermission123' as `0x${string}`,
      };

      const request: RequestArguments = {
        method: 'wallet_revokePermissions',
        params: [revokeData],
      };

      const mockResponse: UIResponse = {
        id: 'test-response-id',
        approved: true,
        data: { success: true },
      };

      // Mock the relay permission response with chainId
      (getPermissionFromRelay as Mock).mockResolvedValue({
        hash: '0xpermission123',
        account: '0x1234567890123456789012345678901234567890',
        spender: '0xspender',
        start: '0',
        end: '9999999999',
        salt: '0',
        calls: [],
        spends: [],
        chainId: '0x1', // Chain ID 1 in hex
      });

      (mockUIHandler.request as Mock).mockResolvedValue(mockResponse);

      // Act
      const result = await signer.request(request);

      // Assert
      expect(result).toEqual({ success: true });
      expect(getPermissionFromRelay).toHaveBeenCalledWith('0xpermission123', 'test-api-key');
      expect(mockUIHandler.request).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'wallet_revokePermissions',
          data: expect.objectContaining({
            permissionId: '0xpermission123',
            address: '0x1234567890123456789012345678901234567890',
            chainId: 1,
          }),
        })
      );
    });

    it('should throw error when permission not found in relay', async () => {
      // Arrange
      const revokeData = {
        id: '0xnonexistent' as `0x${string}`,
      };

      const request: RequestArguments = {
        method: 'wallet_revokePermissions',
        params: [revokeData],
      };

      // Mock the relay to throw an error (permission not found)
      (getPermissionFromRelay as Mock).mockRejectedValue(new Error('Permission not found'));

      // Act & Assert
      await expect(signer.request(request)).rejects.toThrow(
        'Permission not found: 0xnonexistent. It may have already been revoked.'
      );
      expect(getPermissionFromRelay).toHaveBeenCalledWith('0xnonexistent', 'test-api-key');
      expect(mockUIHandler.request).not.toHaveBeenCalled();
    });

    it('should handle wallet_sign request', async () => {
      // Arrange
      // ERC-7871 wallet_sign params: { request: { type: '0x45' | '0x01'; data: { message: string } | TypedData } }
      const signParams = {
        request: {
          type: '0x45' as const, // Personal sign (EIP-191)
          data: {
            message: 'Hello', // UTF-8 message string per ERC-7871
          },
        },
      };

      const request: RequestArguments = {
        method: 'wallet_sign',
        params: [signParams],
      };

      const mockResponse: UIResponse<string> = {
        id: 'test-response-id',
        approved: true,
        data: '0xwalletsignature...',
      };

      (mockUIHandler.request as Mock).mockResolvedValue(mockResponse);

      // Act
      const result = await signer.request(request);

      // Assert
      expect(result).toBe('0xwalletsignature...');
      expect(mockUIHandler.request).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'wallet_sign',
          data: expect.objectContaining({
            address: '0x1234567890123456789012345678901234567890',
            chainId: 1,
            request: {
              type: '0x45',
              data: {
                message: 'Hello',
              },
            },
          }),
        })
      );
    });

    it('should throw error when user rejects signing request', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'personal_sign',
        params: ['0x48656c6c6f', '0x1234567890123456789012345678901234567890'],
      };

      const mockResponse: UIResponse = {
        id: 'test-response-id',
        approved: false,
        error: UIError.userRejected(),
      };

      (mockUIHandler.request as Mock).mockResolvedValue(mockResponse);

      // Act & Assert
      await expect(signer.request(request)).rejects.toThrow();
    });

    it('should switch chain successfully', async () => {
      // Arrange
      const switchRequest: RequestArguments = {
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x89' }], // Polygon
      };

      // Mock that chain is available
      vi.spyOn(store, 'getState').mockReturnValue({
        account: {
          accounts: ['0x1234567890123456789012345678901234567890'],
          chain: { id: 1 },
          capabilities: undefined,
        },
        chains: [
          { id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' },
          { id: 137, rpcUrl: 'https://polygon-mainnet.rpc.com' },
        ],
        config: {
          metadata: mockMetadata,
          version: '1.0.0',
        },
        keys: {},
        callStatuses: {},
      });

      // Act
      const result = await signer.request(switchRequest);

      // Assert
      expect(result).toBeNull();
      expect(store.account.set).toHaveBeenCalledWith({
        chain: { id: 137, rpcUrl: 'https://polygon-mainnet.rpc.com' },
      });
      expect(mockCallback).toHaveBeenCalledWith('chainChanged', '0x89');
    });

    it('should handle wallet_getCallsStatus request', async () => {
      // Arrange
      const callsStatusRequest: RequestArguments = {
        method: 'wallet_getCallsStatus',
        params: ['0xbatchId'],
      };

      const mockCallStatus = { status: 'pending', chainId: 1 };
      const mockEIP5792Response = {
        version: '2.0.0',
        id: '0xbatchId' as `0x${string}`,
        chainId: '0x01' as `0x${string}`,
        status: 100,
        atomic: true,
        receipts: undefined,
      };

      (getCallStatus as Mock).mockReturnValue(mockCallStatus);
      (getCallStatusEIP5792 as Mock).mockReturnValue(mockEIP5792Response);

      // Act
      const result = await signer.request(callsStatusRequest);

      // Assert
      expect(getCallStatusEIP5792).toHaveBeenCalledWith('0xbatchId');
      expect(result).toEqual(mockEIP5792Response);
    });

    it('should forward unknown methods to RPC', async () => {
      // Arrange
      const rpcRequest: RequestArguments = {
        method: 'eth_getBalance',
        params: ['0x1234567890123456789012345678901234567890', 'latest'],
      };

      // Mock chain with RPC URL
      vi.spyOn(store, 'getState').mockReturnValue({
        account: {
          accounts: ['0x1234567890123456789012345678901234567890'],
          chain: { id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' },
          capabilities: undefined,
        },
        chains: [{ id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' }],
        config: { metadata: mockMetadata, version: '1.0.0' },
        keys: {},
        callStatuses: {},
      });

      (fetchRPCRequest as Mock).mockResolvedValue('0x1000');

      // Act
      const result = await signer.request(rpcRequest);

      // Assert
      expect(result).toBe('0x1000');
      expect(fetchRPCRequest).toHaveBeenCalledWith(rpcRequest, 'https://eth-mainnet.rpc.com');
    });
  });

  describe('Unauthenticated Scenarios', () => {
    it('should trigger wallet_connect automatically for eth_requestAccounts', async () => {
      // Arrange
      const mockWalletConnectResponse: UIResponse<{ accounts: { address: string }[] }> = {
        id: 'test-response-id',
        approved: true,
        data: {
          accounts: [{ address: '0x1234567890123456789012345678901234567890' }],
        },
      };

      (mockUIHandler.request as Mock).mockResolvedValue(mockWalletConnectResponse);

      // Act
      const result = await signer.request({
        method: 'eth_requestAccounts',
      });

      // Assert
      expect(result).toEqual(['0x1234567890123456789012345678901234567890']);
      expect(mockUIHandler.request).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'wallet_connect',
        })
      );
    });

    it('should allow wallet_switchEthereumChain when unauthenticated if chain is supported', async () => {
      // Arrange
      vi.spyOn(store, 'getState').mockReturnValue({
        account: {
          accounts: undefined,
          chain: undefined,
          capabilities: undefined,
        },
        chains: [
          { id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' },
          { id: 137, rpcUrl: 'https://polygon-mainnet.rpc.com' },
        ],
        config: { metadata: mockMetadata, version: '1.0.0' },
        keys: {},
        callStatuses: {},
      });

      const request: RequestArguments = {
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x89' }],
      };

      // Act
      const result = await signer.request(request);

      // Assert
      expect(result).toBeNull();
    });

    it('should throw unauthorized error for unknown methods when unauthenticated', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'personal_sign',
        params: ['0x48656c6c6f', '0x1234567890123456789012345678901234567890'],
      };

      // Act & Assert
      await expect(signer.request(request)).rejects.toThrow();
    });
  });

  describe('Cleanup', () => {
    it('should cleanup UI handler and signer resources', async () => {
      // Arrange
      const handshakeRequest: RequestArguments = {
        method: 'wallet_connect',
        params: [{ version: '1.0', capabilities: {} }],
      };

      const mockHandshakeResponse: UIResponse<{ accounts: { address: string }[] }> = {
        id: 'test-response-id',
        approved: true,
        data: {
          accounts: [{ address: '0x1234567890123456789012345678901234567890' }],
        },
      };

      (mockUIHandler.request as Mock).mockResolvedValue(mockHandshakeResponse);
      await signer.handshake(handshakeRequest);

      // Act
      await signer.cleanup();

      // Assert
      expect(mockUIHandler.cleanup).toHaveBeenCalled();
      expect(store.account.clear).toHaveBeenCalled();
    });

    it('should handle cleanup when uiHandler.cleanup is undefined', async () => {
      // Arrange
      const handlerWithoutCleanup: UIHandler = {
        request: vi.fn().mockResolvedValue({
          approved: true,
          data: {
            accounts: [{ address: '0x1234567890123456789012345678901234567890' }],
          },
        }),
      };

      const signerWithoutCleanup = new AppSpecificSigner({
        metadata: mockMetadata,
        uiHandler: handlerWithoutCleanup,
        callback: mockCallback,
        apiKey: 'test-api-key',
      });

      await signerWithoutCleanup.handshake({ method: 'wallet_connect', params: [] });

      // Act & Assert - Should not throw
      await expect(signerWithoutCleanup.cleanup()).resolves.not.toThrow();
    });
  });

  describe('wallet_connect Flow', () => {
    beforeEach(async () => {
      // Perform handshake first
      const handshakeRequest: RequestArguments = {
        method: 'wallet_connect',
        params: [{ version: '1.0', capabilities: {} }],
      };

      const mockHandshakeResponse: UIResponse<{ accounts: { address: string }[] }> = {
        id: 'test-response-id',
        approved: true,
        data: {
          accounts: [{ address: '0x1234567890123456789012345678901234567890' }],
        },
      };

      (mockUIHandler.request as Mock).mockResolvedValue(mockHandshakeResponse);
      await signer.handshake(handshakeRequest);

      // Reset mock call history
      vi.clearAllMocks();
    });

    it('should handle wallet_connect when already authenticated', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_connect',
        params: [{ version: '1.0', capabilities: { signInWithEthereum: { nonce: '123', chainId: '0x1' } } }],
      };

      const mockResponse: UIResponse<{ accounts: { address: string }[] }> = {
        id: 'test-response-id',
        approved: true,
        data: {
          accounts: [{ address: '0x1234567890123456789012345678901234567890' }],
        },
      };

      (mockUIHandler.request as Mock).mockResolvedValue(mockResponse);

      // Act
      const result = await signer.request(request);

      // Assert
      expect(result).toEqual({
        accounts: [{ address: '0x1234567890123456789012345678901234567890' }],
      });
      expect(mockUIHandler.request).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'wallet_connect',
          data: expect.objectContaining({
            capabilities: { signInWithEthereum: { nonce: '123', chainId: '0x1' } },
          }),
        })
      );
    });
  });

  describe('Simple RPC Methods', () => {
    beforeEach(async () => {
      // Perform handshake first
      const handshakeRequest: RequestArguments = {
        method: 'wallet_connect',
        params: [{ version: '1.0', capabilities: {} }],
      };

      const mockHandshakeResponse: UIResponse<{ accounts: { address: string }[] }> = {
        id: 'test-response-id',
        approved: true,
        data: {
          accounts: [{ address: '0x1234567890123456789012345678901234567890' }],
        },
      };

      (mockUIHandler.request as Mock).mockResolvedValue(mockHandshakeResponse);
      await signer.handshake(handshakeRequest);

      // Reset mock call history
      vi.clearAllMocks();
    });

    it('should return first account for eth_coinbase', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'eth_coinbase',
      };

      // Act
      const result = await signer.request(request);

      // Assert
      expect(result).toBe('0x1234567890123456789012345678901234567890');
    });

    it('should return chain id number for net_version', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'net_version',
      };

      // Act
      const result = await signer.request(request);

      // Assert
      expect(result).toBe(1);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      // Perform handshake first
      const handshakeRequest: RequestArguments = {
        method: 'wallet_connect',
        params: [{ version: '1.0', capabilities: {} }],
      };

      const mockHandshakeResponse: UIResponse<{ accounts: { address: string }[] }> = {
        id: 'test-response-id',
        approved: true,
        data: {
          accounts: [{ address: '0x1234567890123456789012345678901234567890' }],
        },
      };

      (mockUIHandler.request as Mock).mockResolvedValue(mockHandshakeResponse);
      await signer.handshake(handshakeRequest);

      // Reset mock call history
      vi.clearAllMocks();
    });

    it('should throw unsupported method error for eth_sign', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'eth_sign',
        params: ['0x1234567890123456789012345678901234567890', '0x48656c6c6f'],
      };

      // Act & Assert
      await expect(signer.request(request)).rejects.toMatchObject({
        code: 4200,
        message: 'The requested method is not supported by this Ethereum provider.',
      });
    });

    it('should throw unsupported method error for unknown wallet_* methods', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_unknownMethod',
        params: [],
      };

      // Act & Assert
      await expect(signer.request(request)).rejects.toMatchObject({
        code: 4200,
      });
    });

    it('should throw error when RPC URL is not set', async () => {
      // Arrange
      vi.spyOn(store, 'getState').mockReturnValue({
        account: {
          accounts: ['0x1234567890123456789012345678901234567890'],
          chain: { id: 1 }, // No rpcUrl
          capabilities: undefined,
        },
        chains: [{ id: 1 }], // No rpcUrl
        config: { metadata: mockMetadata, version: '1.0.0' },
        keys: {},
        callStatuses: {},
      });

      // Manually set authenticated state
      (signer as any).accounts = ['0x1234567890123456789012345678901234567890'];
      (signer as any).chain = { id: 1 };

      const request: RequestArguments = {
        method: 'eth_getBalance',
        params: ['0x1234567890123456789012345678901234567890', 'latest'],
      };

      // Act & Assert
      await expect(signer.request(request)).rejects.toThrow('No RPC URL set for chain');
    });
  });
});
