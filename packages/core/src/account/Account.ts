import type { Address, Hash, Hex, TypedDataDefinition, TypedData, LocalAccount } from 'viem';
import { parseEther, isHex } from 'viem';
import { toWebAuthnAccount, type SmartAccount } from 'viem/account-abstraction';
import {
  createSmartAccount,
  sendTransaction as sendSmartAccountTransaction,
  sendBundledTransaction as sendSmartAccountBundledTransaction,
  estimateUserOpGas,
  calculateGas,
  getBundlerClient,
  type BundledTransactionResult,
} from './smartAccount.js';
import type { JustanAccountImplementation } from './toJustanAccount.js';
import { PasskeyManager, type PasskeyAccount } from '../passkey-manager/index.js';
import {
  grantPermissions as grantSmartAccountPermissions,
  revokePermission as revokeSmartAccountPermission,
  getPermissionFromRelay,
  type PermissionsDetail,
  type WalletGrantPermissionsResponse,
  type RevokePermissionApiResponse,
  type SpendPeriod,
  type CallPermissionDetail,
  type SpendPermissionDetail,
} from '../rpc/permissions.js';
import { JAW_RPC_URL } from '../constants.js';
import type { Chain } from '../store/index.js';

/**
 * Configuration for creating or loading an Account
 */
export interface AccountConfig {
  /** Chain ID for the account */
  chainId: number;
  /** API key for JAW services */
  apiKey?: string;
  /** Custom paymaster URL for gas sponsorship */
  paymasterUrl?: string;
}

/**
 * Options for creating a new account with passkey
 */
export interface CreateAccountOptions {
  /** Username/display name for the passkey */
  username: string;
  /** Relying party identifier (defaults to window.location.hostname) */
  rpId?: string;
  /** Relying party name (defaults to 'JAW Wallet') */
  rpName?: string;
}

/**
 * Transaction call structure
 */
export interface TransactionCall {
  /** Target contract address */
  to: Address;
  /** Value to send (supports bigint, hex string, decimal string, or ether string like "0.1") */
  value?: bigint | string;
  /** Call data */
  data?: Hex;
}

/**
 * Account metadata returned by getMetadata()
 */
export interface AccountMetadata {
  /** Username/display name for the account */
  username: string;
  /** ISO date string when the account was created */
  creationDate: string;
  /** Whether the account was imported from cloud backup */
  isImported: boolean;
}

/**
 * High-level API for smart account operations
 *
 * The Account class provides a unified interface for:
 * - Creating and managing smart accounts with passkey authentication
 * - Signing messages and typed data
 * - Sending transactions (single and bundled)
 * - Granting and revoking permissions
 *
 * @example
 * ```typescript
 * // Load existing account
 * const account = await Account.load({ chainId: 1, apiKey: 'your-api-key' });
 *
 * // Create new account
 * const account = await Account.create(
 *   { chainId: 1, apiKey: 'your-api-key' },
 *   { username: 'myuser' }
 * );
 *
 * // Send transaction
 * const hash = await account.sendTransaction([
 *   { to: '0x...', value: '0.1', data: '0x' }
 * ]);
 * ```
 */
export class Account {
  private readonly _smartAccount: SmartAccount;
  private readonly _chain: Chain;
  private readonly _passkeyAccount: PasskeyAccount | null;
  private readonly _apiKey: string;

  /**
   * Private constructor - use static factory methods to create instances
   */
  private constructor(
    smartAccount: SmartAccount,
    chain: Chain,
    apiKey: string,
    passkeyAccount?: PasskeyAccount
  ) {
    this._smartAccount = smartAccount;
    this._chain = chain;
    this._passkeyAccount = passkeyAccount ?? null;
    this._apiKey = apiKey;
  }

  // ============================================
  // Static Factory Methods
  // ============================================

