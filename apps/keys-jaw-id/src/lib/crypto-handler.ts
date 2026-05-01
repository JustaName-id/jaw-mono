/**
 * Crypto Handler
 *
 * Handles encryption/decryption for communication between apps and the popup.
 * Works with SessionManager to use per-app encryption keys.
 *
 * Features:
 * - Per-app encryption using session-based keys
 * - Secure message encryption/decryption
 * - Handshake and encrypted request handling
 * - Automatic session management
 */

import { encryptContent, decryptContent } from '@jaw.id/core';
import type { RPCResponseMessage, RPCRequestMessage, RPCRequest, MessageID } from '@jaw.id/core';
import {
  SessionManager,
  sessionManager as defaultSessionManager,
  type AppSession,
  type SessionAuthState,
  type CreateSessionOptions,
} from './session-manager';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of a handshake response creation.
 */
export interface HandshakeResponseData {
  accounts: Array<{
    address: string;
    capabilities?: Record<string, unknown>;
  }>;
}

/**
 * Configuration options for CryptoHandler.
 */
export interface CryptoHandlerOptions {
  /** Custom SessionManager instance (defaults to singleton) */
  sessionManager?: SessionManager;
}

// ============================================================================
// Constants
// ============================================================================

const LOG_PREFIX = '[CryptoHandler]';

// ============================================================================
// CryptoHandler Class
// ============================================================================

/**
 * Handles cryptographic operations for popup-app communication.
 *
 * This class manages:
 * - Session-based encryption keys (via SessionManager)
 * - Message encryption/decryption
 * - Handshake response creation
 * - Error response creation
 *
 * @example
 * ```typescript
 * const crypto = new CryptoHandler();
 *
 * // Set the current request context
 * crypto.setOrigin('https://app.example.com');
 *
 * // Check if session exists
 * if (crypto.isAuthenticated()) {
 *   // Decrypt incoming request
 *   const decrypted = await crypto.decryptRequest(request);
 *   // Process and respond...
 * }
 * ```
 */
export class CryptoHandler {
  private sessionManager: SessionManager;
  private currentOrigin: string | null = null;

  constructor(options: CryptoHandlerOptions = {}) {
    this.sessionManager = options.sessionManager || defaultSessionManager;
  }

  // ==========================================================================
  // Context Management
  // ==========================================================================

  /**
   * Sets the current origin context for operations.
   *
   * Call this at the start of handling a request to establish
   * which app session to use.
   *
   * @param origin - The app origin (e.g., "https://app.example.com")
   */
  setOrigin(origin: string): void {
    this.currentOrigin = origin;
    console.log(`${LOG_PREFIX} Origin set to:`, origin);
  }

  /**
   * Gets the current origin context.
   *
   * @returns The current origin, or null if not set
   */
  getOrigin(): string | null {
    return this.currentOrigin;
  }

  /**
   * Clears the current origin context.
   */
  clearOrigin(): void {
    this.currentOrigin = null;
  }

  // ==========================================================================
  // Session Access
  // ==========================================================================

  /**
   * Gets the current session based on the set origin.
   *
   * @returns The current session, or null if no origin set or no session exists
   */
  async getCurrentSession(): Promise<AppSession | null> {
    if (!this.currentOrigin) {
      console.warn(`${LOG_PREFIX} No origin set`);
      return null;
    }
    return this.sessionManager.getSession(this.currentOrigin);
  }

  /**
   * Gets a session for a specific origin.
   *
   * @param origin - The app origin
   * @returns The session, or null if not found
   */
  async getSession(origin: string): Promise<AppSession | null> {
    return this.sessionManager.getSession(origin);
  }

  /**
   * Loads an existing session for an origin and sets it as current.
   *
   * @param origin - The app origin
   * @returns The loaded session, or null if not found
   */
  async loadSession(origin: string): Promise<AppSession | null> {
    this.currentOrigin = origin;
    return this.sessionManager.getSession(origin);
  }

  /**
   * Checks if the current origin has an authenticated session.
   *
   * @returns true if authenticated, false otherwise
   */
  async isAuthenticated(): Promise<boolean> {
    if (!this.currentOrigin) return false;
    return this.sessionManager.isAuthenticated(this.currentOrigin);
  }

  /**
   * Gets the authState for the current origin.
   *
   * @returns The authState, or null if no session
   */
  async getAuthState(): Promise<SessionAuthState | null> {
    if (!this.currentOrigin) return null;
    return this.sessionManager.getAuthStateForOrigin(this.currentOrigin);
  }

  /**
   * Gets the SessionManager instance.
   *
   * @returns The SessionManager
   */
  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  // ==========================================================================
  // Session Operations
  // ==========================================================================

