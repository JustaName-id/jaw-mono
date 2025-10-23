import { createLocalStorage, type SyncStorage } from '../storage-manager/index.js';
import {Address} from 'viem';
import {
  PasskeyAccount,
  AuthCheckResult,
  AuthState,
} from './types.js';
import type { JawProviderPreference } from '../provider/index.js';
import { registerPasskeyInBackend, lookupPasskeyFromBackend } from './utils.js';
import {JAW_PASSKEYS_URL} from "../constants.js";

/**
 * PasskeyManager handles passkey authentication and account management
 *
 * Features:
 * - Manages passkey authentication state
 * - Stores and retrieves passkey credentials and accounts
 * - Supports multiple passkey accounts per user
 * - Validates credential IDs, addresses, and input formats
 *
 * Storage Keys:
 * - authState: Current authentication state
 * - accounts: Array of all passkey accounts
 */
export class PasskeyManager {
  private storage: SyncStorage;
  private preference: JawProviderPreference;
  private static readonly CREDENTIAL_ID_REGEX = /^[A-Za-z0-9_-]+$/;

  constructor(storage?: SyncStorage, preference?: JawProviderPreference) {
    this.storage = storage ?? createLocalStorage('jaw', 'passkey');
    this.preference = preference ?? {};
  }

  /**
   * Check if user is authenticated
   */
  checkAuth(): AuthCheckResult {
    try {
      const authState = this.storage.getItem<AuthState>('authState');
      if (!authState?.isLoggedIn || !authState?.address) {
        return { isAuthenticated: false };
      }

      return {
        isAuthenticated: true,
        address: authState.address,
      };
    } catch (error) {
      console.error('Error checking auth state:', error);
      return { isAuthenticated: false };
    }
  }

  /**
   * Store authentication state
   */
  storeAuthState(address: Address, credentialId: string): void {
    this.validateCredentialId(credentialId);

    const authState: AuthState = {
      isLoggedIn: true,
      address,
      credentialId,
    };

    this.storage.setItem('authState', authState);
  }

  /**
   * Clear authentication state (logout)
   */
  logout(): void {
    try {
      this.storage.removeItem('authState');
    } catch (error) {
      console.error('Error during logout:', error);
      throw error;
    }
  }

  /**
   * Get all stored passkey accounts
   */
  fetchAccounts(): PasskeyAccount[] {
    try {
      const accounts = this.storage.getItem<PasskeyAccount[]>('accounts');
      return Array.isArray(accounts) ? accounts : [];
    } catch (error) {
      console.error('Error fetching accounts:', error);
      return [];
    }
  }

  /**
   * Get the currently active credential ID
   */
  fetchActiveCredentialId(): string | null {
    try {
      const authState = this.storage.getItem<AuthState>('authState');
      return authState?.credentialId ?? null;
    } catch (error) {
      console.error('Error fetching credential ID:', error);
      return null;
    }
  }

  /**
   * Add a passkey account to the stored list
   */
  addAccountToList(account: PasskeyAccount): void {
    const existingAccounts = this.fetchAccounts();

    // Check if account already exists
    const accountExists = existingAccounts.some(
      (existingAccount) => existingAccount.credentialId === account.credentialId
    );

    if (!accountExists) {
      existingAccounts.push(account);
      this.storage.setItem('accounts', existingAccounts);
    }
  }

  /**
   * Register and store a new passkey account
   * Registers the passkey with the backend, then stores locally
   * @param name - Username or display name
   * @param credentialId - The passkey credential ID
   * @param publicKey - The public key associated with the passkey
   * @param address - Wallet address associated with the passkey
   * @param dev - Whether to use the staging environment (default: false)
   * @throws {PasskeyRegistrationError} If backend registration fails
   */
  async storePasskeyAccount(
    name: string,
    credentialId: string,
    publicKey: `0x${string}`,
    address: Address,
    dev = false
  ): Promise<void> {
    this.validateDisplayName(name);
    this.validateCredentialId(credentialId);

    // Register with backend
    const serverUrl = this.preference.serverUrl ?? JAW_PASSKEYS_URL;
    await registerPasskeyInBackend(
      {
        credentialId,
        publicKey,
        displayName: name.trim(),
      },
      this.preference.apiKey,
      dev,
      serverUrl
    );

    // Store auth state
    this.storeAuthState(address, credentialId);

    // Create account metadata
    const newAccount: PasskeyAccount = {
      username: name.trim(),
      credentialId,
      publicKey,
      creationDate: new Date().toISOString(),
      isImported: false,
    };

    // Add to accounts list
    this.addAccountToList(newAccount);
  }

