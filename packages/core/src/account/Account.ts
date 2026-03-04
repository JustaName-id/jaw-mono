import type {
  Address,
  Hash,
  Hex,
  TypedDataDefinition,
  TypedData,
  LocalAccount,
} from "viem";
import {
  isHex,
  encodeFunctionData,
  erc20Abi,
  createPublicClient,
  http,
} from "viem";
import { toWebAuthnAccount, type SmartAccount } from "viem/account-abstraction";
import {
  createSmartAccount,
  sendTransaction as sendSmartAccountTransaction,
  sendCalls as sendSmartAccountCalls,
  sendCallsWithPermission as sendSmartAccountCallsWithPermission,
  estimateUserOpGas,
  estimateUserOpGasWithPermission,
  calculateGas,
  getBundlerClient,
  type BundledTransactionResult,
} from "./smartAccount.js";
import {
  storeCallStatus,
  waitForReceiptInBackground,
  getCallStatusEIP5792,
  type CallStatusResponse,
} from "../rpc/wallet_sendCalls.js";
import type { JustanAccountImplementation } from "./toJustanAccount.js";
import {
  PasskeyManager,
  type PasskeyAccount,
  type PasskeyCreateFn,
  type PasskeyGetFn,
  type NativePasskeyCreateFn,
} from "../passkey-manager/index.js";
import {
  grantPermissions as grantSmartAccountPermissions,
  revokePermission as revokeSmartAccountPermission,
  getPermissionFromRelay,
  buildGrantPermissionCall,
  buildRevokePermissionCall,
  type PermissionsDetail,
  type WalletGrantPermissionsResponse,
  type RevokePermissionApiResponse,
  type CallPermissionDetail,
  type SpendPermissionDetail,
} from "../rpc/permissions.js";
import {
  JAW_RPC_URL,
  JAW_PAYMASTER_URL,
  ERC20_PAYMASTER_ADDRESS,
} from "../constants.js";
import { type Chain, chains as chainStore } from "../store/index.js";
import { logAccountIssuance } from "../analytics/index.js";

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
  /** Custom paymaster context for gas sponsorship */
  paymasterContext?: Record<string, unknown>;
}

/**
 * Options for creating a new account with passkey
 */
export interface CreateAccountOptions {
  /** Username/display name for the passkey */
  username: string;
  /** Relying party identifier (defaults to window.location.hostname) */
  rpId?: string;
  /** Relying party name (defaults to 'JAW') */
  rpName?: string;
  /** Custom WebAuthn create function (React Native adapter) */
  createFn?: PasskeyCreateFn;
  /** Native passkey creation function that bypasses crypto.subtle (React Native) */
  nativeCreateFn?: NativePasskeyCreateFn;
  /** Custom WebAuthn get function (React Native adapter) */
  getFn?: PasskeyGetFn;
}

/**
 * Options for getting an existing account
 */
export interface GetAccountOptions {
  /** Custom WebAuthn get function (React Native adapter) */
  getFn?: PasskeyGetFn;
  /** Relying party identifier (required in React Native where window.location is unavailable) */
  rpId?: string;
}

/**
 * Options for importing an account from cloud backup
 */
export interface ImportAccountOptions {
  /** Custom WebAuthn get function (React Native adapter) */
  getFn?: PasskeyGetFn;
  /** Relying party identifier (required in React Native where window.location is unavailable) */
  rpId?: string;
}

/**
 * Options for restoring an account from known credentials
 */