  /**
   * Ensures a session exists for an origin, creating one if necessary.
   *
   * This handles:
   * - Creating new sessions for new apps
   * - Updating peer keys if app reconnects with new keys
   * - Updating authState if it changed
   *
   * @param origin - The app origin
   * @param peerPublicKey - The app's public key
   * @param authState - The authState to associate with the session
   * @returns The session (existing or newly created)
   */
  async ensureSession(origin: string, peerPublicKey: string, authState?: SessionAuthState): Promise<AppSession> {
    this.currentOrigin = origin;

    let session = await this.sessionManager.getSession(origin);

    if (session) {
      // Session exists - check if updates needed
      let needsUpdate = false;

      // Check if peer key changed (app reconnected with new keys)
      if (session.peerPublicKey !== peerPublicKey) {
        console.log(`${LOG_PREFIX} Peer key changed for:`, origin);
        session = await this.sessionManager.updatePeerKey(origin, peerPublicKey);
        if (!session) {
          throw new Error('Failed to update peer key');
        }
        needsUpdate = true;
      }

      // Check if authState changed (only if authState provided)
      if (authState && session.authState?.address !== authState.address) {
        console.log(`${LOG_PREFIX} AuthState changed for:`, origin);
        session = await this.sessionManager.updateSessionAuthState(origin, authState);
        if (!session) {
          throw new Error('Failed to update authState');
        }
        needsUpdate = true;
      }

      // Touch session if no updates (updates already touch)
      if (!needsUpdate) {
        await this.sessionManager.touchSession(origin);
      }

      return session;
    }

    // No session - create new one
    console.log(`${LOG_PREFIX} Creating new session for:`, origin);

    const options: CreateSessionOptions = {
      origin,
      peerPublicKey,
    };

    return this.sessionManager.createSession(options);
  }

  /**
   * Updates the authState for the current session.
   *
   * @param authState - The new authState data
   * @returns The updated session, or null if no current session
   */
  async updateAuthState(authState: SessionAuthState): Promise<AppSession | null> {
    if (!this.currentOrigin) {
      console.error(`${LOG_PREFIX} Cannot update authState: no origin set`);
      return null;
    }

    return this.sessionManager.updateSessionAuthState(this.currentOrigin, authState);
  }

  /**
   * Deletes the session for an origin.
   *
   * @param origin - The app origin (defaults to current origin)
   * @returns true if deleted, false if not found
   */
  async deleteSession(origin?: string): Promise<boolean> {
    const targetOrigin = origin || this.currentOrigin;
    if (!targetOrigin) {
      console.error(`${LOG_PREFIX} Cannot delete session: no origin`);
      return false;
    }

    const result = await this.sessionManager.deleteSession(targetOrigin);

    if (targetOrigin === this.currentOrigin) {
      this.currentOrigin = null;
    }

    return result;
  }

  // ==========================================================================
  // Crypto Operations
  // ==========================================================================

  /**
   * Gets the shared secret for the current session.
   *
   * @returns The shared secret, or null if no session
   */
  async getSharedSecret(): Promise<CryptoKey | null> {
    if (!this.currentOrigin) {
      console.error(`${LOG_PREFIX} Cannot get shared secret: no origin set`);
      return null;
    }

    return this.sessionManager.deriveSharedSecret(this.currentOrigin);
  }

  /**
   * Gets the popup's public key for the current session.
   *
   * @returns The public key (hex), or null if no session
   */
  async getPopupPublicKey(): Promise<string | null> {
    if (!this.currentOrigin) {
      console.error(`${LOG_PREFIX} Cannot get public key: no origin set`);
      return null;
    }

    return this.sessionManager.getPopupPublicKey(this.currentOrigin);
  }

  // ==========================================================================
  // Message Handling
  // ==========================================================================

  /**
   * Creates an encrypted handshake response.
   *
   * This is sent after a successful handshake/wallet_connect request.
   *
   * @param requestId - The original request ID
   * @param data - The response data (accounts and capabilities)
   * @returns The encrypted response message
   */
  async createHandshakeResponse(requestId: MessageID, data: HandshakeResponseData): Promise<RPCResponseMessage> {
    const sharedSecret = await this.getSharedSecret();
    if (!sharedSecret) {
      throw new Error('No session available for encryption');
    }

    const popupPublicKey = await this.getPopupPublicKey();
    if (!popupPublicKey) {
      throw new Error('No popup public key available');
    }

    console.log(`${LOG_PREFIX} Creating handshake response for:`, this.currentOrigin);

    const responseData = {
      result: {
        value: data,
      },
    };

    const encrypted = await encryptContent(responseData, sharedSecret);

    const response: RPCResponseMessage = {
      requestId,
      id: crypto.randomUUID() as MessageID,
      sender: popupPublicKey,
      correlationId: crypto.randomUUID(),
      content: {
        encrypted,
      },
      timestamp: new Date(),
    };

    return response;
  }

