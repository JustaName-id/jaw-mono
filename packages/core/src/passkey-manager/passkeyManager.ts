import { createLocalStorage, type SyncStorage } from '../storage-manager/index.js';
import { Address } from 'viem';
import { PasskeyAccount, AuthCheckResult, AuthState } from './types.js';
import type { JawProviderPreference } from '../provider/index.js';
import {
    registerPasskeyInBackend,
    lookupPasskeyFromBackend,
    WebAuthnAuthenticationResult,
    authenticateWithWebAuthnUtils,
    createPasskeyUtils,
    ImportWebAuthnAuthenticationResult,
    importPasskeyUtils,
} from './utils.js';
import { JAW_BASE_URL } from '../constants.js';
import type { WebAuthnAccount } from 'viem/account-abstraction';

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
    private apiKey?: string;
    private static readonly CREDENTIAL_ID_REGEX = /^[A-Za-z0-9_-]+$/;

    constructor(storage?: SyncStorage, preference?: JawProviderPreference, apiKey?: string) {
        this.storage = storage ?? createLocalStorage('jaw', 'passkey');
        this.preference = preference ?? {};
        this.apiKey = apiKey;
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
     * If account already exists (by credentialId), updates the isImported flag if needed
     */
    addAccountToList(account: PasskeyAccount): void {
        const existingAccounts = this.fetchAccounts();

        // Check if account already exists
        const existingIndex = existingAccounts.findIndex(
            (existingAccount) => existingAccount.credentialId === account.credentialId
        );

        if (existingIndex === -1) {
            console.log('Adding account to list:', account);
            existingAccounts.push(account);
            this.storage.setItem('accounts', existingAccounts);
        } else if (account.isImported && !existingAccounts[existingIndex].isImported) {
            // Update existing account's isImported flag if importing an existing local account
            console.log('Updating account isImported flag:', account.credentialId);
            existingAccounts[existingIndex].isImported = true;
            this.storage.setItem('accounts', existingAccounts);
        }
    }

    /**
     * Create a new WebAuthn passkey
     * @param username - The username for the passkey
     * @param rpId - The relying party identifier (e.g., domain name)
     * @param rpName - The relying party name
     * @returns WebAuthn passkey creation result with credential and challenge
     * @throws {PasskeyRegistrationError} If passkey creation fails
     */
    async createPasskey(
        username: string,
        rpId: string,
        rpName: string
    ): Promise<{
        credentialId: string;
        publicKey: `0x${string}`;
        webAuthnAccount: WebAuthnAccount;
        passkeyAccount: PasskeyAccount;
    }> {
        const { credentialId, publicKey, webAuthnAccount } = await createPasskeyUtils(username, rpId, rpName);
        const passkeyAccount: PasskeyAccount = {
            username,
            credentialId,
            publicKey,
            creationDate: new Date().toISOString(),
            isImported: false,
        };
        this.addAccountToList(passkeyAccount);
        console.log('Accounts list:', this.fetchAccounts());
        return { credentialId, publicKey, webAuthnAccount, passkeyAccount };
    }

    /**
     * Authenticate with a WebAuthn passkey
     * @param credentialId - The passkey credential ID
     * @param rpId - The relying party identifier (e.g., domain name)
     * @param options - Optional authentication options
     * @returns WebAuthn authentication result with credential and challenge
     * @throws {WebAuthnAuthenticationError} If authentication fails
     */

    async authenticateWithWebAuthn(
        rpId: string,
        credentialId: string,
        options?: {
            userVerification?: UserVerificationRequirement;
            timeout?: number;
            transports?: AuthenticatorTransport[];
        }
    ): Promise<WebAuthnAuthenticationResult> {
        return authenticateWithWebAuthnUtils(rpId, credentialId, options);
    }

    /**
     * Import a passkey account from the backend
     * @returns ImportWebAuthnAuthenticationResult
     * @throws {PasskeyLookupError} If backend lookup fails or passkey not found
     */
    async importPasskeyAccount(): Promise<ImportWebAuthnAuthenticationResult> {
        return importPasskeyUtils();
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

        // Register with backend - use base URL since the route path is already defined in Routes
        const serverUrl = this.preference.serverUrl ?? JAW_BASE_URL;
        await registerPasskeyInBackend(
            {
                credentialId,
                publicKey,
                displayName: name.trim(),
            },
            this.apiKey,
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
    async storePasskeyAccountForLogin(credentialId: string, address: Address, dev = false): Promise<void> {
        // Lookup from backend first - use base URL since the route path is already defined in Routes
        const serverUrl = this.preference.serverUrl ?? JAW_BASE_URL;
        const passkeyData = await lookupPasskeyFromBackend(credentialId, this.apiKey, dev, serverUrl);

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
        const filteredAccounts = accounts.filter((account) => account.credentialId !== credentialId);
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
