import type { Address, Hash, Hex, TypedDataDefinition, TypedData, LocalAccount } from 'viem';
import { isHex } from 'viem';
import { toWebAuthnAccount, type SmartAccount } from 'viem/account-abstraction';
import {
  createSmartAccount,
  sendTransaction as sendSmartAccountTransaction,
  sendCalls as sendSmartAccountCalls,
  sendCallsWithPermission as sendSmartAccountCallsWithPermission,
  estimateUserOpGas,
  calculateGas,
  getBundlerClient,
  type BundledTransactionResult,
} from './smartAccount.js';
import {
  storeCallStatus,
  waitForReceiptInBackground,
  getCallStatusEIP5792,
  type CallStatusResponse,
} from '../rpc/wallet_sendCalls.js';
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
import { type Chain, chains as chainStore } from '../store/index.js';
import { logAccountIssuance } from '../analytics/index.js';

/**
 * Configuration for creating or loading an Account
 */
export interface AccountConfig {
  /** Chain ID for the account */
  chainId: number;
  /** API key for JAW services (required) */
  apiKey: string;
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
  /** Value to send in wei (bigint or hex string) */
  value?: bigint | string;
  /** Call data */
  data?: Hex;
}

/**
 * Options for sendCalls method
 */
export interface SendCallsOptions {
  /** Permission ID to use for executing the calls through the permission manager */
  permissionId?: Hex;
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
 * // Send transaction (value in wei)
 * const hash = await account.sendTransaction([
 *   { to: '0x...', value: 100000000000000000n, data: '0x' }
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
   * Get an account - restores if already authenticated, or triggers login if credentialId provided
   *
   * This is the primary method to get an Account instance:
   * - If already authenticated: restores account from storage (no WebAuthn prompt)
   * - If credentialId provided and not authenticated: triggers WebAuthn login
   * - If not authenticated and no credentialId: throws error
   *
   * @param config - Account configuration
   * @param credentialId - Optional credential ID to login with (triggers WebAuthn if not already authenticated)
   * @returns Promise resolving to the Account instance
   * @throws Error if not authenticated and no credentialId provided
   *
   * @example
   * ```typescript
   * // Restore existing session (no prompt)
   * const account = await Account.get({ chainId: 1, apiKey: 'your-api-key' });
   *
   * // Login with specific credential (triggers WebAuthn if needed)
   * const accounts = Account.getStoredAccounts('your-api-key');
   * const account = await Account.get(
   *   { chainId: 1, apiKey: 'your-api-key' },
   *   accounts[0].credentialId
   * );
   * ```
   */
  static async get(config: AccountConfig, credentialId?: string): Promise<Account> {
    const { chainId, apiKey, paymasterUrl } = config;

    const passkeyManager = new PasskeyManager(undefined, undefined, apiKey);
    const authResult = passkeyManager.checkAuth();

    // If credentialId is explicitly provided, always require WebAuthn authentication
    // This ensures user verification when selecting a specific account to login with
    if (credentialId) {
      const passkeyAccount = passkeyManager.getAccountByCredentialId(credentialId);
      if (!passkeyAccount) {
        throw new Error(`No account found for credential ID: ${credentialId}`);
      }

      const rpId = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

      // Authenticate with WebAuthn
      await passkeyManager.authenticateWithWebAuthn(rpId, credentialId);

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

      // Store auth state
      passkeyManager.storeAuthState(address, credentialId);

      return new Account(smartAccount, chain, apiKey, passkeyAccount);
    }

    // No credentialId provided - restore from existing auth state if available
    if (authResult.isAuthenticated && authResult.address) {
      const currentAccount = passkeyManager.getCurrentAccount();
      if (currentAccount) {
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
    }

    // Not authenticated and no credentialId provided
    throw new Error('Not authenticated. Please provide a credentialId to login, or create an account first.');
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
    const { chainId, apiKey, paymasterUrl } = config;
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

    // Log account issuance for analytics (fire-and-forget)
    logAccountIssuance({ address, type: 'create', apiKey });

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
    const { chainId, apiKey, paymasterUrl } = config;

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

    // Log account issuance for analytics (fire-and-forget)
    logAccountIssuance({ address, type: 'import', apiKey });

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
    const { chainId, apiKey, paymasterUrl } = config;

    const chain = Account.buildChainConfig(chainId, apiKey, paymasterUrl);

    // Register chain in global store for background operations (e.g., waitForReceiptInBackground)
    const existingChains = chainStore.get() ?? [];
    if (!existingChains.some(c => c.id === chain.id)) {
      chainStore.set([...existingChains, chain]);
    }

    const bundlerClient = getBundlerClient(chain);
    const smartAccount = await createSmartAccount(localAccount, bundlerClient as JustanAccountImplementation['client']);
    const address = await smartAccount.getAddress();

    // Log account issuance for analytics (fire-and-forget)
    logAccountIssuance({ address, type: 'fromLocalAccount', apiKey });

    return new Account(smartAccount, chain, apiKey);
  }

  // ============================================
  // Static Utility Methods
  // ============================================

  /**
   * Get the authenticated account address without fully loading the account
   *
   * Use this to check if authenticated: `Account.getAuthenticatedAddress() !== null`
   *
   * @param apiKey - Optional API key
   * @returns The account address or null if not authenticated
   *
   * @example
   * ```typescript
   * const address = Account.getAuthenticatedAddress('your-api-key');
   * if (address) {
   *   console.log('Current address:', address);
   *   const account = await Account.get({ chainId: 1, apiKey: 'your-api-key' });
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
   * import { parseEther } from 'viem';
   *
   * const hash = await account.sendTransaction([
   *   { to: '0x...', value: parseEther('0.1') },  // Send 0.1 ETH
   *   { to: '0x...', data: '0x...' }              // Contract call
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
   * Send multiple calls as a bundled user operation without waiting for receipt
   *
   * @param calls - Array of transaction calls
   * @param options - Optional settings including permissionId for permission-based execution
   * @returns Promise resolving to the user operation ID and chain ID
   *
   * @example
   * ```typescript
   * import { parseEther } from 'viem';
   *
   * // Standard execution
   * const { id, chainId } = await account.sendCalls([
   *   { to: '0x...', value: parseEther('0.1') }
   * ]);
   * console.log('UserOp hash:', id);
   *
   * // Execution with permission (delegated execution)
   * const { id, chainId } = await account.sendCalls(
   *   [{ to: '0x...', value: parseEther('0.1') }],
   *   { permissionId: '0x...' }
   * );
   *
   * // Check status later
   * const status = account.getCallStatus(id);
   * ```
   */
  async sendCalls(calls: TransactionCall[], options?: SendCallsOptions): Promise<BundledTransactionResult> {
    const formattedCalls = calls.map(call => ({
      to: call.to,
      value: Account.parseValue(call.value),
      data: call.data,
    }));

    let result: BundledTransactionResult;

    if (options?.permissionId) {
      // Execute through permission manager
      result = await sendSmartAccountCallsWithPermission(
        this._smartAccount,
        formattedCalls,
        this._chain,
        options.permissionId,
        this._apiKey
      );
    } else {
      // Standard execution
      result = await sendSmartAccountCalls(
        this._smartAccount,
        formattedCalls,
        this._chain
      );
    }

    // Store call status as pending and start background receipt waiting
    storeCallStatus(result.id, result.chainId);
    waitForReceiptInBackground(result.id, result.chainId);

    return result;
  }

  /**
   * Get the status of a previously submitted call batch
   *
   * @param batchId - The batch ID (userOpHash) returned from sendCalls
   * @returns The call status in EIP-5792 format, or undefined if not found
   *
   * @example
   * ```typescript
   * const { id } = await account.sendCalls([{ to: '0x...', value: '0.1' }]);
   *
   * // Check status
   * const status = account.getCallStatus(id);
   * if (status) {
   *   console.log('Status code:', status.status); // 100=pending, 200=completed, 400=failed, 500=reverted
   *   if (status.receipts) {
   *     console.log('Transaction hash:', status.receipts[0].transactionHash);
   *   }
   * }
   * ```
   */
  getCallStatus(batchId: Hash): CallStatusResponse | undefined {
    return getCallStatusEIP5792(batchId);
  }

  /**
   * Estimate gas for a transaction
   *
   * @param calls - Array of transaction calls
   * @returns Promise resolving to the estimated gas amount
   *
   * @example
   * ```typescript
   * import { parseEther } from 'viem';
   *
   * const gas = await account.estimateGas([
   *   { to: '0x...', value: parseEther('0.1') }
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
   * import { parseEther } from 'viem';
   *
   * const cost = await account.calculateGasCost([
   *   { to: '0x...', value: parseEther('0.1') }
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
   * Get details of a previously granted permission from the relay
   *
   * @param permissionId - The permission ID (hash) to fetch
   * @returns Promise resolving to the permission details in the same format as grantPermissions response
   *
   * @example
   * ```typescript
   * const details = await account.getPermission('0x...');
   * console.log('Spender:', details.spender);
   * console.log('Expires:', new Date(details.expiry * 1000));
   * console.log('Calls:', details.calls);
   * console.log('Spends:', details.spends);
   * ```
   */
  async getPermission(permissionId: Hex): Promise<WalletGrantPermissionsResponse> {
    const relayResponse = await getPermissionFromRelay(permissionId, this._apiKey);

    // Transform relay response to WalletGrantPermissionsResponse format
    const calls: CallPermissionDetail[] = relayResponse.calls.map(call => ({
      target: call.target as Address,
      selector: call.selector as Hex,
    }));

    const spends: SpendPermissionDetail[] = relayResponse.spends.map(spend => ({
      token: spend.token as Address,
      limit: spend.allowance,
      period: spend.unit as SpendPeriod,
      multiplier: spend.multiplier,
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
   * Parse value from bigint or hex string to bigint (wei)
   * @internal
   */
  private static parseValue(value: bigint | string | undefined): bigint | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value === 'bigint') {
      return value;
    }

    // Hex string for wei (e.g., "0x0de0b6b3a7640000")
    if (isHex(value)) {
      return BigInt(value);
    }

    throw new Error(`Invalid value format: ${value}. Use bigint or hex string (wei).`);
  }
}

// Re-export for convenience
export { type BundledTransactionResult } from './smartAccount.js';
