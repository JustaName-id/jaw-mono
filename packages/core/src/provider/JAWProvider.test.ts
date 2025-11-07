/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { JAWProvider } from './JAWProvider.js';
import { createJAWProvider } from './createJAWProvider.js';
import { Communicator } from '../communicator/index.js';
import { standardErrorCodes } from '../errors/index.js';
import { correlationIds, store } from '../store/index.js';
import { fetchRPCRequest, checkErrorForInvalidRequestArgs, buildHandleJawRpcUrl } from '../utils/index.js';
import {
  createSigner,
  loadSignerType,
  storeSignerType,
} from '../signer/index.js';
import { storeCallStatus, getCallStatus, waitForReceiptInBackground } from '../rpc/index.js';
import type { AppMetadata, ConstructorOptions, RequestArguments } from './interface.js';
import type { Signer } from '../signer/index.js';

// Mock all dependencies
vi.mock('../communicator/index.js');
vi.mock('../errors/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../errors/index.js')>();
  return {
    ...actual,
    serializeError: vi.fn((error) => error),
  };
});
vi.mock('../utils/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/index.js')>();
  return {
    ...actual,
    fetchRPCRequest: vi.fn(),
    checkErrorForInvalidRequestArgs: vi.fn(),
    buildHandleJawRpcUrl: vi.fn(),
  };
});
vi.mock('../signer/index.js', () => ({
  createSigner: vi.fn(),
  fetchSignerType: vi.fn(),
  loadSignerType: vi.fn(),
  storeSignerType: vi.fn(),
}));
vi.mock('../rpc/index.js', () => ({
  storeCallStatus: vi.fn(),
  getCallStatus: vi.fn(),
  waitForReceiptInBackground: vi.fn(),
}));
vi.mock('../store/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../store/index.js')>();
  return {
    ...actual,
    correlationIds: {
      set: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
    },
    store: {
      account: {
        get: vi.fn(() => ({ chain: { id: 1 } })),
      },
      callStatuses: {
        get: vi.fn(),
        set: vi.fn(),
        update: vi.fn(),
      },
    },
  };
});

