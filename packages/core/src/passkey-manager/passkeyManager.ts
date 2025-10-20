import { createLocalStorage, type SyncStorage } from '../storage-manager/index.js';
import {
  PasskeyAccount,
  AuthCheckResult,
  AuthState,
  PasskeyConfig,
} from './types.js';

/**
 * PasskeyManager handles passkey authentication and account management
 * 
 * Features:
 * - Manages passkey authentication state
 * - Stores and retrieves passkey credentials and accounts
 * - Supports multiple passkey accounts per user
 * 
 * Storage Keys:
 * - authState: Current authentication state
 * - accounts: Array of all passkey accounts
 */
export class PasskeyManager {
  private storage: SyncStorage;
  private config: PasskeyConfig;

  constructor(storage?: SyncStorage, config?: PasskeyConfig) {
    this.storage = storage ?? createLocalStorage('jaw', 'passkey');
    this.config = config ?? {};
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
  storeAuthState(address: string, credentialId: string): void {
    const authState: AuthState = {
      isLoggedIn: true,
      address,
      credentialId,
      timestamp: Date.now(),
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
   * Store a new passkey account (after registration)
   * @param name - Username or display name
   * @param credentialId - The passkey credential ID
   * @param address - Wallet address associated with the passkey
   * @param isImported - Whether this was imported (default: false)
   */
  storePasskeyAccount(
    name: string,
    credentialId: string,
    address: string,
    isImported: boolean = false
  ): void {
    // Store auth state
    this.storeAuthState(address, credentialId);

    // Create account metadata
    const newAccount: PasskeyAccount = {
      username: name.trim(),
      credentialId,
      creationDate: new Date().toISOString(),
      isImported,
    };

    // Add to accounts list
    this.addAccountToList(newAccount);
  }

  /**
   * Store a passkey account for login (imported credential)
   * @param username - Username or display name
   * @param credentialId - The passkey credential ID
   * @param address - Wallet address associated with the passkey
   */
  storePasskeyAccountForLogin(
    username: string,
    credentialId: string,
    address: string
  ): void {
    // Store auth state
    this.storeAuthState(address, credentialId);

    // Create account metadata (marked as imported)
    const newAccount: PasskeyAccount = {
      username,
      credentialId,
      creationDate: new Date().toISOString(),
      isImported: true,
    };

    // Add to accounts list
    this.addAccountToList(newAccount);
  }

  /**
   * Remove a passkey account from the stored list
   * @param credentialId - The credential ID to remove
   */
  removeAccount(credentialId: string): void {
    const accounts = this.fetchAccounts();
    const filteredAccounts = accounts.filter(
      (account) => account.credentialId !== credentialId
    );
    this.storage.setItem('accounts', filteredAccounts);
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
   * Check if an account exists
   */
  hasAccount(credentialId: string): boolean {
    return this.getAccountByCredentialId(credentialId) !== undefined;
  }

  /**
   * Get configuration
   */
  getConfig(): PasskeyConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PasskeyConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
