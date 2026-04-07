import { Address, numberToHex } from 'viem';

import { Signer } from './interface.js';

import { assertParamsChainId, getCachedWalletConnectResponse, injectRequestCapabilities } from './SignerUtils.js';
import { storeCallStatus, waitForReceiptInBackground } from '../rpc/wallet_sendCalls.js';
import { handleGetCallsStatusRequest } from '../rpc/wallet_getCallStatus.js';
import { handleGetAssetsRequest } from '../rpc/wallet_getAssets.js';
import { handleGetCallsHistoryRequest } from '../rpc/wallet_getCallsHistory.js';

import { standardErrors } from '../errors/index.js';
import { RPCResponse } from '../messages/index.js';
import { AppMetadata, ProviderEventCallback, RequestArguments } from '../provider/index.js';
import { SDKChain, correlationIds, store } from '../store/index.js';
import {
    WalletConnectResponse,
    WalletConnectRequest,
    SignInWithEthereumCapabilityRequest,
    SubnameTextRecordCapabilityRequest,
    handleGetPermissionsRequest,
    handleGetCapabilitiesRequest,
} from '../rpc/index.js';
import { fetchRPCRequest, ensureIntNumber, hexStringFromNumber } from '../utils/index.js';
import { clearSignerType } from './signerStorage.js';

type ConstructorOptions = {
    metadata: AppMetadata;
    callback: ProviderEventCallback | null;
};

/**
 * Abstract base class for all JAW signers.
 * Provides common functionality for account management, chain switching,
 * and standard RPC method handling.
 */
export abstract class JAWSigner implements Signer {
    protected callback: ProviderEventCallback | null;
    protected readonly metadata: AppMetadata;

    protected accounts: Address[];
    protected chain: SDKChain;
    protected pendingWalletConnectResponse: WalletConnectResponse | null = null;

    constructor(params: ConstructorOptions) {
        this.callback = params.callback;
        this.metadata = params.metadata;

        const state = store.getState();
        const { account } = state;

        this.accounts = account.accounts ?? [];
        this.chain = account.chain ?? {
            id: params.metadata.defaultChainId ?? 1,
        };
    }

    /**
     * Establishes connection with the wallet/user.
     * Implementation varies by signer type.
     */
    abstract handshake(args: RequestArguments): Promise<void>;

    /**
     * Handles wallet_connect when user is already authenticated.
     */
    protected abstract handleWalletConnect(request: RequestArguments): Promise<unknown>;

    /**
     * Handles wallet_connect when user is not authenticated.
     */
    protected abstract handleWalletConnectUnauthenticated(request: RequestArguments): Promise<unknown>;

    /**
     * Handles signing requests (personal_sign, eth_signTypedData_v4, wallet_sendCalls, etc.)
     */
    protected abstract handleSigningRequest(request: RequestArguments): Promise<unknown>;

    async request<T>(request: RequestArguments): Promise<T> {
        const result = await this._request(request);
        return result as T;
    }

    protected async _request(request: RequestArguments): Promise<unknown> {
        // Handle unauthenticated requests
        if (this.accounts.length === 0) {
            return this.handleUnauthenticatedRequest(request);
        }

        // Handle authenticated requests
        return this.handleAuthenticatedRequest(request);
    }

    /**
     * Handles requests when user is not authenticated
     */
    protected async handleUnauthenticatedRequest(request: RequestArguments): Promise<unknown> {
        switch (request.method) {
            case 'eth_requestAccounts': {
                // Trigger wallet_connect to establish connection and get accounts
                await this._request({
                    method: 'wallet_connect',
                    params: [
                        {
                            capabilities: {},
                        },
                    ],
                });
                return this.accounts;
            }

            case 'wallet_switchEthereumChain': {
                assertParamsChainId(request.params);
                const chainId = ensureIntNumber(request.params[0].chainId);

                // Check if chain is supported
                const chains = store.getState().chains ?? [];
                const chain = chains.find((c) => c.id === chainId);
                if (!chain) {
                    throw standardErrors.provider.unsupportedMethod(
                        `wallet_switchEthereumChain is not supported for chainID ${chainId}`
                    );
                }

                this.chain.id = chainId;
                return null;
            }

            case 'wallet_connect': {
                return this.handleWalletConnectUnauthenticated(request);
            }

            case 'wallet_sendCalls':
            case 'wallet_sign':
            case 'wallet_grantPermissions':
            case 'wallet_revokePermissions': {
                return this.handleSigningRequest(request);
            }

            default:
                throw standardErrors.provider.unauthorized();
        }
    }

