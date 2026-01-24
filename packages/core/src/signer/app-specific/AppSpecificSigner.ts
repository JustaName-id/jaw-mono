import { Address, Hex } from 'viem';
import { JAWSigner } from '../JAWSigner.js';
import { decodePersonalSignMessage } from '../SignerUtils.js';
import {
    UIHandler,
    UIError,
    ConnectUIRequest,
    SignatureUIRequest,
    TypedDataUIRequest,
    TransactionUIRequest,
    SendTransactionUIRequest,
    PermissionUIRequest,
    RevokePermissionUIRequest,
    WalletSignUIRequest,
    PersonalSignRequestData,
    TypedDataRequestData,
    PaymasterConfig,
} from '../../ui/interface.js';
import { AppMetadata, ProviderEventCallback, RequestArguments } from '../../provider/interface.js';
import {
    WalletConnectResponse,
    WalletConnectRequest,
    WalletGrantPermissionsRequest,
    WalletRevokePermissionsRequest,
    getPermissionFromRelay,
    RequestCapabilities,
} from '../../rpc/index.js';
import { store, SDKChain } from '../../store/index.js';
import { standardErrors } from '../../errors/index.js';
import { Account } from '../../account/Account.js';

type ConstructorOptions = {
    metadata: AppMetadata;
    uiHandler?: UIHandler;
    callback: ProviderEventCallback | null;
    apiKey: string;
    paymasters?: Record<number, PaymasterConfig>;
    ens?: string;
};

export class AppSpecificSigner extends JAWSigner {
    private readonly uiHandler?: UIHandler;
    private readonly apiKey: string;
    private readonly paymasters?: Record<number, PaymasterConfig>;
    private account?: Account;

    constructor(params: ConstructorOptions) {
        super({
            metadata: params.metadata,
            callback: params.callback,
        });
        this.uiHandler = params.uiHandler;
        this.apiKey = params.apiKey;
        this.paymasters = params.paymasters;

        // Initialize the UI handler with SDK configuration (if provided)
        if (this.uiHandler?.init) {
            this.uiHandler.init({
                apiKey: params.apiKey,
                defaultChainId: params.metadata.defaultChainId,
                paymasters: params.paymasters,
                appName: params.metadata.appName,
                appLogoUrl: params.metadata.appLogoUrl,
                ens: params.ens
            });
        }
    }

    /**
     * Handshake establishes connection with user approval.
     * Sends raw params without validation (same as CrossPlatformSigner).
     * Capabilities validation only happens in handleWalletConnect/handleWalletConnectUnauthenticated.
     */
    async handshake(args: RequestArguments): Promise<void> {
        await this.performWalletConnect(args, { skipCapabilitiesValidation: true });
    }

    protected async handleWalletConnect(request: RequestArguments): Promise<unknown> {
        // Return cached wallet connect response if available (same as CrossPlatformSigner)
        const cachedResponse = await this.getCachedWalletConnectResponse();
        if (cachedResponse) {
            return cachedResponse;
        }

        this.emitConnect();

        return this.performWalletConnect(request);
    }

    protected async handleWalletConnectUnauthenticated(request: RequestArguments): Promise<unknown> {
        // For unauthenticated, we don't emit connect (same as CrossPlatformSigner)
        return this.performWalletConnect(request);
    }