  /**
   * Load an authenticated account from storage (triggers WebAuthn re-authentication)
   *
   * This method verifies the user still owns the passkey by triggering WebAuthn.
   * For restoring an account without re-authentication (e.g., after initial connect),
   * use `Account.restore()` instead.
   *
   * @param config - Account configuration
   * @returns Promise resolving to the loaded Account instance
   * @throws Error if not authenticated or loading fails
   *
   * @example
   * ```typescript
   * const account = await Account.load({ chainId: 1, apiKey: 'your-api-key' });
   * console.log('Address:', account.address);
   * ```
   */
  static async load(config: AccountConfig): Promise<Account> {
    const { chainId, apiKey = '', paymasterUrl } = config;

    const passkeyManager = new PasskeyManager(undefined, undefined, apiKey);
    const authResult = passkeyManager.checkAuth();

    if (!authResult.isAuthenticated || !authResult.address) {
      throw new Error('Not authenticated. Please login or create an account first.');
    }

    const credentialId = passkeyManager.fetchActiveCredentialId();
    if (!credentialId) {
      throw new Error('No active credential found.');
    }

    const passkeyAccount = passkeyManager.getAccountByCredentialId(credentialId);
    if (!passkeyAccount) {
      throw new Error('Passkey account not found for active credential.');
    }

    const chain = Account.buildChainConfig(chainId, apiKey, paymasterUrl);

    // Authenticate with WebAuthn to verify the user owns the passkey
    await passkeyManager.authenticateWithWebAuthn(
      typeof window !== 'undefined' ? window.location.hostname : 'localhost',
      credentialId
    );

    // Use stored credential info to create WebAuthn account
    const webAuthnAccount = toWebAuthnAccount({
      credential: {
        id: credentialId,
        publicKey: passkeyAccount.publicKey,
      },
    });

    const bundlerClient = getBundlerClient(chain);
    const smartAccount = await createSmartAccount(webAuthnAccount, bundlerClient as JustanAccountImplementation['client']);

    return new Account(smartAccount, chain, apiKey, passkeyAccount);
  }

  /**
   * Restore an authenticated account from storage WITHOUT triggering WebAuthn
   *
   * This method recreates the Account from stored credentials assuming the user
   * has already authenticated (e.g., during wallet_connect). Use this for subsequent
   * operations like signing and transactions after initial authentication.
   *
   * For initial authentication that verifies passkey ownership, use `Account.load()` instead.
   *
   * @param config - Account configuration
   * @returns Promise resolving to the restored Account instance
   * @throws Error if not authenticated or no account found
   *
   * @example
   * ```typescript
   * // After user has authenticated via wallet_connect
   * const account = await Account.restore({ chainId: 1, apiKey: 'your-api-key' });
   * const signature = await account.signMessage('Hello');
   * ```
   */
  static async restore(config: AccountConfig): Promise<Account> {
    const { chainId, apiKey = '', paymasterUrl } = config;

    const passkeyManager = new PasskeyManager(undefined, undefined, apiKey);
    const authResult = passkeyManager.checkAuth();

    if (!authResult.isAuthenticated || !authResult.address) {
      throw new Error('Not authenticated. Please connect first.');
    }

    const currentAccount = passkeyManager.getCurrentAccount();
    if (!currentAccount) {
      throw new Error('No authenticated account found. Please connect first.');
    }

    // Use stored credential info to create WebAuthn account (no re-auth)
    const webAuthnAccount = toWebAuthnAccount({
      credential: {
        id: currentAccount.credentialId,
        publicKey: currentAccount.publicKey,
      },
    });

    const chain = Account.buildChainConfig(chainId, apiKey, paymasterUrl);
    const bundlerClient = getBundlerClient(chain);
    const smartAccount = await createSmartAccount(webAuthnAccount, bundlerClient as JustanAccountImplementation['client']);

    return new Account(smartAccount, chain, apiKey, currentAccount);
  }

  /**
   * Create a new account with a passkey
   *
   * @param config - Account configuration
   * @param options - Options for creating the passkey
   * @returns Promise resolving to the new Account instance
   *
   * @example
   * ```typescript
   * const account = await Account.create(
   *   { chainId: 1, apiKey: 'your-api-key' },
   *   { username: 'myuser' }
   * );
   * ```
   */
  static async create(config: AccountConfig, options: CreateAccountOptions): Promise<Account> {
    const { chainId, apiKey = '', paymasterUrl } = config;
    const { username, rpId, rpName } = options;

    const resolvedRpId = rpId ?? (typeof window !== 'undefined' ? window.location.hostname : 'localhost');
    const resolvedRpName = rpName ?? 'JAW Wallet';

    const passkeyManager = new PasskeyManager(undefined, undefined, apiKey);

    // Create the passkey
    const { credentialId, publicKey, webAuthnAccount, passkeyAccount } = await passkeyManager.createPasskey(
      username,
      resolvedRpId,
      resolvedRpName
    );

    const chain = Account.buildChainConfig(chainId, apiKey, paymasterUrl);

    const bundlerClient = getBundlerClient(chain);
    const smartAccount = await createSmartAccount(webAuthnAccount, bundlerClient as JustanAccountImplementation['client']);
    const address = await smartAccount.getAddress();

    // Store the passkey account with the smart account address
    await passkeyManager.storePasskeyAccount(
      username,
      credentialId,
      publicKey,
      address
    );

    return new Account(smartAccount, chain, apiKey, passkeyAccount);
  }