    /**
     * Handles requests when user is authenticated
     */
    protected async handleAuthenticatedRequest(request: RequestArguments): Promise<unknown> {
        switch (request.method) {
            case 'eth_requestAccounts': {
                const cachedResponse = await this.getCachedWalletConnectResponse();
                if (!cachedResponse) {
                    // Session expired, trigger re-authentication
                    this.accounts = [];
                    return this.handleUnauthenticatedRequest(request);
                }
                this.emitConnect();
                return this.accounts;
            }

            case 'eth_accounts': {
                this.emitConnect();
                return this.accounts;
            }

            case 'eth_coinbase':
                return this.accounts[0];

            case 'net_version':
                return this.chain.id;

            case 'eth_chainId':
                return numberToHex(this.chain.id);

            case 'wallet_getCallsStatus':
                return await handleGetCallsStatusRequest(request);

            case 'wallet_getCallsHistory': {
                const config = store.config.get();
                const apiKey = config.apiKey;

                if (!apiKey) {
                    throw standardErrors.rpc.internal('No API key configured');
                }

                return await handleGetCallsHistoryRequest(request, apiKey, this.accounts[0]);
            }

            case 'wallet_getAssets': {
                const config = store.config.get();
                const apiKey = config.apiKey;
                const showTestnets = config.preference?.showTestnets ?? false;

                if (!apiKey) {
                    throw standardErrors.rpc.internal('No API key configured');
                }

                return await handleGetAssetsRequest(request, apiKey, showTestnets);
            }

            case 'wallet_getPermissions': {
                const config = store.config.get();
                const apiKey = config.apiKey;

                if (!apiKey) {
                    throw standardErrors.rpc.internal('No API key configured');
                }

                return await handleGetPermissionsRequest(request, apiKey, this.accounts[0]);
            }

            case 'wallet_getCapabilities': {
                const apiKey = store.getState().config.apiKey;
                if (!apiKey) {
                    throw standardErrors.rpc.internal('No API key configured');
                }
                const showTestnets = store.getState().config.preference?.showTestnets ?? false;
                return await handleGetCapabilitiesRequest(request, apiKey, showTestnets);
            }

            case 'wallet_switchEthereumChain':
                return this.handleSwitchChainRequest(request);

            case 'wallet_sendCalls':
            case 'personal_sign':
            case 'wallet_sign':
            case 'eth_sendTransaction':
            case 'eth_signTypedData_v4':
            case 'wallet_grantPermissions':
            case 'wallet_revokePermissions':
                return this.handleSigningRequest(request);

            case 'eth_sign':
            case 'eth_ecRecover':
            case 'personal_ecRecover':
            case 'eth_signTransaction':
            case 'eth_signTypedData':
            case 'eth_signTypedData_v1':
            case 'eth_signTypedData_v3':
                throw standardErrors.provider.unsupportedMethod();

            case 'wallet_connect': {
                return this.handleWalletConnect(request);
            }

            default: {
                // Throw error for any unhandled wallet_* methods
                if (request.method.startsWith('wallet_')) {
                    throw standardErrors.provider.unsupportedMethod();
                }

                // Forward to RPC provider for standard Ethereum methods
                const chains = store.getState().chains;
                const chain = chains?.find((c) => c.id === this.chain.id) ?? this.chain;
                if (!chain.rpcUrl) {
                    throw standardErrors.rpc.internal('No RPC URL set for chain');
                }
                return fetchRPCRequest(request, chain.rpcUrl);
            }
        }
    }

    /**
     * Handles response from wallet operations and updates internal state.
     * Call this after receiving a response from handshake or signing requests.
     */
    protected async handleResponse(request: RequestArguments, response: RPCResponse): Promise<unknown> {
        const result = response.result;

        if ('error' in result) throw result.error;

        switch (request.method) {
            case 'eth_requestAccounts': {
                const walletResponse = result.value as WalletConnectResponse;
                const accounts = walletResponse.accounts.map((account) => account.address);
                this.accounts = accounts;
                store.account.set({
                    accounts,
                    chain: this.chain,
                });
                this.callback?.('accountsChanged', accounts);
                break;
            }

            case 'wallet_connect': {
                const walletResponse = result.value as WalletConnectResponse;
                if (!walletResponse || !walletResponse.accounts || !Array.isArray(walletResponse.accounts)) {
                    throw standardErrors.rpc.invalidParams('Invalid wallet_connect response: missing accounts');
                }
                const accounts = walletResponse.accounts.map((account) => account.address);
                this.accounts = accounts;
                const walletCapabilities = walletResponse.accounts[0]?.capabilities;
                store.account.set({
                    accounts,
                    chain: this.chain,
                    ...(walletCapabilities && { capabilities: walletCapabilities }),
                });
                // Store the full response so handleWalletConnect can return it
                // with capabilities on fresh connections (before falling through to cached path)
                this.pendingWalletConnectResponse = walletResponse;

                const accounts_ = [this.accounts[0]];
                this.callback?.('accountsChanged', accounts_);
                break;
            }

            case 'wallet_sendCalls': {
                this.trackSendCallsResult(result.value as { id?: string; chainId?: number });
                break;
            }

            default:
                break;
        }

        return result.value;
    }

