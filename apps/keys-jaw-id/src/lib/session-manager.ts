/**
 * Per-origin session management
 *
 * This module manages authentication sessions on a per-origin basis,
 * allowing each dApp to have its own isolated authentication state
 * while sharing the global passkey accounts.
 */

import { createOriginSessionStorage, type SyncStorage } from './origin-storage';

interface SessionState {
  isLoggedIn: boolean;
  address: string;
  credentialId: string;
}

const AUTH_STATE_KEY = 'authState';

/**
 * SessionManager provides per-origin session management
 *
 * Unlike the global Account.getAuthenticatedAddress() which is shared
 * across all dApps, SessionManager maintains separate auth sessions
 * for each origin.
 */
export class SessionManager {
  private storage: SyncStorage;

  constructor(origin: string) {
    this.storage = createOriginSessionStorage(origin);
  }

  /**
   * Check if user is authenticated for this origin
   * Returns session state including address and credentialId if authenticated
   */
  checkAuth(): { isAuthenticated: boolean; address?: string; credentialId?: string } {
    const state = this.storage.getItem<SessionState>(AUTH_STATE_KEY);

    if (state && state.isLoggedIn && state.address) {
      return {
        isAuthenticated: true,
        address: state.address,
        credentialId: state.credentialId,
      };
    }

    return { isAuthenticated: false };
  }

  /**
   * Store authentication session for this origin
   */
  storeSession(address: string, credentialId: string): void {
    const state: SessionState = {
      isLoggedIn: true,
      address,
      credentialId,
    };
    this.storage.setItem(AUTH_STATE_KEY, state);
  }

  /**
   * Clear authentication session for this origin
   */
  clearSession(): void {
    this.storage.removeItem(AUTH_STATE_KEY);
  }
}
