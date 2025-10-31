
import {
  KeyManager,
  encryptContent,
  decryptContent,
  exportKeyToHexString,
  importKeyFromHexString,
} from '@jaw.id/core';
// import type { RPCRequest, RPCResponse, DecryptedRequest, EncryptedContent } from './sdk-types';
import type { RPCResponseMessage , RPCRequestMessage ,RPCRequest, MessageID} from '@jaw.id/core';

// Local Chain type matching the core's Chain interface
type Chain = {
  id: number;
  rpcUrl?: string;
  nativeCurrency?: {
    name?: string;
    symbol?: string;
    decimal?: number;
  };
  paymasterUrl?: string;
};


export class CryptoHandler {
  private keyManager: KeyManager; 
  private peerPublicKeyHex: string | null = null;
  private ownPublicKeyHex: string | null = null;

  constructor() {
    // KeyManager automatically handles localStorage persistence
    this.keyManager = new KeyManager();
  }

  /**
   * Initialize the crypto handler (lazy-load own public key)
   */
  async initialize(): Promise<void> {
    console.log('🔑 Initializing CryptoHandler...');
    try {
      // Get own public key (triggers KeyManager initialization)
      const ownPublicKey = await this.keyManager.getOwnPublicKey();
      this.ownPublicKeyHex = await exportKeyToHexString('public', ownPublicKey);
      console.log('✅ Own public key:', this.ownPublicKeyHex.slice(0, 20) + '...');
    } catch (error) {
      console.error('❌ Failed to initialize CryptoHandler:', error);
      throw error;
    }
  }

  /**
   * Process handshake request (unencrypted initial request)
   * Stores peer's public key and derives shared secret
   */
  async processHandshakeRequest(request: RPCRequestMessage): Promise<void> {
    console.log('🤝 Processing handshake request from:', request.sender.slice(0, 20) + '...');

    try {
      // Store peer's public key hex
      this.peerPublicKeyHex = request.sender;

      // Import peer's public key
      const peerPublicKey = await importKeyFromHexString('public', request.sender);

      // Set peer key - this triggers shared secret derivation and localStorage save
      await this.keyManager.setPeerPublicKey(peerPublicKey);

      console.log('✅ Handshake processed, shared secret derived and saved');
    } catch (error) {
      console.error('❌ Failed to process handshake:', error);
      throw error;
    }
  }

  /**
   * Restore shared secret from a message's sender field
   * Used for encrypted follow-up requests
   */
  async restoreSharedSecretFromMessage(request: RPCRequestMessage): Promise<void> {
    console.log('🔄 Restoring shared secret from message sender:', request.sender.slice(0, 20) + '...');

    try {
      // Import peer's public key from sender field
      const peerPublicKey = await importKeyFromHexString('public', request.sender);

      // Set it - KeyManager will restore shared secret from localStorage automatically
      await this.keyManager.setPeerPublicKey(peerPublicKey);

      console.log('✅ Shared secret restored from localStorage');
    } catch (error) {
      console.error('❌ Failed to restore shared secret:', error);
      throw error;
    }
  }

  /**
   * Create encrypted handshake response
   */
  async createHandshakeResponse(
    requestId: MessageID,
    accounts: string[]
  ): Promise<RPCResponseMessage> {
    console.log('📦 Creating handshake response for accounts:', accounts);

    try {
      const sharedSecret = await this.keyManager.getSharedSecret();
      if (!sharedSecret) {
        throw new Error('No shared secret available');
      }

      if (!this.ownPublicKeyHex || !this.peerPublicKeyHex) {
        throw new Error('Missing public keys');
      }

      // Create response data matching SDK expectations
      const chainsData: { [key: number]: Chain } = {
        1: { id: 1, rpcUrl: 'https://eth.drpc.org' },
        8453: { id: 8453, rpcUrl: 'https://base.drpc.org' },
        84532: { id: 84532, rpcUrl: 'https://base-sepolia.drpc.org' },
      };
      
      const responseData = {
        result: {
          value: {
            accounts: accounts.map((address) => ({ address })),
          },
        },
        data: {
          chains: chainsData,
          capabilities: {
            '0x1': {
              paymasterService: { supported: false },
              atomicBatch: { supported: false },
            },
            '0x2105': {
              paymasterService: { supported: true },
              atomicBatch: { supported: true },
            },
            '0x14a34': {
              paymasterService: { supported: true },
              atomicBatch: { supported: true },
            },
          },
        },
      };

      // Encrypt using @jaw.id/core
      const encrypted = await encryptContent(responseData, sharedSecret);

      const response: RPCResponseMessage = {
        requestId,
        id: crypto.randomUUID() as MessageID,
        sender: this.ownPublicKeyHex,
        correlationId: crypto.randomUUID(),
        content: {
          encrypted,
        },
        timestamp: new Date(),
      };

      console.log('✅ Handshake response created');
      return response;
    } catch (error) {
      console.error('❌ Failed to create handshake response:', error);
      throw error;
    }
  }

