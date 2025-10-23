/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { JAWProvider } from './JAWProvider.js';
import { createJAWProvider } from './createJAWProvider.js';
import { Communicator } from '../communicator/index.js';
import { standardErrorCodes } from '../errors/index.js';
import { correlationIds } from '../store/index.js';
import { fetchRPCRequest, checkErrorForInvalidRequestArgs } from '../utils/index.js';
import {
  createSigner,
  fetchSignerType,
  loadSignerType,
  storeSignerType,
} from '../signer/index.js';
import type { AppMetadata, ConstructorOptions, RequestArguments } from './interface.js';
import type { Signer } from '../signer/index.js';
import type { SignerType } from '../messages/index.js';

// Mock all dependencies
vi.mock('../communicator/index.js');
vi.mock('../errors/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../errors/index.js')>();
  return {
    ...actual,
    serializeError: vi.fn((error) => error),
  };
});
vi.mock('../store/index.js', () => ({
  correlationIds: {
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
  },
}));
vi.mock('../utils/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/index.js')>();
  return {
    ...actual,
    fetchRPCRequest: vi.fn(),
    checkErrorForInvalidRequestArgs: vi.fn(),
  };
});
vi.mock('../signer/index.js', () => ({
  createSigner: vi.fn(),
  fetchSignerType: vi.fn(),
  loadSignerType: vi.fn(),
  storeSignerType: vi.fn(),
}));

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
      appChainIds: [1, 137],
    };

    mockConstructorOptions = {
      metadata: mockMetadata,
      preference: {
        keysUrl: 'https://keys.test.com',
        appSpecific: false,
      },
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
    (fetchSignerType as Mock).mockResolvedValue('scw' as SignerType);
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
        appSpecific: false,
      });
    });

    it('should create communicator with correct options', () => {
      // Act
      provider = new JAWProvider(mockConstructorOptions);

      // Assert
      expect(Communicator).toHaveBeenCalledWith({
        url: 'https://keys.test.com',
        metadata: mockMetadata,
        preference: {
          appSpecific: false,
        },
      });
    });

    it('should initialize signer if signerType is stored', () => {
      // Arrange
      (loadSignerType as Mock).mockReturnValue('scw');

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
      (fetchSignerType as Mock).mockResolvedValue('scw');
      (mockSigner.handshake as Mock).mockResolvedValue(undefined);
      (mockSigner.request as Mock).mockResolvedValue(mockAccounts);

      // Act
      await provider.request(request);

      // Assert
      expect(fetchSignerType).toHaveBeenCalledWith({
        communicator: (provider as any).communicator,
        preference: (provider as any).preference,
        handshakeRequest: request,
      });
      expect(createSigner).toHaveBeenCalled();
      expect(mockSigner.handshake).toHaveBeenCalledWith(request);
      expect(storeSignerType).toHaveBeenCalledWith('scw');
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
      (fetchSignerType as Mock).mockResolvedValue('scw');
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
      (fetchSignerType as Mock).mockResolvedValue('scw');
      (mockSigner.handshake as Mock).mockRejectedValue(new Error('Handshake failed'));

      // Act & Assert
      await expect(provider.request(request)).rejects.toThrow('Handshake failed');
      expect(storeSignerType).not.toHaveBeenCalled();
      expect((provider as any).signer).toBeNull();
    });

    it('should handle fetchSignerType failure', async () => {
      // Arrange
      const request: RequestArguments = { method: 'eth_requestAccounts' };
      (fetchSignerType as Mock).mockRejectedValue(new Error('Network error'));

      // Act & Assert
      await expect(provider.request(request)).rejects.toThrow('Network error');
      expect((provider as any).signer).toBeNull();
    });
  });

  describe('_request - No Signer: wallet_connect', () => {
    beforeEach(() => {
      provider = new JAWProvider(mockConstructorOptions);
    });

    it('should create scw signer and handshake', async () => {
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
        signerType: 'scw',
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
    });

    it('should create ephemeral signer and cleanup after request', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_sendCalls',
        params: [{ calls: [] }],
      };
      const mockBatchId = '0xbatchId';
      (mockSigner.handshake as Mock).mockResolvedValue(undefined);
      (mockSigner.request as Mock).mockResolvedValue(mockBatchId);
      (mockSigner.cleanup as Mock).mockResolvedValue(undefined);

      // Act
      const result = await provider.request(request);

      // Assert
      expect(createSigner).toHaveBeenCalled();
      expect(mockSigner.handshake).toHaveBeenCalledWith({ method: 'handshake' });
      expect(mockSigner.request).toHaveBeenCalledWith(request);
      expect(mockSigner.cleanup).toHaveBeenCalled();
      expect(result).toEqual(mockBatchId);
      expect((provider as any).signer).toBeNull(); // Should not store ephemeral signer
    });

    it('should return result even if cleanup fails', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_sendCalls',
        params: [{ calls: [] }],
      };
      const mockBatchId = '0xbatchId';
      (mockSigner.handshake as Mock).mockResolvedValue(undefined);
      (mockSigner.request as Mock).mockResolvedValue(mockBatchId);
      (mockSigner.cleanup as Mock).mockRejectedValue(new Error('Cleanup failed'));

      // Act
      const result = await provider.request(request);

      // Assert
      expect(mockSigner.handshake).toHaveBeenCalled();
      expect(mockSigner.request).toHaveBeenCalled();
      expect(mockSigner.cleanup).toHaveBeenCalled();
      expect(result).toEqual(mockBatchId);
      expect((provider as any).signer).toBeNull();
    });

    it('should never store ephemeral signer', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_sendCalls',
        params: [{ calls: [] }],
      };
      const mockBatchId = '0xbatchId';
      (mockSigner.handshake as Mock).mockResolvedValue(undefined);
      (mockSigner.request as Mock).mockResolvedValue(mockBatchId);
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

  describe('_request - No Signer: wallet_getCallsStatus', () => {
    beforeEach(() => {
      provider = new JAWProvider(mockConstructorOptions);
    });

    it('should forward to JAW_RPC_URL', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_getCallsStatus',
        params: ['0xbatchId'],
      };
      const mockStatus = { status: 'CONFIRMED' };
      (fetchRPCRequest as Mock).mockResolvedValue(mockStatus);

      // Act
      const result = await provider.request(request);

      // Assert
      expect(fetchRPCRequest).toHaveBeenCalledWith(request, expect.any(String));
      expect(result).toEqual(mockStatus);
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
      (fetchSignerType as Mock).mockResolvedValue('scw');
      (mockSigner.handshake as Mock).mockResolvedValue(undefined);
      (mockSigner.request as Mock).mockResolvedValue(mockAccounts);

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        // No-op for tests
      });

      // Act
      const result = await provider.enable();

      // Assert
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        `.enable() has been deprecated. Please use .request({ method: "eth_requestAccounts" }) instead.`
      );
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

      (fetchSignerType as Mock).mockResolvedValue('scw');
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

      (fetchSignerType as Mock).mockResolvedValue('scw');
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

      (fetchSignerType as Mock).mockResolvedValue('scw');
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

      (fetchSignerType as Mock).mockResolvedValue('scw');
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
});

describe('createJAWProvider', () => {
  let mockMetadata: AppMetadata;

  beforeEach(() => {
    mockMetadata = {
      appName: 'Test App',
      appLogoUrl: 'https://test.com/logo.png',
      appChainIds: [1, 137],
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
      apiKey: 'test-api-key',
    };

    const options = {
      metadata: mockMetadata,
      preference,
    };

    // Act
    const provider = createJAWProvider(options);

    // Assert
    expect((provider as any).preference).toEqual({
      appSpecific: true,
      serverUrl: 'https://api.test.com',
      apiKey: 'test-api-key',
    });
  });

  it('should create multiple independent instances', () => {
    // Arrange
    const options1 = {
      metadata: { ...mockMetadata, appName: 'App 1' },
      preference: { keysUrl: 'https://keys1.test.com' },
    };

    const options2 = {
      metadata: { ...mockMetadata, appName: 'App 2' },
      preference: { keysUrl: 'https://keys2.test.com' },
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

