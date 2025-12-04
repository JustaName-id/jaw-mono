import {
  type PasskeyAccount,
  Account,
  type Chain,
} from '@jaw.id/core';
import type { Address } from 'viem';

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
  challenge?: Uint8Array;
}

/**
 * PasskeyService handles WebAuthn passkey creation and authentication
 * Uses Account class for all passkey operations
 */
export class PasskeyService {
  private rpId: string;
  private rpName: string;
  private apiKey: string;

  constructor(preference?: { serverUrl?: string; apiKey?: string; localOnly?: boolean }) {
    this.apiKey = preference?.apiKey || process.env.NEXT_PUBLIC_API_KEY || '';
    // For local development, use localhost
    // For production, use your actual domain
    this.rpId = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    this.rpName = 'JAW Wallet';
  }

  private getDefaultChainId(): number {
    return +(process.env.NEXT_PUBLIC_CHAIN_ID || 1);
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
    return {
      isAuthenticated: Account.isAuthenticated(this.apiKey),
      address: Account.getAuthenticatedAddress(this.apiKey),
    };
  }

  /**
   * Get all stored passkey accounts
   */
  fetchAccounts(): PasskeyAccount[] {
    return Account.getStoredAccounts(this.apiKey);
  }

  storeAuthState(address: Address, credentialId: string): void {
    Account.storeAuthState(address, credentialId, this.apiKey);
  }

  /**
   * Get currently active account
   */
  getCurrentAccount(): PasskeyAccount | undefined {
    return Account.getCurrentAccount(this.apiKey);
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
      // Create passkey using Account class
      const { credentialId, publicKey, passkeyAccount } = await Account.createPasskeyCredential(
        username,
        this.apiKey,
        { rpId: this.rpId, rpName: this.rpName }
      );

      // Get address using Account class
      const address = await Account.getAddressForPublicKey(
        {
          chainId: this.getDefaultChainId(),
          apiKey: this.apiKey,
        },
        credentialId,
        publicKey
      );

      console.log('🔍 Smart account address:', address);

      Account.storeAuthState(address, credentialId, this.apiKey);

      return {
        credentialId,
        publicKey,
        address,
        account: passkeyAccount,
      };
    } catch (error) {
      console.error('Failed to create passkey:', error);
      throw error;
    }
  }

  /**
   * Authenticate with existing passkey
   * @param credentialId - specific credential ID to authenticate with
   * @returns Authentication result with address and account
   */
  async authenticateWithPasskey(credentialId: string): Promise<PasskeyAuthenticationResult> {
    if (!this.isWebAuthnSupported()) {
      throw new Error('WebAuthn is not supported in this browser');
    }

    try {
      // Get existing passkeys
      const existingAccounts = this.fetchAccounts();

      // If no accounts exist, throw error
      if (existingAccounts.length === 0) {
        throw new Error('No passkeys found. Please create a passkey first.');
      }

      console.log('🔍 Found accounts:', existingAccounts.length);
      console.log('🌐 Using rpId:', this.rpId);

      // Filter passkey data from found accounts
      const passkeyData = existingAccounts.find(acc => acc.credentialId === credentialId);
      if (!passkeyData) {
        throw new Error(`Passkey with ID ${credentialId} not found`);
      }

      console.log('✅ Using account:', passkeyData.username, credentialId);

      // Perform WebAuthn authentication using Account class
      const { challenge } = await Account.authenticateWithWebAuthn(credentialId, this.apiKey);

      // Get address using Account class
      const address = await Account.getAddressForCredential(
        {
          chainId: this.getDefaultChainId(),
          apiKey: this.apiKey,
        },
        credentialId
      );

      Account.storeAuthState(address, credentialId, this.apiKey);

      return {
        credentialId,
        address,
        account: passkeyData,
        challenge,
      };
    } catch (error) {
      console.error('Failed to authenticate with passkey:', error);
      throw error;
    }
  }

  /**
   * Import a passkey account from the backend
   * @returns PasskeyAuthenticationResult
   * @throws {PasskeyLookupError} If backend lookup fails or passkey not found
   */
  async importPasskeyAccount(): Promise<PasskeyAuthenticationResult> {
    // Import passkey using Account class
    const { name, credential } = await Account.importPasskeyCredential(this.apiKey);

    // Get address using Account class
    const address = await Account.getAddressForPublicKey(
      {
        chainId: this.getDefaultChainId(),
        apiKey: this.apiKey,
      },
      credential.id,
      credential.publicKey
    );

    Account.storeAuthState(address, credential.id, this.apiKey);

    const newAccount: PasskeyAccount = {
      credentialId: credential.id,
      publicKey: credential.publicKey,
      username: name,
      creationDate: new Date().toISOString(),
      isImported: true,
    };

    Account.storePasskeyAccount(newAccount, this.apiKey);

    return {
      credentialId: credential.id,
      address,
      account: newAccount,
    };
  }

  /**
   * Get an Account instance for signing operations
   * @param chain - Chain configuration
   * @returns Account instance
   */
  async getAccount(chain: Chain): Promise<Account> {
    return Account.restore({
      chainId: chain.id,
      apiKey: this.apiKey,
      paymasterUrl: chain.paymasterUrl,
    });
  }
}