  /**
   * Import a passkey from cloud backup
   *
   * @param config - Account configuration
   * @returns Promise resolving to the imported Account instance
   *
   * @example
   * ```typescript
   * const account = await Account.import({ chainId: 1, apiKey: 'your-api-key' });
   * ```
   */
  static async import(config: AccountConfig): Promise<Account> {
    const { chainId, apiKey = '', paymasterUrl } = config;

    const passkeyManager = new PasskeyManager(undefined, undefined, apiKey);

    // Import passkey from cloud backup
    const importResult = await passkeyManager.importPasskeyAccount();

    const webAuthnAccount = toWebAuthnAccount({
      credential: {
        id: importResult.credential.id,
        publicKey: importResult.credential.publicKey,
      },
    });

    const chain = Account.buildChainConfig(chainId, apiKey, paymasterUrl);

    const bundlerClient = getBundlerClient(chain);
    const smartAccount = await createSmartAccount(webAuthnAccount, bundlerClient as JustanAccountImplementation['client']);
    const address = await smartAccount.getAddress();

    // Store for login (marks as imported)
    await passkeyManager.storePasskeyAccountForLogin(importResult.credential.id, address);

    const passkeyAccount = passkeyManager.getAccountByCredentialId(importResult.credential.id);
    if (!passkeyAccount) {
      throw new Error('Failed to retrieve imported passkey account.');
    }

    return new Account(smartAccount, chain, apiKey, passkeyAccount);
  }

  /**
   * Login with an existing passkey
   *
   * @param config - Account configuration
   * @param credentialId - The credential ID of the passkey to login with
   * @returns Promise resolving to the logged-in Account instance
   *
   * @example
   * ```typescript
   * const accounts = Account.getStoredAccounts('your-api-key');
   * const account = await Account.login(
   *   { chainId: 1, apiKey: 'your-api-key' },
   *   accounts[0].credentialId
   * );
   * ```
   */
  static async login(config: AccountConfig, credentialId: string): Promise<Account> {
    const { chainId, apiKey = '', paymasterUrl } = config;

    const passkeyManager = new PasskeyManager(undefined, undefined, apiKey);

    const passkeyAccount = passkeyManager.getAccountByCredentialId(credentialId);
    if (!passkeyAccount) {
      throw new Error(`No account found for credential ID: ${credentialId}`);
    }

    const rpId = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

    // Authenticate with WebAuthn to verify the user owns the passkey
    await passkeyManager.authenticateWithWebAuthn(rpId, credentialId);

    // Use stored credential info to create WebAuthn account
    const webAuthnAccount = toWebAuthnAccount({
      credential: {
        id: credentialId,
        publicKey: passkeyAccount.publicKey,
      },
    });

    const chain = Account.buildChainConfig(chainId, apiKey, paymasterUrl);

    const bundlerClient = getBundlerClient(chain);
    const smartAccount = await createSmartAccount(webAuthnAccount, bundlerClient as JustanAccountImplementation['client']);
    const address = await smartAccount.getAddress();

    // Update auth state
    passkeyManager.storeAuthState(address, credentialId);

    return new Account(smartAccount, chain, apiKey, passkeyAccount);
  }

  /**
   * Create an account from a LocalAccount (e.g., from Privy, Dynamic, or private key)
   *
   * This method is ideal for server-side usage or when integrating with
   * embedded wallet providers like Privy, Dynamic, Magic, Turnkey, etc.
   *
   * @param config - Account configuration
   * @param localAccount - A viem LocalAccount instance
   * @returns Promise resolving to the Account instance
   *
   * @example
   * ```typescript
   * import { privateKeyToAccount } from 'viem/accounts';
   *
   * // From private key
   * const localAccount = privateKeyToAccount('0x...');
   * const account = await Account.fromLocalAccount(
   *   { chainId: 1, apiKey: 'your-api-key' },
   *   localAccount
   * );
   *
   * // From Privy embedded wallet
   * const privyAccount = await privy.getEmbeddedWallet();
   * const account = await Account.fromLocalAccount(
   *   { chainId: 1, apiKey: 'your-api-key' },
   *   privyAccount
   * );
   * ```
   */
  static async fromLocalAccount(
    config: AccountConfig,
    localAccount: LocalAccount
  ): Promise<Account> {
    const { chainId, apiKey = '', paymasterUrl } = config;

    const chain = Account.buildChainConfig(chainId, apiKey, paymasterUrl);

    const bundlerClient = getBundlerClient(chain);
    const smartAccount = await createSmartAccount(localAccount, bundlerClient as JustanAccountImplementation['client']);

    return new Account(smartAccount, chain, apiKey);
  }

