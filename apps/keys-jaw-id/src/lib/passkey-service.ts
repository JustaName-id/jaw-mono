import {
  PasskeyManager, type PasskeyAccount, toJustanAccount, type JustanAccountImplementation, createSmartAccount,
  SUPPORTED_CHAINS, findOwnerIndex
} from '@jaw.id/core';
import type { Address, PublicClient } from 'viem';
import {  toWebAuthnAccount } from 'viem/account-abstraction';
import { getAddress, createPublicClient, http, Chain as ViemChain } from 'viem';
import { mainnet } from 'viem/chains';
import {type Chain, SPEND_PERMISSIONS_MANAGER_ADDRESS, getBundlerClient } from '@jaw.id/core';


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

  constructor(preference?: { serverUrl?: string; apiKey?: string; localOnly?: boolean }) {
    this.passkeyManager = new PasskeyManager(undefined, preference);
    // For local development, use localhost
    // For production, use your actual domain
    this.rpId = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    this.rpName = 'JAW Wallet';
  }

  private getMainnetPublicClient(): PublicClient {
      const viemChain = SUPPORTED_CHAINS.find(c => c.id === +(process.env.NEXT_PUBLIC_CHAIN_ID || 1));
      return createPublicClient({
      chain: viemChain as ViemChain,
      transport: http(process.env.NEXT_PUBLIC_MAINNET_CLIENT_URL),
    });
  }

  /**
   * Store address for a credential ID
   */
  private storeAddress(credentialId: string, address: Address): void {
      this.passkeyManager.storeAuthState(address, credentialId);
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
 fetchAccounts(): PasskeyAccount[] {
  return this.passkeyManager.fetchAccounts();
}

storeAuthState(address: Address, credentialId: string): void {
  this.passkeyManager.storeAuthState(address, credentialId);
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

      const client = this.getMainnetPublicClient();

      console.log('🔍 Creating smart account for chain:', mainnet);
      const smartAccount = await createSmartAccount(webAuthnAccount, client);

      console.log('🔍 Smart account created:', smartAccount);
      const address = getAddress(smartAccount.address);
      console.log('🔍 Smart account created for address:', address);

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

      // Perform WebAuthn authentication using core SDK
      const { challenge } = await this.passkeyManager.authenticateWithWebAuthn(
       
        this.rpId,
        credentialId,
        {
          userVerification: "preferred",
          timeout: 60000,
          transports: ["internal", "hybrid"],
        }
      );


      const webAuthnAccount = toWebAuthnAccount({
        credential: {
          id: passkeyData.credentialId,
          publicKey: passkeyData.publicKey,
        },
      });

      const client = this.getMainnetPublicClient();
      console.log('🔍 Creating smart account for chain:', client);
      const smartAccount = await createSmartAccount(webAuthnAccount, client);
      console.log('🔍 Smart account created:', smartAccount);
      const address = getAddress(smartAccount.address);
      this.storeAddress(credentialId, address);

      return {
        credentialId: credentialId,
        address:address,
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
   * @returns ImportWebAuthnAuthenticationResult
   * @throws {PasskeyLookupError} If backend lookup fails or passkey not found
   */
  async importPasskeyAccount(): Promise<PasskeyAuthenticationResult> {
    const result = await this.passkeyManager.importPasskeyAccount();
    const { name,credential } = result;
    const client = this.getMainnetPublicClient();
    const webAuthnAccount = toWebAuthnAccount({
      credential: {
        id: credential.id,
        publicKey: credential.publicKey,
      },
    });
    const smartAccount = await createSmartAccount(webAuthnAccount, client);
    const address = getAddress(smartAccount.address);
    this.storeAddress(credential.id, address);

    const newAccount: PasskeyAccount = {
      credentialId: credential.id,
      publicKey: credential.publicKey,
      username: name,
      creationDate: new Date().toISOString(),
      isImported: true,
    };

    this.passkeyManager.addAccountToList(newAccount);

    return {
      credentialId: credential.id,
      address: address,
      account: newAccount,
    };
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


    console.log('🔍 Creating bundler client for chain:', chain);
    const client = getBundlerClient(chain) as JustanAccountImplementation["client"];

    const tempSmartAccount = await toJustanAccount({
      client,
      owners: [webAuthnAccount, SPEND_PERMISSIONS_MANAGER_ADDRESS],
    });

    const smartAccountAddress = await tempSmartAccount.getAddress();

    const ownerIndex = await findOwnerIndex({
      address: smartAccountAddress,
      client: client,
      publicKey: webAuthnAccount.publicKey,
    });


    // Use toJustanAccount to derive the smart contract wallet address
    const smartAccount = await toJustanAccount({
      client,
      owners: [webAuthnAccount, SPEND_PERMISSIONS_MANAGER_ADDRESS],
      ownerIndex
    });

    return smartAccount;
  }

}