export interface RestoreAccountOptions {
  /** Custom WebAuthn get function (React Native adapter) */
  getFn?: PasskeyGetFn;
  /** Relying party identifier (required in React Native where window.location is unavailable) */
  rpId?: string;
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
  /** The credential ID of the passkey */
  credentialId: string;
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
    passkeyAccount?: PasskeyAccount,
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
  static async get(
    config: AccountConfig,
    credentialId?: string,
    options?: GetAccountOptions,
  ): Promise<Account> {
    const { chainId, apiKey, paymasterUrl } = config;
    const getFn = options?.getFn;
    const rpIdOption = options?.rpId;

    const passkeyManager = new PasskeyManager(undefined, undefined, apiKey);
    const authResult = passkeyManager.checkAuth();

    // If credentialId is explicitly provided, always require WebAuthn authentication
    // This ensures user verification when selecting a specific account to login with
    if (credentialId) {
      const passkeyAccount =
        passkeyManager.getAccountByCredentialId(credentialId);
      if (!passkeyAccount) {
        throw new Error(`No account found for credential ID: ${credentialId}`);
      }

      const rpId =
        rpIdOption ??
        (typeof window !== "undefined"
          ? window.location.hostname
          : "localhost");

      // Authenticate with WebAuthn
      await passkeyManager.authenticateWithWebAuthn(
        rpId,
        credentialId,
        undefined,
        getFn,
      );

      const webAuthnAccount = toWebAuthnAccount({
        credential: {
          id: credentialId,
          publicKey: passkeyAccount.publicKey,
        },
        getFn,
        rpId,
      });

      const chain = Account.buildChainConfig(chainId, apiKey, paymasterUrl);
      const bundlerClient = getBundlerClient(chain);
      const smartAccount = await createSmartAccount(
        webAuthnAccount,
        bundlerClient as JustanAccountImplementation["client"],
      );
      const address = await smartAccount.getAddress();

      // Store auth state
      passkeyManager.storeAuthState(address, credentialId);

      return new Account(smartAccount, chain, apiKey, passkeyAccount);
    }

    // No credentialId provided - restore from existing auth state if available
    if (authResult.isAuthenticated && authResult.address) {
      const currentAccount = passkeyManager.getCurrentAccount();
      if (currentAccount) {
        const rpId =
          rpIdOption ??
          (typeof window !== "undefined"
            ? window.location.hostname
            : "localhost");

        const webAuthnAccount = toWebAuthnAccount({
          credential: {
            id: currentAccount.credentialId,
            publicKey: currentAccount.publicKey,
          },
          getFn,
          rpId,
        });

        const chain = Account.buildChainConfig(chainId, apiKey, paymasterUrl);
        const bundlerClient = getBundlerClient(chain);
        const smartAccount = await createSmartAccount(
          webAuthnAccount,
          bundlerClient as JustanAccountImplementation["client"],
        );

        return new Account(smartAccount, chain, apiKey, currentAccount);
      }
    }

    // Not authenticated and no credentialId provided
    throw new Error(
      "Not authenticated. Please provide a credentialId to login, or create an account first.",
    );
  }