  /**
   * Decrypts an incoming encrypted request.
   *
   * @param request - The encrypted RPC request message
   * @returns The decrypted request data
   */
  async decryptRequest(request: RPCRequestMessage): Promise<RPCRequest> {
    const sharedSecret = await this.getSharedSecret();
    if (!sharedSecret) {
      throw new Error('No session available for decryption');
    }

    if (!('encrypted' in request.content)) {
      throw new Error('Request does not contain encrypted content');
    }

    console.log(`${LOG_PREFIX} Decrypting request for:`, this.currentOrigin);

    const decrypted = await decryptContent(request.content.encrypted, sharedSecret);

    console.log(`${LOG_PREFIX} Request decrypted successfully`);
    return decrypted as RPCRequest;
  }

  /**
   * Creates an encrypted response for any RPC method.
   *
   * @param requestId - The original request ID
   * @param correlationId - The correlation ID for tracking
   * @param result - The result data to send
   * @returns The encrypted response message
   */
  async createEncryptedResponse(
    requestId: MessageID,
    correlationId: string,
    result: unknown
  ): Promise<RPCResponseMessage> {
    const sharedSecret = await this.getSharedSecret();
    if (!sharedSecret) {
      throw new Error('No session available for encryption');
    }

    const popupPublicKey = await this.getPopupPublicKey();
    if (!popupPublicKey) {
      throw new Error('No popup public key available');
    }

    console.log(`${LOG_PREFIX} Creating encrypted response for:`, this.currentOrigin);

    const responseData = {
      result: {
        value: result,
      },
    };

    const encrypted = await encryptContent(responseData, sharedSecret);

    const response: RPCResponseMessage = {
      requestId,
      id: crypto.randomUUID() as MessageID,
      sender: popupPublicKey,
      correlationId,
      content: {
        encrypted,
      },
      timestamp: new Date(),
    };

    return response;
  }

  /**
   * Creates an encrypted error response.
   *
   * @param requestId - The original request ID
   * @param correlationId - The correlation ID for tracking
   * @param errorCode - The error code (EIP-1193 standard codes)
   * @param errorMessage - The error message
   * @returns The encrypted error response message
   */
  async createEncryptedErrorResponse(
    requestId: MessageID,
    correlationId: string,
    errorCode: number,
    errorMessage: string
  ): Promise<RPCResponseMessage> {
    const sharedSecret = await this.getSharedSecret();
    if (!sharedSecret) {
      throw new Error('No session available for encryption');
    }

    const popupPublicKey = await this.getPopupPublicKey();
    if (!popupPublicKey) {
      throw new Error('No popup public key available');
    }

    console.log(`${LOG_PREFIX} Creating error response for:`, this.currentOrigin, {
      code: errorCode,
      message: errorMessage,
    });

    const responseData = {
      result: {
        error: {
          code: errorCode,
          message: errorMessage,
        },
      },
    };

    const encrypted = await encryptContent(responseData, sharedSecret);

    const response: RPCResponseMessage = {
      requestId,
      id: crypto.randomUUID() as MessageID,
      sender: popupPublicKey,
      correlationId,
      content: {
        encrypted,
      },
      timestamp: new Date(),
    };

    return response;
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Verifies and potentially updates the peer key for a request.
   *
   * Call this when receiving an encrypted request to handle
   * cases where the app may have reconnected with new keys.
   *
   * @param request - The incoming request
   * @returns true if the session is valid, false otherwise
   */
  async verifyAndUpdatePeerKey(request: RPCRequestMessage): Promise<boolean> {
    if (!this.currentOrigin) {
      console.error(`${LOG_PREFIX} Cannot verify peer key: no origin set`);
      return false;
    }

    const session = await this.getCurrentSession();
    if (!session) {
      console.error(`${LOG_PREFIX} No session for origin:`, this.currentOrigin);
      return false;
    }

    // Check if peer key changed
    if (session.peerPublicKey !== request.sender) {
      console.log(`${LOG_PREFIX} Peer key mismatch, updating for:`, this.currentOrigin);

      const updated = await this.sessionManager.updatePeerKey(this.currentOrigin, request.sender);
      if (!updated) {
        console.error(`${LOG_PREFIX} Failed to update peer key`);
        return false;
      }
    }

    return true;
  }

  /**
   * Initializes the handler (no-op, kept for backward compatibility).
   *
   * @deprecated Sessions are now managed by SessionManager
   */
  async initialize(): Promise<void> {
    console.log(`${LOG_PREFIX} Initialized (using SessionManager)`);
  }

  /**
   * Clears the handler state.
   *
   * @deprecated Use deleteSession() or SessionManager.clearAllSessions() instead
   */
  async clear(): Promise<void> {
    console.warn(`${LOG_PREFIX} clear() is deprecated. Use deleteSession() instead.`);
    this.currentOrigin = null;
  }
}
