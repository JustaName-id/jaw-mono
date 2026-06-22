import { UUID } from 'crypto';

import { JAWSigner } from '../JAWSigner.js';
import { decodePersonalSignRequest } from '../SignerUtils.js';

import { Communicator } from '../../communicator/index.js';
import { getPermissionFromRelay } from '../../rpc/index.js';
import { standardErrors } from '../../errors/index.js';
import { RPCRequestMessage, RPCResponseMessage, RPCResponse, isReconnectRequiredFailure } from '../../messages/index.js';
import { KeyManager } from '../../key-manager/index.js';
import { AppMetadata, ProviderEventCallback, RequestArguments } from '../../provider/index.js';
import { store, SDKChain } from '../../store/index.js';
import { decryptContent, encryptContent, exportKeyToHexString, importKeyFromHexString } from '../../utils/index.js';

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
                chain,
            },
            correlationId
        );
        const response: RPCResponseMessage = await this.communicator.postRequestAndWaitForResponse(handshakeMessage);

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
        const cachedResponse = await this.getCachedWalletConnectResponse(request);
        if (cachedResponse) {
            this.emitConnect();
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
        let resolvedChain: SDKChain | undefined;

        // Decode hex-encoded messages for personal_sign before sending to popup
        // (wagmi and other libraries hex-encode messages before sending)
        const processedRequest = decodePersonalSignRequest(request);

        // wallet_revokePermissions needs chainId from relay (not in request params)
        // because the permission may have been granted on a different chain
        if (processedRequest.method === 'wallet_revokePermissions') {
            const params = processedRequest.params as [{ id: `0x${string}` }];
            const permissionId = params[0]?.id;
            if (permissionId) {
                const apiKey = store.config.get().apiKey;
                if (!apiKey) {
                    throw standardErrors.rpc.internal('No API key configured');
                }
                try {
                    const relayPermission = await getPermissionFromRelay(permissionId, apiKey);
                    resolvedChain = this.resolveChain(relayPermission.chainId);
                } catch {
                    throw standardErrors.rpc.invalidParams(
                        `Permission not found: ${permissionId}. It may have already been revoked.`
                    );
                }
            }
        } else {
            // For other methods, resolve chain from request params if present
            resolvedChain = this.resolveChainFromRequest(processedRequest);
        }

        return this.sendRequestToPopup(processedRequest, resolvedChain);
    }

    /**
     * Extracts chainId from request params and resolves the chain.
     * Supports eth_sendTransaction, wallet_grantPermissions, wallet_sendCalls, and wallet_sign.
     * All methods accept chainId as hex string only (e.g., '0x1').
     */
    private resolveChainFromRequest(request: RequestArguments): SDKChain | undefined {
        const params = request.params as unknown[];
        if (!params || !Array.isArray(params) || params.length === 0) {
            return undefined;
        }

        const firstParam = params[0] as Record<string, unknown> | undefined;
        if (!firstParam || typeof firstParam !== 'object') {
            return undefined;
        }

        let chainIdParam: string | undefined;

        switch (request.method) {
            case 'eth_sendTransaction':
            case 'wallet_grantPermissions':
            case 'wallet_sendCalls':
            case 'wallet_sign': {
                // All methods accept chainId as hex string only
                const chainId = firstParam.chainId;
                if (typeof chainId === 'string') {
                    chainIdParam = chainId;
                }
                break;
            }
            default:
                return undefined;
        }

        if (chainIdParam) {
            return this.resolveChain(chainIdParam);
        }

        return undefined;
    }

    override async cleanup(): Promise<void> {
        await this.keyManager.clear();
        await super.cleanup();
    }

    private async sendRequestToPopup(
        request: RequestArguments,
        overrideChain?: SDKChain,
        isReconnectRetry = false
    ): Promise<unknown> {
        // Open the popup before constructing the request message.
        // This is to ensure that the popup is not blocked by some browsers (i.e. Safari)
        await this.communicator.waitForPopupLoaded?.();

        try {
            const response = await this.sendEncryptedRequest(request, overrideChain);
            const decrypted = await this.decryptResponseMessage(response);

            return this.handleResponse(request, decrypted);
        } catch (error) {
            // Safari iframe storage partitioning: the iframe has no session (the
            // one created in the popup at connect is in a different partition) and
            // asked us to re-establish one. Reconnect against the iframe and retry
            // exactly once. Only the keys iframe emits this sentinel, only when it
            // has no session — so existing/popup flows never enter this branch.
            if (!isReconnectRetry && isReconnectRequiredFailure(error)) {
                await this.reconnectInIframe();
                return this.sendRequestToPopup(request, overrideChain, true);
            }
            throw error;
        }
    }

    /**
     * Re-establish a session inside the live iframe (Safari partition recovery).
     *
     * Re-runs the connect handshake forced at the iframe — a credential *get*
     * (the passkey already exists), which Safari permits in cross-origin iframes,
     * unlike the *create* at first connect. This rebuilds the session and re-keys
     * the shared secret in the iframe's own storage; the caller then retries the
     * original request, which re-encrypts with the new secret.
     */
    private async reconnectInIframe(): Promise<void> {
        // Direct this one handshake at the live iframe, bypassing the Safari
        // credential->popup rule (safe: it is a get(), not a create()).
        this.communicator.forceIframeReconnect();

        const chains = store.getState().chains;
        const chain = chains?.find((c) => c.id === this.chain.id) ?? this.chain;

        const reconnectArgs: RequestArguments = { method: 'eth_requestAccounts', params: [] };
        const handshakeMessage = await this.createRequestMessage(
            {
                handshake: { method: reconnectArgs.method, params: reconnectArgs.params ?? [] },
                chain,
            },
            this.getCorrelationId(reconnectArgs)
        );

        const response: RPCResponseMessage = await this.communicator.postRequestAndWaitForResponse(handshakeMessage);

        if ('failure' in response.content) {
            throw response.content.failure;
        }

        // Re-key: derive the new shared secret from the iframe session's public key.
        const peerPublicKey = await importKeyFromHexString('public', response.sender);
        await this.keyManager.setPeerPublicKey(peerPublicKey);
    }

    private async sendEncryptedRequest(
        request: RequestArguments,
        overrideChain?: SDKChain
    ): Promise<RPCResponseMessage> {
        const sharedSecret = await this.keyManager.getSharedSecret();
        if (!sharedSecret) {
            throw standardErrors.provider.unauthorized('No shared secret found when encrypting request');
        }

        // Use override chain if provided, otherwise use current chain
        let chain: SDKChain;
        if (overrideChain) {
            chain = overrideChain;
        } else {
            const chains = store.getState().chains;
            chain = chains?.find((c) => c.id === this.chain.id) ?? this.chain;
        }

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