  // ============================================
  // Static Utility Methods
  // ============================================

  /**
   * Check if a user is authenticated
   *
   * @param apiKey - Optional API key
   * @returns true if authenticated, false otherwise
   *
   * @example
   * ```typescript
   * if (Account.isAuthenticated('your-api-key')) {
   *   const account = await Account.load({ chainId: 1, apiKey: 'your-api-key' });
   * }
   * ```
   */
  static isAuthenticated(apiKey?: string): boolean {
    const passkeyManager = new PasskeyManager(undefined, undefined, apiKey);
    return passkeyManager.checkAuth().isAuthenticated;
  }

  /**
   * Get the authenticated account address without fully loading the account
   *
   * @param apiKey - Optional API key
   * @returns The account address or null if not authenticated
   *
   * @example
   * ```typescript
   * const address = Account.getAuthenticatedAddress('your-api-key');
   * if (address) {
   *   console.log('Current address:', address);
   * }
   * ```
   */
  static getAuthenticatedAddress(apiKey?: string): Address | null {
    const passkeyManager = new PasskeyManager(undefined, undefined, apiKey);
    const authResult = passkeyManager.checkAuth();
    return authResult.isAuthenticated && authResult.address
      ? (authResult.address as Address)
      : null;
  }

  /**
   * Get all stored passkey accounts
   *
   * @param apiKey - Optional API key
   * @returns Array of stored passkey accounts
   *
   * @example
   * ```typescript
   * const accounts = Account.getStoredAccounts('your-api-key');
   * console.log(`Found ${accounts.length} stored accounts`);
   * ```
   */
  static getStoredAccounts(apiKey?: string): PasskeyAccount[] {
    const passkeyManager = new PasskeyManager(undefined, undefined, apiKey);
    return passkeyManager.fetchAccounts();
  }

  /**
   * Clear authentication state (logout)
   *
   * @param apiKey - Optional API key
   *
   * @example
   * ```typescript
   * Account.logout('your-api-key');
   * ```
   */
  static logout(apiKey?: string): void {
    const passkeyManager = new PasskeyManager(undefined, undefined, apiKey);
    passkeyManager.logout();
  }

  /**
   * Get the counterfactual smart account address for a stored credential without triggering WebAuthn
   *
   * This is useful for UI flows where you need to display the address before
   * the user confirms (e.g., in a connect dialog). It computes the address
   * from the stored credential without requiring user interaction.
   *
   * @param config - Account configuration (chainId, apiKey, paymasterUrl)
   * @param credentialId - The credential ID to get the address for
   * @returns Promise resolving to the smart account address
   * @throws Error if the credential is not found
   *
   * @example
   * ```typescript
   * // Get address to display in UI before user confirms
   * const address = await Account.getAddressForCredential(
   *   { chainId: 1, apiKey: 'your-api-key' },
   *   'credential-id'
   * );
   * // Show confirmation dialog with address...
   * // Then on confirm, call Account.login()
   * ```
   */
  static async getAddressForCredential(
    config: AccountConfig,
    credentialId: string
  ): Promise<Address> {
    const { apiKey = '' } = config;

    const passkeyManager = new PasskeyManager(undefined, undefined, apiKey);
    const passkeyAccount = passkeyManager.getAccountByCredentialId(credentialId);

    if (!passkeyAccount) {
      throw new Error(`No account found for credential ID: ${credentialId}`);
    }

    return Account.getAddressForPublicKey(config, credentialId, passkeyAccount.publicKey);
  }