  /**
   * Decrypt an encrypted RPC request
   */
  async decryptRequest(request: RPCRequestMessage): Promise<RPCRequest> {
    console.log('🔓 Decrypting request...');

    try {
      const sharedSecret = await this.keyManager.getSharedSecret();
      if (!sharedSecret) {
        throw new Error('No shared secret available');
      }

      if (!('encrypted' in request.content)) {
        throw new Error('Request does not contain encrypted content');
      }

      // Decrypt using @jaw.id/core
      const decrypted = await decryptContent(request.content.encrypted, sharedSecret);

      console.log('✅ Request decrypted:', decrypted);
      return decrypted as RPCRequest;
    } catch (error) {
      console.error('❌ Failed to decrypt request:', error);
      throw error;
    }
  }

  /**
   * Create encrypted response for any RPC method
   */
  async createEncryptedResponse(
    requestId: MessageID,
    correlationId: string,
    result: unknown
  ): Promise<RPCResponseMessage> {
    console.log('📦 Creating encrypted response:', { requestId, result });

    try {
      const sharedSecret = await this.keyManager.getSharedSecret();
      if (!sharedSecret) {
        throw new Error('No shared secret available');
      }

      if (!this.ownPublicKeyHex) {
        throw new Error('Own public key not available');
      }

      // Create response payload
      const responseData = {
        result: {
          value: result,
        },
      };

      // Encrypt using @jaw.id/core
      const encrypted = await encryptContent(responseData, sharedSecret);

      const response: RPCResponseMessage = {
        requestId,
        id: crypto.randomUUID() as MessageID,
        sender: this.ownPublicKeyHex,
        correlationId,
        content: {
          encrypted,
        },
        timestamp: new Date(),
      };

      console.log('✅ Encrypted response created');
      return response;
    } catch (error) {
      console.error('❌ Failed to create encrypted response:', error);
      throw error;
    }
  }

  /**
   * Create encrypted error response for RPC methods
   */
  async createEncryptedErrorResponse(
    requestId: MessageID,
    correlationId: string,
    errorCode: number,
    errorMessage: string
  ): Promise<RPCResponseMessage> {
    console.log('📦 Creating encrypted error response:', { requestId, errorCode, errorMessage });

    try {
      const sharedSecret = await this.keyManager.getSharedSecret();
      if (!sharedSecret) {
        throw new Error('No shared secret available');
      }

      if (!this.ownPublicKeyHex) {
        throw new Error('Own public key not available');
      }

      // Create error response payload
      const responseData = {
        result: {
          error: {
            code: errorCode,
            message: errorMessage,
          },
        },
      };

      // Encrypt using @jaw.id/core
      const encrypted = await encryptContent(responseData, sharedSecret);

      const response: RPCResponseMessage = {
        requestId,
        id: crypto.randomUUID() as MessageID,
        sender: this.ownPublicKeyHex,
        correlationId,
        content: {
          encrypted,
        },
        timestamp: new Date(),
      };

      console.log('✅ Encrypted error response created');
      return response;
    } catch (error) {
      console.error('❌ Failed to create encrypted error response:', error);
      throw error;
    }
  }

  /**
   * Clear all stored keys
   * Called when starting a new session
   */
  async clear(): Promise<void> {
    console.log('🗑️ Clearing crypto handler...');

    try {
      await this.keyManager.clear();
      this.peerPublicKeyHex = null;
      this.ownPublicKeyHex = null;

      // Re-initialize with fresh keys
      await this.initialize();

      console.log('✅ Crypto handler cleared and re-initialized');
    } catch (error) {
      console.error('❌ Failed to clear crypto handler:', error);
      throw error;
    }
  }

  /**
   * Get own public key hex
   */
  getOwnPublicKeyHex(): string | null {
    return this.ownPublicKeyHex;
  }

  /**
   * Get peer public key hex
   */
  getPeerPublicKeyHex(): string | null {
    return this.peerPublicKeyHex;
  }
}
