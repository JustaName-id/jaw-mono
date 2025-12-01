import { UUID } from 'crypto';

import { JAWSigner } from '../JAWSigner.js';

import { Communicator } from '../../communicator/index.js';
import { standardErrors } from '../../errors/index.js';
import { RPCRequestMessage, RPCResponseMessage, RPCResponse } from '../../messages/index.js';
import { KeyManager } from '../../key-manager/index.js';
import { AppMetadata, ProviderEventCallback, RequestArguments } from '../../provider/index.js';
import { store } from '../../store/index.js';
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
        const cachedResponse = await this.getCachedWalletConnectResponse();
        if (cachedResponse) {
            return cachedResponse;
        }

        // Wait for the popup to be loaded before making async calls
        await this.communicator.waitForPopupLoaded?.();

        // Validate and inject capabilities using base class method
        const modifiedRequest = this.validateAndInjectCapabilities(request);

        this.emitConnect();
        return this.sendRequestToPopup(modifiedRequest);
    }

    protected override async handleWalletConnectUnauthenticated(request: RequestArguments): Promise<unknown> {
        // Wait for the popup to be loaded before making async calls
        await this.communicator.waitForPopupLoaded?.();

        // Validate and inject capabilities using base class method
        const modifiedRequest = this.validateAndInjectCapabilities(request);
        return this.sendRequestToPopup(modifiedRequest);
    }

    protected override async handleSigningRequest(request: RequestArguments): Promise<unknown> {
        return this.sendRequestToPopup(request);
    }

    override async cleanup(): Promise<void> {
        await this.keyManager.clear();
        await super.cleanup();
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