  /**
   * Get the counterfactual smart account address for a credential ID and public key
   *
   * This is useful for UI flows where you have just created or imported a passkey
   * and need to compute the address before storing the account. It does not
   * require the credential to be stored yet.
   *
   * @param config - Account configuration (chainId, apiKey, paymasterUrl)
   * @param credentialId - The credential ID
   * @param publicKey - The public key as a hex string
   * @returns Promise resolving to the smart account address
   *
   * @example
   * ```typescript
   * // After creating a passkey, get the address before storing
   * const { credentialId, publicKey } = await passkeyManager.createPasskey(...);
   * const address = await Account.getAddressForPublicKey(
   *   { chainId: 1, apiKey: 'your-api-key' },
   *   credentialId,
   *   publicKey
   * );
   * // Show confirmation dialog with address...
   * ```
   */
  static async getAddressForPublicKey(
    config: AccountConfig,
    credentialId: string,
    publicKey: Hex
  ): Promise<Address> {
    const { chainId, apiKey = '', paymasterUrl } = config;

    // Create WebAuthn account from credential (no WebAuthn prompt)
    const webAuthnAccount = toWebAuthnAccount({
      credential: {
        id: credentialId,
        publicKey,
      },
    });

    const chain = Account.buildChainConfig(chainId, apiKey, paymasterUrl);
    const bundlerClient = getBundlerClient(chain);
    const smartAccount = await createSmartAccount(webAuthnAccount, bundlerClient as JustanAccountImplementation['client']);

    return smartAccount.address;
  }

  /**
   * Get the currently authenticated account details
   *
   * @param apiKey - Optional API key
   * @returns The current PasskeyAccount or undefined if not authenticated
   *
   * @example
   * ```typescript
   * const currentAccount = Account.getCurrentAccount('your-api-key');
   * if (currentAccount) {
   *   console.log('Logged in as:', currentAccount.username);
   * }
   * ```
   */
  static getCurrentAccount(apiKey?: string): PasskeyAccount | undefined {
    const passkeyManager = new PasskeyManager(undefined, undefined, apiKey);
    return passkeyManager.getCurrentAccount();
  }

  /**
   * Authenticate with WebAuthn for a specific credential
   *
   * This is useful for UI flows where you need to verify the user owns a passkey
   * before proceeding with an operation. It triggers the WebAuthn prompt.
   *
   * @param credentialId - The credential ID to authenticate with
   * @param apiKey - Optional API key
   * @param options - Optional WebAuthn options
   * @returns Promise resolving to the authentication result with challenge
   *
   * @example
   * ```typescript
   * // Authenticate user before showing confirmation dialog
   * const result = await Account.authenticateWithWebAuthn('credential-id', 'your-api-key');
   * // Now show confirmation dialog...
   * ```
   */
  static async authenticateWithWebAuthn(
    credentialId: string,
    apiKey?: string,
    options?: {
      userVerification?: 'preferred' | 'required' | 'discouraged';
      timeout?: number;
      transports?: AuthenticatorTransport[];
    }
  ): Promise<{ challenge: Uint8Array }> {
    const passkeyManager = new PasskeyManager(undefined, undefined, apiKey);
    const rpId = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

    return passkeyManager.authenticateWithWebAuthn(rpId, credentialId, {
      userVerification: options?.userVerification ?? 'preferred',
      timeout: options?.timeout ?? 60000,
      transports: options?.transports ?? ['internal', 'hybrid'],
    });
  }

  /**
   * Store authentication state after successful authentication
   *
   * This should be called after authenticating to persist the auth state.
   *
   * @param address - The wallet address
   * @param credentialId - The credential ID that was authenticated
   * @param apiKey - Optional API key
   *
   * @example
   * ```typescript
   * // After authentication and getting address
   * Account.storeAuthState(address, credentialId, 'your-api-key');
   * ```
   */
  static storeAuthState(address: Address, credentialId: string, apiKey?: string): void {
    const passkeyManager = new PasskeyManager(undefined, undefined, apiKey);
    passkeyManager.storeAuthState(address, credentialId);
  }