  /**
   * Restore an Account from existing credential info WITHOUT triggering WebAuthn
   *
   * Use this method when the user has already authenticated (e.g., during connection)
   * and you just need to restore the Account instance for signing operations.
   * The actual signing will trigger its own WebAuthn prompt.
   *
   * @param config - Account configuration
   * @param credentialId - The credential ID of the passkey
   * @param publicKey - The public key of the passkey
   * @returns Promise resolving to the Account instance
   *
   * @example
   * ```typescript
   * // Restore account from session data (no WebAuthn prompt)
   * const account = await Account.restore(
   *   { chainId: 1, apiKey: 'your-api-key' },
   *   session.authState.credentialId,
   *   session.authState.publicKey
   * );
   *
   * // Signing will trigger WebAuthn
   * const signature = await account.signMessage('Hello');
   * ```
   */
  static async restore(
    config: AccountConfig,
    credentialId: string,
    publicKey: `0x${string}`,
    options?: RestoreAccountOptions,
  ): Promise<Account> {
    const { chainId, apiKey, paymasterUrl } = config;

    if (!credentialId || !publicKey) {
      throw new Error(
        "credentialId and publicKey are required to restore an account",
      );
    }

    const passkeyManager = new PasskeyManager(undefined, undefined, apiKey);
    const passkeyAccount =
      passkeyManager.getAccountByCredentialId(credentialId);

    // Create WebAuthn account from credential info (no WebAuthn prompt)
    const webAuthnAccount = toWebAuthnAccount({
      credential: {
        id: credentialId,
        publicKey: publicKey,
      },
      ...(options?.getFn && { getFn: options.getFn }),
      ...(options?.rpId && { rpId: options.rpId }),
    });

    const chain = Account.buildChainConfig(chainId, apiKey, paymasterUrl);
    const bundlerClient = getBundlerClient(chain);
    const smartAccount = await createSmartAccount(
      webAuthnAccount,
      bundlerClient as JustanAccountImplementation["client"],
    );

    // Use passkeyAccount if found, otherwise create minimal metadata
    const accountMetadata = passkeyAccount ?? {
      username: "",
      credentialId,
      publicKey,
      creationDate: new Date().toISOString(),
      isImported: false,
    };

    return new Account(smartAccount, chain, apiKey, accountMetadata);
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
  static async create(
    config: AccountConfig,
    options: CreateAccountOptions,
  ): Promise<Account> {
    const { chainId, apiKey, paymasterUrl } = config;
    const { username, rpId, rpName, createFn, nativeCreateFn, getFn } = options;

    const resolvedRpId =
      rpId ??
      (typeof window !== "undefined" ? window.location.hostname : "localhost");
    const resolvedRpName = rpName ?? "JAW";

    const passkeyManager = new PasskeyManager(undefined, undefined, apiKey);

    // Create the passkey
    const { credentialId, publicKey, webAuthnAccount, passkeyAccount } =
      await passkeyManager.createPasskey(
        username,
        resolvedRpId,
        resolvedRpName,
        createFn,
        nativeCreateFn,
        getFn,
      );

    const chain = Account.buildChainConfig(chainId, apiKey, paymasterUrl);

    const bundlerClient = getBundlerClient(chain);
    const smartAccount = await createSmartAccount(
      webAuthnAccount,
      bundlerClient as JustanAccountImplementation["client"],
    );
    const address = await smartAccount.getAddress();

    // Store the passkey account with the smart account address
    await passkeyManager.storePasskeyAccount(
      username,
      credentialId,
      publicKey,
      address,
    );

    // Log account issuance for analytics (fire-and-forget)
    logAccountIssuance({ address, type: "create", apiKey });

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
  static async import(
    config: AccountConfig,
    options?: ImportAccountOptions,
  ): Promise<Account> {
    const { chainId, apiKey, paymasterUrl } = config;
    const getFn = options?.getFn;
    const rpId = options?.rpId;

    const passkeyManager = new PasskeyManager(undefined, undefined, apiKey);

    // Import passkey from cloud backup
    const importResult = await passkeyManager.importPasskeyAccount(getFn, rpId);

    const webAuthnAccount = toWebAuthnAccount({
      credential: {
        id: importResult.credential.id,
        publicKey: importResult.credential.publicKey,
      },
      getFn,
      rpId,
    });

    const chain = Account.buildChainConfig(chainId, apiKey, paymasterUrl);

    const bundlerClient = getBundlerClient(chain);
    const smartAccount = await createSmartAccount(
      webAuthnAccount,
      bundlerClient as JustanAccountImplementation["client"],
    );
    const address = await smartAccount.getAddress();

    // Store for login (marks as imported)
    await passkeyManager.storePasskeyAccountForLogin(
      importResult.credential.id,
      address,
    );

    const passkeyAccount = passkeyManager.getAccountByCredentialId(
      importResult.credential.id,
    );
    if (!passkeyAccount) {
      throw new Error("Failed to retrieve imported passkey account.");
    }

    // Log account issuance for analytics (fire-and-forget)
    logAccountIssuance({ address, type: "import", apiKey });

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
    localAccount: LocalAccount,
  ): Promise<Account> {
    const { chainId, apiKey, paymasterUrl } = config;

    const chain = Account.buildChainConfig(chainId, apiKey, paymasterUrl);

    // Register chain in global store for background operations (e.g., waitForReceiptInBackground)
    const existingChains = chainStore.get() ?? [];
    if (!existingChains.some((c) => c.id === chain.id)) {
      chainStore.set([...existingChains, chain]);
    }

    const bundlerClient = getBundlerClient(chain);
    const smartAccount = await createSmartAccount(
      localAccount,
      bundlerClient as JustanAccountImplementation["client"],
    );
    const address = await smartAccount.getAddress();

    // Log account issuance for analytics (fire-and-forget)
    logAccountIssuance({ address, type: "fromLocalAccount", apiKey });

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
   * Get the currently authenticated account data
   *
   * @param apiKey - Optional API key
   * @returns The current account data if authenticated, null otherwise
   *
   * @example
   * ```typescript
   * const account = Account.getCurrentAccount('your-api-key');
   * if (account) {
   *   console.log(`Authenticated as: ${account.username}`);
   * }
   * ```
   */
  static getCurrentAccount(apiKey?: string): PasskeyAccount | null {
    const passkeyManager = new PasskeyManager(undefined, undefined, apiKey);
    return passkeyManager.getCurrentAccount() || null;
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
      credentialId: this._passkeyAccount.credentialId,
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
   * console.log(`Paymaster: ${chain.paymaster?.url}`);
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
  async signTypedData(
    typedData: TypedDataDefinition<TypedData, string>,
  ): Promise<Hex> {
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
  async sendTransaction(
    calls: TransactionCall[],
    paymasterUrlOverride?: string,
    paymasterContextOverride?: Record<string, unknown>,
  ): Promise<Hash> {
    const formattedCalls = calls.map((call) => ({
      to: call.to,
      value: Account.parseValue(call.value),
      data: call.data,
    }));

    // If using JAW ERC-20 paymaster, prepend approval call if needed
    const approvalCall = await this.createErc20ApprovalCall(
      paymasterUrlOverride,
      paymasterContextOverride,
      formattedCalls,
    );
    const finalCalls = approvalCall
      ? [approvalCall, ...formattedCalls]
      : formattedCalls;

    // Remove gas field from context (only used for approval logic)
    const { gas: _gas, ...contextWithoutGas } = paymasterContextOverride ?? {};

    return await sendSmartAccountTransaction(
      this._smartAccount,
      finalCalls,
      this._chain,
      paymasterUrlOverride,
      Object.keys(contextWithoutGas).length > 0 ? contextWithoutGas : undefined,
      this._apiKey,
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
  async sendCalls(
    calls: TransactionCall[],
    options?: SendCallsOptions,
    paymasterUrlOverride?: string,
    paymasterContextOverride?: Record<string, unknown>,
  ): Promise<BundledTransactionResult> {
    const formattedCalls = calls.map((call) => ({
      to: call.to,
      value: Account.parseValue(call.value),
      data: call.data,
    }));

    // If using JAW ERC-20 paymaster, prepend approval call if needed
    const approvalCall = await this.createErc20ApprovalCall(
      paymasterUrlOverride,
      paymasterContextOverride,
      formattedCalls,
    );
    const finalCalls = approvalCall
      ? [approvalCall, ...formattedCalls]
      : formattedCalls;

    // Remove gas field from context (only used for approval logic)
    const { gas: _gas, ...contextWithoutGas } = paymasterContextOverride ?? {};
    const cleanedContext =
      Object.keys(contextWithoutGas).length > 0 ? contextWithoutGas : undefined;

    let result: BundledTransactionResult;

    if (options?.permissionId) {
      // Execute through permission manager
      result = await sendSmartAccountCallsWithPermission(
        this._smartAccount,
        finalCalls,
        this._chain,
        options.permissionId,
        this._apiKey,
        paymasterUrlOverride,
        cleanedContext,
      );
    } else {
      // Standard execution
      result = await sendSmartAccountCalls(
        this._smartAccount,
        finalCalls,
        this._chain,
        paymasterUrlOverride,
        cleanedContext,
      );
    }

    // Store call status as pending and start background receipt waiting
    storeCallStatus(result.id, result.chainId, this._apiKey);
    waitForReceiptInBackground(result.id, result.chainId, this._apiKey);

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
   * @param options - Optional settings including permissionId for permission-based execution
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
  async estimateGas(
    calls: TransactionCall[],
    options?: { permissionId?: Hex },
  ): Promise<bigint> {
    const formattedCalls = calls.map((call) => ({
      to: call.to,
      value: Account.parseValue(call.value),
      data: call.data,
    }));

    if (options?.permissionId) {
      // Estimate gas for permission-based execution through the permission manager
      return await estimateUserOpGasWithPermission(
        this._smartAccount,
        formattedCalls,
        this._chain,
        options.permissionId,
        this._apiKey,
      );
    }

    return await estimateUserOpGas(
      this._smartAccount,
      formattedCalls,
      this._chain,
    );
  }

  /**
   * Calculate gas cost in ETH
   *
   * @param calls - Array of transaction calls
   * @param options - Optional settings including permissionId for permission-based execution
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
  async calculateGasCost(
    calls: TransactionCall[],
    options?: { permissionId?: Hex },
  ): Promise<string> {
    const gas = await this.estimateGas(calls, options);
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
   * @param paymasterUrlOverride - Optional paymaster URL for ERC-20 payment
   * @param paymasterContextOverride - Optional paymaster context (e.g., token address for ERC-20 payment)
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
   * console.log('Permission ID:', response.permissionId);
   * ```
   */
  async grantPermissions(
    expiry: number,
    spender: Address,
    permissions: PermissionsDetail,
    paymasterUrlOverride?: string,
    paymasterContextOverride?: Record<string, unknown>,
  ): Promise<WalletGrantPermissionsResponse> {
    // Build the permission call for gas estimation
    const permissionCall = buildGrantPermissionCall(
      this._smartAccount.address,
      spender,
      expiry,
      permissions,
    );

    // Check if we need an ERC-20 approval for the paymaster
    const approvalCall = await this.createErc20ApprovalCall(
      paymasterUrlOverride,
      paymasterContextOverride,
      [permissionCall],
    );

    // Remove gas field from context (only used for approval logic)
    const { gas: _gas, ...contextWithoutGas } = paymasterContextOverride ?? {};
    const cleanedContext =
      Object.keys(contextWithoutGas).length > 0 ? contextWithoutGas : undefined;

    return await grantSmartAccountPermissions(
      this._smartAccount,
      expiry,
      spender,
      permissions,
      this._chain,
      this._apiKey,
      paymasterUrlOverride,
      cleanedContext,
      approvalCall || undefined,
    );
  }

  /**
   * Revoke a previously granted permission
   *
   * @param permissionId - The permission ID (hash) to revoke
   * @param paymasterUrlOverride - Optional paymaster URL for ERC-20 payment
   * @param paymasterContextOverride - Optional paymaster context (e.g., token address for ERC-20 payment)
   * @returns Promise resolving to the revoke response
   *
   * @example
   * ```typescript
   * const response = await account.revokePermission('0x...');
   * console.log('Revoked:', response.success);
   * ```
   */
  async revokePermission(
    permissionId: Hex,
    paymasterUrlOverride?: string,
    paymasterContextOverride?: Record<string, unknown>,
  ): Promise<RevokePermissionApiResponse> {
    // Build the revoke call for gas estimation (requires fetching permission from relay)
    let revokeCalls: Array<{ to: Address; data: Hex }> = [];
    try {
      const relayPermission = await getPermissionFromRelay(
        permissionId,
        this._apiKey,
      );
      const revokeCall = buildRevokePermissionCall(relayPermission);
      revokeCalls = [revokeCall];
    } catch (error) {
      // If we can't fetch the permission, skip gas estimation
      console.warn("Could not fetch permission for gas estimation:", error);
    }

    // Check if we need an ERC-20 approval for the paymaster
    const approvalCall = await this.createErc20ApprovalCall(
      paymasterUrlOverride,
      paymasterContextOverride,
      revokeCalls,
    );

    // Remove gas field from context (only used for approval logic)
    const { gas: _gas, ...contextWithoutGas } = paymasterContextOverride ?? {};
    const cleanedContext =
      Object.keys(contextWithoutGas).length > 0 ? contextWithoutGas : undefined;

    return await revokeSmartAccountPermission(
      this._smartAccount,
      permissionId,
      this._chain,
      this._apiKey,
      paymasterUrlOverride,
      cleanedContext,
      approvalCall || undefined,
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
   * console.log('Expires:', new Date(details.end * 1000));
   * console.log('Calls:', details.calls);
   * console.log('Spends:', details.spends);
   * ```
   */
  async getPermission(
    permissionId: Hex,
  ): Promise<WalletGrantPermissionsResponse> {
    const relayResponse = await getPermissionFromRelay(
      permissionId,
      this._apiKey,
    );

    // Transform relay response to WalletGrantPermissionsResponse format
    const calls: CallPermissionDetail[] = relayResponse.calls.map((call) => ({
      target: call.target as Address,
      selector: call.selector as Hex,
    }));

    const spends: SpendPermissionDetail[] = relayResponse.spends.map(
      (spend) => ({
        token: spend.token as Address,
        allowance: spend.allowance,
        unit: spend.unit,
        multiplier: spend.multiplier,
      }),
    );

    return {
      account: relayResponse.account as Address,
      spender: relayResponse.spender as Address,
      start: relayResponse.start,
      end: relayResponse.end,
      salt: relayResponse.salt as Hex,
      calls,
      spends,
      permissionId: relayResponse.permissionId as Hex,
      chainId: relayResponse.chainId as Hex,
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
    paymasterUrl?: string,
  ): Chain {
    const rpcUrl = apiKey
      ? `${JAW_RPC_URL}?chainId=${chainId}&api-key=${apiKey}`
      : `${JAW_RPC_URL}?chainId=${chainId}`;

    return {
      id: chainId,
      rpcUrl,
      ...(paymasterUrl && { paymaster: { url: paymasterUrl } }),
    };
  }

  /**
   * Parse value from bigint or hex string to bigint (wei)
   * @internal
   */
  private static parseValue(
    value: bigint | string | undefined,
  ): bigint | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value === "bigint") {
      return value;
    }

    // Hex string for wei (e.g., "0x0de0b6b3a7640000")
    if (isHex(value)) {
      return BigInt(value);
    }

    throw new Error(
      `Invalid value format: ${value}. Use bigint or hex string (wei).`,
    );
  }

  /**
   * Check if the paymaster URL is the JAW ERC-20 paymaster
   * @internal
   */
  private static isJawErc20Paymaster(paymasterUrl?: string): boolean {
    if (!paymasterUrl) return false;
    // Remove query params and compare base URL
    const baseUrl = paymasterUrl.split("?")[0];
    return baseUrl === JAW_PAYMASTER_URL;
  }

  /**
   * Create ERC-20 approval call for the paymaster if using JAW ERC-20 paymaster,
   * only if the current allowance is insufficient.
   * @internal
   */
  private async createErc20ApprovalCall(
    paymasterUrl?: string,
    paymasterContext?: Record<string, unknown>,
    calls?: Array<{ to: Address; value?: bigint; data?: Hex }>,
  ): Promise<{ to: Address; value?: bigint; data: Hex } | null> {
    // Only add approval if using JAW ERC-20 paymaster
    if (!Account.isJawErc20Paymaster(paymasterUrl)) {
      return null;
    }

    // Extract token address and gas amount from context
    const tokenAddress = paymasterContext?.token as string | undefined;
    let gasAmount = paymasterContext?.gas as string | bigint | undefined;

    if (!tokenAddress) {
      return null;
    }

    // If gasAmount is undefined, estimate it using the paymaster
    if (gasAmount === undefined && paymasterUrl && calls && calls.length > 0) {
      try {
        const { fetchTokenQuotes, calculateTokenCostFromGas } =
          await import("./erc20Paymaster.js");
        const { getBundlerClient } = await import("./smartAccount.js");

        // Get token quote for exchange rate
        const quotes = await fetchTokenQuotes(paymasterUrl, this._chain.id, [
          tokenAddress as Address,
        ]);

        if (quotes.length > 0) {
          // Get paymaster address from quote
          const paymasterAddress = quotes[0].paymasterAddress;

          // Create a dummy approval call for estimation
          // Use MaxUint256 for approval - amount doesn't affect gas estimation
          const MaxUint256 = BigInt(
            "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
          );
          const dummyApprovalCall = {
            to: tokenAddress as Address,
            value: 0n,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [paymasterAddress, MaxUint256],
            }),
          };

          // Include dummy approval in estimation to get accurate gas limits
          const callsWithApproval = [dummyApprovalCall, ...calls];

          // Prepare a UserOp to get gas estimates
          const bundlerClient = getBundlerClient(this._chain, paymasterUrl, {
            token: tokenAddress,
          });

          const userOp = await bundlerClient.prepareUserOperation({
            account: this._smartAccount,
            calls: callsWithApproval,
          });

          // Extract gas fields
          const gas = {
            preVerificationGas: userOp.preVerificationGas,
            verificationGasLimit: userOp.verificationGasLimit,
            callGasLimit: userOp.callGasLimit,
            paymasterVerificationGasLimit:
              "paymasterVerificationGasLimit" in userOp
                ? (userOp as { paymasterVerificationGasLimit?: bigint })
                    .paymasterVerificationGasLimit
                : undefined,
            paymasterPostOpGasLimit:
              "paymasterPostOpGasLimit" in userOp
                ? (userOp as { paymasterPostOpGasLimit?: bigint })
                    .paymasterPostOpGasLimit
                : undefined,
            maxFeePerGas: userOp.maxFeePerGas,
          };

          // Calculate token cost
          const tokenCost = calculateTokenCostFromGas(gas, quotes[0]);
          gasAmount = tokenCost;
        }
      } catch (error) {
        console.warn(
          "Failed to estimate gas amount for ERC-20 paymaster:",
          error,
        );
        // If estimation fails, return null (no approval call)
        return null;
      }
    }

    if (gasAmount === undefined) {
      // If we still don't have gasAmount after estimation attempt, skip approval
      return null;
    }

    // Parse the gas amount from context
    const requiredAmount =
      typeof gasAmount === "string" ? BigInt(gasAmount) : gasAmount;

    // Check current allowance
    const publicClient = createPublicClient({
      chain: { id: this._chain.id } as Parameters<
        typeof createPublicClient
      >[0]["chain"],
      transport: http(this._chain.rpcUrl),
    });

    const currentAllowance = await publicClient.readContract({
      address: tokenAddress as Address,
      abi: erc20Abi,
      functionName: "allowance",
      args: [this._smartAccount.address, ERC20_PAYMASTER_ADDRESS as Address],
    });

    // If current allowance is sufficient, no approval needed
    if (currentAllowance >= requiredAmount) {
      return null;
    }
    // Encode ERC-20 approve call for the required amount
    const approveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [ERC20_PAYMASTER_ADDRESS as Address, requiredAmount],
    });

    return {
      to: tokenAddress as Address,
      value: 0n,
      data: approveData,
    };
  }
}

// Re-export for convenience
export { type BundledTransactionResult } from "./smartAccount.js";
