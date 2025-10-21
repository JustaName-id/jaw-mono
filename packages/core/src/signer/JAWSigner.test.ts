import { describe, it, expect, vi, beforeEach, afterEach, Mock, Mocked } from 'vitest';
import { JAWSigner } from './JAWSigner.js';
import { Communicator } from '../communicator/index.js';
import { KeyManager } from '../key-manager/index.js';
import { store } from '../store/index.js';
import type { AppMetadata, ProviderEventCallback, RequestArguments } from '../provider/interface.js';
import type { RPCResponseMessage, RPCResponse } from '../messages/index.js';
import {
  exportKeyToHexString,
  importKeyFromHexString,
  encryptContent,
  decryptContent,
} from '../utils/index.js';
import { fetchRPCRequest } from '../utils/index.js';
import { correlationIds } from '../store/correlation-ids/store.js';

// Mock dependencies
vi.mock('../communicator/index.js', () => ({
  Communicator: vi.fn(() => ({
    waitForPopupLoaded: vi.fn(),
    postRequestAndWaitForResponse: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

vi.mock('../key-manager/index.js', () => ({
  KeyManager: vi.fn(() => ({
    getOwnPublicKey: vi.fn(),
    setPeerPublicKey: vi.fn(),
    getSharedSecret: vi.fn(),
    clear: vi.fn(),
  })),
}));

vi.mock('../utils/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/index.js')>();
  return {
    ...actual,
    exportKeyToHexString: vi.fn(),
    importKeyFromHexString: vi.fn(),
    encryptContent: vi.fn(),
    decryptContent: vi.fn(),
    fetchRPCRequest: vi.fn(),
  };
});

const mockCryptoKey = {} as CryptoKey;
const mockEncryptedData = {
  iv: new Uint8Array([1, 2, 3]),
  cipherText: new ArrayBuffer(8),
};
const mockCorrelationId = 'test-correlation-id';
const mockMessageId = '12345678-1234-1234-1234-123456789012' as const;

describe('JAWSigner', () => {
  let signer: JAWSigner;
  let mockCommunicator: Mocked<Communicator>;
  let mockKeyManager: Mocked<KeyManager>;
  let mockCallback: ProviderEventCallback;
  let mockMetadata: AppMetadata;

  beforeEach(() => {
    // Setup metadata
    mockMetadata = {
      appName: 'Test App',
      appLogoUrl: 'https://test.com/logo.png',
      appChainIds: [1, 137],
    };

    // Setup mock communicator
    mockCommunicator = new Communicator({
      url: 'https://test.com',
      metadata: mockMetadata,
      preference: { keysUrl: 'https://test.com' },
    }) as Mocked<Communicator>;

    mockCommunicator.waitForPopupLoaded.mockResolvedValue({} as Window);
    mockCommunicator.postRequestAndWaitForResponse.mockResolvedValue({
      id: mockMessageId,
      requestId: mockMessageId,
      correlationId: mockCorrelationId,
      sender: 'peer-public-key-hex',
      content: {
        encrypted: mockEncryptedData,
      },
      timestamp: new Date(),
    } as RPCResponseMessage);

    // Setup mock key manager
    mockKeyManager = new KeyManager({} as any) as Mocked<KeyManager>;
    (KeyManager as Mock).mockImplementation(() => mockKeyManager);

    mockKeyManager.getOwnPublicKey.mockResolvedValue(mockCryptoKey);
    mockKeyManager.setPeerPublicKey.mockResolvedValue(undefined);
    mockKeyManager.getSharedSecret.mockResolvedValue(mockCryptoKey);
    mockKeyManager.clear.mockResolvedValue(undefined);

    // Setup utility mocks
    (exportKeyToHexString as Mock).mockResolvedValue('mock-public-key-hex');
    (importKeyFromHexString as Mock).mockResolvedValue(mockCryptoKey);
    (encryptContent as Mock).mockResolvedValue(mockEncryptedData);
    (decryptContent as Mock).mockResolvedValue({
      result: { value: 'decrypted-value' },
    });
    (fetchRPCRequest as Mock).mockResolvedValue('rpc-result');

    // Setup correlation ID mock
    vi.spyOn(correlationIds, 'get').mockReturnValue(mockCorrelationId);

    // Setup callback
    mockCallback = vi.fn();

    // Setup store mocks
    vi.spyOn(store, 'getState').mockReturnValue({
      account: {
        accounts: [],
        chain: undefined,
        capabilities: undefined,
      },
      chains: [],
      config: {
        metadata: mockMetadata,
        version: '1.0.0',
      },
      keys: {},
    });

    vi.spyOn(store.config, 'get').mockReturnValue({
      metadata: mockMetadata,
      version: '1.0.0',
    });

    vi.spyOn(store.account, 'set').mockReturnValue(undefined);
    vi.spyOn(store.account, 'clear').mockReturnValue(undefined);
    vi.spyOn(store.chains, 'set').mockReturnValue(undefined);
    vi.spyOn(store.chains, 'clear').mockReturnValue(undefined);

    // Create signer instance
    signer = new JAWSigner({
      metadata: mockMetadata,
      communicator: mockCommunicator,
      callback: mockCallback,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Handshake', () => {
    it('should successfully perform handshake', async () => {
      // Arrange
      const handshakeRequest: RequestArguments = {
        method: 'wallet_connect',
        params: [{ version: '1.0', capabilities: {} }],
      };

      const mockResponse: RPCResponseMessage = {
        id: mockMessageId,
        requestId: mockMessageId,
        correlationId: mockCorrelationId,
        sender: 'peer-public-key-hex',
        content: {
          encrypted: mockEncryptedData,
        },
        timestamp: new Date(),
      };

      mockCommunicator.postRequestAndWaitForResponse.mockResolvedValue(mockResponse);

      // Mock decrypted response
      (decryptContent as Mock).mockResolvedValue({
        result: {
          value: {
            accounts: [
              { address: '0x1234567890123456789012345678901234567890' },
            ],
          },
        },
        data: {
          chains: {
            1: 'https://eth-mainnet.rpc.com',
            137: 'https://polygon-mainnet.rpc.com',
          },
          capabilities: {
            '0x1': { paymasterService: { supported: true } },
          },
        },
      } as RPCResponse);

      // Act
      await signer.handshake(handshakeRequest);

      // Assert
      expect(mockCommunicator.waitForPopupLoaded).toHaveBeenCalled();
      expect(mockCommunicator.postRequestAndWaitForResponse).toHaveBeenCalled();
      
      const sentMessage = mockCommunicator.postRequestAndWaitForResponse.mock.calls[0][0] as any;
      expect(sentMessage.content).toHaveProperty('handshake');
      expect(sentMessage.content.handshake.method).toBe('wallet_connect');
    });

    it('should throw error if handshake response contains failure', async () => {
      // Arrange
      const handshakeRequest: RequestArguments = {
        method: 'wallet_connect',
        params: [],
      };

      const mockErrorResponse: RPCResponseMessage = {
        id: mockMessageId,
        requestId: mockMessageId,
        correlationId: mockCorrelationId,
        sender: 'peer-public-key-hex',
        content: {
          failure: {
            code: 4001,
            message: 'User rejected request',
          },
        },
        timestamp: new Date(),
      };

      mockCommunicator.postRequestAndWaitForResponse.mockResolvedValue(mockErrorResponse);

      // Act & Assert
      await expect(signer.handshake(handshakeRequest)).rejects.toMatchObject({
        code: 4001,
        message: 'User rejected request',
      });
    });

    it('should store peer public key after successful handshake', async () => {
      // Arrange
      const handshakeRequest: RequestArguments = {
        method: 'wallet_connect',
        params: [],
      };

      const mockResponse: RPCResponseMessage = {
        id: mockMessageId,
        requestId: mockMessageId,
        correlationId: mockCorrelationId,
        sender: 'peer-public-key-hex',
        content: {
          encrypted: mockEncryptedData,
        },
        timestamp: new Date(),
      };

      mockCommunicator.postRequestAndWaitForResponse.mockResolvedValue(mockResponse);

      (decryptContent as Mock).mockResolvedValue({
        result: {
          value: {
            accounts: [
              { address: '0x1234567890123456789012345678901234567890' },
            ],
          },
        },
        data: {
          chains: {
            1: 'https://eth-mainnet.rpc.com',
          },
        },
      } as RPCResponse);

      // Act
      await signer.handshake(handshakeRequest);

      // Assert
      expect(importKeyFromHexString).toHaveBeenCalledWith('public', 'peer-public-key-hex');
    });
  });

  describe('Request After Handshake', () => {
    beforeEach(async () => {
      // Perform handshake first
      const handshakeRequest: RequestArguments = {
        method: 'wallet_connect',
        params: [{ version: '1.0', capabilities: {} }],
      };

      const mockHandshakeResponse: RPCResponseMessage = {
        id: mockMessageId,
        requestId: mockMessageId,
        correlationId: mockCorrelationId,
        sender: 'peer-public-key-hex',
        content: {
          encrypted: mockEncryptedData,
        },
        timestamp: new Date(),
      };

      mockCommunicator.postRequestAndWaitForResponse.mockResolvedValue(mockHandshakeResponse);

      (decryptContent as Mock).mockResolvedValue({
        result: {
          value: {
            accounts: [
              { address: '0x1234567890123456789012345678901234567890' },
            ],
          },
        },
        data: {
          chains: {
            1: 'https://eth-mainnet.rpc.com',
          },
        },
      } as RPCResponse);

      await signer.handshake(handshakeRequest);

      // Reset mock call history
      vi.clearAllMocks();
    });

    it('should successfully make eth_accounts request', async () => {
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

    it('should successfully make eth_chainId request', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'eth_chainId',
      };

      // Act
      const result = await signer.request(request);

      // Assert
      expect(result).toBe('0x1');
    });

    it('should make personal_sign request to popup', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'personal_sign',
        params: ['0x48656c6c6f', '0x1234567890123456789012345678901234567890'],
      };

      const mockSignResponse: RPCResponseMessage = {
        id: mockMessageId,
        requestId: mockMessageId,
        correlationId: mockCorrelationId,
        sender: 'peer-public-key-hex',
        content: {
          encrypted: mockEncryptedData,
        },
        timestamp: new Date(),
      };

      mockCommunicator.postRequestAndWaitForResponse.mockResolvedValue(mockSignResponse);

      (decryptContent as Mock).mockResolvedValue({
        result: {
          value: '0xsignature...',
        },
      } as RPCResponse);

      // Act
      const result = await signer.request(request);

      // Assert
      expect(result).toBe('0xsignature...');
      expect(mockCommunicator.waitForPopupLoaded).toHaveBeenCalled();
      expect(mockCommunicator.postRequestAndWaitForResponse).toHaveBeenCalled();
    });

    it('should make eth_sendTransaction request to popup', async () => {
      // Arrange
      const txRequest: RequestArguments = {
        method: 'eth_sendTransaction',
        params: [
          {
            from: '0x1234567890123456789012345678901234567890',
            to: '0x0987654321098765432109876543210987654321',
            value: '0x1000',
            data: '0x',
          },
        ],
      };

      const mockTxResponse: RPCResponseMessage = {
        id: mockMessageId,
        requestId: mockMessageId,
        correlationId: mockCorrelationId,
        sender: 'peer-public-key-hex',
        content: {
          encrypted: mockEncryptedData,
        },
        timestamp: new Date(),
      };

      mockCommunicator.postRequestAndWaitForResponse.mockResolvedValue(mockTxResponse);

      (decryptContent as Mock).mockResolvedValue({
        result: {
          value: '0xtxhash...',
        },
      } as RPCResponse);

      // Act
      const result = await signer.request(txRequest);

      // Assert
      expect(result).toBe('0xtxhash...');
      expect(mockCommunicator.postRequestAndWaitForResponse).toHaveBeenCalled();
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

    it('should handle wallet_getCapabilities request', async () => {
      // Arrange
      const capabilitiesRequest: RequestArguments = {
        method: 'wallet_getCapabilities',
        params: ['0x1234567890123456789012345678901234567890'],
      };

      vi.spyOn(store, 'getState').mockReturnValue({
        account: {
          accounts: ['0x1234567890123456789012345678901234567890'],
          chain: { id: 1 },
          capabilities: {
            '0x1': { paymasterService: { supported: true } },
            '0x89': { atomicBatch: { supported: true } },
          },
        },
        chains: [{ id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' }],
        config: { metadata: mockMetadata, version: '1.0.0' },
        keys: {},
      });

      // Act
      const result = await signer.request(capabilitiesRequest);

      // Assert
      expect(result).toEqual({
        '0x1': { paymasterService: { supported: true } },
        '0x89': { atomicBatch: { supported: true } },
      });
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
      });

      (fetchRPCRequest as Mock).mockResolvedValue('0x1000');

      // Act
      const result = await signer.request(rpcRequest);

      // Assert
      expect(result).toBe('0x1000');
      expect(fetchRPCRequest).toHaveBeenCalledWith(
        rpcRequest,
        'https://eth-mainnet.rpc.com'
      );
    });

    it('should throw unauthorized error for unauthenticated requests', async () => {
      // Arrange - Create new signer without handshake
      const unauthenticatedSigner = new JAWSigner({
        metadata: mockMetadata,
        communicator: mockCommunicator,
        callback: mockCallback,
      });

      const request: RequestArguments = {
        method: 'personal_sign',
        params: ['0x48656c6c6f', '0x1234567890123456789012345678901234567890'],
      };

      // Act & Assert
      await expect(unauthenticatedSigner.request(request)).rejects.toThrow();
    });

    it('should handle error response from popup', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'personal_sign',
        params: ['0x48656c6c6f', '0x1234567890123456789012345678901234567890'],
      };

      const mockErrorResponse: RPCResponseMessage = {
        id: mockMessageId,
        requestId: mockMessageId,
        correlationId: mockCorrelationId,
        sender: 'peer-public-key-hex',
        content: {
          encrypted: mockEncryptedData,
        },
        timestamp: new Date(),
      };

      mockCommunicator.postRequestAndWaitForResponse.mockResolvedValue(mockErrorResponse);

      (decryptContent as Mock).mockResolvedValue({
        result: {
          error: {
            code: 4001,
            message: 'User rejected request',
          },
        },
      });

      // Act & Assert
      await expect(signer.request(request)).rejects.toMatchObject({
        code: 4001,
        message: 'User rejected request',
      });
    });
  });

  describe('Cleanup', () => {
    it('should cleanup all resources', async () => {
      // Act
      await signer.cleanup();

      // Assert
      expect(store.account.clear).toHaveBeenCalled();
      expect(store.chains.clear).toHaveBeenCalled();
    });
  });

  describe('Integration: Handshake -> Request -> Cleanup', () => {
    it('should complete full flow successfully', async () => {
      // Step 1: Handshake
      const handshakeRequest: RequestArguments = {
        method: 'wallet_connect',
        params: [{ version: '1.0', capabilities: {} }],
      };

      const mockHandshakeResponse: RPCResponseMessage = {
        id: mockMessageId,
        requestId: mockMessageId,
        correlationId: mockCorrelationId,
        sender: 'peer-public-key-hex',
        content: {
          encrypted: mockEncryptedData,
        },
        timestamp: new Date(),
      };

      mockCommunicator.postRequestAndWaitForResponse.mockResolvedValue(mockHandshakeResponse);

      (decryptContent as Mock).mockResolvedValue({
        result: {
          value: {
            accounts: [
              { address: '0x1234567890123456789012345678901234567890' },
            ],
          },
        },
        data: {
          chains: {
            1: 'https://eth-mainnet.rpc.com',
          },
        },
      } as RPCResponse);

      await signer.handshake(handshakeRequest);

      // Step 2: Make request
      const accountsRequest: RequestArguments = {
        method: 'eth_accounts',
      };

      const accounts = await signer.request(accountsRequest);
      expect(accounts).toEqual(['0x1234567890123456789012345678901234567890']);

      // Step 3: Cleanup
      await signer.cleanup();

      expect(store.account.clear).toHaveBeenCalled();
      expect(store.chains.clear).toHaveBeenCalled();
    });
  });
});
