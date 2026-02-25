/**
 * Session Manager
 *
 * Manages per-app sessions for the JAW popup (keys.jaw.id).
 * Each connected app (identified by origin) gets its own isolated session with:
 * - Unique encryption key pair
 * - Associated account
 * - Session metadata
 *
 * Origins are hashed before being used as keys for privacy.
 *
 * This replaces the global authState approach, allowing multiple apps to
 * connect simultaneously with different accounts and isolated encryption keys.
 */

import {
  generateKeyPair,
  exportKeyToHexString,
  importKeyFromHexString,
  deriveSharedSecret,
} from "@jaw.id/core";

// ============================================================================
// Types
// ============================================================================

/**
 * Authentication state stored in a session.
 * This represents the authenticated account for a specific app connection.
 */
export interface SessionAuthState {
  /** Wallet address (checksummed) */
  address: `0x${string}`;
  /** Passkey credential ID used for authentication */
  credentialId: string;
  /** Display name (e.g., ENS name or username) */
  username: string;
  /** Passkey public key (for WebAuthn operations) */
  publicKey: `0x${string}`;
}

/**
 * Complete session data for a connected app.
 * Note: origin is NOT stored here - a hash of it is used as the key in StoredSessions.
 */
export interface AppSession {
  /** Popup's private key for this session (hex encoded) */
  popupPrivateKey: string;
  /** Popup's public key for this session (hex encoded) */
  popupPublicKey: string;
  /** App's public key (hex encoded) */
  peerPublicKey: string;

  /** Auth state for this session (null until user approves connection) */
  authState: SessionAuthState | null;

  /** Timestamp when session was created */
  createdAt: number;
  /** Timestamp when session was last used */
  lastUsedAt: number;
}

/**
 * Serialized session data for storage.
 * Keys are hashed origins.
 */
type StoredSessions = Record<string, AppSession>;

/**
 * Options for creating a new session.
 */
export interface CreateSessionOptions {
  origin: string;
  peerPublicKey: string;
  /** Account is optional - can be set later when user approves */
  account?: SessionAuthState;
}

/**
 * Result of session operations that may fail.
 */
export interface SessionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = "jaw:sessions:apps";
const LOG_PREFIX = "[SessionManager]";

/** Maximum session age: 30 days (milliseconds) */
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** Maximum inactivity before session expires: 7 days (milliseconds) */
const SESSION_INACTIVITY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// In-memory cache for hashed origins to avoid re-computing
const originHashCache = new Map<string, string>();

// ============================================================================
// Hash Helper
// ============================================================================

/**
 * Hashes an origin using SHA-256 for privacy.
 * Results are cached in memory for performance.
 *
 * @param origin - The origin URL to hash
 * @returns The hex-encoded SHA-256 hash
 */
async function hashOrigin(origin: string): Promise<string> {
  // Check cache first
  const cached = originHashCache.get(origin);
  if (cached) {
    return cached;
  }

  // Compute hash
  const encoder = new TextEncoder();
  const data = encoder.encode(origin);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  // Cache and return
  originHashCache.set(origin, hash);
  return hash;
}

// ============================================================================
// Storage Helpers
// ============================================================================

/**
 * Safe localStorage getter with SSR support.
 */
function getFromStorage<T>(key: string): T | null {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return null;
  }

  try {
    const value = localStorage.getItem(key);
    if (!value) return null;
    return JSON.parse(value) as T;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to parse storage value:`, error);
    return null;
  }
}

/**
 * Safe localStorage setter with SSR support.
 */
function setToStorage<T>(key: string, value: T): boolean {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return false;
  }

  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to save to storage:`, error);
    return false;
  }
}

/**
 * Safe localStorage remover with SSR support.
 */