  /**
   * Create a new passkey credential
   *
   * This triggers the WebAuthn registration flow to create a new passkey.
   * After creation, use `getAddressForPublicKey` to get the wallet address,
   * then `storePasskeyAccount` to persist the account.
   *
   * @param username - Display name for the passkey
   * @param apiKey - Optional API key
   * @param options - Optional creation options
   * @returns Promise resolving to the created credential details
   *
   * @example
   * ```typescript
   * // Create a new passkey
   * const { credentialId, publicKey, passkeyAccount } = await Account.createPasskeyCredential(
   *   'myuser',
   *   'your-api-key'
   * );
   * // Get the wallet address
   * const address = await Account.getAddressForPublicKey(config, credentialId, publicKey);
   * // Store the account
   * Account.storePasskeyAccount(passkeyAccount, 'your-api-key');
   * ```
   */
  static async createPasskeyCredential(
    username: string,
    apiKey?: string,
    options?: {
      rpId?: string;
      rpName?: string;
    }
  ): Promise<{
    credentialId: string;
    publicKey: Hex;
    passkeyAccount: PasskeyAccount;
  }> {
    const passkeyManager = new PasskeyManager(undefined, undefined, apiKey);
    const rpId = options?.rpId ?? (typeof window !== 'undefined' ? window.location.hostname : 'localhost');
    const rpName = options?.rpName ?? 'JAW Wallet';

    const { credentialId, publicKey, passkeyAccount } = await passkeyManager.createPasskey(
      username,
      rpId,
      rpName
    );

    return { credentialId, publicKey, passkeyAccount };
  }

  /**
   * Import a passkey from cloud backup
   *
   * This triggers the WebAuthn flow to import an existing passkey from the cloud.
   * After import, use `getAddressForPublicKey` to get the wallet address,
   * then `storePasskeyAccount` to persist the account.
   *
   * @param apiKey - Optional API key
   * @returns Promise resolving to the imported credential details
   *
   * @example
   * ```typescript
   * // Import a passkey from cloud
   * const { name, credential } = await Account.importPasskeyCredential('your-api-key');
   * // Get the wallet address
   * const address = await Account.getAddressForPublicKey(config, credential.id, credential.publicKey);
   * // Create and store the account
   * const account = { credentialId: credential.id, publicKey: credential.publicKey, username: name, ... };
   * Account.storePasskeyAccount(account, 'your-api-key');
   * ```
   */
  static async importPasskeyCredential(apiKey?: string): Promise<{
    name: string;
    credential: { id: string; publicKey: Hex };
  }> {
    const passkeyManager = new PasskeyManager(undefined, undefined, apiKey);
    return passkeyManager.importPasskeyAccount();
  }

  /**
   * Store a passkey account to the local account list
   *
   * This adds an account to the stored accounts list without setting it as active.
   *
   * @param account - The passkey account to store
   * @param apiKey - Optional API key
   *
   * @example
   * ```typescript
   * Account.storePasskeyAccount({
   *   credentialId: 'cred-id',
   *   publicKey: '0x...',
   *   username: 'myuser',
   *   creationDate: new Date().toISOString(),
   *   isImported: false,
   * }, 'your-api-key');
   * ```
   */
  static storePasskeyAccount(account: PasskeyAccount, apiKey?: string): void {
    const passkeyManager = new PasskeyManager(undefined, undefined, apiKey);
    passkeyManager.addAccountToList(account);
  }

  // ============================================
  // Instance Properties
  // ============================================

  /**
   * The smart account address
   */
  get address(): Address {
    return this._smartAccount.address;
  }

  /**
   * The current chain ID
   */
  get chainId(): number {
    return this._chain.id;
  }

  // ============================================
  // Instance Methods - Info
  // ============================================

  /**
   * Get account metadata (only available for passkey-based accounts)
   *
   * @returns Account metadata including username, creation date, and import status,
   *          or null for accounts created via fromLocalAccount
   *
   * @example
   * ```typescript
   * const metadata = account.getMetadata();
   * if (metadata) {
   *   console.log(`Username: ${metadata.username}`);
   *   console.log(`Created: ${metadata.creationDate}`);
   * } else {
   *   console.log('Local account - no passkey metadata');
   * }
   * ```
   */
  getMetadata(): AccountMetadata | null {
    if (!this._passkeyAccount) {
      return null;
    }
    return {
      username: this._passkeyAccount.username,
      creationDate: this._passkeyAccount.creationDate,
      isImported: this._passkeyAccount.isImported,
    };
  }

  /**
   * Get the underlying viem SmartAccount for advanced operations
   *
   * @returns The raw SmartAccount instance
   *
   * @example
   * ```typescript
   * const smartAccount = account.getSmartAccount();
   * // Use for advanced viem operations
   * ```
   */
  getSmartAccount(): SmartAccount {
    return this._smartAccount;
  }

  /**
   * Get the chain configuration
   *
   * @returns The Chain configuration object
   *
   * @example
   * ```typescript
   * const chain = account.getChain();
   * console.log(`RPC URL: ${chain.rpcUrl}`);
   * ```
   */
  getChain(): Chain {
    return { ...this._chain };
  }

