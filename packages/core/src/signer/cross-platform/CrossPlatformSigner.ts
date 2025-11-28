import { UUID } from 'crypto';

import { JAWSigner } from '../JAWSigner.js';
import {
    getCachedWalletConnectResponse,
    injectRequestCapabilities,
} from '../SignerUtils.js';

import { Communicator } from '../../communicator/index.js';
import { standardErrors } from '../../errors/index.js';
import { RPCRequestMessage, RPCResponseMessage, RPCResponse } from '../../messages/index.js';
import { KeyManager } from '../../key-manager/index.js';
import { AppMetadata, ProviderEventCallback, RequestArguments } from '../../provider/index.js';
import { store } from '../../store/index.js';
import { SignInWithEthereumCapabilityRequest, SubnameTextRecordCapabilityRequest, WalletConnectRequest } from '../../rpc/index.js';
import {
    decryptContent,
    encryptContent,
    exportKeyToHexString,
    importKeyFromHexString,
} from '../../utils/index.js';

type ConstructorOptions = {
    metadata: AppMetadata;
    communicator: Communicator;
    callback: ProviderEventCallback | null;
};

export class CrossPlatformSigner extends JAWSigner {
    private readonly communicator: Communicator;
    private readonly keyManager: KeyManager;

    constructor(params: ConstructorOptions) {
        super({
            metadata: params.metadata,
            callback: params.callback,
        });
        this.communicator = params.communicator;
        this.keyManager = new KeyManager();
    }

    override async handshake(args: RequestArguments): Promise<void> {
        const correlationId = this.getCorrelationId(args);

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

    protected override async handleWalletConnect(request: RequestArguments): Promise<unknown> {
        // Return cached wallet connect response if available
        const cachedResponse = await getCachedWalletConnectResponse();
        if (cachedResponse) {
            return cachedResponse;
        }

        // Wait for the popup to be loaded before making async calls
        await this.communicator.waitForPopupLoaded?.();

        const modifiedRequest = this.extractAndInjectCapabilities(request);

        this.emitConnect();
        return this.sendRequestToPopup(modifiedRequest);
    }

    protected override async handleWalletConnectUnauthenticated(request: RequestArguments): Promise<unknown> {
        // Wait for the popup to be loaded before making async calls
        await this.communicator.waitForPopupLoaded?.();

        const modifiedRequest = this.extractAndInjectCapabilities(request);
        return this.sendRequestToPopup(modifiedRequest);
    }

    protected override async handleSigningRequest(request: RequestArguments): Promise<unknown> {
        return this.sendRequestToPopup(request);
    }

    override async cleanup(): Promise<void> {
        await this.keyManager.clear();
        await super.cleanup();
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

    private async sendRequestToPopup(request: RequestArguments): Promise<unknown> {
        // Open the popup before constructing the request message.
        // This is to ensure that the popup is not blocked by some browsers (i.e. Safari)
        await this.communicator.waitForPopupLoaded?.();

        const response = await this.sendEncryptedRequest(request);
        const decrypted = await this.decryptResponseMessage(response);

        return this.handleResponse(request, decrypted);
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
        const correlationId = this.getCorrelationId(request);
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
}
