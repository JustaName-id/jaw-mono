import { describe, it, expect, vi, beforeEach, afterEach, Mock, Mocked } from 'vitest';
import { JAWSigner } from './JAWSigner.js';
import { Communicator } from '../communicator/index.js';
import { KeyManager } from '../key-manager/index.js';
import { store } from '../store/index.js';
import type { AppMetadata, ProviderEventCallback, RequestArguments } from '../provider/interface.js';
import type { RPCResponseMessage, RPCResponse, RPCRequestMessage } from '../messages/index.js';
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

vi.mock('./utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./utils.js')>();
  return {
    ...actual,
    clearSignerType: vi.fn(),
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
      defaultChainId: 1,
    };

    // Setup mock communicator
    mockCommunicator = new Communicator({
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
            1: { id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' },
            137: { id: 137, rpcUrl: 'https://polygon-mainnet.rpc.com' },
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
            1: { id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' },
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
            1: { id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' },
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
            '0x89': { atomicBatch: { status: 'supported' } },
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
        '0x89': { atomicBatch: { status: 'supported' } },
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
            1: { id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' },
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
    });
  });

  describe('eth_requestAccounts Flow', () => {
    it('should trigger wallet_connect automatically when unauthenticated', async () => {
      // Arrange - Create new signer without handshake
      const unauthenticatedSigner = new JAWSigner({
        metadata: mockMetadata,
        communicator: mockCommunicator,
        callback: mockCallback,
      });

      const mockWalletConnectResponse: RPCResponseMessage = {
        id: mockMessageId,
        requestId: mockMessageId,
        correlationId: mockCorrelationId,
        sender: 'peer-public-key-hex',
        content: {
          encrypted: mockEncryptedData,
        },
        timestamp: new Date(),
      };

      mockCommunicator.postRequestAndWaitForResponse.mockResolvedValue(mockWalletConnectResponse);

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
            1: { id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' },
          },
        },
      } as RPCResponse);

      // Act
      const result = await unauthenticatedSigner.request({
        method: 'eth_requestAccounts',
      });

      // Assert
      expect(result).toEqual(['0x1234567890123456789012345678901234567890']);
      expect(mockCommunicator.waitForPopupLoaded).toHaveBeenCalled();
      expect(mockCommunicator.postRequestAndWaitForResponse).toHaveBeenCalled();
    });

    it('should trigger accountsChanged callback after eth_requestAccounts', async () => {
      // Arrange - Create new signer without handshake
      const unauthenticatedSigner = new JAWSigner({
        metadata: mockMetadata,
        communicator: mockCommunicator,
        callback: mockCallback,
      });

      const mockWalletConnectResponse: RPCResponseMessage = {
        id: mockMessageId,
        requestId: mockMessageId,
        correlationId: mockCorrelationId,
        sender: 'peer-public-key-hex',
        content: {
          encrypted: mockEncryptedData,
        },
        timestamp: new Date(),
      };

      mockCommunicator.postRequestAndWaitForResponse.mockResolvedValue(mockWalletConnectResponse);

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
            1: { id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' },
          },
        },
      } as RPCResponse);

      // Act
      await unauthenticatedSigner.request({
        method: 'eth_requestAccounts',
      });

      // Assert
      expect(mockCallback).toHaveBeenCalledWith('accountsChanged', ['0x1234567890123456789012345678901234567890']);
    });
  });

  describe('Simple RPC Methods', () => {
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
            1: { id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' },
          },
        },
      } as RPCResponse);

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

  describe('Error Handling: Critical Paths', () => {
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
            1: { id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' },
          },
        },
      } as RPCResponse);

      await signer.handshake(handshakeRequest);

      // Reset mock call history
      vi.clearAllMocks();
    });

    it('should throw error when forwarding to RPC without rpcUrl', async () => {
      // Arrange - Create new signer with chain that has no rpcUrl
      const signerWithNoRpc = new JAWSigner({
        metadata: mockMetadata,
        communicator: mockCommunicator,
        callback: mockCallback,
      });

      // Set up authenticated state but with no rpcUrl
      vi.spyOn(store, 'getState').mockReturnValue({
        account: {
          accounts: ['0x1234567890123456789012345678901234567890'],
          chain: { id: 1 }, // No rpcUrl
          capabilities: undefined,
        },
        chains: [{ id: 1 }], // No rpcUrl in chains either
        config: { metadata: mockMetadata, version: '1.0.0' },
        keys: {},
      });

      // Manually set authenticated state for the signer
      (signerWithNoRpc as any).accounts = ['0x1234567890123456789012345678901234567890'];
      (signerWithNoRpc as any).chain = { id: 1 }; // No rpcUrl

      const rpcRequest: RequestArguments = {
        method: 'eth_getBalance',
        params: ['0x1234567890123456789012345678901234567890', 'latest'],
      };

      // Act & Assert
      await expect(signerWithNoRpc.request(rpcRequest)).rejects.toThrow('No RPC URL set for chain');
    });

    it('should throw error when encrypting without shared secret', async () => {
      // Arrange
      mockKeyManager.getSharedSecret.mockResolvedValue(null);

      const request: RequestArguments = {
        method: 'personal_sign',
        params: ['0x48656c6c6f', '0x1234567890123456789012345678901234567890'],
      };

      // Act & Assert
      await expect(signer.request(request)).rejects.toThrow('No shared secret found when encrypting request');
    });

    it('should throw error when decrypting without shared secret', async () => {
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

      // Mock shared secret to be null on decrypt (but present on encrypt)
      let encryptCallCount = 0;
      mockKeyManager.getSharedSecret.mockImplementation(async () => {
        encryptCallCount++;
        return encryptCallCount === 1 ? mockCryptoKey : null;
      });

      // Act & Assert
      await expect(signer.request(request)).rejects.toThrow('Invalid session: no shared secret found when decrypting response');
    });
  });

  describe('wallet_connect Caching', () => {
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
            1: { id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' },
          },
        },
      } as RPCResponse);

      await signer.handshake(handshakeRequest);

      // Reset mock call history
      vi.clearAllMocks();
    });

    it('should return cached wallet_connect response if available', async () => {
      // Arrange
      vi.spyOn(store.account, 'get').mockReturnValue({
        accounts: ['0x1234567890123456789012345678901234567890'],
        chain: { id: 1 },
        capabilities: undefined,
      });

      const request: RequestArguments = {
        method: 'wallet_connect',
        params: [{ version: '1.0', capabilities: {} }],
      };

      // Act
      const result = await signer.request(request);

      // Assert
      expect(result).toEqual({
        accounts: [
          {
            address: '0x1234567890123456789012345678901234567890',
            capabilities: {},
          },
        ],
      });
      expect(mockCommunicator.postRequestAndWaitForResponse).not.toHaveBeenCalled();
    });

    it('should trigger connect callback when wallet_connect is not cached', async () => {
      // Arrange - Mock store to return undefined accounts (no cache)
      // Note: empty array [] is truthy, so getCachedWalletConnectResponse needs undefined
      vi.spyOn(store.account, 'get').mockReturnValue({
        accounts: undefined,
        chain: undefined,
        capabilities: undefined,
      });

      // Clear previous callback calls from beforeEach handshake
      vi.mocked(mockCallback).mockClear();

      const mockWalletConnectResponse: RPCResponseMessage = {
        id: mockMessageId,
        requestId: mockMessageId,
        correlationId: mockCorrelationId,
        sender: 'peer-public-key-hex',
        content: {
          encrypted: mockEncryptedData,
        },
        timestamp: new Date(),
      };

      mockCommunicator.postRequestAndWaitForResponse.mockResolvedValue(mockWalletConnectResponse);

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
            1: { id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' },
          },
        },
      } as RPCResponse);

      const request: RequestArguments = {
        method: 'wallet_connect',
        params: [{ version: '1.0', capabilities: {} }],
      };

      // Act
      await signer.request(request);

      // Assert
      expect(mockCallback).toHaveBeenCalledWith('connect', { chainId: '0x1' });
    });
  });

  describe('Unauthenticated Scenarios', () => {
    it('should allow wallet_switchEthereumChain when unauthenticated if chain is supported', async () => {
      // Arrange - Create new signer without handshake
      const unauthenticatedSigner = new JAWSigner({
        metadata: mockMetadata,
        communicator: mockCommunicator,
        callback: mockCallback,
      });

      // Mock store with supported chains
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
      });

      const request: RequestArguments = {
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x89' }],
      };

      // Act
      const result = await unauthenticatedSigner.request(request);

      // Assert - Should not throw and should update local chain
      expect(result).toBeUndefined();
    });

    it('should allow wallet_sendCalls when unauthenticated', async () => {
      // Arrange - Create new signer without handshake
      const unauthenticatedSigner = new JAWSigner({
        metadata: mockMetadata,
        communicator: mockCommunicator,
        callback: mockCallback,
      });

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
          value: '0xbatchId',
        },
      } as RPCResponse);

      const request: RequestArguments = {
        method: 'wallet_sendCalls',
        params: [{ calls: [] }],
      };

      // Act
      const result = await unauthenticatedSigner.request(request);

      // Assert
      expect(result).toBe('0xbatchId');
      expect(mockCommunicator.waitForPopupLoaded).toHaveBeenCalled();
    });

    it('should allow wallet_sign when unauthenticated', async () => {
      // Arrange - Create new signer without handshake
      const unauthenticatedSigner = new JAWSigner({
        metadata: mockMetadata,
        communicator: mockCommunicator,
        callback: mockCallback,
      });

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
          value: '0xsignature',
        },
      } as RPCResponse);

      const request: RequestArguments = {
        method: 'wallet_sign',
        params: ['0x1234567890123456789012345678901234567890', '0x48656c6c6f'],
      };

      // Act
      const result = await unauthenticatedSigner.request(request);

      // Assert
      expect(result).toBe('0xsignature');
      expect(mockCommunicator.waitForPopupLoaded).toHaveBeenCalled();
    });

    it('should allow wallet_connect when unauthenticated', async () => {
      // Arrange - Create new signer without handshake
      const unauthenticatedSigner = new JAWSigner({
        metadata: mockMetadata,
        communicator: mockCommunicator,
        callback: mockCallback,
      });

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
            1: { id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' },
          },
        },
      } as RPCResponse);

      const request: RequestArguments = {
        method: 'wallet_connect',
        params: [{ version: '1.0', capabilities: {} }],
      };

      // Act
      const result = await unauthenticatedSigner.request(request);

      // Assert
      expect(result).toEqual({
        accounts: [
          { address: '0x1234567890123456789012345678901234567890' },
        ],
      });
      expect(mockCommunicator.waitForPopupLoaded).toHaveBeenCalled();
    });
  });

  describe('wallet_getCapabilities Edge Cases', () => {
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
            1: { id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' },
          },
        },
      } as RPCResponse);

      await signer.handshake(handshakeRequest);

      // Reset mock call history
      vi.clearAllMocks();
    });

    it('should throw unauthorized for non-owned account', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_getCapabilities',
        params: ['0x0987654321098765432109876543210987654321'], // Different account
      };

      vi.spyOn(store, 'getState').mockReturnValue({
        account: {
          accounts: ['0x1234567890123456789012345678901234567890'],
          chain: { id: 1 },
          capabilities: {
            '0x1': { paymasterService: { supported: true } },
          },
        },
        chains: [{ id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' }],
        config: { metadata: mockMetadata, version: '1.0.0' },
        keys: {},
      });

      // Act & Assert
      await expect(signer.request(request)).rejects.toThrow('no active account found when getting capabilities');
    });

    it('should return SDK capabilities when wallet capabilities undefined', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_getCapabilities',
        params: ['0x1234567890123456789012345678901234567890'],
      };

      vi.spyOn(store, 'getState').mockReturnValue({
        account: {
          accounts: ['0x1234567890123456789012345678901234567890'],
          chain: { id: 1 },
          capabilities: undefined,
        },
        chains: [{ id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' }],
        config: { metadata: mockMetadata, version: '1.0.0' },
        keys: {},
      });

      // Act
      const result = await signer.request(request);

      // Assert
      // Should return SDK-generated capabilities based on configured chains
      expect(result).toEqual({
        '0x1': { atomicBatch: { status: 'supported' } },
      });
    });

    it('should include paymasterService when chain has paymasterUrl', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_getCapabilities',
        params: ['0x1234567890123456789012345678901234567890'],
      };

      vi.spyOn(store, 'getState').mockReturnValue({
        account: {
          accounts: ['0x1234567890123456789012345678901234567890'],
          chain: { id: 1 },
          capabilities: undefined,
        },
        chains: [
          { id: 1, rpcUrl: 'https://eth-mainnet.rpc.com', paymasterUrl: 'https://paymaster.example.com' },
          { id: 137, rpcUrl: 'https://polygon-mainnet.rpc.com' },
        ],
        config: { metadata: mockMetadata, version: '1.0.0' },
        keys: {},
      });

      // Act
      const result = await signer.request(request);

      // Assert
      // Should include paymasterService for chain 1 (has paymasterUrl)
      // Should NOT include paymasterService for chain 137 (no paymasterUrl)
      expect(result).toEqual({
        '0x1': {
          atomicBatch: { status: 'supported' },
          paymasterService: { supported: true }
        },
        '0x89': {
          atomicBatch: { status: 'supported' }
        },
      });
    });

    it('should filter capabilities by chainIds parameter', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_getCapabilities',
        params: ['0x1234567890123456789012345678901234567890', ['0x1']], // Only request chain 1
      };

      vi.spyOn(store, 'getState').mockReturnValue({
        account: {
          accounts: ['0x1234567890123456789012345678901234567890'],
          chain: { id: 1 },
          capabilities: {
            '0x1': { paymasterService: { supported: true } },
            '0x89': { atomicBatch: { status: 'supported' } },
            '0xa': { otherFeature: { supported: true } },
          },
        },
        chains: [{ id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' }],
        config: { metadata: mockMetadata, version: '1.0.0' },
        keys: {},
      });

      // Act
      const result = await signer.request(request);

      // Assert
      expect(result).toEqual({
        '0x1': { paymasterService: { supported: true } },
      });
    });

    it('should filter capabilities by multiple chainIds', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_getCapabilities',
        params: ['0x1234567890123456789012345678901234567890', ['0x1', '0x89']],
      };

      vi.spyOn(store, 'getState').mockReturnValue({
        account: {
          accounts: ['0x1234567890123456789012345678901234567890'],
          chain: { id: 1 },
          capabilities: {
            '0x1': { paymasterService: { supported: true } },
            '0x89': { atomicBatch: { status: 'supported' } },
            '0xa': { otherFeature: { supported: true } },
          },
        },
        chains: [{ id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' }],
        config: { metadata: mockMetadata, version: '1.0.0' },
        keys: {},
      });

      // Act
      const result = await signer.request(request);

      // Assert
      expect(result).toEqual({
        '0x1': { paymasterService: { supported: true } },
        '0x89': { atomicBatch: { status: 'supported' } },
      });
    });
  });

  describe('Chain & Capabilities Updates', () => {
    it('should update capabilities from response data', async () => {
      // Arrange - Create new signer without handshake
      const unauthenticatedSigner = new JAWSigner({
        metadata: mockMetadata,
        communicator: mockCommunicator,
        callback: mockCallback,
      });

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
            1: { id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' },
            137: { id: 137, rpcUrl: 'https://polygon-mainnet.rpc.com' },
          },
          capabilities: {
            '0x1': { paymasterService: { supported: true } },
          },
        },
      } as RPCResponse);

      const request: RequestArguments = {
        method: 'wallet_connect',
        params: [{ version: '1.0', capabilities: {} }],
      };

      // Act
      await unauthenticatedSigner.request(request);

      // Assert - chains are no longer stored from response data
      expect(store.chains.set).not.toHaveBeenCalled();
      expect(store.account.set).toHaveBeenCalledWith({
        capabilities: {
          '0x1': { paymasterService: { supported: true } },
        },
      });
    });

    it('should not store chains from response data', async () => {
      // Arrange - Create new signer without handshake
      const unauthenticatedSigner = new JAWSigner({
        metadata: mockMetadata,
        communicator: mockCommunicator,
        callback: mockCallback,
      });

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
            1: { id: 1, rpcUrl: 'https://eth-mainnet.rpc.com', nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimal: 18 } },
            137: { id: 137, rpcUrl: 'https://polygon-mainnet.rpc.com', nativeCurrency: { name: 'Polygon', symbol: 'MATIC', decimal: 18 } },
          },
        },
      } as RPCResponse);

      const request: RequestArguments = {
        method: 'wallet_connect',
        params: [{ version: '1.0', capabilities: {} }],
      };

      // Act
      await unauthenticatedSigner.request(request);

      // Assert - chains are no longer stored from response data
      expect(store.chains.set).not.toHaveBeenCalled();
    });
  });

  describe('updateChain Edge Cases', () => {
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
            1: { id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' },
            137: { id: 137, rpcUrl: 'https://polygon-mainnet.rpc.com' },
          },
        },
      } as RPCResponse);

      await signer.handshake(handshakeRequest);

      // Reset mock call history
      vi.clearAllMocks();
    });

    it('should throw error when chain not found in available chains', async () => {
      // Arrange
      const switchRequest: RequestArguments = {
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x2a' }], // Chain 42 (not in available chains)
      };

      vi.spyOn(store, 'getState').mockReturnValue({
        account: {
          accounts: ['0x1234567890123456789012345678901234567890'],
          chain: { id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' },
          capabilities: undefined,
        },
        chains: [
          { id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' },
          { id: 137, rpcUrl: 'https://polygon-mainnet.rpc.com' },
        ],
        config: { metadata: mockMetadata, version: '1.0.0' },
        keys: {},
      });

      // Act & Assert
      try {
        await signer.request(switchRequest);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe(4200);
        expect(error.message).toContain('wallet_switchEthereumChain');
        expect(error.message).toContain('42');
      }
      expect(mockCommunicator.postRequestAndWaitForResponse).not.toHaveBeenCalled();
    });

    it('should not trigger chainChanged callback if chain is already current', async () => {
      // Arrange
      const switchRequest: RequestArguments = {
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x1' }], // Already on chain 1
      };

      const currentChain = { id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' };

      // Set the signer's internal chain to the same object reference
      (signer as any).chain = currentChain;

      vi.spyOn(store, 'getState').mockReturnValue({
        account: {
          accounts: ['0x1234567890123456789012345678901234567890'],
          chain: currentChain,
          capabilities: undefined,
        },
        chains: [
          currentChain,
          { id: 137, rpcUrl: 'https://polygon-mainnet.rpc.com' },
        ],
        config: { metadata: mockMetadata, version: '1.0.0' },
        keys: {},
      });

      // Clear previous callback calls from beforeEach
      vi.mocked(mockCallback).mockClear();

      // Act
      const result = await signer.request(switchRequest);

      // Assert
      expect(result).toBeNull();
      expect(mockCallback).not.toHaveBeenCalled();
    });

    it('should not update chains when receiving chain data in responses', async () => {
      // Arrange
      // Mock current state with different chains
      vi.spyOn(store, 'getState').mockReturnValue({
        account: {
          accounts: ['0x1234567890123456789012345678901234567890'],
          chain: { id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' },
          capabilities: undefined,
        },
        chains: [
          { id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' },
          { id: 137, rpcUrl: 'https://polygon-mainnet.rpc.com' },
        ],
        config: { metadata: mockMetadata, version: '1.0.0' },
        keys: {},
      });

      // Clear previous callback calls
      vi.mocked(mockCallback).mockClear();

      // Act - Call updateChain through decryptResponseMessage by making a request
      const request: RequestArguments = {
        method: 'personal_sign',
        params: ['0x48656c6c6f', '0x1234567890123456789012345678901234567890'],
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
          value: '0xsignature',
        },
        data: {
          chains: {
            1: { id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' },
            10: { id: 10, rpcUrl: 'https://optimism-mainnet.rpc.com' },
          },
        },
      } as RPCResponse);

      await signer.request(request);

      // Assert - chains are no longer stored from response data
      expect(store.chains.set).not.toHaveBeenCalled();
    });
  });

  describe('handleResponse Default Case', () => {
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
            1: { id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' },
          },
        },
      } as RPCResponse);

      await signer.handshake(handshakeRequest);

      // Reset mock call history
      vi.clearAllMocks();
    });

    it('should return result value for eth_signTypedData_v4', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'eth_signTypedData_v4',
        params: ['0x1234567890123456789012345678901234567890', '{"types":{}}'],
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
          value: '0xsignature123',
        },
      } as RPCResponse);

      // Act
      const result = await signer.request(request);

      // Assert
      expect(result).toBe('0xsignature123');
      expect(store.account.set).not.toHaveBeenCalled(); // Should not update accounts
    });

    it('should throw unsupported method error for wallet_addEthereumChain', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_addEthereumChain',
        params: [{ chainId: '0xa', rpcUrls: ['https://optimism.rpc.com'] }],
      };

      // Act & Assert
      await expect(signer.request(request)).rejects.toMatchObject({
        code: 4200,
        message: 'The requested method is not supported by this Ethereum provider.',
      });
      expect(store.account.set).not.toHaveBeenCalled(); // Should not update accounts
    });

    it('should throw unsupported method error for wallet_watchAsset', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'wallet_watchAsset',
        params: [{
          type: 'ERC20',
          options: {
            address: '0xtoken',
            symbol: 'TKN',
            decimals: 18,
          },
        }],
      };

      // Act & Assert
      await expect(signer.request(request)).rejects.toMatchObject({
        code: 4200,
        message: 'The requested method is not supported by this Ethereum provider.',
      });
      expect(store.account.set).not.toHaveBeenCalled();
    });
  });

  describe('decryptResponseMessage Edge Cases', () => {
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
            1: { id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' },
          },
        },
      } as RPCResponse);

      await signer.handshake(handshakeRequest);

      // Reset mock call history
      vi.clearAllMocks();
    });

    it('should handle response without chains data', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'personal_sign',
        params: ['0x48656c6c6f', '0x1234567890123456789012345678901234567890'],
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
          value: '0xsignature',
        },
        data: undefined, // No data
      } as RPCResponse);

      // Act
      const result = await signer.request(request);

      // Assert
      expect(result).toBe('0xsignature');
      expect(store.chains.set).not.toHaveBeenCalled();
    });

    it('should handle response without capabilities data', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'personal_sign',
        params: ['0x48656c6c6f', '0x1234567890123456789012345678901234567890'],
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
          value: '0xsignature',
        },
        data: {
          chains: {
            1: { id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' },
          },
          // No capabilities
        },
      } as RPCResponse);

      // Act
      const result = await signer.request(request);

      // Assert
      expect(result).toBe('0xsignature');
      expect(store.account.set).not.toHaveBeenCalledWith(
        expect.objectContaining({ capabilities: expect.anything() })
      );
    });

    it('should handle response with empty data object', async () => {
      // Arrange
      const request: RequestArguments = {
        method: 'personal_sign',
        params: ['0x48656c6c6f', '0x1234567890123456789012345678901234567890'],
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
          value: '0xsignature',
        },
        data: {}, // Empty data object
      } as RPCResponse);

      // Act
      const result = await signer.request(request);

      // Assert
      expect(result).toBe('0xsignature');
      expect(store.chains.set).not.toHaveBeenCalled();
    });
  });

  describe('Constructor Initialization', () => {
    it('should initialize with accounts from store', () => {
      // Arrange
      vi.spyOn(store, 'getState').mockReturnValue({
        account: {
          accounts: ['0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222'],
          chain: { id: 137, rpcUrl: 'https://polygon.rpc.com' },
          capabilities: undefined,
        },
        chains: [{ id: 137, rpcUrl: 'https://polygon.rpc.com' }],
        config: { metadata: mockMetadata, version: '1.0.0' },
        keys: {},
      });

      // Act
      const newSigner = new JAWSigner({
        metadata: mockMetadata,
        communicator: mockCommunicator,
        callback: mockCallback,
      });

      // Assert
      expect((newSigner as any).accounts).toEqual([
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222',
      ]);
      expect((newSigner as any).chain).toEqual({ id: 137, rpcUrl: 'https://polygon.rpc.com' });
    });

    it('should initialize with default chain when no accounts in store', () => {
      // Arrange
      vi.spyOn(store, 'getState').mockReturnValue({
        account: {
          accounts: undefined,
          chain: undefined,
          capabilities: undefined,
        },
        chains: [],
        config: { metadata: mockMetadata, version: '1.0.0' },
        keys: {},
      });

      const metadata: AppMetadata = {
        appName: 'Test App',
        appLogoUrl: 'https://test.com/logo.png',
        defaultChainId: 42,
      };

      // Act
      const newSigner = new JAWSigner({
        metadata,
        communicator: mockCommunicator,
        callback: mockCallback,
      });

      // Assert
      expect((newSigner as any).accounts).toEqual([]);
      expect((newSigner as any).chain).toEqual({ id: 42 }); // From defaultChainId
    });

    it('should initialize with chain 1 when no defaultChainId provided', () => {
      // Arrange
      vi.spyOn(store, 'getState').mockReturnValue({
        account: {
          accounts: undefined,
          chain: undefined,
          capabilities: undefined,
        },
        chains: [],
        config: { metadata: mockMetadata, version: '1.0.0' },
        keys: {},
      });

      const metadata: AppMetadata = {
        appName: 'Test App',
        appLogoUrl: 'https://test.com/logo.png',
        // No defaultChainId provided - should default to chain 1
      };

      // Act
      const newSigner = new JAWSigner({
        metadata,
        communicator: mockCommunicator,
        callback: mockCallback,
      });

      // Assert
      expect((newSigner as any).chain).toEqual({ id: 1 }); // Default to chain 1
    });
  });

  describe('createRequestMessage Structure', () => {
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
            1: { id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' },
          },
        },
      } as RPCResponse);

      await signer.handshake(handshakeRequest);

      // Reset mock call history
      vi.clearAllMocks();
    });

    it('should create request message with correlationId', async () => {
      // Arrange
      const testCorrelationId = 'test-correlation-123';
      vi.spyOn(correlationIds, 'get').mockReturnValue(testCorrelationId);

      const request: RequestArguments = {
        method: 'personal_sign',
        params: ['0x48656c6c6f', '0x1234567890123456789012345678901234567890'],
      };

      const mockResponse: RPCResponseMessage = {
        id: mockMessageId,
        requestId: mockMessageId,
        correlationId: testCorrelationId,
        sender: 'peer-public-key-hex',
        content: {
          encrypted: mockEncryptedData,
        },
        timestamp: new Date(),
      };

      mockCommunicator.postRequestAndWaitForResponse.mockResolvedValue(mockResponse);

      (decryptContent as Mock).mockResolvedValue({
        result: {
          value: '0xsignature',
        },
      } as RPCResponse);

      // Act
      await signer.request(request);

      // Assert
      const sentMessage = mockCommunicator.postRequestAndWaitForResponse.mock.calls[0][0] as RPCRequestMessage;
      expect(sentMessage.correlationId).toBe(testCorrelationId);
      expect(sentMessage.sender).toBe('mock-public-key-hex');
      expect(sentMessage.id).toBeDefined();
      expect(sentMessage.timestamp).toBeInstanceOf(Date);
      expect(sentMessage.content).toHaveProperty('encrypted');
    });

    it('should create handshake message with proper structure', async () => {
      // Arrange
      const newSigner = new JAWSigner({
        metadata: mockMetadata,
        communicator: mockCommunicator,
        callback: mockCallback,
      });

      const testCorrelationId = 'handshake-correlation-456';
      vi.spyOn(correlationIds, 'get').mockReturnValue(testCorrelationId);

      const handshakeRequest: RequestArguments = {
        method: 'wallet_connect',
        params: [{ version: '1.0', capabilities: {} }],
      };

      const mockHandshakeResponse: RPCResponseMessage = {
        id: mockMessageId,
        requestId: mockMessageId,
        correlationId: testCorrelationId,
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
            1: { id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' },
          },
        },
      } as RPCResponse);

      // Act
      await newSigner.handshake(handshakeRequest);

      // Assert
      const sentMessage = mockCommunicator.postRequestAndWaitForResponse.mock.calls[0][0] as RPCRequestMessage;
      expect(sentMessage.correlationId).toBe(testCorrelationId);
      expect(sentMessage.sender).toBe('mock-public-key-hex');
      expect(sentMessage.id).toBeDefined();
      expect(sentMessage.timestamp).toBeInstanceOf(Date);
      expect(sentMessage.content).toHaveProperty('handshake');
      expect((sentMessage.content as any).handshake.method).toBe('wallet_connect');
    });
  });

  describe('sendEncryptedRequest Structure', () => {
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
            1: { id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' },
          },
        },
      } as RPCResponse);

      await signer.handshake(handshakeRequest);

      // Reset mock call history
      vi.clearAllMocks();
    });

    it('should encrypt request with action and chainId', async () => {
      // Arrange
      // Mock store to have chains with rpcUrl
      vi.spyOn(store, 'getState').mockReturnValue({
        account: {
          accounts: ['0x1234567890123456789012345678901234567890'],
          chain: { id: 1 },
          capabilities: undefined,
        },
        chains: [
          { id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' },
        ],
        config: { metadata: mockMetadata, version: '1.0.0' },
        keys: {},
      });

      const request: RequestArguments = {
        method: 'personal_sign',
        params: ['0x48656c6c6f', '0x1234567890123456789012345678901234567890'],
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
          value: '0xsignature',
        },
      } as RPCResponse);

      // Act
      await signer.request(request);

      // Assert
      expect(encryptContent).toHaveBeenCalledWith(
        {
          action: request,
          chain: {
            id: 1,
            rpcUrl: 'https://eth-mainnet.rpc.com',
          },
        },
        mockCryptoKey
      );
    });

    it('should include current chainId in encrypted content', async () => {
      // Arrange - Switch to a different chain first
      vi.spyOn(store, 'getState').mockReturnValue({
        account: {
          accounts: ['0x1234567890123456789012345678901234567890'],
          chain: { id: 137, rpcUrl: 'https://polygon.rpc.com' },
          capabilities: undefined,
        },
        chains: [
          { id: 1, rpcUrl: 'https://eth-mainnet.rpc.com' },
          { id: 137, rpcUrl: 'https://polygon.rpc.com' },
        ],
        config: { metadata: mockMetadata, version: '1.0.0' },
        keys: {},
      });

      await signer.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x89' }],
      });

      vi.clearAllMocks();

      const request: RequestArguments = {
        method: 'eth_sendTransaction',
        params: [{ from: '0x1234567890123456789012345678901234567890', to: '0x0987654321098765432109876543210987654321', value: '0x100' }],
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
          value: '0xtxhash',
        },
      } as RPCResponse);

      // Act
      await signer.request(request);

      // Assert
      expect(encryptContent).toHaveBeenCalledWith(
        {
          action: request,
          chain: {
            id: 137,
            rpcUrl: 'https://polygon.rpc.com',
          }, // Should use the switched chain
        },
        mockCryptoKey
      );
    });
  });
});