    /**
     * Core wallet_connect flow used by handshake, handleWalletConnect, and handleWalletConnectUnauthenticated.
     * This ensures consistent behavior across all connect paths.
     *
     * @param options.skipCapabilitiesValidation - If true, skips capabilities validation (used by handshake)
     */
    private async performWalletConnect(
        request: RequestArguments,
        options?: { skipCapabilitiesValidation?: boolean }
    ): Promise<WalletConnectResponse> {
        // Headless mode: no UIHandler, use Account class directly
        if (!this.uiHandler) {
            return this.performHeadlessConnect();
        }

        // Validate and inject capabilities using base class method (same as CrossPlatformSigner)
        const modifiedRequest = options?.skipCapabilitiesValidation
            ? request
            : this.validateAndInjectCapabilities(request);

        const correlationId = this.getCorrelationId(request);

        const chains = store.getState().chains;
        const chain = chains?.find((c: SDKChain) => c.id === this.chain.id) ?? this.chain;

        // Extract capabilities and silent flag from request params
        const walletConnectParams = modifiedRequest.params as WalletConnectRequest['params'] | undefined;
        const capabilities = walletConnectParams?.[0]?.capabilities;
        const silent = walletConnectParams?.[0]?.silent;

        const uiRequest: ConnectUIRequest = {
            id: crypto.randomUUID(),
            type: 'wallet_connect',
            timestamp: Date.now(),
            correlationId,
            data: {
                appName: this.metadata.appName,
                appLogoUrl: this.metadata.appLogoUrl,
                origin: typeof window !== 'undefined' ? window.location.origin : 'unknown',
                chainId: chain.id,
                capabilities,
                silent,
            },
        };

        const response = await this.uiHandler.request<WalletConnectResponse>(uiRequest);

        if (!response.approved) {
            throw response.error || UIError.userRejected();
        }

        if (!response.data) {
            throw UIError.userRejected('Invalid wallet_connect response: missing data');
        }

        // Extract accounts from response
        const accounts = response.data.accounts?.map((acc) => acc.address) ?? [];
        this.accounts = accounts;

        // Store capabilities from response (same as CrossPlatformSigner does in decryptResponseMessage)
        // The capabilities are per-account in WalletConnectResponse
        const walletCapabilities = response.data.accounts?.[0]?.capabilities;

        store.account.set({
            accounts,
            chain: this.chain,
            ...(walletCapabilities && { capabilities: walletCapabilities }),
        });

        // Only emit first account in array (same as CrossPlatformSigner handleResponse for wallet_connect)
        this.callback?.('accountsChanged', [accounts[0]]);
        return response.data;
    }

    /**
     * Headless connect flow - used when no UIHandler is provided.
     * Connects using Account class directly with browser-native passkey prompts.
     */
    private async performHeadlessConnect(): Promise<WalletConnectResponse> {
        const config = {
            chainId: this.chain.id,
            apiKey: this.apiKey,
            paymasterUrl: this.paymasters?.[this.chain.id]?.url,
        };

        // 1. Check if already authenticated
        const authenticatedAddress = Account.getAuthenticatedAddress(this.apiKey);
        if (authenticatedAddress) {
            this.account = await Account.get(config);
            return this.buildConnectResponse(this.account.address);
        }

        // 2. Check for stored accounts - login with first one if available
        const storedAccounts = Account.getStoredAccounts(this.apiKey);
        if (storedAccounts.length > 0) {
            this.account = await Account.get(config, storedAccounts[0].credentialId);
            return this.buildConnectResponse(this.account.address);
        }

        // 3. No accounts - create new one with auto-generated username
        const username = `jaw-${crypto.randomUUID().slice(0, 8)}`;
        this.account = await Account.create(config, { username });
        return this.buildConnectResponse(this.account.address);
    }

    /**
     * Build a WalletConnectResponse from an address
     */
    private buildConnectResponse(address: Address): WalletConnectResponse {
        this.accounts = [address];

        store.account.set({
            accounts: [address],
            chain: this.chain,
        });

        this.callback?.('accountsChanged', [address]);

        return {
            accounts: [{ address }],
        };
    }