    /**
     * Tracks the result of a wallet_sendCalls operation.
     * Stores call status and starts background receipt tracking.
     */
    protected trackSendCallsResult(result: { id?: string; chainId?: number }): void {
        const userOpHash = result?.id;
        const chainId = result?.chainId;
        const apiKey = store.getState().config.apiKey;

        if (userOpHash && chainId) {
            storeCallStatus(userOpHash, chainId, apiKey);
            waitForReceiptInBackground(userOpHash, chainId, apiKey).catch((error) => {
                console.error('Background receipt wait failed:', error);
            });
        }
    }

    /**
     * Cleans up signer state. Subclasses should call super.cleanup()
     * after their own cleanup logic.
     *
     * Note: This does NOT clear PasskeyManager auth state - that's handled
     * by JAWProvider.disconnect() for explicit logout scenarios.
     */
    async cleanup(): Promise<void> {
        store.account.clear();
        clearSignerType();

        this.accounts = [];
        this.pendingWalletConnectResponse = null;
        this.chain = {
            id: this.metadata.defaultChainId ?? 1,
        };
    }

    /**
     * Handles wallet_switchEthereumChain request.
     * @returns `null` if the request was successful.
     * https://eips.ethereum.org/EIPS/eip-3326#wallet_switchethereumchain
     */
    protected async handleSwitchChainRequest(request: RequestArguments): Promise<null> {
        assertParamsChainId(request.params);

        const chainId = ensureIntNumber(request.params[0].chainId);
        const localResult = this.updateChain(chainId);
        if (localResult) return null;

        // Chain not found in store - it's not supported
        throw standardErrors.provider.unsupportedMethod(
            `wallet_switchEthereumChain is not supported for target chainID ${chainId}`
        );
    }

    /**
     * Updates the current chain if it's available.
     * @returns true if chain was updated, false if chain not found
     */
    protected updateChain(chainId: number, newAvailableChains?: SDKChain[]): boolean {
        const state = store.getState();
        const chains = newAvailableChains ?? state.chains;
        const chain = chains?.find((chain) => chain.id === chainId);
        if (!chain) return false;

        if (chain !== this.chain) {
            this.chain = chain;
            store.account.set({
                chain,
            });
            this.callback?.('chainChanged', hexStringFromNumber(chain.id));
        }
        return true;
    }

    /**
     * Resolves the chainId to use based on priority:
     * 1. If chainId param is provided (hex string), use that chain
     * 2. Otherwise, use the current chain (set via wallet_switchEthereumChain)
     * 3. Fallback to defaultChainId
     *
     * @param chainIdHex - Optional chainId in hex format (e.g., '0x1')
     * @returns The resolved SDKChain object
     * @throws {EthereumRpcError} If the resolved chain is not supported
     */
    protected resolveChain(chainIdHex?: string): SDKChain {
        const state = store.getState();
        const chains = state.chains ?? [];

        // Priority 1: Use provided chainId if present
        if (chainIdHex) {
            const chainId = ensureIntNumber(chainIdHex);
            const chain = chains.find((c) => c.id === chainId);
            if (!chain) {
                throw standardErrors.provider.unsupportedMethod(`Chain ${chainIdHex} (${chainId}) is not supported`);
            }
            return chain;
        }

        // Priority 2: Use current chain (set via wallet_switchEthereumChain)
        const currentChain = chains.find((c) => c.id === this.chain.id);
        if (currentChain) {
            return currentChain;
        }

        // Priority 3: Fallback to defaultChainId
        const defaultChainId = this.metadata.defaultChainId ?? 1;
        const defaultChain = chains.find((c) => c.id === defaultChainId);
        if (defaultChain) {
            return defaultChain;
        }

        // If nothing found, return current chain object (may be incomplete)
        return this.chain;
    }

    /**
     * Emits a connect event with the current chain ID.
     */
    protected emitConnect(): void {
        this.callback?.('connect', { chainId: numberToHex(this.chain.id) });
    }

