import { PasskeyManager, type PasskeyAccount, toJustanAccount } from '@jaw.id/core';
import type { Address } from 'viem';
import { createWebAuthnCredential, toWebAuthnAccount } from 'viem/account-abstraction';
import { getAddress, createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

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
        chain: mainnet,
        transport: http(),
      });

      // Use toJustanAccount to derive the smart contract wallet address
      const smartAccount = await toJustanAccount({
        client,
        owners: [webAuthnAccount],
      });

      const address = getAddress(smartAccount.address);

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
   * @returns Authentication result with address and account
   */
  async authenticateWithPasskey(): Promise<PasskeyAuthenticationResult> {
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

      // Use conditional mediation to let user select their passkey
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rpId: this.rpId,
          allowCredentials: existingAccounts.map(acc => ({
            type: 'public-key',
            id: this.base64UrlDecode(acc.credentialId),
          })),
          userVerification: 'required',
          timeout: 60000,
        },
        mediation: 'optional', // Allow user to select from available credentials
      }) as PublicKeyCredential | null;

      if (!credential) {
        throw new Error('Authentication cancelled or failed');
      }

      const credentialId = this.base64UrlEncode(new Uint8Array(credential.rawId));

      // Find the account
      const account = this.passkeyManager.getAccountByCredentialId(credentialId);

      if (!account) {
        // Account exists on device but not in our storage, need to import it
        throw new Error('Passkey found but not registered. Please register this passkey first.');
      }

      // Create WebAuthn account from stored credential
      const webAuthnAccount = toWebAuthnAccount({
        credential: {
          id: account.credentialId,
          publicKey: account.publicKey,
        },
      });

      // Create a public client to interact with the smart account factory
      const client = createPublicClient({
        chain: mainnet,
        transport: http(),
      });

      // Use toJustanAccount to derive the smart contract wallet address
      const smartAccount = await toJustanAccount({
        client,
        owners: [webAuthnAccount],
      });
     
  
  
      const address = getAddress(smartAccount.address);

      // Update auth state
      this.passkeyManager.storeAuthState(address, credentialId);

      return {
        credentialId,
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
  async recreateSmartAccount(): Promise<Awaited<ReturnType<typeof toJustanAccount>>> {
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

    // Create a public client to interact with the smart account factory
    const client = createPublicClient({
      chain: mainnet,
      transport: http(),
    });

    // Use toJustanAccount to derive the smart contract wallet address
    const smartAccount = await toJustanAccount({
      client,
      owners: [webAuthnAccount],
    });

    return smartAccount;
  }

  /**
   * Base64URL encode
   */
  private base64UrlEncode(buffer: Uint8Array): string {
    const base64 = btoa(String.fromCharCode(...Array.from(buffer)));
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Base64URL decode
   */
  private base64UrlDecode(base64url: string): ArrayBuffer {
    const base64 = base64url
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const binaryString = atob(base64 + padding);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

}
