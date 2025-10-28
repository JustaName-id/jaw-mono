import {
  KeyManager,
  encryptContent,
  decryptContent,
  exportKeyToHexString,
  importKeyFromHexString,
} from '@jaw.id/core';
import type { MessageID } from '@jaw.id/core';

export interface RPCRequestMessage {
  id: MessageID;
  correlationId?: string;
  sender: string; // hex encoded public key
  content: {
    handshake?: {
      method: string;
      params?: unknown[];
    };
  } | {
    encrypted: {
      iv: Uint8Array;
      cipherText: ArrayBuffer;
    };
  };
  timestamp: Date;
}

export interface RPCResponseMessage {
  id?: MessageID;
  requestId: MessageID;
  correlationId?: string;
  sender: string; // hex encoded public key
  content: {
    encrypted: {
      iv: Uint8Array;
      cipherText: ArrayBuffer;
    };
  } | {
    failure: {
      code: number;
      message: string;
    };
  };
  timestamp: Date;
}

export interface RPCResponse {
  result: {
    value: unknown;
  } | {
    error: {
      code: number;
      message: string;
    };
  };
  data?: {
    chains?: { [key: number]: string };
    capabilities?: Record<string, Record<string, unknown>>;
  };
}

/**
 * Handles cryptographic operations for the popup
 */
export class CryptoHandler {
  private keyManager: KeyManager;
  private peerPublicKeyHex: string | null = null;

  constructor() {
    this.keyManager = new KeyManager();
  }

  /**
   * Get own public key as hex string
   */
  async getOwnPublicKeyHex(): Promise<string> {
    const publicKey = await this.keyManager.getOwnPublicKey();
    return exportKeyToHexString('public', publicKey);
  }

  /**
   * Process handshake request and extract peer's public key
   */
  async processHandshakeRequest(request: RPCRequestMessage): Promise<void> {
    // Store peer's public key
    this.peerPublicKeyHex = request.sender;
    const peerPublicKey = await importKeyFromHexString('public', request.sender);
    await this.keyManager.setPeerPublicKey(peerPublicKey);

    console.log('Handshake processed, peer public key set');
  }

  /**
   * Restore shared secret from encrypted message for decryption
   */
  async restoreSharedSecretFromMessage(request: RPCRequestMessage): Promise<void> {
    console.log('[CryptoHandler] Restoring shared secret from sender:', request.sender.slice(0, 30) + '...');
    
    // Import peer's public key from the sender field
    const peerPublicKey = await importKeyFromHexString('public', request.sender);
    
    // Set it - this will trigger shared secret derivation
    await this.keyManager.setPeerPublicKey(peerPublicKey);
    
    // Verify we have a shared secret
    const sharedSecret = await this.keyManager.getSharedSecret();
    if (!sharedSecret) {
      throw new Error('Failed to derive shared secret');
    }
    
    console.log('[CryptoHandler] Shared secret restored successfully');
  }

  /**
   * Create encrypted response for handshake (wallet_connect)
   */
  async createHandshakeResponse(
    requestId: MessageID | string,
    accounts: string[]
  ): Promise<RPCResponseMessage> {
    const sharedSecret = await this.keyManager.getSharedSecret();
    if (!sharedSecret) {
      throw new Error('Shared secret not available');
    }

    // Create the response data in WalletConnectResponse format
    // wallet_connect expects: { accounts: [{ address: "0x..." }] }
    // Using dRPC endpoints - high performance RPC for dApps with excellent CORS support
    const responseData: RPCResponse = {
      result: {
        value: {
          accounts: accounts.map(address => ({ address })),
        },
      },
      data: {
        chains: {
          1: 'https://eth.drpc.org',
          137: 'https://polygon.drpc.org',
          8453: 'https://base.drpc.org',
        },
        capabilities: {
          '0x1': {  // Ethereum Mainnet
            paymasterService: { supported: false },
            sessionKeys: { supported: false },
          },
          '0x89': {  // Polygon
            paymasterService: { supported: false },
            sessionKeys: { supported: false },
          },
          '0x2105': {  // Base
            paymasterService: { supported: false },
            sessionKeys: { supported: false },
          },
        },
      },
    };

    // Encrypt the response
    const encrypted = await encryptContent(responseData, sharedSecret);

    // Get own public key
    const ownPublicKey = await this.keyManager.getOwnPublicKey();
    const ownPublicKeyHex = await exportKeyToHexString('public', ownPublicKey);

    return {
      requestId: requestId as MessageID,
      sender: ownPublicKeyHex,
      content: {
        encrypted,
      },
      timestamp: new Date(),
    };
  }

  /**
   * Decrypt incoming request
   */
  async decryptRequest(request: RPCRequestMessage): Promise<unknown> {
    const sharedSecret = await this.keyManager.getSharedSecret();
    if (!sharedSecret) {
      throw new Error('Shared secret not available');
    }

    if ('encrypted' in request.content) {
      return decryptContent(request.content.encrypted, sharedSecret);
    }

    return null;
  }

  /**
   * Create encrypted response for regular requests
   */
  async createEncryptedResponse(
    requestId: MessageID,
    responseData: unknown
  ): Promise<RPCResponseMessage> {
    const sharedSecret = await this.keyManager.getSharedSecret();
    if (!sharedSecret) {
      throw new Error('Shared secret not available');
    }

    const rpcResponse: RPCResponse = {
      result: {
        value: responseData,
      },
    };

    const encrypted = await encryptContent(rpcResponse, sharedSecret);
    const ownPublicKey = await this.keyManager.getOwnPublicKey();
    const ownPublicKeyHex = await exportKeyToHexString('public', ownPublicKey);

    return {
      requestId,
      sender: ownPublicKeyHex,
      content: {
        encrypted,
      },
      timestamp: new Date(),
    };
  }

  /**
   * Create error response
   */
  async createErrorResponse(
    requestId: MessageID,
    code: number,
    message: string
  ): Promise<RPCResponseMessage> {
    const ownPublicKey = await this.keyManager.getOwnPublicKey();
    const ownPublicKeyHex = await exportKeyToHexString('public', ownPublicKey);

    return {
      requestId,
      sender: ownPublicKeyHex,
      content: {
        failure: {
          code,
          message,
        },
      },
      timestamp: new Date(),
    };
  }

  /**
   * Clear all keys
   */
  async clear(): Promise<void> {
    await this.keyManager.clear();
    this.peerPublicKeyHex = null;
  }
}