    /**
     * Gets the correlation ID for a request.
     */
    protected getCorrelationId(request: RequestArguments): string | undefined {
        return correlationIds.get(request);
    }

    /**
     * Gets wallet_connect response. Returns the pending fresh response (with capabilities)
     * if available, otherwise falls back to the cached response (address only).
     * Skips cache when capabilities are requested since they require a fresh connection.
     */
    protected async getCachedWalletConnectResponse(request?: RequestArguments): Promise<WalletConnectResponse | null> {
        if (this.pendingWalletConnectResponse) {
            const response = this.pendingWalletConnectResponse;
            this.pendingWalletConnectResponse = null;
            return response;
        }
        // Capabilities require a fresh connection — skip cache
        const params = request?.params as WalletConnectRequest['params'] | undefined;
        const capabilities = params?.[0]?.capabilities;
        if (capabilities && Object.keys(capabilities).length > 0) {
            return null;
        }
        return getCachedWalletConnectResponse();
    }

    /**
     * Type guard to validate if request matches WalletConnectRequest structure.
     * Validates capabilities structure including signInWithEthereum and subnameTextRecords.
     */
    protected isValidWalletConnectRequest(request: RequestArguments): request is WalletConnectRequest {
        if (request.method !== 'wallet_connect') {
            return false;
        }

        const params = request.params;
        if (!Array.isArray(params) || params.length === 0) {
            return false;
        }

        const firstParam = params[0];
        if (typeof firstParam !== 'object' || firstParam === null) {
            return false;
        }

        // Validate capabilities structure if present
        if ('capabilities' in firstParam && firstParam.capabilities !== undefined) {
            const capabilities = firstParam.capabilities;
            if (typeof capabilities !== 'object' || capabilities === null) {
                return false;
            }

            // Validate signInWithEthereum structure if present
            if ('signInWithEthereum' in capabilities && capabilities.signInWithEthereum !== undefined) {
                const siwe = capabilities.signInWithEthereum;
                if (typeof siwe !== 'object' || siwe === null) {
                    return false;
                }
                if (!('nonce' in siwe) || typeof siwe.nonce !== 'string') {
                    return false;
                }
                if (!('chainId' in siwe) || typeof siwe.chainId !== 'string') {
                    return false;
                }
            }

            // Validate subnameTextRecords structure if present
            if ('subnameTextRecords' in capabilities && capabilities.subnameTextRecords !== undefined) {
                const records = capabilities.subnameTextRecords;
                if (!Array.isArray(records)) {
                    return false;
                }
                for (const record of records) {
                    if (typeof record !== 'object' || record === null) {
                        return false;
                    }
                    if (!('key' in record) || typeof record.key !== 'string') {
                        return false;
                    }
                    if (!('value' in record) || typeof record.value !== 'string') {
                        return false;
                    }
                }
            }
        }

        return true;
    }

    /**
     * Validates and extracts capabilities from a wallet_connect request.
     * Injects capabilities into the request if present.
     *
     * For requests without params or with empty params, this returns the request as-is
     * (no capabilities to validate or inject). For requests with params, it validates
     * the structure and injects capabilities if present.
     *
     * @param request - The request arguments to validate and process
     * @returns The modified request with capabilities injected
     * @throws {EthereumRpcError} If the request has params but doesn't match WalletConnectRequest structure
     */
    protected validateAndInjectCapabilities(request: RequestArguments): RequestArguments {
        // If no params or empty params, just return the request as-is (no capabilities)
        const params = request.params;
        if (!params || !Array.isArray(params) || params.length === 0) {
            return request;
        }

        // If params exist, validate they match WalletConnectRequest structure
        if (!this.isValidWalletConnectRequest(request)) {
            throw standardErrors.rpc.invalidParams(
                'Invalid wallet_connect request structure. Request must match WalletConnectRequest type.'
            );
        }

        // Now we can safely access params[0] as WalletConnectRequest['params'][0]
        const walletConnectRequest = request as WalletConnectRequest;
        const firstParam = walletConnectRequest.params[0];

        // Extract capabilities from request params if present
        const requestCapabilities = firstParam.capabilities;

        // If capabilities exist, inject them into the request
        if (requestCapabilities) {
            const capabilitiesToInject: Record<
                string,
                SignInWithEthereumCapabilityRequest | SubnameTextRecordCapabilityRequest
            > = { ...requestCapabilities };
            return injectRequestCapabilities(request, capabilitiesToInject);
        }

        return request;
    }
}
