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
}

/**
 * PasskeyService handles WebAuthn passkey creation and authentication
 * Uses Account class for all passkey operations
 */
export class PasskeyService {
  private rpId: string;
  private rpName: string;
  private apiKey: string;
  private defaultChainId: number;

  constructor(preference?: { serverUrl?: string; apiKey?: string; localOnly?: boolean; defaultChainId?: number }) {
    this.apiKey = preference?.apiKey || '';
    this.defaultChainId = preference?.defaultChainId ?? +(process.env.NEXT_PUBLIC_CHAIN_ID || 1);
    // For local development, use localhost
    // For production, use your actual domain
    this.rpId = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    this.rpName = 'JAW';
  }

  private getDefaultChainId(): number {
    return this.defaultChainId;
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
   * Get all stored passkey accounts
   */
  fetchAccounts(): PasskeyAccount[] {
    return Account.getStoredAccounts(this.apiKey);
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
      // Create account using Account.create which handles everything
      const account = await Account.create(
        {
          chainId: this.getDefaultChainId(),
          apiKey: this.apiKey,
        },
        {
          username,
          rpId: this.rpId,
          rpName: this.rpName,
        }
      );

      const metadata = account.getMetadata();
      if (!metadata) {
        throw new Error('Failed to get account metadata after creation');
      }

      // Get the passkey account from stored accounts
      const storedAccounts = Account.getStoredAccounts(this.apiKey);
      const passkeyAccount = storedAccounts.find(acc => acc.username === username);

      if (!passkeyAccount) {
        throw new Error('Failed to retrieve created passkey account');
      }

      console.log('🔍 Smart account address:', account.address);

      return {
        credentialId: passkeyAccount.credentialId,
        publicKey: passkeyAccount.publicKey,
        address: account.address,
        account: passkeyAccount,
      };
    } catch (error) {
      console.error('Failed to create passkey:', error);
      throw error;
    }
  }

  /**
   * Authenticate with existing passkey (login)
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

      // Find the passkey data
      const passkeyData = existingAccounts.find(acc => acc.credentialId === credentialId);
      if (!passkeyData) {
        throw new Error(`Passkey with ID ${credentialId} not found`);
      }

      console.log('✅ Using account:', passkeyData.username, credentialId);

      // Use Account.get which handles WebAuthn authentication
      const account = await Account.get(
        {
          chainId: this.getDefaultChainId(),
          apiKey: this.apiKey,
        },
        credentialId
      );

      return {
        credentialId,
        address: account.address,
        account: passkeyData,
      };
    } catch (error) {
      console.error('Failed to authenticate with passkey:', error);
      throw error;
    }
  }

  /**
   * Import a passkey account from the cloud
   * @returns PasskeyAuthenticationResult
   */
  async importPasskeyAccount(): Promise<PasskeyAuthenticationResult> {
    // Import passkey using Account.import which handles everything
    const account = await Account.import({
      chainId: this.getDefaultChainId(),
      apiKey: this.apiKey,
    });

    const metadata = account.getMetadata();
    if (!metadata) {
      throw new Error('Failed to get account metadata after import');
    }

    // Get the imported passkey account from stored accounts
    const storedAccounts = Account.getStoredAccounts(this.apiKey);
    const passkeyAccount = storedAccounts.find(acc => acc.isImported && acc.username === metadata.username);

    if (!passkeyAccount) {
      throw new Error('Failed to retrieve imported passkey account');
    }

    return {
      credentialId: passkeyAccount.credentialId,
      address: account.address,
      account: passkeyAccount,
    };
  }

  /**
   * Get an Account instance for signing operations
   * @param chain - Chain configuration
   * @returns Account instance
   */
  async getAccount(chain: Chain): Promise<Account> {
    return Account.get({
      chainId: chain.id,
      apiKey: this.apiKey,
      paymasterUrl: chain.paymaster?.url,
    });
  }
}