function removeFromStorage(key: string): boolean {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return false;
  }

  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to remove from storage:`, error);
    return false;
  }
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validates that a string is a valid origin URL.
 */
function isValidOrigin(origin: string): boolean {
  if (!origin || typeof origin !== "string") return false;

  try {
    const url = new URL(origin);
    // Origin should be protocol + host (no path)
    return url.origin === origin || origin === url.origin;
  } catch {
    return false;
  }
}

/**
 * Validates that a string looks like a hex-encoded key.
 */
function isValidHexKey(key: string): boolean {
  if (!key || typeof key !== "string") return false;
  // Basic hex validation - should be even length and only hex chars
  return /^[0-9a-fA-F]+$/.test(key) && key.length > 0 && key.length % 2 === 0;
}

/**
 * Validates that an address is a valid Ethereum address.
 */
function isValidAddress(address: string): address is `0x${string}` {
  if (!address || typeof address !== "string") return false;
  return /^0x[0-9a-fA-F]{40}$/i.test(address);
}

/**
 * Validates a SessionAuthState object.
 */
function isValidSessionAuthState(
  account: unknown,
): account is SessionAuthState {
  if (!account || typeof account !== "object") return false;

  const acc = account as Record<string, unknown>;

  return (
    isValidAddress(acc.address as string) &&
    typeof acc.credentialId === "string" &&
    acc.credentialId.length > 0 &&
    typeof acc.username === "string" &&
    typeof acc.publicKey === "string" &&
    (acc.publicKey as string).startsWith("0x")
  );
}

/**
 * Validates an AppSession object from storage.
 */
function isValidSession(session: unknown): session is AppSession {
  if (!session || typeof session !== "object") return false;

  const s = session as Record<string, unknown>;

  return (
    typeof s.popupPrivateKey === "string" &&
    typeof s.popupPublicKey === "string" &&
    typeof s.peerPublicKey === "string" &&
    (s.authState === null || isValidSessionAuthState(s.authState)) &&
    typeof s.createdAt === "number" &&
    typeof s.lastUsedAt === "number"
  );
}

/**
 * Checks whether a session has expired.
 * A session expires if:
 * - It was created more than SESSION_MAX_AGE_MS ago (30 days), OR
 * - It has been inactive for more than SESSION_INACTIVITY_TTL_MS (7 days)
 */
function isSessionExpired(session: AppSession): boolean {
  const now = Date.now();
  const age = now - session.createdAt;
  const inactivity = now - session.lastUsedAt;

  return age > SESSION_MAX_AGE_MS || inactivity > SESSION_INACTIVITY_TTL_MS;
}

// ============================================================================
// SessionManager Class
// ============================================================================

/**
 * Manages per-app sessions for secure communication between apps and the popup.
 *
 * Features:
 * - Isolated encryption keys per app
 * - Per-app account management
 * - Automatic key pair generation
 * - Session persistence in localStorage
 * - Origin hashing for privacy
 *
 * @example
 * ```typescript
 * const manager = new SessionManager();
 *
 * // Create a new session
 * const session = await manager.createSession({
 *   origin: 'https://app.example.com',
 *   peerPublicKey: '...',
 *   account: { address: '0x...', credentialId: '...', username: 'alice', publicKey: '0x...' }
 * });
 *
 * // Get existing session
 * const existing = await manager.getSession('https://app.example.com');
 *
 * // Derive shared secret for encryption
 * const secret = await manager.deriveSharedSecret('https://app.example.com');
 * ```
 */
export class SessionManager {
  private cache: StoredSessions | null = null;

  constructor() {
    // Load sessions into cache on initialization
    this.loadFromStorage();
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Loads sessions from localStorage into memory cache.
   */
  private loadFromStorage(): void {
    const stored = getFromStorage<StoredSessions>(STORAGE_KEY);
    this.cache = stored || {};

    // Validate and clean up invalid or expired sessions
    if (this.cache) {
      const activeSessions: StoredSessions = {};
      let hasRemoved = false;

      for (const [hashedOrigin, session] of Object.entries(this.cache)) {
        if (!isValidSession(session)) {
          console.warn(
            `${LOG_PREFIX} Removing invalid session for hash:`,
            hashedOrigin.slice(0, 8) + "...",
          );
          hasRemoved = true;
        } else if (isSessionExpired(session)) {
          console.warn(
            `${LOG_PREFIX} Removing expired session for hash:`,
            hashedOrigin.slice(0, 8) + "...",
          );
          hasRemoved = true;
        } else {
          activeSessions[hashedOrigin] = session;
        }
      }

      if (hasRemoved) {
        this.cache = activeSessions;
        this.saveToStorage();
      }
    }
  }

  /**
   * Saves the current cache to localStorage.
   */
  private saveToStorage(): boolean {
    if (!this.cache) {
      this.cache = {};
    }
    return setToStorage(STORAGE_KEY, this.cache);
  }

  /**
   * Ensures cache is loaded.
   */
  private ensureCache(): StoredSessions {
    if (!this.cache) {
      this.loadFromStorage();
    }
    return this.cache || {};
  }

  // ==========================================================================
  // Public Methods - CRUD Operations
  // ==========================================================================

  /**
   * Gets all stored sessions.
   * Note: Keys are hashed origins, not plain origins.
   *
   * @returns Record of hashedOrigin -> session mappings
   */
  getAllSessions(): StoredSessions {
    return { ...this.ensureCache() };
  }

  /**
   * Gets a session for a specific origin.
   *
   * @param origin - The app origin (e.g., "https://app.example.com")
   * @returns The session if found, null otherwise
   */
  async getSession(origin: string): Promise<AppSession | null> {
    if (!origin) return null;

    const hashedOrigin = await hashOrigin(origin);
    const sessions = this.ensureCache();
    const session = sessions[hashedOrigin];

    if (session && isValidSession(session)) {
      // Evict expired sessions on access
      if (isSessionExpired(session)) {
        delete sessions[hashedOrigin];
        this.cache = sessions;
        this.saveToStorage();
        return null;
      }
      return { ...session };
    }

    return null;
  }

  /**
   * Creates a new session for an app.
   *
   * Generates a unique key pair for this session and stores it
   * along with the app's public key and account information.
   *
   * @param options - Session creation options
   * @returns The created session
   * @throws Error if validation fails or key generation fails
   */
  async createSession(options: CreateSessionOptions): Promise<AppSession> {
    const { origin, peerPublicKey, account } = options;

    // Validate inputs
    if (!isValidOrigin(origin)) {
      throw new Error(`Invalid origin: ${origin}`);
    }

    if (!isValidHexKey(peerPublicKey)) {
      throw new Error("Invalid peer public key");
    }

    // Account is optional - validate only if provided
    if (account && !isValidSessionAuthState(account)) {
      throw new Error("Invalid account data");
    }

    console.log(
      `${LOG_PREFIX} Creating session for:`,
      origin,
      account ? `with account ${account.address}` : "(pending account)",
    );

    // Hash the origin for storage
    const hashedOrigin = await hashOrigin(origin);

    // Generate unique key pair for this session
    const keyPair = await generateKeyPair();
    const popupPrivateKey = await exportKeyToHexString(
      "private",
      keyPair.privateKey,
    );
    const popupPublicKey = await exportKeyToHexString(
      "public",
      keyPair.publicKey,
    );

    const now = Date.now();
    const session: AppSession = {
      popupPrivateKey,
      popupPublicKey,
      peerPublicKey,
      authState: account || null,
      createdAt: now,
      lastUsedAt: now,
    };

    // Save to cache and storage using hashed origin
    const sessions = this.ensureCache();
    sessions[hashedOrigin] = session;
    this.cache = sessions;

    if (!this.saveToStorage()) {
      throw new Error("Failed to persist session");
    }

    console.log(`${LOG_PREFIX} Session created for:`, origin);
    return { ...session };
  }

  /**
   * Updates an existing session.
   *
   * @param origin - The app origin
   * @param updates - Partial session data to update
   * @returns The updated session, or null if session doesn't exist
   */
  async updateSession(
    origin: string,
    updates: Partial<Omit<AppSession, "createdAt">>,
  ): Promise<AppSession | null> {
    const session = await this.getSession(origin);
    if (!session) {
      console.warn(`${LOG_PREFIX} Cannot update non-existent session:`, origin);
      return null;
    }

    const hashedOrigin = await hashOrigin(origin);

    const updatedSession: AppSession = {
      ...session,
      ...updates,
      createdAt: session.createdAt, // Ensure createdAt cannot be changed
      lastUsedAt: Date.now(),
    };

    // Validate the updated session
    if (!isValidSession(updatedSession)) {
      console.error(`${LOG_PREFIX} Invalid session after update:`, origin);
      return null;
    }

    // Save to cache and storage
    const sessions = this.ensureCache();
    sessions[hashedOrigin] = updatedSession;
    this.cache = sessions;
    this.saveToStorage();

    console.log(`${LOG_PREFIX} Session updated for:`, origin);
    return { ...updatedSession };
  }

  /**
   * Deletes a session for an app.
   *
   * @param origin - The app origin to delete
   * @returns true if session was deleted, false if it didn't exist
   */
  async deleteSession(origin: string): Promise<boolean> {
    const hashedOrigin = await hashOrigin(origin);
    const sessions = this.ensureCache();

    if (!sessions[hashedOrigin]) {
      return false;
    }

    delete sessions[hashedOrigin];
    this.cache = sessions;
    this.saveToStorage();

    console.log(`${LOG_PREFIX} Session deleted for:`, origin);
    return true;
  }

  /**
   * Clears all sessions.
   *
   * Use with caution - this disconnects all apps.
   */
  clearAllSessions(): void {
    this.cache = {};
    originHashCache.clear(); // Also clear the hash cache
    removeFromStorage(STORAGE_KEY);
    console.log(`${LOG_PREFIX} All sessions cleared`);
  }

  // ==========================================================================
  // Public Methods - Session Operations
  // ==========================================================================

  /**
   * Updates the peer public key for a session.
   *
   * This is called when an app reconnects with a new key pair.
   * For security, this also regenerates the popup's key pair.
   *
   * @param origin - The app origin
   * @param newPeerPublicKey - The app's new public key
   * @returns The updated session, or null if session doesn't exist
   */
  async updatePeerKey(
    origin: string,
    newPeerPublicKey: string,
  ): Promise<AppSession | null> {
    const session = await this.getSession(origin);
    if (!session) {
      console.warn(
        `${LOG_PREFIX} Cannot update peer key for non-existent session:`,
        origin,
      );
      return null;
    }

    if (!isValidHexKey(newPeerPublicKey)) {
      console.error(`${LOG_PREFIX} Invalid new peer public key`);
      return null;
    }

    console.log(`${LOG_PREFIX} Updating peer key for:`, origin);

    // Generate new popup key pair for security
    const keyPair = await generateKeyPair();
    const popupPrivateKey = await exportKeyToHexString(
      "private",
      keyPair.privateKey,
    );
    const popupPublicKey = await exportKeyToHexString(
      "public",
      keyPair.publicKey,
    );

    return this.updateSession(origin, {
      peerPublicKey: newPeerPublicKey,
      popupPrivateKey,
      popupPublicKey,
    });
  }

  /**
   * Updates the account for a session.
   *
   * This is called when a user switches accounts for an app.
   *
   * @param origin - The app origin
   * @param account - The new account data
   * @returns The updated session, or null if session doesn't exist
   */
  async updateSessionAuthState(
    origin: string,
    authState: SessionAuthState,
  ): Promise<AppSession | null> {
    if (!isValidSessionAuthState(authState)) {
      console.error(`${LOG_PREFIX} Invalid authState data`);
      return null;
    }

    console.log(
      `${LOG_PREFIX} Updating authState for:`,
      origin,
      "→",
      authState.address,
    );
    return this.updateSession(origin, { authState });
  }

  /**
   * Updates the lastUsedAt timestamp for a session.
   *
   * Call this when processing a request from an app.
   *
   * @param origin - The app origin
   */
  async touchSession(origin: string): Promise<void> {
    const session = await this.getSession(origin);
    if (session) {
      await this.updateSession(origin, {});
    }
  }

  // ==========================================================================
  // Public Methods - Auth Helpers
  // ==========================================================================

  /**
   * Checks if an origin has an active session with authState.
   *
   * @param origin - The app origin
   * @returns true if the origin has a valid session with authState
   */
  async isAuthenticated(origin: string): Promise<boolean> {
    const session = await this.getSession(origin);
    return session !== null && isValidSessionAuthState(session.authState);
  }

  /**
   * Gets the authState associated with an origin.
   *
   * @param origin - The app origin
   * @returns The authState if session exists, null otherwise
   */
  async getAuthStateForOrigin(
    origin: string,
  ): Promise<SessionAuthState | null> {
    const session = await this.getSession(origin);
    return session?.authState || null;
  }

  /**
   * Gets all connected app origins.
   * Note: Returns hashed origins since we don't store plain origins.
   *
   * @returns Array of hashed origin strings
   */
  getConnectedOrigins(): string[] {
    return Object.keys(this.ensureCache());
  }

  /**
   * Gets the number of active sessions.
   *
   * @returns Number of sessions
   */
  getSessionCount(): number {
    return Object.keys(this.ensureCache()).length;
  }

  // ==========================================================================
  // Public Methods - Crypto Helpers
  // ==========================================================================

  /**
   * Derives the shared secret for a session.
   *
   * Use this to encrypt/decrypt messages with the app.
   *
   * @param origin - The app origin
   * @returns The derived shared secret, or null if session doesn't exist
   */
  async deriveSharedSecret(origin: string): Promise<CryptoKey | null> {
    const session = await this.getSession(origin);
    if (!session) {
      console.warn(
        `${LOG_PREFIX} Cannot derive secret for non-existent session:`,
        origin,
      );
      return null;
    }

    try {
      const privateKey = await importKeyFromHexString(
        "private",
        session.popupPrivateKey,
      );
      const peerPublicKey = await importKeyFromHexString(
        "public",
        session.peerPublicKey,
      );
      return deriveSharedSecret(privateKey, peerPublicKey);
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to derive shared secret:`, error);
      return null;
    }
  }

  /**
   * Gets the popup's public key for a session.
   *
   * This is sent to the app so it can derive the same shared secret.
   *
   * @param origin - The app origin
   * @returns The popup's public key (hex encoded), or null if session doesn't exist
   */
  async getPopupPublicKey(origin: string): Promise<string | null> {
    const session = await this.getSession(origin);
    return session?.popupPublicKey || null;
  }

  // ==========================================================================
  // Public Methods - Debug/Admin
  // ==========================================================================

  /**
   * Gets session statistics for debugging.
   * Note: Origins are hashed, so only hashes are returned.
   *
   * @returns Session statistics object
   */
  getStats(): {
    totalSessions: number;
    hashedOrigins: string[];
    oldestSession: number | null;
    newestSession: number | null;
  } {
    const sessions = this.ensureCache();
    const entries = Object.values(sessions);

    if (entries.length === 0) {
      return {
        totalSessions: 0,
        hashedOrigins: [],
        oldestSession: null,
        newestSession: null,
      };
    }

    const timestamps = entries.map((s) => s.createdAt);

    return {
      totalSessions: entries.length,
      hashedOrigins: Object.keys(sessions),
      oldestSession: Math.min(...timestamps),
      newestSession: Math.max(...timestamps),
    };
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Singleton instance of SessionManager.
 *
 * Use this for most cases to ensure consistent state across the app.
 */
export const sessionManager = new SessionManager();
