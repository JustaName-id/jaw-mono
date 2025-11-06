import { PasskeyManager, type PasskeyAccount, toJustanAccount, type JustanAccountImplementation, createSmartAccount} from '@jaw.id/core';
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
  challenge?: Uint8Array;
}

/**
 * PasskeyService handles WebAuthn passkey creation and authentication
 * Integrates with PasskeyManager for storage and backend sync
 */
export class PasskeyService {
  private passkeyManager: PasskeyManager;
  private rpId: string;
  private rpName: string;
  private static ADDRESS_STORAGE_KEY = 'jaw_passkey_addresses';

  constructor(preference?: { serverUrl?: string; apiKey?: string; localOnly?: boolean }) {
    this.passkeyManager = new PasskeyManager(undefined, preference);
    // For local development, use localhost
    // For production, use your actual domain
    this.rpId = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    this.rpName = 'JAW Wallet';
  }

  /**
   * Store address for a credential ID
   */
  private storeAddress(credentialId: string, address: Address): void {
      this.passkeyManager.storeAuthState(address, credentialId);

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
    
      const { credentialId, publicKey, webAuthnAccount , passkeyAccount} = await this.passkeyManager.createPasskey(username, this.rpId, this.rpName);

      const client = createPublicClient({
        chain: baseSepolia,
        transport: http(),
      });

      const smartAccount = await createSmartAccount(webAuthnAccount, client);

      const address = getAddress(smartAccount.address);

      this.storeAddress(credentialId, address);

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
   * @param specificCredentialId - specific credential ID to authenticate with
   * @returns Authentication result with address and account
   */
  async authenticateWithPasskey(specificCredentialId: string): Promise<PasskeyAuthenticationResult> {
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

      // Filter passkey data from found accounts
      const passkeyData = existingAccounts.find(acc => acc.credentialId === specificCredentialId);
      if (!passkeyData) {
        throw new Error(`Passkey with ID ${specificCredentialId} not found`);
      }

      console.log('✅ Using account:', passkeyData.username, specificCredentialId);

      // Perform WebAuthn authentication using core SDK
      const { challenge } = await this.passkeyManager.authenticateWithWebAuthn(
        specificCredentialId,
        this.rpId,
        {
          userVerification: "preferred",
          timeout: 60000,
          transports: ["internal", "hybrid"],
        }
      );

      // Get cached address from localStorage (stored during passkey creation)
      const cachedAddress = this.getAddress(specificCredentialId);

      if (!cachedAddress) {
        throw new Error(`Address not found for credential ID: ${specificCredentialId}. Please recreate the passkey.`);
      }

      const address: Address = cachedAddress;
      console.log('✅ Using cached address from storage:', address);

      // Update auth state
      this.passkeyManager.storeAuthState(address, specificCredentialId);

      return {
        credentialId: specificCredentialId,
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
