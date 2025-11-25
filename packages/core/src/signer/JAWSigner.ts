import { Address, numberToHex } from 'viem';
import { UUID } from 'crypto';

import { Signer } from './interface.js';
import {
    assertParamsChainId,
    getCachedWalletConnectResponse,
    injectRequestCapabilities,
} from './SignerUtils.js';
import { waitForReceiptInBackground, storeCallStatus } from '../rpc/wallet_sendCalls.js';
import { handleGetCallsStatusRequest } from '../rpc/wallet_getCallStatus.js';
import { handleGetAssetsRequest } from '../rpc/wallet_getAssets.js';

import { Communicator } from '../communicator/index.js';
import { standardErrors } from '../errors/index.js';
import { RPCRequestMessage, RPCResponseMessage, RPCResponse } from '../messages/index.js';
import { KeyManager } from '../key-manager/index.js';
import { AppMetadata, ProviderEventCallback, RequestArguments } from '../provider/index.js';
import { SDKChain, correlationIds, store } from '../store/index.js';
import { SignInWithEthereumCapabilityRequest, SubnameTextRecordCapabilityRequest, WalletConnectRequest, WalletConnectResponse, handleGetPermissionsRequest } from '../rpc/index.js';
import {
    decryptContent,
    encryptContent,
    exportKeyToHexString,
    importKeyFromHexString,
    fetchRPCRequest,
    ensureIntNumber,
    hexStringFromNumber
} from '../utils/index.js';
import {clearSignerType} from "./utils.js";

type ConstructorOptions = {
    metadata: AppMetadata;
    communicator: Communicator;
    callback: ProviderEventCallback | null;
};

export class JAWSigner implements Signer {
    private readonly communicator: Communicator;
    private readonly keyManager: KeyManager;
    private callback: ProviderEventCallback | null;

    private accounts: Address[];
    private chain: SDKChain;

    constructor(params: ConstructorOptions) {
        this.communicator = params.communicator;
        this.callback = params.callback;
        this.keyManager = new KeyManager();

        const state = store.getState();
        const { account } = state;

        this.accounts = account.accounts ?? [];
        this.chain = account.chain ?? {
            id: params.metadata.defaultChainId ?? 1,
        };
    }

    async handshake(args: RequestArguments) {
        const correlationId = correlationIds.get(args);

        // Open the popup before constructing the request message.
        // This is to ensure that the popup is not blocked by some browsers (i.e. Safari)
        await this.communicator.waitForPopupLoaded?.();

        const chains = store.getState().chains;
        const chain = chains?.find((c) => c.id === this.chain.id) ?? this.chain;

        const handshakeMessage = await this.createRequestMessage(
            {
                handshake: {
                    method: args.method,
                    params: args.params ?? [],
                },
            chain
            },
            correlationId
        );
        const response: RPCResponseMessage =
            await this.communicator.postRequestAndWaitForResponse(handshakeMessage);

        // store peer's public key
        if ('failure' in response.content) {
            throw response.content.failure;
        }

        const peerPublicKey = await importKeyFromHexString('public', response.sender);
        await this.keyManager.setPeerPublicKey(peerPublicKey);

        const decrypted = await this.decryptResponseMessage(response);

        await this.handleResponse(args, decrypted);
    }

    async request(request: RequestArguments) {
        const result = await this._request(request);
        return result;
    }