describe('JAWProvider', () => {
  let provider: JAWProvider;
  let mockSigner: Signer;
  let mockMetadata: AppMetadata;
  let mockConstructorOptions: ConstructorOptions;

  beforeEach(() => {
    // Setup metadata
    mockMetadata = {
      appName: 'Test App',
      appLogoUrl: 'https://test.com/logo.png',
    };

    mockConstructorOptions = {
      metadata: mockMetadata,
      preference: {
        keysUrl: 'https://keys.test.com',
        appSpecific: false,
      },
      apiKey: 'test-api-key',
    };

    // Setup mock signer
    mockSigner = {
      request: vi.fn(),
      handshake: vi.fn(),
      cleanup: vi.fn(),
    } as any;

    // Setup default mocks
    (loadSignerType as Mock).mockReturnValue(null);
    (createSigner as Mock).mockReturnValue(mockSigner);
    (checkErrorForInvalidRequestArgs as Mock).mockImplementation(() => {
      // No-op for tests
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with metadata and preference', () => {
      // Act
      provider = new JAWProvider(mockConstructorOptions);

      // Assert
      expect(provider).toBeInstanceOf(JAWProvider);
      expect((provider as any).metadata).toEqual(mockMetadata);
      expect((provider as any).preference).toEqual({
        keysUrl: 'https://keys.test.com',
        appSpecific: false,
      });
    });

    it('should create communicator with correct options', () => {
      // Act
      provider = new JAWProvider(mockConstructorOptions);

      // Assert
      expect(Communicator).toHaveBeenCalledWith({
        metadata: mockMetadata,
        preference: {
          keysUrl: 'https://keys.test.com',
          appSpecific: false,
        },
      });
    });

    it('should initialize signer if signerType is stored', () => {
      // Arrange
      (loadSignerType as Mock).mockReturnValue('crossPlatform');

      // Act
      provider = new JAWProvider(mockConstructorOptions);

      // Assert
      expect(loadSignerType).toHaveBeenCalled();
      expect(createSigner).toHaveBeenCalled();
      expect((provider as any).signer).toBe(mockSigner);
    });

    it('should not initialize signer if signerType is not stored', () => {
      // Arrange
      (loadSignerType as Mock).mockReturnValue(null);

      // Act
      provider = new JAWProvider(mockConstructorOptions);

      // Assert
      expect(loadSignerType).toHaveBeenCalled();
      expect(createSigner).not.toHaveBeenCalled();
      expect((provider as any).signer).toBeNull();
    });
  });

  describe('request - Correlation ID Management', () => {
    beforeEach(() => {
      provider = new JAWProvider(mockConstructorOptions);
      (provider as any).signer = mockSigner;
      (mockSigner.request as Mock).mockResolvedValue('result');
    });

    it('should create and set correlationId for request lifecycle', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'eth_accounts',
      };

      // Mock crypto.randomUUID
      const mockUUID = '12345678-1234-1234-1234-123456789012';
      vi.spyOn(crypto, 'randomUUID').mockReturnValue(mockUUID);

      // Act
      await provider.request(request);

      // Assert
      expect(correlationIds.set).toHaveBeenCalledWith(request, mockUUID);
    });

    it('should delete correlationId after successful request', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'eth_accounts',
      };

      // Act
      await provider.request(request);

      // Assert
      expect(correlationIds.delete).toHaveBeenCalledWith(request);
    });

    it('should delete correlationId even if request fails', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'eth_accounts',
      };
      (mockSigner.request as Mock).mockRejectedValue(new Error('Test error'));

      // Act & Assert
      await expect(provider.request(request)).rejects.toThrow();
      expect(correlationIds.delete).toHaveBeenCalledWith(request);
    });

    it('should return result with correct type', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'eth_accounts',
      };
      const mockAccounts = ['0x1234567890123456789012345678901234567890'];
      (mockSigner.request as Mock).mockResolvedValue(mockAccounts);

      // Act
      const result = await provider.request<string[]>(request);

      // Assert
      expect(result).toEqual(mockAccounts);
    });
  });

  describe('_request - No Signer: eth_requestAccounts', () => {
    beforeEach(() => {
      provider = new JAWProvider(mockConstructorOptions);
    });

    it('should request signer selection and initialize signer', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'eth_requestAccounts',
      };
      const mockAccounts = ['0x1234567890123456789012345678901234567890'];
      (mockSigner.handshake as Mock).mockResolvedValue(undefined);
      (mockSigner.request as Mock).mockResolvedValue(mockAccounts);

      // Act
      await provider.request(request);

      // Assert
      expect(createSigner).toHaveBeenCalled();
      expect(mockSigner.handshake).toHaveBeenCalledWith(request);
      expect(storeSignerType).toHaveBeenCalledWith('crossPlatform');
      expect((provider as any).signer).toBe(mockSigner);
    });

    it('should delegate subsequent requests to initialized signer', async () => {
      // Arrange
      const request1: RequestArguments = {
        method: 'eth_requestAccounts',
      };
      const request2: RequestArguments = {
        method: 'eth_accounts',
      };
      (mockSigner.handshake as Mock).mockResolvedValue(undefined);
      (mockSigner.request as Mock).mockResolvedValue(['0x1234567890123456789012345678901234567890']);

      // Act
      await provider.request(request1);
      await provider.request(request2);

      // Assert
      expect(mockSigner.request).toHaveBeenCalledTimes(2);
      expect(mockSigner.request).toHaveBeenNthCalledWith(2, request2);
    });

    it('should handle handshake failure and not store signer', async () => {
      // Arrange
      const request: RequestArguments = { method: 'eth_requestAccounts' };
      (mockSigner.handshake as Mock).mockRejectedValue(new Error('Handshake failed'));

      // Act & Assert
      await expect(provider.request(request)).rejects.toThrow('Handshake failed');
      expect(storeSignerType).not.toHaveBeenCalled();
      expect((provider as any).signer).toBeNull();
    });
  });

  describe('_request - No Signer: wallet_connect', () => {
    beforeEach(() => {
      provider = new JAWProvider(mockConstructorOptions);
    });

    it('should create crossPlatform signer and handshake', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_connect',
        params: [{ version: '1.0', capabilities: {} }],
      };
      const mockResponse = {
        accounts: [{ address: '0x1234567890123456789012345678901234567890' }],
      };
      (mockSigner.handshake as Mock).mockResolvedValue(undefined);
      (mockSigner.request as Mock).mockResolvedValue(mockResponse);

      // Act
      const result = await provider.request(request);

      // Assert
      expect(createSigner).toHaveBeenCalledWith({
        signerType: 'crossPlatform',
        metadata: mockMetadata,
        communicator: (provider as any).communicator,
        callback: expect.any(Function),
      });
      expect(mockSigner.handshake).toHaveBeenCalledWith({ method: 'handshake' });
      expect(mockSigner.request).toHaveBeenCalledWith(request);
      expect(result).toEqual(mockResponse);
      expect((provider as any).signer).toBe(mockSigner);
    });

    it('should handle handshake failure for wallet_connect', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_connect',
        params: [{ version: '1.0', capabilities: {} }],
      };
      (mockSigner.handshake as Mock).mockRejectedValue(new Error('Handshake failed'));

      // Act & Assert
      await expect(provider.request(request)).rejects.toThrow('Handshake failed');
      expect((provider as any).signer).toBeNull();
    });
  });

  describe('_request - No Signer: wallet_sendCalls', () => {
    beforeEach(() => {
      provider = new JAWProvider(mockConstructorOptions);
      (waitForReceiptInBackground as Mock).mockResolvedValue(undefined);
    });

    it('should create ephemeral signer and cleanup after request', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_sendCalls',
        params: [{ calls: [] }],
      };
      const mockUserOpHash = '0xuserOpHash';
      const mockChainId = 1;
      (mockSigner.handshake as Mock).mockResolvedValue(undefined);
      (mockSigner.request as Mock).mockResolvedValue({ id: mockUserOpHash, chainId: mockChainId });
      (mockSigner.cleanup as Mock).mockResolvedValue(undefined);

      // Act
      const result = await provider.request(request);

      // Assert
      expect(createSigner).toHaveBeenCalled();
      expect(mockSigner.handshake).toHaveBeenCalledWith({ method: 'handshake' });
      expect(mockSigner.request).toHaveBeenCalledWith(request);
      expect(mockSigner.cleanup).toHaveBeenCalled();
      expect(storeCallStatus).toHaveBeenCalledWith(mockUserOpHash, mockChainId);
      expect(waitForReceiptInBackground).toHaveBeenCalledWith(mockUserOpHash, mockChainId);
      expect(result).toEqual({ id: mockUserOpHash });
      expect((provider as any).signer).toBeNull(); // Should not store ephemeral signer
    });

    it('should store call status and start background task when userOpHash is returned', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_sendCalls',
        params: [{ calls: [] }],
      };
      const mockUserOpHash = '0xuserOpHash123';
      const mockChainId = 137;
      (mockSigner.handshake as Mock).mockResolvedValue(undefined);
      (mockSigner.request as Mock).mockResolvedValue({ id: mockUserOpHash, chainId: mockChainId });
      (mockSigner.cleanup as Mock).mockResolvedValue(undefined);

      // Act
      await provider.request(request);

      // Assert
      expect(storeCallStatus).toHaveBeenCalledWith(mockUserOpHash, mockChainId);
      expect(waitForReceiptInBackground).toHaveBeenCalledWith(mockUserOpHash, mockChainId);
    });

    it('should not store call status if no userOpHash is returned', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_sendCalls',
        params: [{ calls: [] }],
      };
      (mockSigner.handshake as Mock).mockResolvedValue(undefined);
      (mockSigner.request as Mock).mockResolvedValue({ id: undefined });
      (mockSigner.cleanup as Mock).mockResolvedValue(undefined);

      // Act
      await provider.request(request);

      // Assert
      expect(storeCallStatus).not.toHaveBeenCalled();
      expect(waitForReceiptInBackground).not.toHaveBeenCalled();
    });

    it('should return result even if cleanup fails', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_sendCalls',
        params: [{ calls: [] }],
      };
      const mockUserOpHash = '0xbatchId';
      const mockChainId = 1;
      (mockSigner.handshake as Mock).mockResolvedValue(undefined);
      (mockSigner.request as Mock).mockResolvedValue({ id: mockUserOpHash, chainId: mockChainId });
      (mockSigner.cleanup as Mock).mockRejectedValue(new Error('Cleanup failed'));

      // Act
      const result = await provider.request(request);

      // Assert
      expect(mockSigner.handshake).toHaveBeenCalled();
      expect(mockSigner.request).toHaveBeenCalled();
      expect(mockSigner.cleanup).toHaveBeenCalled();
      expect(storeCallStatus).toHaveBeenCalledWith(mockUserOpHash, mockChainId);
      expect(waitForReceiptInBackground).toHaveBeenCalledWith(mockUserOpHash, mockChainId);
      expect(result).toEqual({ id: mockUserOpHash });
      expect((provider as any).signer).toBeNull();
    });

    it('should handle background task errors gracefully', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_sendCalls',
        params: [{ calls: [] }],
      };
      const mockUserOpHash = '0xbatchId';
      const mockChainId = 1;
      (mockSigner.handshake as Mock).mockResolvedValue(undefined);
      (mockSigner.request as Mock).mockResolvedValue({ id: mockUserOpHash, chainId: mockChainId });
      (mockSigner.cleanup as Mock).mockResolvedValue(undefined);
      (waitForReceiptInBackground as Mock).mockRejectedValue(new Error('Background task failed'));

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Act
      const result = await provider.request(request);

      // Assert
      expect(result).toEqual({ id: mockUserOpHash });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Background receipt wait failed:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should never store ephemeral signer', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_sendCalls',
        params: [{ calls: [] }],
      };
      const mockUserOpHash = '0xbatchId';
      const mockChainId = 1;
      (mockSigner.handshake as Mock).mockResolvedValue(undefined);
      (mockSigner.request as Mock).mockResolvedValue({ id: mockUserOpHash, chainId: mockChainId });
      (mockSigner.cleanup as Mock).mockResolvedValue(undefined);

      const storeSignerTypeSpy = vi.mocked(storeSignerType);

      // Act
      await provider.request(request);

      // Assert
      expect(storeSignerTypeSpy).not.toHaveBeenCalled();
      expect((provider as any).signer).toBeNull();
    });
  });

  describe('_request - No Signer: wallet_sign', () => {
    beforeEach(() => {
      provider = new JAWProvider(mockConstructorOptions);
    });

    it('should create ephemeral signer and cleanup after request', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_sign',
        params: ['0x1234567890123456789012345678901234567890', '0x48656c6c6f'],
      };
      const mockSignature = '0xsignature';
      (mockSigner.handshake as Mock).mockResolvedValue(undefined);
      (mockSigner.request as Mock).mockResolvedValue(mockSignature);
      (mockSigner.cleanup as Mock).mockResolvedValue(undefined);

      // Act
      const result = await provider.request(request);

      // Assert
      expect(createSigner).toHaveBeenCalled();
      expect(mockSigner.handshake).toHaveBeenCalledWith({ method: 'handshake' });
      expect(mockSigner.request).toHaveBeenCalledWith(request);
      expect(mockSigner.cleanup).toHaveBeenCalled();
      expect(result).toEqual(mockSignature);
    });

    it('should return result even if cleanup fails', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_sign',
        params: ['0x1234567890123456789012345678901234567890', '0x48656c6c6f'],
      };
      const mockSignature = '0xsignature';
      (mockSigner.handshake as Mock).mockResolvedValue(undefined);
      (mockSigner.request as Mock).mockResolvedValue(mockSignature);
      (mockSigner.cleanup as Mock).mockRejectedValue(new Error('Cleanup failed'));

      // Act
      const result = await provider.request(request);

      // Assert
      expect(mockSigner.handshake).toHaveBeenCalled();
      expect(mockSigner.request).toHaveBeenCalled();
      expect(mockSigner.cleanup).toHaveBeenCalled();
      expect(result).toEqual(mockSignature);
      expect((provider as any).signer).toBeNull();
    });
  });

  describe('_request - No Signer: wallet_getAssets', () => {
    beforeEach(() => {
      provider = new JAWProvider(mockConstructorOptions);
    });

    it('should call fetchRPCRequest with correct RPC URL', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_getAssets',
        params: [],
      };
      const mockRpcUrl = 'https://rpc.test.com';
      const mockAssets = [{ address: '0x123', symbol: 'ETH' }];
      (buildHandleJawRpcUrl as Mock).mockReturnValue(mockRpcUrl);
      (fetchRPCRequest as Mock).mockResolvedValue(mockAssets);

      // Act
      const result = await provider.request(request);

      // Assert
      expect(buildHandleJawRpcUrl).toHaveBeenCalledWith(expect.any(String), 'test-api-key');
      expect(fetchRPCRequest).toHaveBeenCalledWith(request, mockRpcUrl);
      expect(result).toEqual(mockAssets);
    });

    it('should handle fetchRPCRequest errors', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_getAssets',
        params: [],
      };
      const mockRpcUrl = 'https://rpc.test.com';
      const mockError = new Error('RPC request failed');
      (buildHandleJawRpcUrl as Mock).mockReturnValue(mockRpcUrl);
      (fetchRPCRequest as Mock).mockRejectedValue(mockError);

      // Act & Assert
      await expect(provider.request(request)).rejects.toThrow('RPC request failed');
      expect(fetchRPCRequest).toHaveBeenCalledWith(request, mockRpcUrl);
    });
  });

  describe('_request - No Signer: wallet_getCallsStatus', () => {
    beforeEach(() => {
      provider = new JAWProvider(mockConstructorOptions);
    });

    it('should get call status from storage', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_getCallsStatus',
        params: ['0xbatchId'],
      };
      const mockCallStatus = {
        status: 'pending',
        chainId: 1,
      };
      (getCallStatus as Mock).mockReturnValue(mockCallStatus);

      // Act
      const result = await provider.request(request);

      // Assert
      expect(getCallStatus).toHaveBeenCalledWith('0xbatchId');
      expect(result).toEqual({
        id: '0xbatchId',
        status: 100, // pending
        receipts: [],
      });
    });

    it('should return status code 200 for completed status', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_getCallsStatus',
        params: ['0xbatchId'],
      };
      const mockCallStatus = {
        status: 'completed',
        chainId: 1,
        receipts: [{ hash: '0xreceipt1' }],
      };
      (getCallStatus as Mock).mockReturnValue(mockCallStatus);

      // Act
      const result = await provider.request(request);

      // Assert
      expect(result).toEqual({
        id: '0xbatchId',
        status: 200, // completed
        receipts: [{ hash: '0xreceipt1' }],
      });
    });

    it('should return status code 400 for failed status', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_getCallsStatus',
        params: ['0xbatchId'],
      };
      const mockCallStatus = {
        status: 'failed',
        chainId: 1,
        error: 'Transaction failed',
      };
      (getCallStatus as Mock).mockReturnValue(mockCallStatus);

      // Act
      const result = await provider.request(request);

      // Assert
      expect(result).toEqual({
        id: '0xbatchId',
        status: 400, // failed
        receipts: [],
      });
    });

    it('should throw error if batchId is missing', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_getCallsStatus',
        params: [],
      };

      // Act & Assert
      await expect(provider.request(request)).rejects.toMatchObject({
        message: 'batchId is required',
      });
    });

    it('should throw error if no call status found', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_getCallsStatus',
        params: ['0xnonexistent'],
      };
      (getCallStatus as Mock).mockReturnValue(undefined);

      // Act & Assert
      await expect(provider.request(request)).rejects.toMatchObject({
        message: 'No call status found for batchId: 0xnonexistent',
      });
    });
  });

  describe('_request - No Signer: net_version', () => {
    beforeEach(() => {
      provider = new JAWProvider(mockConstructorOptions);
    });

    it('should return default chain id 1', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'net_version',
      };

      // Act
      const result = await provider.request(request);

      // Assert
      expect(result).toBe(1);
    });
  });

  describe('_request - No Signer: eth_chainId', () => {
    beforeEach(() => {
      provider = new JAWProvider(mockConstructorOptions);
    });

    it('should return default chain id as hex', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'eth_chainId',
      };

      // Act
      const result = await provider.request(request);

      // Assert
      expect(result).toBe('0x1');
    });
  });

  describe('_request - No Signer: Unauthorized Methods', () => {
    beforeEach(() => {
      provider = new JAWProvider(mockConstructorOptions);
    });

    it('should throw unauthorized error for eth_accounts', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'eth_accounts',
      };

      // Act & Assert
      await expect(provider.request(request)).rejects.toMatchObject({
        message: "Must call 'eth_requestAccounts' before other methods",
      });
    });

    it('should throw unauthorized error for personal_sign', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'personal_sign',
        params: ['0x48656c6c6f', '0x1234567890123456789012345678901234567890'],
      };

      // Act & Assert
      await expect(provider.request(request)).rejects.toMatchObject({
        message: "Must call 'eth_requestAccounts' before other methods",
      });
    });

    it('should throw unauthorized error for eth_sendTransaction', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'eth_sendTransaction',
        params: [
          {
            from: '0x1234567890123456789012345678901234567890',
            to: '0x0987654321098765432109876543210987654321',
            value: '0x1000',
          },
        ],
      };

      // Act & Assert
      await expect(provider.request(request)).rejects.toMatchObject({
        message: "Must call 'eth_requestAccounts' before other methods",
      });
    });
  });

  describe('_request - With Signer', () => {
    beforeEach(() => {
      provider = new JAWProvider(mockConstructorOptions);
      (provider as any).signer = mockSigner;
    });

    it('should delegate to signer for eth_accounts', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'eth_accounts',
      };
      const mockAccounts = ['0x1234567890123456789012345678901234567890'];
      (mockSigner.request as Mock).mockResolvedValue(mockAccounts);

      // Act
      const result = await provider.request(request);

      // Assert
      expect(mockSigner.request).toHaveBeenCalledWith(request);
      expect(result).toEqual(mockAccounts);
    });

    it('should delegate to signer for personal_sign', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'personal_sign',
        params: ['0x48656c6c6f', '0x1234567890123456789012345678901234567890'],
      };
      const mockSignature = '0xsignature';
      (mockSigner.request as Mock).mockResolvedValue(mockSignature);

      // Act
      const result = await provider.request(request);

      // Assert
      expect(mockSigner.request).toHaveBeenCalledWith(request);
      expect(result).toEqual(mockSignature);
    });

    it('should delegate to signer for eth_sendTransaction', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'eth_sendTransaction',
        params: [
          {
            from: '0x1234567890123456789012345678901234567890',
            to: '0x0987654321098765432109876543210987654321',
            value: '0x1000',
          },
        ],
      };
      const mockTxHash = '0xtxhash';
      (mockSigner.request as Mock).mockResolvedValue(mockTxHash);

      // Act
      const result = await provider.request(request);

      // Assert
      expect(mockSigner.request).toHaveBeenCalledWith(request);
      expect(result).toEqual(mockTxHash);
    });

    it('should store call status and start background task for wallet_sendCalls', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_sendCalls',
        params: [{ calls: [] }],
      };
      const mockUserOpHash = '0xuserOpHash';
      (mockSigner.request as Mock).mockResolvedValue({ id: mockUserOpHash });
      (waitForReceiptInBackground as Mock).mockResolvedValue(undefined);
      (store.account.get as Mock).mockReturnValue({ chain: { id: 1 } });

      // Act
      const result = await provider.request(request);

      // Assert
      expect(mockSigner.request).toHaveBeenCalledWith(request);
      expect(storeCallStatus).toHaveBeenCalledWith(mockUserOpHash, 1);
      expect(waitForReceiptInBackground).toHaveBeenCalledWith(mockUserOpHash, 1);
      expect(result).toEqual({ id: mockUserOpHash });
    });

    it('should use metadata defaultChainId if account chain is not set', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_sendCalls',
        params: [{ calls: [] }],
      };
      const mockUserOpHash = '0xuserOpHash';
      (mockSigner.request as Mock).mockResolvedValue({ id: mockUserOpHash });
      (waitForReceiptInBackground as Mock).mockResolvedValue(undefined);
      (store.account.get as Mock).mockReturnValue({});
      const metadataWithChainId = { ...mockMetadata, defaultChainId: 137 };

      provider = new JAWProvider({ ...mockConstructorOptions, metadata: metadataWithChainId });
      (provider as any).signer = mockSigner;

      // Act
      await provider.request(request);

      // Assert
      expect(storeCallStatus).toHaveBeenCalledWith(mockUserOpHash, 137);
      expect(waitForReceiptInBackground).toHaveBeenCalledWith(mockUserOpHash, 137);
    });

    it('should use chainId 1 as fallback if no chain info available', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_sendCalls',
        params: [{ calls: [] }],
      };
      const mockUserOpHash = '0xuserOpHash';
      (mockSigner.request as Mock).mockResolvedValue({ id: mockUserOpHash });
      (waitForReceiptInBackground as Mock).mockResolvedValue(undefined);
      (store.account.get as Mock).mockReturnValue({});
      const metadataWithoutChainId = { ...mockMetadata };

      provider = new JAWProvider({ ...mockConstructorOptions, metadata: metadataWithoutChainId });
      (provider as any).signer = mockSigner;

      // Act
      await provider.request(request);

      // Assert
      expect(storeCallStatus).toHaveBeenCalledWith(mockUserOpHash, 1);
      expect(waitForReceiptInBackground).toHaveBeenCalledWith(mockUserOpHash, 1);
    });

    it('should get call status from storage for wallet_getCallsStatus', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_getCallsStatus',
        params: ['0xbatchId'],
      };
      const mockCallStatus = {
        status: 'pending',
        chainId: 1,
      };
      (getCallStatus as Mock).mockReturnValue(mockCallStatus);

      // Act
      const result = await provider.request(request);

      // Assert
      expect(getCallStatus).toHaveBeenCalledWith('0xbatchId');
      expect(result).toEqual({
        id: '0xbatchId',
        status: 100, // pending
        receipts: [],
      });
    });

    it('should return status code 200 for completed status with signer', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_getCallsStatus',
        params: ['0xbatchId'],
      };
      const mockCallStatus = {
        status: 'completed',
        chainId: 1,
        receipts: [{ hash: '0xreceipt1' }],
      };
      (getCallStatus as Mock).mockReturnValue(mockCallStatus);

      // Act
      const result = await provider.request(request);

      // Assert
      expect(result).toEqual({
        id: '0xbatchId',
        status: 200, // completed
        receipts: [{ hash: '0xreceipt1' }],
      });
    });

    it('should throw error if batchId is missing with signer', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_getCallsStatus',
        params: [],
      };

      // Act & Assert
      await expect(provider.request(request)).rejects.toMatchObject({
        message: 'batchId is required',
      });
    });

    it('should throw error if no call status found with signer', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_getCallsStatus',
        params: ['0xnonexistent'],
      };
      (getCallStatus as Mock).mockReturnValue(undefined);

      // Act & Assert
      await expect(provider.request(request)).rejects.toMatchObject({
        message: 'No call status found for batchId: 0xnonexistent',
      });
    });
  });

  describe('_request - Error Handling', () => {
    beforeEach(() => {
      provider = new JAWProvider(mockConstructorOptions);
      (provider as any).signer = mockSigner;
    });

    it('should validate request arguments', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'eth_accounts',
      };
      (mockSigner.request as Mock).mockResolvedValue(['0x1234567890123456789012345678901234567890']);

      // Act
      await provider.request(request);

      // Assert
      expect(checkErrorForInvalidRequestArgs).toHaveBeenCalledWith(request);
    });

    it('should serialize errors before rejecting', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'eth_accounts',
      };
      const mockError = new Error('Test error');
      (mockSigner.request as Mock).mockRejectedValue(mockError);

      const { serializeError } = await import('../errors/index.js');

      // Act & Assert
      await expect(provider.request(request)).rejects.toThrow();
      expect(serializeError).toHaveBeenCalledWith(mockError);
    });

    it('should disconnect on unauthorized error', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'eth_accounts',
      };
      const unauthorizedError = {
        code: standardErrorCodes.provider.unauthorized,
        message: 'Unauthorized',
      };
      (mockSigner.request as Mock).mockRejectedValue(unauthorizedError);

      const disconnectSpy = vi.spyOn(provider, 'disconnect');

      // Act & Assert
      await expect(provider.request(request)).rejects.toMatchObject(unauthorizedError);
      expect(disconnectSpy).toHaveBeenCalled();
    });

    it('should not disconnect on non-unauthorized errors', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'eth_accounts',
      };
      const otherError = {
        code: 4001,
        message: 'User rejected',
      };
      (mockSigner.request as Mock).mockRejectedValue(otherError);

      const disconnectSpy = vi.spyOn(provider, 'disconnect');

      // Act & Assert
      await expect(provider.request(request)).rejects.toMatchObject(otherError);
      expect(disconnectSpy).not.toHaveBeenCalled();
    });

    it('should complete disconnect before rejecting on unauthorized error', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'eth_accounts',
      };
      const unauthorizedError = {
        code: standardErrorCodes.provider.unauthorized,
        message: 'Unauthorized',
      };
      (mockSigner.request as Mock).mockRejectedValue(unauthorizedError);

      let cleanupCompleted = false;
      (mockSigner.cleanup as Mock).mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        cleanupCompleted = true;
      });

      const disconnectSpy = vi.spyOn(provider, 'disconnect');

      // Act & Assert
      await expect(provider.request(request)).rejects.toMatchObject(unauthorizedError);

      // Verify disconnect was called and cleanup completed
      expect(disconnectSpy).toHaveBeenCalled();
      expect(cleanupCompleted).toBe(true);
      expect((provider as any).signer).toBeNull();
    });
  });

  describe('enable (deprecated)', () => {
    beforeEach(() => {
      provider = new JAWProvider(mockConstructorOptions);
    });

    it('should call eth_requestAccounts', async () => {
      // Arrange
      const mockAccounts = ['0x1234567890123456789012345678901234567890'];
      (mockSigner.handshake as Mock).mockResolvedValue(undefined);
      (mockSigner.request as Mock).mockResolvedValue(mockAccounts);

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        // No-op for tests
      });

      // Act
      const result = await provider.request({method: 'eth_requestAccounts'});

      // Assert
      expect(result).toEqual(mockAccounts);

      consoleWarnSpy.mockRestore();
    });
  });

  describe('disconnect', () => {
    beforeEach(() => {
      provider = new JAWProvider(mockConstructorOptions);
      (provider as any).signer = mockSigner;
    });

    it('should cleanup signer', async () => {
      // Arrange
      (mockSigner.cleanup as Mock).mockResolvedValue(undefined);

      // Act
      await provider.disconnect();

      // Assert
      expect(mockSigner.cleanup).toHaveBeenCalled();
    });

    it('should nullify signer', async () => {
      // Arrange
      (mockSigner.cleanup as Mock).mockResolvedValue(undefined);

      // Act
      await provider.disconnect();

      // Assert
      expect((provider as any).signer).toBeNull();
    });

    it('should clear correlationIds', async () => {
      // Arrange
      (mockSigner.cleanup as Mock).mockResolvedValue(undefined);

      // Act
      await provider.disconnect();

      // Assert
      expect(correlationIds.clear).toHaveBeenCalled();
    });

    it('should emit disconnect event', async () => {
      // Arrange
      (mockSigner.cleanup as Mock).mockResolvedValue(undefined);
      const emitSpy = vi.spyOn(provider, 'emit');

      // Act
      await provider.disconnect();

      // Assert
      expect(emitSpy).toHaveBeenCalledWith(
        'disconnect',
        expect.objectContaining({
          message: 'User initiated disconnection',
        })
      );
    });

    it('should handle disconnect when no signer exists', async () => {
      // Arrange
      (provider as any).signer = null;

      // Act & Assert - Should not throw
      await expect(provider.disconnect()).resolves.toBeUndefined();
      expect(correlationIds.clear).toHaveBeenCalled();
    });
  });

  describe('Event Emitter Functionality', () => {
    beforeEach(() => {
      provider = new JAWProvider(mockConstructorOptions);
      (provider as any).signer = mockSigner;
    });

    it('should emit events through provider', () => {
      // Arrange
      const eventHandler = vi.fn();
      provider.on('connect', eventHandler);

      // Act
      provider.emit('connect', { chainId: '0x1' });

      // Assert
      expect(eventHandler).toHaveBeenCalledWith({ chainId: '0x1' });
    });

    it('should pass emit callback to signer', async () => {
      // Arrange
      provider = new JAWProvider(mockConstructorOptions);
      const request: RequestArguments = {
        method: 'eth_requestAccounts',
      };
      const mockAccounts = ['0x1234567890123456789012345678901234567890'];

      (mockSigner.handshake as Mock).mockResolvedValue(undefined);
      (mockSigner.request as Mock).mockResolvedValue(mockAccounts);

      // Act
      await provider.request(request);

      // Assert
      expect(createSigner).toHaveBeenCalledWith(
        expect.objectContaining({
          callback: expect.any(Function),
        })
      );
    });

    it('should emit connect event through callback from signer', async () => {
      // Arrange
      provider = new JAWProvider(mockConstructorOptions);
      const request: RequestArguments = { method: 'eth_requestAccounts' };
      const mockAccounts = ['0x1234567890123456789012345678901234567890'];

      (mockSigner.handshake as Mock).mockResolvedValue(undefined);
      (mockSigner.request as Mock).mockResolvedValue(mockAccounts);

      const connectHandler = vi.fn();
      provider.on('connect', connectHandler);

      // Simulate signer calling the callback (which is provider.emit.bind(this))
      (createSigner as Mock).mockImplementation((params) => {
        const signer = mockSigner;
        // Simulate what JAWSigner does - call the callback with connect event
        params.callback('connect', { chainId: '0x1' });
        return signer;
      });

      // Act
      await provider.request(request);

      // Assert
      expect(connectHandler).toHaveBeenCalledWith({ chainId: '0x1' });
    });

    it('should forward events from signer via callback', () => {
      // Arrange
      provider = new JAWProvider(mockConstructorOptions);
      const connectHandler = vi.fn();
      const chainChangedHandler = vi.fn();
      const accountsChangedHandler = vi.fn();

      provider.on('connect', connectHandler);
      provider.on('chainChanged', chainChangedHandler);
      provider.on('accountsChanged', accountsChangedHandler);

      // Act - Simulate signer emitting events via callback
      const callback = (provider as any).emit.bind(provider);
      callback('connect', { chainId: '0x1' });
      callback('chainChanged', '0x89');
      callback('accountsChanged', ['0x123']);

      // Assert
      expect(connectHandler).toHaveBeenCalledWith({ chainId: '0x1' });
      expect(chainChangedHandler).toHaveBeenCalledWith('0x89');
      expect(accountsChangedHandler).toHaveBeenCalledWith(['0x123']);
    });
  });

  describe('Multiple Requests Flow', () => {
    beforeEach(() => {
      provider = new JAWProvider(mockConstructorOptions);
    });

    it('should handle sequential requests correctly', async () => {
      // Arrange
      const request1: RequestArguments = { method: 'eth_requestAccounts' };
      const request2: RequestArguments = { method: 'eth_accounts' };
      const request3: RequestArguments = {
        method: 'personal_sign',
        params: ['0x48656c6c6f', '0x1234567890123456789012345678901234567890'],
      };

      (mockSigner.handshake as Mock).mockResolvedValue(undefined);
      (mockSigner.request as Mock)
        .mockResolvedValueOnce(['0x1234567890123456789012345678901234567890'])
        .mockResolvedValueOnce(['0x1234567890123456789012345678901234567890'])
        .mockResolvedValueOnce('0xsignature');

      // Act
      await provider.request(request1);
      await provider.request(request2);
      await provider.request(request3);

      // Assert
      expect(mockSigner.request).toHaveBeenCalledTimes(3);
      expect(mockSigner.request).toHaveBeenNthCalledWith(1, request1);
      expect(mockSigner.request).toHaveBeenNthCalledWith(2, request2);
      expect(mockSigner.request).toHaveBeenNthCalledWith(3, request3);
    });

    it('should handle disconnect and reconnect', async () => {
      // Arrange
      const request1: RequestArguments = { method: 'eth_requestAccounts' };
      const request2: RequestArguments = { method: 'eth_requestAccounts' };

      (mockSigner.handshake as Mock).mockResolvedValue(undefined);
      (mockSigner.request as Mock).mockResolvedValue(['0x1234567890123456789012345678901234567890']);
      (mockSigner.cleanup as Mock).mockResolvedValue(undefined);

      // Act
      await provider.request(request1);
      await provider.disconnect();
      await provider.request(request2);

      // Assert
      expect(mockSigner.cleanup).toHaveBeenCalledTimes(1);
      expect(createSigner).toHaveBeenCalledTimes(2); // Once for each connection
    });
  });

  describe('Parallel Requests and CorrelationId Management', () => {
    beforeEach(() => {
      provider = new JAWProvider(mockConstructorOptions);
      (provider as any).signer = mockSigner;
    });

    it('should handle parallel requests with unique correlationIds', async () => {
      // Arrange
      const request1: RequestArguments = { method: 'eth_accounts' };
      const request2: RequestArguments = { method: 'eth_chainId' };
      const request3: RequestArguments = { method: 'net_version' };

      const mockUUIDs = [
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333',
      ];

      let uuidCallCount = 0;
      vi.spyOn(crypto, 'randomUUID').mockImplementation(() => mockUUIDs[uuidCallCount++] as `${string}-${string}-${string}-${string}-${string}`);

      // Mock signer to add delay to simulate parallel execution
      (mockSigner.request as Mock).mockImplementation(async (req: RequestArguments) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        if (req.method === 'eth_accounts') return ['0x1234567890123456789012345678901234567890'];
        if (req.method === 'eth_chainId') return '0x1';
        if (req.method === 'net_version') return 1;
        return null;
      });

      // Act - Execute requests in parallel
      const results = await Promise.all([
        provider.request(request1),
        provider.request(request2),
        provider.request(request3),
      ]);

      // Assert
      expect(correlationIds.set).toHaveBeenCalledTimes(3);
      expect(correlationIds.set).toHaveBeenNthCalledWith(1, request1, mockUUIDs[0]);
      expect(correlationIds.set).toHaveBeenNthCalledWith(2, request2, mockUUIDs[1]);
      expect(correlationIds.set).toHaveBeenNthCalledWith(3, request3, mockUUIDs[2]);

      expect(correlationIds.delete).toHaveBeenCalledTimes(3);
      expect(correlationIds.delete).toHaveBeenCalledWith(request1);
      expect(correlationIds.delete).toHaveBeenCalledWith(request2);
      expect(correlationIds.delete).toHaveBeenCalledWith(request3);

      expect(results).toEqual([
        ['0x1234567890123456789012345678901234567890'],
        '0x1',
        1,
      ]);
    });

    it('should handle many parallel requests without conflicts', async () => {
      // Arrange
      const numRequests = 10;

      // Reset the mock to clear previous calls from beforeEach
      (correlationIds.set as Mock).mockClear();
      (correlationIds.delete as Mock).mockClear();

      // Track request order
      let requestCount = 0;
      (mockSigner.request as Mock).mockImplementation(async () => {
        const currentRequest = requestCount++;
        // Simulate some async work
        await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
        return [`0x${currentRequest.toString().padStart(40, '0')}`];
      });

      // Act - Execute many requests in parallel with different request objects
      const promises = Array.from({ length: numRequests }, () =>
        provider.request<string[]>({ method: 'eth_accounts' })
      );

      const results = await Promise.all(promises);

      // Assert - All requests should complete successfully
      expect(results).toHaveLength(numRequests);
      expect(mockSigner.request).toHaveBeenCalledTimes(numRequests);

      // Each request should have been tracked with correlationIds
      expect(correlationIds.set).toHaveBeenCalledTimes(numRequests);
      expect(correlationIds.delete).toHaveBeenCalledTimes(numRequests);

      // All results should be valid ethereum addresses
      results.forEach((result) => {
        expect(result).toHaveLength(1);
        expect(result[0]).toMatch(/^0x[0-9a-f]{40}$/i);
      });
    });

    it('should cleanup correlationId even when parallel request fails', async () => {
      // Arrange
      const request1: RequestArguments = { method: 'eth_accounts' };
      const request2: RequestArguments = { method: 'personal_sign', params: ['0x', '0x'] };

      (mockSigner.request as Mock).mockImplementation(async (req: RequestArguments) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        if (req.method === 'eth_accounts') {
          return ['0x1234567890123456789012345678901234567890'];
        }
        throw new Error('Signing failed');
      });

      // Act
      const results = await Promise.allSettled([
        provider.request(request1),
        provider.request(request2),
      ]);

      // Assert
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(correlationIds.delete).toHaveBeenCalledTimes(2);
      expect(correlationIds.delete).toHaveBeenCalledWith(request1);
      expect(correlationIds.delete).toHaveBeenCalledWith(request2);
    });
  });

  describe('Event Listener Lifecycle', () => {
    beforeEach(() => {
      provider = new JAWProvider(mockConstructorOptions);
    });

    it('should add and remove event listeners', () => {
      // Arrange
      const connectHandler = vi.fn();
      const chainChangedHandler = vi.fn();

      // Act - Add listeners
      provider.on('connect', connectHandler);
      provider.on('chainChanged', chainChangedHandler);

      provider.emit('connect', { chainId: '0x1' });
      provider.emit('chainChanged', '0x89');

      // Assert
      expect(connectHandler).toHaveBeenCalledWith({ chainId: '0x1' });
      expect(chainChangedHandler).toHaveBeenCalledWith('0x89');

      // Act - Remove listeners
      provider.off('connect', connectHandler);
      provider.off('chainChanged', chainChangedHandler);

      connectHandler.mockClear();
      chainChangedHandler.mockClear();

      provider.emit('connect', { chainId: '0x1' });
      provider.emit('chainChanged', '0x89');

      // Assert - Handlers should not be called after removal
      expect(connectHandler).not.toHaveBeenCalled();
      expect(chainChangedHandler).not.toHaveBeenCalled();
    });

    it('should handle once listeners that auto-remove after first call', () => {
      // Arrange
      const handler = vi.fn();

      // Act
      provider.once('connect', handler);
      provider.emit('connect', { chainId: '0x1' });
      provider.emit('connect', { chainId: '0x89' });

      // Assert - Handler should only be called once
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ chainId: '0x1' });
    });

    it('should remove all listeners for a specific event', () => {
      // Arrange
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();
      const otherHandler = vi.fn();

      provider.on('connect', handler1);
      provider.on('connect', handler2);
      provider.on('connect', handler3);
      provider.on('chainChanged', otherHandler);

      // Act - Remove all connect listeners
      provider.removeAllListeners('connect');
      provider.emit('connect', { chainId: '0x1' });
      provider.emit('chainChanged', '0x89');

      // Assert
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
      expect(handler3).not.toHaveBeenCalled();
      expect(otherHandler).toHaveBeenCalledWith('0x89');
    });

    it('should remove all listeners for all events', () => {
      // Arrange
      const connectHandler = vi.fn();
      const chainChangedHandler = vi.fn();
      const accountsChangedHandler = vi.fn();

      provider.on('connect', connectHandler);
      provider.on('chainChanged', chainChangedHandler);
      provider.on('accountsChanged', accountsChangedHandler);

      // Act
      provider.removeAllListeners();
      provider.emit('connect', { chainId: '0x1' });
      provider.emit('chainChanged', '0x89');
      provider.emit('accountsChanged', ['0x123']);

      // Assert
      expect(connectHandler).not.toHaveBeenCalled();
      expect(chainChangedHandler).not.toHaveBeenCalled();
      expect(accountsChangedHandler).not.toHaveBeenCalled();
    });

    it('should support multiple handlers for the same event', () => {
      // Arrange
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      // Act
      provider.on('connect', handler1);
      provider.on('connect', handler2);
      provider.on('connect', handler3);
      provider.emit('connect', { chainId: '0x1' });

      // Assert
      expect(handler1).toHaveBeenCalledWith({ chainId: '0x1' });
      expect(handler2).toHaveBeenCalledWith({ chainId: '0x1' });
      expect(handler3).toHaveBeenCalledWith({ chainId: '0x1' });
    });

    it('should call all handlers even if one is removed during iteration', () => {
      // Arrange
      const handler1 = vi.fn();
      const handler2 = vi.fn(() => {
        // Remove handler3 while iterating
        provider.off('connect', handler3);
      });
      const handler3 = vi.fn();

      // Act
      provider.on('connect', handler1);
      provider.on('connect', handler2);
      provider.on('connect', handler3);
      provider.emit('connect', { chainId: '0x1' });

      // Assert - handler1 and handler2 should be called, handler3 behavior depends on EventEmitter implementation
      expect(handler1).toHaveBeenCalledWith({ chainId: '0x1' });
      expect(handler2).toHaveBeenCalledWith({ chainId: '0x1' });
    });
  });

  describe('Chain Switching', () => {
    beforeEach(() => {
      provider = new JAWProvider(mockConstructorOptions);
      (provider as any).signer = mockSigner;
    });

    it('should emit chainChanged event when chain switches', async () => {
      // Arrange
      const chainChangedHandler = vi.fn();
      provider.on('chainChanged', chainChangedHandler);

      const request: RequestArguments = {
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x89' }],
      };

      (mockSigner.request as Mock).mockImplementation(async () => {
        // Simulate signer emitting chainChanged event
        const callback = (provider as any).emit.bind(provider);
        callback('chainChanged', '0x89');
        return null;
      });

      // Act
      await provider.request(request);

      // Assert
      expect(chainChangedHandler).toHaveBeenCalledWith('0x89');
    });

    it('should handle wallet_addEthereumChain request', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: '0x89',
            chainName: 'Polygon',
            rpcUrls: ['https://polygon-rpc.com'],
            nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
            blockExplorerUrls: ['https://polygonscan.com'],
          },
        ],
      };

      (mockSigner.request as Mock).mockResolvedValue(null);

      // Act
      const result = await provider.request(request);

      // Assert
      expect(mockSigner.request).toHaveBeenCalledWith(request);
      expect(result).toBeNull();
    });

    it('should maintain state across chain switches', async () => {
      // Arrange
      const accountsRequest: RequestArguments = { method: 'eth_accounts' };
      const switchChainRequest: RequestArguments = {
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x89' }],
      };

      const mockAccounts = ['0x1234567890123456789012345678901234567890'];

      (mockSigner.request as Mock).mockImplementation(async (req: RequestArguments) => {
        if (req.method === 'eth_accounts') return mockAccounts;
        if (req.method === 'wallet_switchEthereumChain') {
          const callback = (provider as any).emit.bind(provider);
          callback('chainChanged', '0x89');
          return null;
        }
        return null;
      });

      // Act
      const accountsBefore = await provider.request(accountsRequest);
      await provider.request(switchChainRequest);
      const accountsAfter = await provider.request(accountsRequest);

      // Assert - Accounts should remain the same after chain switch
      expect(accountsBefore).toEqual(mockAccounts);
      expect(accountsAfter).toEqual(mockAccounts);
      expect((provider as any).signer).toBe(mockSigner); // Signer should not change
    });

    it('should handle chain switch failure', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x999' }],
      };

      const error = {
        code: 4902,
        message: 'Unrecognized chain ID',
      };

      (mockSigner.request as Mock).mockRejectedValue(error);

      // Act & Assert
      await expect(provider.request(request)).rejects.toMatchObject(error);
      expect((provider as any).signer).toBe(mockSigner); // Signer should remain
    });

    it('should emit chainChanged only once during switch', async () => {
      // Arrange
      const chainChangedHandler = vi.fn();
      provider.on('chainChanged', chainChangedHandler);

      const request: RequestArguments = {
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x89' }],
      };

      (mockSigner.request as Mock).mockImplementation(async () => {
        const callback = (provider as any).emit.bind(provider);
        callback('chainChanged', '0x89');
        return null;
      });

      // Act
      await provider.request(request);

      // Assert
      expect(chainChangedHandler).toHaveBeenCalledTimes(1);
      expect(chainChangedHandler).toHaveBeenCalledWith('0x89');
    });

    it('should support multiple chain switches in sequence', async () => {
      // Arrange
      const chainChangedHandler = vi.fn();
      provider.on('chainChanged', chainChangedHandler);

      const chains = ['0x89', '0xa', '0x1'];
      const requests = chains.map(chainId => ({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId }],
      }));

      (mockSigner.request as Mock).mockImplementation(async (req: RequestArguments) => {
        const chainId = (req.params as any)?.[0]?.chainId;
        const callback = (provider as any).emit.bind(provider);
        callback('chainChanged', chainId);
        return null;
      });

      // Act
      for (const req of requests) {
        await provider.request(req);
      }

      // Assert
      expect(chainChangedHandler).toHaveBeenCalledTimes(3);
      expect(chainChangedHandler).toHaveBeenNthCalledWith(1, '0x89');
      expect(chainChangedHandler).toHaveBeenNthCalledWith(2, '0xa');
      expect(chainChangedHandler).toHaveBeenNthCalledWith(3, '0x1');
    });
  });
});