  /**
   * Get the smart account address (async)
   *
   * This is useful for getting the counterfactual address before the account is deployed.
   * For deployed accounts, this returns the same value as the `address` property.
   *
   * @returns Promise resolving to the account address
   *
   * @example
   * ```typescript
   * const address = await account.getAddress();
   * console.log('Address:', address);
   * ```
   */
  async getAddress(): Promise<Address> {
    return await this._smartAccount.getAddress();
  }

  // ============================================
  // Instance Methods - Signing
  // ============================================

  /**
   * Sign a personal message
   *
   * @param message - The message to sign
   * @returns Promise resolving to the signature
   *
   * @example
   * ```typescript
   * const signature = await account.signMessage('Hello, World!');
   * ```
   */
  async signMessage(message: string): Promise<Hex> {
    return await this._smartAccount.signMessage({ message });
  }

  /**
   * Sign EIP-712 typed data
   *
   * @param typedData - The typed data to sign
   * @returns Promise resolving to the signature
   *
   * @example
   * ```typescript
   * const signature = await account.signTypedData({
   *   domain: { name: 'MyApp', version: '1' },
   *   types: { Message: [{ name: 'content', type: 'string' }] },
   *   primaryType: 'Message',
   *   message: { content: 'Hello' }
   * });
   * ```
   */
  async signTypedData(typedData: TypedDataDefinition<TypedData, string>): Promise<Hex> {
    return await this._smartAccount.signTypedData(typedData);
  }

  // ============================================
  // Instance Methods - Transactions
  // ============================================

  /**
   * Send a transaction and wait for the receipt
   *
   * @param calls - Array of transaction calls
   * @returns Promise resolving to the transaction hash
   *
   * @example
   * ```typescript
   * const hash = await account.sendTransaction([
   *   { to: '0x...', value: '0.1' },           // Send 0.1 ETH
   *   { to: '0x...', data: '0x...' }           // Contract call
   * ]);
   * ```
   */
  async sendTransaction(calls: TransactionCall[]): Promise<Hash> {
    const formattedCalls = calls.map(call => ({
      to: call.to,
      value: Account.parseValue(call.value),
      data: call.data,
    }));

    return await sendSmartAccountTransaction(
      this._smartAccount,
      formattedCalls,
      this._chain
    );
  }

  /**
   * Send a bundled transaction (user operation) without waiting for receipt
   *
   * @param calls - Array of transaction calls
   * @returns Promise resolving to the user operation ID and chain ID
   *
   * @example
   * ```typescript
   * const { id, chainId } = await account.sendBundledTransaction([
   *   { to: '0x...', value: '0.1' }
   * ]);
   * console.log('UserOp hash:', id);
   * ```
   */
  async sendBundledTransaction(calls: TransactionCall[]): Promise<BundledTransactionResult> {
    const formattedCalls = calls.map(call => ({
      to: call.to,
      value: Account.parseValue(call.value),
      data: call.data,
    }));

    return await sendSmartAccountBundledTransaction(
      this._smartAccount,
      formattedCalls,
      this._chain
    );
  }

  /**
   * Estimate gas for a transaction
   *
   * @param calls - Array of transaction calls
   * @returns Promise resolving to the estimated gas amount
   *
   * @example
   * ```typescript
   * const gas = await account.estimateGas([
   *   { to: '0x...', value: '0.1' }
   * ]);
   * console.log('Estimated gas:', gas.toString());
   * ```
   */
  async estimateGas(calls: TransactionCall[]): Promise<bigint> {
    const formattedCalls = calls.map(call => ({
      to: call.to,
      value: Account.parseValue(call.value),
      data: call.data,
    }));

    return await estimateUserOpGas(
      this._smartAccount,
      formattedCalls,
      this._chain
    );
  }

  /**
   * Calculate gas cost in ETH
   *
   * @param calls - Array of transaction calls
   * @returns Promise resolving to the gas cost in ETH as a string
   *
   * @example
   * ```typescript
   * const cost = await account.calculateGasCost([
   *   { to: '0x...', value: '0.1' }
   * ]);
   * console.log('Gas cost:', cost, 'ETH');
   * ```
   */
  async calculateGasCost(calls: TransactionCall[]): Promise<string> {
    const gas = await this.estimateGas(calls);
    return await calculateGas(this._chain, gas);
  }

  // ============================================
  // Instance Methods - Permissions
  // ============================================