  /**
   * Lookup and store a passkey account for login (import existing credential)
   * Looks up the passkey from the backend by credentialId, then stores locally
   * @param credentialId - The passkey credential ID to lookup
   * @param address - Wallet address associated with the passkey
   * @param dev - Whether to use the staging environment (default: false)
   * @throws {PasskeyLookupError} If backend lookup fails or passkey not found
   */
  async storePasskeyAccountForLogin(
    credentialId: string,
    address: Address,
    dev = false
  ): Promise<void> {
    // Lookup from backend first
    const serverUrl = this.preference.serverUrl ?? JAW_PASSKEYS_URL;
    const passkeyData = await lookupPasskeyFromBackend(
      credentialId,
      this.preference.apiKey,
      dev,
      serverUrl
    );

    // Store auth state (validates inputs)
    this.storeAuthState(address, credentialId);

    // Create account metadata (marked as imported) using backend data
    const newAccount: PasskeyAccount = {
      username: passkeyData.displayName.trim(),
      credentialId: passkeyData.credentialId,
      publicKey: passkeyData.publicKey as `0x${string}`,
      creationDate: new Date().toISOString(),
      isImported: true,
    };

    // Add to accounts list
    this.addAccountToList(newAccount);
  }

  /**
   * Remove a passkey account from the stored list
   * If the removed account is currently active, logout the user
   * @param credentialId - The credential ID to remove
   */
  removeAccount(credentialId: string): void {
    const accounts = this.fetchAccounts();
    const filteredAccounts = accounts.filter(
      (account) => account.credentialId !== credentialId
    );
    this.storage.setItem('accounts', filteredAccounts);

    // If removing the currently active credential, clear auth state
    const activeCredentialId = this.fetchActiveCredentialId();
    if (activeCredentialId === credentialId) {
      this.logout();
    }
  }

  /**
   * Clear all stored data (accounts, auth state)
   */
  clearAll(): void {
    this.storage.removeItem('authState');
    this.storage.removeItem('accounts');
  }

  /**
   * Get account by credential ID
   */
  getAccountByCredentialId(credentialId: string): PasskeyAccount | undefined {
    const accounts = this.fetchAccounts();
    return accounts.find((account) => account.credentialId === credentialId);
  }

  /**
   * Get the currently active account
   */
  getCurrentAccount(): PasskeyAccount | undefined {
    const credentialId = this.fetchActiveCredentialId();
    if (!credentialId) {
      return undefined;
    }
    return this.getAccountByCredentialId(credentialId);
  }

  /**
   * Check if an account exists
   */
  hasAccount(credentialId: string): boolean {
    return this.getAccountByCredentialId(credentialId) !== undefined;
  }

  /**
   * Get provider preference configuration
   */
  getPreference(): JawProviderPreference {
    return { ...this.preference };
  }

  /**
   * Update provider preference configuration
   */
  updatePreference(preference: Partial<JawProviderPreference>): void {
    this.preference = { ...this.preference, ...preference };
  }

  /**
   * Validate credential ID format
   */
  private validateCredentialId(credentialId: string): void {
    if (!credentialId || !PasskeyManager.CREDENTIAL_ID_REGEX.test(credentialId)) {
      throw new Error(`Invalid credential ID format: ${credentialId}`);
    }
  }

  /**
   * Validate display name
   */
  private validateDisplayName(name: string): void {
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error('Display name cannot be empty');
    }
    if (trimmedName.length > 100) {
      throw new Error('Display name cannot exceed 100 characters');
    }
  }
}