describe('createJAWProvider', () => {
  let mockMetadata: AppMetadata;

  beforeEach(() => {
    mockMetadata = {
      appName: 'Test App',
      appLogoUrl: 'https://test.com/logo.png',
    };

    vi.clearAllMocks();
  });

  it('should create JAWProvider instance', () => {
    // Arrange
    const options = {
      metadata: mockMetadata,
      preference: {
        keysUrl: 'https://keys.test.com',
      },
      apiKey: 'test-api-key',
    };

    // Act
    const provider = createJAWProvider(options);

    // Assert
    expect(provider).toBeInstanceOf(JAWProvider);
  });

  it('should pass metadata to JAWProvider constructor', () => {
    // Arrange
    const options = {
      metadata: mockMetadata,
      preference: {
        keysUrl: 'https://keys.test.com',
      },
      apiKey: 'test-api-key',
    };

    // Act
    const provider = createJAWProvider(options);

    // Assert
    expect((provider as any).metadata).toEqual(mockMetadata);
  });

  it('should pass preference to JAWProvider constructor', () => {
    // Arrange
    const preference = {
      keysUrl: 'https://keys.test.com',
      appSpecific: true,
      serverUrl: 'https://api.test.com',
    };

    const options = {
      metadata: mockMetadata,
      preference,
      apiKey: 'test-api-key',
    };

    // Act
    const provider = createJAWProvider(options);

    // Assert
    expect((provider as any).preference).toEqual({
      keysUrl: 'https://keys.test.com',
      appSpecific: true,
      serverUrl: 'https://api.test.com',
    });
  });

  it('should create multiple independent instances', () => {
    // Arrange
    const options1 = {
      metadata: { ...mockMetadata, appName: 'App 1' },
      preference: { keysUrl: 'https://keys1.test.com' },
      apiKey: 'test-api-key',
    };

    const options2 = {
      metadata: { ...mockMetadata, appName: 'App 2' },
      preference: { keysUrl: 'https://keys2.test.com' },
      apiKey: 'test-api-key',
    };

    // Act
    const provider1 = createJAWProvider(options1);
    const provider2 = createJAWProvider(options2);

    // Assert
    expect(provider1).toBeInstanceOf(JAWProvider);
    expect(provider2).toBeInstanceOf(JAWProvider);
    expect(provider1).not.toBe(provider2);
    expect((provider1 as any).metadata.appName).toBe('App 1');
    expect((provider2 as any).metadata.appName).toBe('App 2');
  });
});

