import { Address, numberToHex } from 'viem';

import { Signer } from './interface.js';
import { assertParamsChainId } from './SignerUtils.js';
import { storeCallStatus, waitForReceiptInBackground } from '../rpc/wallet_sendCalls.js';
import { handleGetCallsStatusRequest } from '../rpc/wallet_getCallStatus.js';
import { handleGetAssetsRequest } from '../rpc/wallet_getAssets.js';

import { standardErrors } from '../errors/index.js';
import { RPCResponse } from '../messages/index.js';
import { AppMetadata, ProviderEventCallback, RequestArguments } from '../provider/index.js';
import { SDKChain, correlationIds, store } from '../store/index.js';
import { WalletConnectResponse, handleGetPermissionsRequest } from '../rpc/index.js';
import {
    fetchRPCRequest,
    ensureIntNumber,
    hexStringFromNumber
} from '../utils/index.js';
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
                    params: [{
                        capabilities: {}
                    }]
                });
                return this.accounts;
            }

            case 'wallet_switchEthereumChain': {
                assertParamsChainId(request.params);
                const chainId = ensureIntNumber(request.params[0].chainId);

                // Check if chain is supported
                const chains = store.getState().chains ?? [];
                const chain = chains.find(c => c.id === chainId);
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
            case 'wallet_sign': {
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
            case 'eth_requestAccounts':
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

            case 'wallet_switchEthereumChain':
                return this.handleSwitchChainRequest(request);

            case 'wallet_sendCalls':
            case 'personal_sign':
            case 'wallet_sign':
            case 'eth_sendTransaction':
            case 'eth_signTypedData_v4':
            case 'wallet_showCallsStatus':
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
                const accounts = result.value as Address[];
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
                store.account.set({
                    accounts,
                    chain: this.chain,
                });

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

        if (userOpHash && chainId) {
            storeCallStatus(userOpHash, chainId);
            waitForReceiptInBackground(userOpHash, chainId).catch((error) => {
                console.error('Background receipt wait failed:', error);
            });
        }
    }

    /**
     * Cleans up signer state. Subclasses should call super.cleanup()
     * after their own cleanup logic.
     */
    async cleanup(): Promise<void> {
        store.account.clear();
        clearSignerType();

        this.accounts = [];
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
}