    protected async handleSigningRequest(request: RequestArguments): Promise<unknown> {
        const correlationId = this.getCorrelationId(request);

        switch (request.method) {
            case 'personal_sign': {
                const params = request.params as [string, Address];
                const [message] = params;

                // Decode hex-encoded message for display and signing
                // (wagmi and other libraries hex-encode messages before sending)
                const decodedMessage = decodePersonalSignMessage(message);

                // Headless mode: sign directly with Account
                if (!this.uiHandler) {
                    await this.ensureAccount();
                    return await this.account!.signMessage(decodedMessage);
                }

                const uiRequest: SignatureUIRequest = {
                    id: crypto.randomUUID(),
                    type: 'personal_sign',
                    timestamp: Date.now(),
                    correlationId,
                    data: {
                        message: decodedMessage,
                        address: params[1],
                        chainId: this.chain.id,
                    },
                };

                const response = await this.uiHandler.request<string>(uiRequest);

                if (!response.approved) {
                    throw response.error || UIError.userRejected();
                }

                return response.data;
            }

            case 'eth_signTypedData_v4': {
                const params = request.params as [Address, string];
                const [address, typedData] = params;

                // Headless mode: sign typed data directly with Account
                if (!this.uiHandler) {
                    await this.ensureAccount();
                    const parsedTypedData = typeof typedData === 'string' ? JSON.parse(typedData) : typedData;
                    return await this.account!.signTypedData(parsedTypedData);
                }

                const uiRequest: TypedDataUIRequest = {
                    id: crypto.randomUUID(),
                    type: 'eth_signTypedData_v4',
                    timestamp: Date.now(),
                    correlationId,
                    data: {
                        address,
                        typedData,
                        chainId: this.chain.id,
                    },
                };

                const response = await this.uiHandler.request<string>(uiRequest);

                if (!response.approved) {
                    throw response.error || UIError.userRejected();
                }

                return response.data;
            }

            case 'wallet_sign': {
                // ERC-7871 wallet_sign params structure with optional chainId
                type WalletSignParams = {
                    /** Target chain ID in hex format. Defaults to the connected chain. */
                    chainId?: `0x${string}`;
                    request: PersonalSignRequestData | TypedDataRequestData;
                };
                const params = request.params as [WalletSignParams];
                const signParams = params[0];

                // Resolve chain: param chainId -> current chain -> defaultChainId
                const resolvedChain = this.resolveChain(signParams.chainId);

                // Headless mode: sign directly with Account
                if (!this.uiHandler) {
                    await this.ensureAccount(resolvedChain.id);
                    // Type 0x45 = personal sign, Type 0x01 = EIP-712 typed data (ERC-7871)
                    if (signParams.request.type === '0x45') {
                        return await this.account!.signMessage(signParams.request.data.message);
                    } else if (signParams.request.type === '0x01') {
                        const typedData = signParams.request.data;
                        return await this.account!.signTypedData(typedData as Parameters<Account['signTypedData']>[0]);
                    } else {
                        throw standardErrors.rpc.invalidParams(`Unsupported wallet_sign type: ${(signParams.request as { type: string }).type}`);
                    }
                }

                const uiRequest: WalletSignUIRequest = {
                    id: crypto.randomUUID(),
                    type: 'wallet_sign',
                    timestamp: Date.now(),
                    correlationId,
                    data: {
                        address: this.accounts[0],
                        chainId: resolvedChain.id,
                        request: signParams.request,
                    },
                };

                const response = await this.uiHandler.request<string>(uiRequest);

                if (!response.approved) {
                    throw response.error || UIError.userRejected();
                }

                return response.data;
            }

            case 'wallet_sendCalls': {
                // EIP-5792 wallet_sendCalls params - chainId must be hex string
                type WalletSendCallsParams = Omit<TransactionUIRequest['data'], 'chainId'> & {
                    /** Target chain ID in hex format. Defaults to the connected chain. */
                    chainId?: `0x${string}`;
                    /** Optional capabilities including paymaster service */
                    capabilities?: RequestCapabilities;
                };
                const params = request.params as [WalletSendCallsParams];
                const callsData = params[0];

                // Resolve chain: param chainId -> current chain -> defaultChainId
                const resolvedChain = this.resolveChain(callsData.chainId);

                // Headless mode: send calls directly with Account
                if (!this.uiHandler) {
                    await this.ensureAccount(resolvedChain.id);
                    // Priority: capabilities.paymasterService > pre-configured paymasters
                    const capabilitiesPaymaster = callsData.capabilities?.paymasterService;
                    const paymasterConfig = this.paymasters?.[resolvedChain.id];
                    const paymasterUrl = capabilitiesPaymaster?.url ?? paymasterConfig?.url;
                    const paymasterContext = (capabilitiesPaymaster as { context?: Record<string, unknown> } | undefined)?.context ?? paymasterConfig?.context;

                    const result = await this.account!.sendCalls(
                        callsData.calls.map(call => ({
                            to: call.to as Address,
                            value: call.value ? BigInt(call.value) : undefined,
                            data: call.data as Hex | undefined,
                        })),
                        undefined,
                        paymasterUrl,
                        paymasterContext
                    );
                    this.trackSendCallsResult({ id: result.id, chainId: result.chainId });
                    return { id: result.id, chainId: result.chainId };
                }

                const uiRequest: TransactionUIRequest = {
                    id: crypto.randomUUID(),
                    type: 'wallet_sendCalls',
                    timestamp: Date.now(),
                    correlationId,
                    data: {
                        ...callsData,
                        from: callsData.from ?? this.accounts[0],
                        chainId: resolvedChain.id,
                        capabilities: callsData.capabilities,
                    },
                };

                const response = await this.uiHandler.request<{ id: string; chainId: number }>(uiRequest);

                if (!response.approved) {
                    throw response.error || UIError.userRejected();
                }

                // Handle background receipt tracking
                if (response.data) {
                    this.trackSendCallsResult(response.data);
                }

                return response.data;
            }

            case 'eth_sendTransaction': {
                type EthSendTransactionParams = Omit<SendTransactionUIRequest['data'], 'chainId' | 'from'> & {
                    from?: Address;
                    /** Target chain ID in hex format. Defaults to the connected chain. */
                    chainId?: `0x${string}`;
                    /** Optional capabilities including paymaster service */
                    capabilities?: RequestCapabilities;
                };
                const params = request.params as [EthSendTransactionParams];
                const txData = params[0];

                // Resolve chain: param chainId -> current chain -> defaultChainId
                const resolvedChain = this.resolveChain(txData.chainId);

                // Headless mode: send transaction directly with Account
                // Note: No tracking needed - sendTransaction returns a tx hash directly (not a userOpHash)
                if (!this.uiHandler) {
                    await this.ensureAccount(resolvedChain.id);
                    // Priority: capabilities.paymasterService > pre-configured paymasters
                    const capabilitiesPaymaster = txData.capabilities?.paymasterService;
                    const paymasterConfig = this.paymasters?.[resolvedChain.id];
                    const paymasterUrl = capabilitiesPaymaster?.url ?? paymasterConfig?.url;
                    const paymasterContext = (capabilitiesPaymaster as { context?: Record<string, unknown> } | undefined)?.context ?? paymasterConfig?.context;

                    return await this.account!.sendTransaction(
                        [{
                            to: txData.to as Address,
                            value: txData.value ? BigInt(txData.value) : undefined,
                            data: txData.data as Hex | undefined,
                        }],
                        paymasterUrl,
                        paymasterContext
                    );
                }

                const uiRequest: SendTransactionUIRequest = {
                    id: crypto.randomUUID(),
                    type: 'eth_sendTransaction',
                    timestamp: Date.now(),
                    correlationId,
                    data: {
                        from: txData.from ?? this.accounts[0],
                        to: txData.to,
                        value: txData.value,
                        data: txData.data,
                        gas: txData.gas,
                        gasPrice: txData.gasPrice,
                        maxFeePerGas: txData.maxFeePerGas,
                        maxPriorityFeePerGas: txData.maxPriorityFeePerGas,
                        nonce: txData.nonce,
                        chainId: resolvedChain.id,
                        capabilities: txData.capabilities,
                    },
                };

                // eth_sendTransaction returns transaction hash string directly
                const response = await this.uiHandler.request<string>(uiRequest);

                if (!response.approved) {
                    throw response.error || UIError.userRejected();
                }

                // Handle background receipt tracking using txHash as id
                if (response.data) {
                    this.trackSendCallsResult({ id: response.data, chainId: resolvedChain.id });
                }

                return response.data;
            }

            case 'wallet_grantPermissions': {
                const grantParams = request.params as WalletGrantPermissionsRequest['params'];
                const permissionData = grantParams[0];

                // Resolve chain: param chainId -> current chain -> defaultChainId
                const resolvedChain = this.resolveChain(permissionData.chainId);

                // Headless mode: grant permissions directly with Account
                if (!this.uiHandler) {
                    await this.ensureAccount(resolvedChain.id);
                    // Priority: capabilities.paymasterService > pre-configured paymasters
                    const capabilitiesPaymaster = permissionData.capabilities?.paymasterService;
                    const paymasterConfig = this.paymasters?.[resolvedChain.id];
                    const paymasterUrl = capabilitiesPaymaster?.url ?? paymasterConfig?.url;
                    const paymasterContext = (capabilitiesPaymaster as { context?: Record<string, unknown> } | undefined)?.context ?? paymasterConfig?.context;

                    return await this.account!.grantPermissions(
                        permissionData.expiry,
                        permissionData.spender as Address,
                        permissionData.permissions,
                        paymasterUrl,
                        paymasterContext
                    );
                }

                const uiRequest: PermissionUIRequest = {
                    id: crypto.randomUUID(),
                    type: 'wallet_grantPermissions',
                    timestamp: Date.now(),
                    correlationId,
                    data: {
                        address: this.accounts[0],
                        chainId: resolvedChain.id,
                        expiry: permissionData.expiry,
                        spender: permissionData.spender,
                        permissions: permissionData.permissions,
                        capabilities: permissionData.capabilities,
                    },
                };

                const response = await this.uiHandler.request(uiRequest);

                if (!response.approved) {
                    throw response.error || UIError.userRejected();
                }

                return response.data;
            }

            case 'wallet_revokePermissions': {
                const revokeParams = request.params as WalletRevokePermissionsRequest['params'];
                const revokeData = revokeParams[0];

                // Fetch permission from relay to get the correct chainId
                // (permission may have been granted on a different chain than current)
                const apiKey = store.config.get().apiKey;
                if (!apiKey) {
                    throw standardErrors.rpc.internal('No API key configured');
                }

                let relayPermission;
                try {
                    relayPermission = await getPermissionFromRelay(revokeData.id, apiKey);
                } catch {
                    throw standardErrors.rpc.invalidParams(
                        `Permission not found: ${revokeData.id}. It may have already been revoked.`
                    );
                }
                const permissionChainId = parseInt(relayPermission.chainId, 16);

                // Headless mode: revoke permission directly with Account
                if (!this.uiHandler) {
                    await this.ensureAccount(permissionChainId);
                    return await this.account!.revokePermission(revokeData.id as Hex);
                }

                const uiRequest: RevokePermissionUIRequest = {
                    id: crypto.randomUUID(),
                    type: 'wallet_revokePermissions',
                    timestamp: Date.now(),
                    correlationId,
                    data: {
                        permissionId: revokeData.id,
                        address: revokeData.address ?? this.accounts[0],
                        chainId: permissionChainId,
                        capabilities: revokeData.capabilities,
                    },
                };

                const response = await this.uiHandler.request(uiRequest);

                if (!response.approved) {
                    throw response.error || UIError.userRejected();
                }

                return response.data;
            }

            default:
                // For any other signing methods, delegate to base class behavior
                // which will throw unsupportedMethod for unknown wallet_* methods
                return super.handleAuthenticatedRequest(request);
        }
    }

    /**
     * Ensure we have an Account instance for headless operations.
     * If chainId differs from current account, recreate with new chain.
     */
    private async ensureAccount(chainId?: number): Promise<void> {
        const targetChainId = chainId ?? this.chain.id;

        // If we already have an account on the correct chain, we're good
        if (this.account && this.account.chainId === targetChainId) {
            return;
        }

        const config = {
            chainId: targetChainId,
            apiKey: this.apiKey,
            paymasterUrl: this.paymasters?.[targetChainId]?.url,
        };

        // Try to restore from auth state
        const authenticatedAddress = Account.getAuthenticatedAddress(this.apiKey);
        if (authenticatedAddress) {
            this.account = await Account.get(config);
            return;
        }

        // Not authenticated - this shouldn't happen if connect was called first
        throw standardErrors.provider.unauthorized('Not connected. Call wallet_connect first.');
    }

    override async cleanup(): Promise<void> {
        await this.uiHandler?.cleanup?.();
        await super.cleanup();
    }
}
