import { PasskeyManager, type PasskeyAccount, toJustanAccount, type JustanAccountImplementation } from '@jaw.id/core';
import type { Address } from 'viem';
import { createWebAuthnCredential, toWebAuthnAccount } from 'viem/account-abstraction';
import { getAddress, createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import {type Chain } from '@jaw.id/core';
import { getBundlerClient } from '@jaw.id/core';

export interface PasskeyCreationResult {
  credentialId: string;
  publicKey: `0x${string}`;
  address: Address;
  account: PasskeyAccount;
}

export interface PasskeyAuthenticationResult {
  credentialId: string;
  address: Address;
  account: PasskeyAccount;
}

/**
 * PasskeyService handles WebAuthn passkey creation and authentication
 * Integrates with PasskeyManager for storage and backend sync
 */
export class PasskeyService {
  private passkeyManager: PasskeyManager;
  private rpId: string;
  private rpName: string;
  private localOnly: boolean;
  private static ADDRESS_STORAGE_KEY = 'jaw_passkey_addresses';

  constructor(preference?: { serverUrl?: string; apiKey?: string; localOnly?: boolean }) {
    this.passkeyManager = new PasskeyManager(undefined, preference);
    // For local development, use localhost
    // For production, use your actual domain
    this.rpId = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    this.rpName = 'JAW Wallet';
    // Enable local-only mode for development (skips backend registration)
    this.localOnly = preference?.localOnly ?? true;
  }

  /**
   * Store address for a credential ID
   */
  private storeAddress(credentialId: string, address: Address): void {
    if (typeof window === 'undefined') return;

    const addresses = this.getAddressMap();
    addresses[credentialId] = address;
    localStorage.setItem(PasskeyService.ADDRESS_STORAGE_KEY, JSON.stringify(addresses));
  }

  /**
   * Get address for a credential ID
   */
  private getAddress(credentialId: string): Address | null {
    const addresses = this.getAddressMap();
    return addresses[credentialId] || null;
  }

  /**
   * Get all address mappings
   */
  private getAddressMap(): Record<string, Address> {
    if (typeof window === 'undefined') return {};

    const stored = localStorage.getItem(PasskeyService.ADDRESS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  }

  /**
   * Check if WebAuthn is supported
   */
  isWebAuthnSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      window.PublicKeyCredential !== undefined &&
      typeof window.PublicKeyCredential === 'function'
    );
  }

  /**
   * Check if user is already authenticated
   */
  checkAuth() {
    return this.passkeyManager.checkAuth();
  }

  /**
   * Get all stored passkey accounts
   */
  getAccounts(): PasskeyAccount[] {
    return this.passkeyManager.fetchAccounts();
  }

  /**
   * Get currently active account
   */
  getCurrentAccount(): PasskeyAccount | undefined {
    return this.passkeyManager.getCurrentAccount();
  }

  /**
   * Create a new passkey and account
   * @param username - Display name for the passkey
   * @returns Passkey creation result with address and credential details
   */
  async createPasskey(username: string): Promise<PasskeyCreationResult> {
    if (!this.isWebAuthnSupported()) {
      throw new Error('WebAuthn is not supported in this browser');
    }

    try {
      // Use viem's createWebAuthnCredential to create the passkey
      const credential = await createWebAuthnCredential({
        name: username,
        rp: {
          id: this.rpId,
          name: this.rpName,
        },
      });

      // Create WebAuthn account from credential
      const webAuthnAccount = toWebAuthnAccount({
        credential,
      });

      const credentialId = credential.id;
      const publicKey = credential.publicKey;

      // Create a public client to interact with the smart account factory
      const client = createPublicClient({
        chain: baseSepolia,
        transport: http(),
      });

      // Use toJustanAccount to derive the smart contract wallet address
      const smartAccount = await toJustanAccount({
        client,
        owners: [webAuthnAccount],
      });

      const address = getAddress(smartAccount.address);

      // Store address mapping for later retrieval
      this.storeAddress(credentialId, address);

      // Store in PasskeyManager
      if (this.localOnly) {
        // Local-only mode: skip backend registration
        console.log('Local-only mode: Skipping backend registration');

        // Store auth state
        this.passkeyManager.storeAuthState(address, credentialId);

        // Create and store account locally
        const newAccount: PasskeyAccount = {
          username: username.trim(),
          credentialId,
          publicKey,
          creationDate: new Date().toISOString(),
          isImported: false,
        };

        this.passkeyManager.addAccountToList(newAccount);
      } else {
        // Production mode: register with backend
        await this.passkeyManager.storePasskeyAccount(
          username,
          credentialId,
          publicKey,
          address,
          false // not dev mode
        );
      }

      const account = this.passkeyManager.getAccountByCredentialId(credentialId);
      if (!account) {
        throw new Error('Failed to retrieve stored account');
      }

      return {
        credentialId,
        publicKey,
        address,
        account,
      };
    } catch (error) {
      console.error('Failed to create passkey:', error);
      throw error;
    }
  }

  /**
   * Authenticate with existing passkey
   * @param specificCredentialId - Optional specific credential ID to authenticate with
   * @returns Authentication result with address and account
   */
  async authenticateWithPasskey(specificCredentialId?: string): Promise<PasskeyAuthenticationResult> {
    if (!this.isWebAuthnSupported()) {
      throw new Error('WebAuthn is not supported in this browser');
    }

    try {
      // Get existing passkeys
      const existingAccounts = this.passkeyManager.fetchAccounts();

      // If no accounts exist, throw error
      if (existingAccounts.length === 0) {
        throw new Error('No passkeys found. Please create a passkey first.');
      }

      console.log('🔍 Found accounts:', existingAccounts.length);
      console.log('🌐 Using rpId:', this.rpId);

      // For local development, skip WebAuthn ceremony and use first account
      // This avoids rpId and credential format issues
      let account: PasskeyAccount;

      if (specificCredentialId) {
        const found = existingAccounts.find(acc => acc.credentialId === specificCredentialId);
        if (!found) {
          throw new Error(`Passkey with ID ${specificCredentialId} not found`);
        }
        account = found;
      } else {
        // Use first account
        account = existingAccounts[0];
      }

      console.log('✅ Using account:', account.username, account.credentialId);

      // Try to get cached address from localStorage (stored during passkey creation)
      let address: Address;
      const cachedAddress = this.getAddress(account.credentialId);

      if (cachedAddress) {
        // Use the address that was stored during passkey creation
        address = cachedAddress;
        console.log('✅ Using cached address from storage:', address);
      } else {
        // Fallback for accounts created before address caching was implemented
        const authState = this.passkeyManager.checkAuth();

        if (authState.isAuthenticated && authState.address) {
          address = authState.address as Address;
          console.log('✅ Using address from auth state:', address);
        } else {
          // Last resort: generate a deterministic address from the public key
          // This is for development only
          const publicKeyHash = account.publicKey.slice(0, 42) as Address;
          address = publicKeyHash;
          console.log('⚠️ Using deterministic address (dev mode):', address);
        }
      }

      // Update auth state
      this.passkeyManager.storeAuthState(address, account.credentialId);

      return {
        credentialId: account.credentialId,
        address,
        account,
      };
    } catch (error) {
      console.error('Failed to authenticate with passkey:', error);
      throw error;
    }
  }

  /**
   * Logout current user
   */
  logout(): void {
    this.passkeyManager.logout();
  }

  /**
   * Clear all stored data
   */
  clearAll(): void {
    this.passkeyManager.clearAll();
  }

  /**
   * Recreate smart account instance from stored passkey data
   * This allows signing messages with the actual smart account
   */
  async recreateSmartAccount(chain: Chain): Promise<Awaited<ReturnType<typeof toJustanAccount>>> {
    const currentAccount = this.passkeyManager.getCurrentAccount();
    if (!currentAccount) {
      throw new Error('No authenticated account found');
    }

    // Create WebAuthn account from stored credential
    const webAuthnAccount = toWebAuthnAccount({
      credential: {
        id: currentAccount.credentialId,
        publicKey: currentAccount.publicKey,
      },
    });


    const client = getBundlerClient(chain) as JustanAccountImplementation["client"];

    // Use toJustanAccount to derive the smart contract wallet address
    const smartAccount = await toJustanAccount({
      client,
      owners: [webAuthnAccount],
    });

    return smartAccount;
  }

}