  /**
   * Grant permissions to a spender
   *
   * @param expiry - Timestamp when the permission expires (unix seconds)
   * @param spender - Address that can use the permission
   * @param permissions - Permissions to grant (calls and/or spends)
   * @returns Promise resolving to the grant permissions response
   *
   * @example
   * ```typescript
   * const response = await account.grantPermissions(
   *   Math.floor(Date.now() / 1000) + 3600, // 1 hour
   *   '0xSpenderAddress...',
   *   {
   *     calls: [{ target: '0x...', selector: '0xa9059cbb' }],
   *     spends: [{ token: '0xEee...', limit: '1000000000000000000', period: 'day' }]
   *   }
   * );
   * console.log('Permission ID:', response.id);
   * ```
   */
  async grantPermissions(
    expiry: number,
    spender: Address,
    permissions: PermissionsDetail
  ): Promise<WalletGrantPermissionsResponse> {
    return await grantSmartAccountPermissions(
      this._smartAccount,
      expiry,
      spender,
      permissions,
      this._chain,
      this._apiKey
    );
  }

  /**
   * Revoke a previously granted permission
   *
   * @param permissionId - The permission ID (hash) to revoke
   * @returns Promise resolving to the revoke response
   *
   * @example
   * ```typescript
   * const response = await account.revokePermission('0x...');
   * console.log('Revoked:', response.success);
   * ```
   */
  async revokePermission(permissionId: Hex): Promise<RevokePermissionApiResponse> {
    return await revokeSmartAccountPermission(
      this._smartAccount,
      permissionId,
      this._chain,
      this._apiKey
    );
  }

  /**
   * Fetch details of a previously granted permission from the relay
   *
   * @param permissionId - The permission ID (hash) to fetch
   * @returns Promise resolving to the permission details in the same format as grantPermissions response
   *
   * @example
   * ```typescript
   * const details = await account.fetchPermissionDetails('0x...');
   * console.log('Spender:', details.spender);
   * console.log('Expires:', new Date(details.expiry * 1000));
   * console.log('Calls:', details.calls);
   * console.log('Spends:', details.spends);
   * ```
   */
  async fetchPermissionDetails(permissionId: Hex): Promise<WalletGrantPermissionsResponse> {
    const relayResponse = await getPermissionFromRelay(permissionId, this._apiKey);

    // Transform relay response to WalletGrantPermissionsResponse format
    const calls: CallPermissionDetail[] = relayResponse.calls.map(call => ({
      target: call.target as Address,
      selector: call.selector as Hex,
    }));

    const spends: SpendPermissionDetail[] = relayResponse.spends.map(spend => ({
      token: spend.token as Address,
      limit: spend.allowance,
      period: spend.period as SpendPeriod,
    }));

    return {
      address: relayResponse.account as Address,
      chainId: relayResponse.chainId as Hex,
      start: parseInt(relayResponse.start, 10),
      expiry: parseInt(relayResponse.end, 10),
      salt: relayResponse.salt as Hex,
      id: relayResponse.hash as Hex,
      spender: relayResponse.spender as Address,
      calls,
      spends,
    };
  }

  // ============================================
  // Private Static Helpers
  // ============================================

  /**
   * Build chain configuration with RPC URL
   * @internal
   */
  private static buildChainConfig(
    chainId: number,
    apiKey?: string,
    paymasterUrl?: string
  ): Chain {
    const rpcUrl = apiKey
      ? `${JAW_RPC_URL}?chainId=${chainId}&api-key=${apiKey}`
      : `${JAW_RPC_URL}?chainId=${chainId}`;

    return {
      id: chainId,
      rpcUrl,
      paymasterUrl,
    };
  }

  /**
   * Parse value from various formats to bigint
   * Handles: undefined, bigint, hex string, decimal string, ether string
   * @internal
   */
  private static parseValue(value: bigint | string | undefined): bigint | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value === 'bigint') {
      return value;
    }

    // At this point, value is a string
    // Hex string (e.g., "0x1234")
    if (isHex(value)) {
      return BigInt(value);
    }

    // Decimal string (e.g., "1000000000000000000")
    if (/^\d+$/.test(value)) {
      return BigInt(value);
    }

    // Ether string (e.g., "0.1", "1.5")
    // This handles decimal ETH values
    try {
      return parseEther(value);
    } catch {
      throw new Error(`Invalid value format: ${value}`);
    }
  }
}

// Re-export for convenience
export { type BundledTransactionResult } from './smartAccount.js';
