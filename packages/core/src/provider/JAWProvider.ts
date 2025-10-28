import { Communicator } from '../communicator/index.js';
import { standardErrorCodes, serializeError, standardErrors } from '../errors/index.js';
import { JAW_RPC_URL } from '../constants.js';

import { SignerType } from '../messages/index.js';

import {
    AppMetadata,
    ConstructorOptions,
    JawProviderPreference,
    ProviderEventEmitter,
    ProviderInterface,
    RequestArguments,
} from './interface.js';

import { hexStringFromNumber, checkErrorForInvalidRequestArgs, fetchRPCRequest } from '../utils/index.js';

import { correlationIds } from '../store/index.js';

import { Signer, AppSpecificSigner } from '../signer/index.js';
import { EventBus } from '../events/EventBus.js';

import {
    createSigner,
    loadSignerType,
    storeSignerType,
} from '../signer/index.js';

export class JAWProvider extends ProviderEventEmitter implements ProviderInterface {
    private readonly metadata: AppMetadata;
    private readonly preference: JawProviderPreference;
    private readonly communicator: Communicator | null;

    private signer: Signer | null = null;

    constructor({ metadata, preference: { keysUrl, ...preference } }: Readonly<ConstructorOptions>) {
        super();
        this.metadata = metadata;
        this.preference = preference;

        // Only create communicator for cross-platform mode
        if (!preference.appSpecific) {
            this.communicator = new Communicator({
                url: keysUrl,
                metadata,
                preference,
            });
        } else {
            this.communicator = null;
        }

        const signerType = loadSignerType();
        if (signerType) {
            this.signer = this.initSigner(signerType);
        }
    }

    public async request<T>(args: RequestArguments): Promise<T> {
        // correlation id across the entire request lifecycle
        const correlationId = crypto.randomUUID();
        correlationIds.set(args, correlationId);

        try {
            const result = await this._request(args);
            return result as T;
        } finally {
            correlationIds.delete(args);
        }
    }

    async disconnect() {
        await this.signer?.cleanup();
        this.signer = null;

        correlationIds.clear();
        this.emit('disconnect', standardErrors.provider.disconnected('User initiated disconnection'));
    }

    /**
     * Get the EventBus instance for app-specific mode
     * @returns EventBus if using AppSpecificSigner (app-specific mode), null otherwise
     *
     * @example
     * ```typescript
     * const provider = jaw.getProvider();
     * const eventBus = provider.getEventBus();
     *
     * if (eventBus) {
     *   // App-specific mode - subscribe to events
     *   eventBus.on('authRequired', (data, resolve, reject) => {
     *     showAuthModal(data).then(resolve).catch(reject);
     *   });
     * }
     * ```
     */
    public getEventBus(): EventBus | null {
        if (this.signer instanceof AppSpecificSigner) {
            return this.signer.events;
        }
        return null;
    }

    private async _request<T>(args: RequestArguments): Promise<T> {
        try {
            checkErrorForInvalidRequestArgs(args);
            if (!this.signer) {
                switch (args.method) {
                    case 'eth_requestAccounts': {
                        // Determine signer type based on preference
                        const signerType: SignerType = this.preference.appSpecific
                            ? 'appSpecific'
                            : "crossPlatform";

                        const signer = this.initSigner(signerType);

                        // Only perform handshake for cross-platform mode (key exchange)
                        if (signerType === 'crossPlatform') {
                            await signer.handshake(args);
                        }

                        this.signer = signer;
                        storeSignerType(signerType);
                        break;
                    }
                    case 'wallet_connect': {
                        // Determine signer type for wallet_connect
                        const signerType: SignerType = this.preference.appSpecific ? 'appSpecific' : 'crossPlatform';
                        const signer = this.initSigner(signerType);

                        // Only perform handshake for cross-platform mode (key exchange)
                        if (signerType === 'crossPlatform') {
                            await signer.handshake({ method: 'handshake' });
                        }

                        const result = await signer.request(args);
                        this.signer = signer;
                        return result as T;
                    }
                    case 'wallet_sendCalls':
                    case 'wallet_sign': {
                        // Ephemeral signer: use once then cleanup
                        const signerType: SignerType = this.preference.appSpecific ? 'appSpecific' : 'crossPlatform';
                        const ephemeralSigner = this.initSigner(signerType);

                        // Only perform handshake for popup mode (key exchange)
                        if (signerType === 'crossPlatform') {
                            await ephemeralSigner.handshake({ method: 'handshake' });
                        }

                        const result = await ephemeralSigner.request(args);
                        try {
                            await ephemeralSigner.cleanup(); // clean up ephemeral session
                        } catch (cleanupError) {
                            // Log cleanup error but don't fail the request
                            console.warn('Ephemeral signer cleanup failed:', cleanupError);
                        }
                        return result as T;
                    }
                    case 'wallet_getCallsStatus': {
                        const result = await fetchRPCRequest(args, JAW_RPC_URL);
                        return result as T;
                    }
                    case 'net_version': {
                        const result = 1 as T; // default value
                        return result;
                    }
                    case 'eth_chainId': {
                        const result = hexStringFromNumber(1) as T; // default value
                        return result;
                    }
                    default: {
                        throw standardErrors.provider.unauthorized(
                            "Must call 'eth_requestAccounts' before other methods"
                        );
                    }
                }
            }
            const result = await this.signer.request(args);
            return result as T;
        } catch (error) {
            const { code } = error as { code?: number };
            if (code === standardErrorCodes.provider.unauthorized) {
                await this.disconnect();
            }
            return Promise.reject(serializeError(error));
        }
    }

    private initSigner(signerType: SignerType): Signer {
        return createSigner({
            signerType,
            metadata: this.metadata,
            communicator: this.communicator,
            callback: this.emit.bind(this),
        });
    }
}