    async _request(request: RequestArguments) {
        if (this.accounts.length === 0) {
            switch (request.method) {
                case 'eth_requestAccounts': {
                    // Wait for the popup to be loaded before making async calls
                    await this.communicator.waitForPopupLoaded?.();

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
                    return;
                }
                case 'wallet_connect': {
                    // Wait for the popup to be loaded before making async calls
                    await this.communicator.waitForPopupLoaded?.();

                    const modifiedRequest = this.extractAndInjectCapabilities(request);
                    return this.sendRequestToPopup(modifiedRequest);
                }
                case 'wallet_sendCalls':
                case 'wallet_sign': {
                    return this.sendRequestToPopup(request);
                }
                default:
                    throw standardErrors.provider.unauthorized();
            }
        }

        switch (request.method) {
            case 'eth_requestAccounts':
            case 'eth_accounts': {
                this.callback?.('connect', { chainId: numberToHex(this.chain.id) });
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
                return this.sendRequestToPopup(request);
            case 'eth_sign':
            case 'eth_ecRecover':
            case 'personal_ecRecover':
            case 'eth_signTransaction':
            case 'eth_signTypedData':
            case 'eth_signTypedData_v1':
            case 'eth_signTypedData_v3':
                throw standardErrors.provider.unsupportedMethod();
            case 'wallet_connect': {
                // Return cached wallet connect response if available
                const cachedResponse = await getCachedWalletConnectResponse();
                if (cachedResponse) {
                    return cachedResponse;
                }

                // Wait for the popup to be loaded before making async calls
                await this.communicator.waitForPopupLoaded?.();
                
                const modifiedRequest = this.extractAndInjectCapabilities(request);

                this.callback?.('connect', { chainId: numberToHex(this.chain.id) });
                return this.sendRequestToPopup(modifiedRequest);
            }
            default: {
                // Throw error for any unhandled wallet_* methods
                if (request.method.startsWith('wallet_')) {
                    throw standardErrors.provider.unsupportedMethod();
                }

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
     * Type guard to validate if request matches WalletConnectRequest structure
     */
    private isValidWalletConnectRequest(request: RequestArguments): request is WalletConnectRequest {
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
     * Extracts capabilities from request params and injects them into the request.
     * This function handles any capabilities generically, not just specific ones.
     * Validates that the request matches WalletConnectRequest structure before processing.
     * 
     * @param request - The request arguments containing potential capabilities
     * @returns The modified request with capabilities injected
     * @throws {EthereumRpcError} If the request doesn't match WalletConnectRequest structure
     */
    private extractAndInjectCapabilities(request: RequestArguments): RequestArguments {
        // Validate and type cast to WalletConnectRequest
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
            const capabilitiesToInject: Record<string, SignInWithEthereumCapabilityRequest | SubnameTextRecordCapabilityRequest> = { ...requestCapabilities };
            return injectRequestCapabilities(request, capabilitiesToInject);
        }
        
        return request;
    }

    private async sendRequestToPopup(request: RequestArguments) {
        // Open the popup before constructing the request message.
        // This is to ensure that the popup is not blocked by some browsers (i.e. Safari)
        await this.communicator.waitForPopupLoaded?.();

        const response = await this.sendEncryptedRequest(request);
        const decrypted = await this.decryptResponseMessage(response);

        return this.handleResponse(request, decrypted);
    }

    private async handleResponse(request: RequestArguments, decrypted: RPCResponse) {
        const result = decrypted.result;

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
                const response = result.value as WalletConnectResponse;
                if (!response || !response.accounts || !Array.isArray(response.accounts)) {
                    throw standardErrors.rpc.invalidParams('Invalid wallet_connect response: missing accounts');
                }
                const accounts = response.accounts.map((account) => account.address);
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
                // Handle wallet_sendCalls result: store call status and start background task
                const resultObj = result.value as { id?: string; chainId?: number };
                const userOpHash = resultObj?.id;
                const chainId = resultObj?.chainId;

                if (userOpHash && chainId) {
                    // Store call status and start background task
                    storeCallStatus(userOpHash, chainId);
                    // Start background task (don't await - runs in background)
                    waitForReceiptInBackground(userOpHash, chainId).catch((error) => {
                        console.error('Background receipt wait failed:', error);
                    });
                }
                break;
            }
            default:
                break;
        }
        return result.value;
    }

    async cleanup() {
        const metadata = store.config.get().metadata;
        await this.keyManager.clear();

        // clear the store
        store.account.clear();

        clearSignerType();

        // reset the signer
        this.accounts = [];
        this.chain = {
            id: metadata?.defaultChainId ?? 1,
        };
    }

    /**
     * @returns `null` if the request was successful.
     * https://eips.ethereum.org/EIPS/eip-3326#wallet_switchethereumchain
     */
    private async handleSwitchChainRequest(request: RequestArguments) {
        assertParamsChainId(request.params);

        const chainId = ensureIntNumber(request.params[0].chainId);
        const localResult = this.updateChain(chainId);
        if (localResult) return null;

        // Chain not found in store - it's not supported
        throw standardErrors.provider.unsupportedMethod(
            `wallet_switchEthereumChain is not supported for target chainID ${chainId}`
        );
    }

    private async sendEncryptedRequest(request: RequestArguments): Promise<RPCResponseMessage> {
        const sharedSecret = await this.keyManager.getSharedSecret();
        if (!sharedSecret) {
            throw standardErrors.provider.unauthorized('No shared secret found when encrypting request');
        }

        const chains = store.getState().chains;
        const chain = chains?.find((c) => c.id === this.chain.id) ?? this.chain;

        const encrypted = await encryptContent(
            {
                action: request,
                chain: chain,
            },
            sharedSecret
        );
        const correlationId = correlationIds.get(request);
        const message = await this.createRequestMessage({ encrypted }, correlationId);

        return this.communicator.postRequestAndWaitForResponse(message);
    }

    private async createRequestMessage(
        content: RPCRequestMessage['content'],
        correlationId: string | undefined
    ): Promise<RPCRequestMessage> {
        const publicKey = await exportKeyToHexString('public', await this.keyManager.getOwnPublicKey());

        return {
            id: crypto.randomUUID() as UUID,
            correlationId,
            sender: publicKey,
            content,
            timestamp: new Date(),
        };
    }

    private async decryptResponseMessage(message: RPCResponseMessage): Promise<RPCResponse> {
        const content = message.content;

        // throw protocol level error
        if ('failure' in content) {
            throw content.failure;
        }

        const sharedSecret = await this.keyManager.getSharedSecret();
        if (!sharedSecret) {
            throw standardErrors.provider.unauthorized(
                'Invalid session: no shared secret found when decrypting response'
            );
        }

        const response: RPCResponse = await decryptContent(content.encrypted, sharedSecret);

        const walletCapabilities = response.data?.capabilities;
        if (walletCapabilities) {
            store.account.set({
                capabilities: walletCapabilities,
            });
        }
        return response;
    }

    private updateChain(chainId: number, newAvailableChains?: SDKChain[]): boolean {
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
}
