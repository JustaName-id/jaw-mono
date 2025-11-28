import { Communicator } from '../communicator/index.js';
import { standardErrorCodes, serializeError, standardErrors } from '../errors/index.js';

import { SignerType } from '../messages/index.js';

import {
    AppMetadata,
    ConstructorOptions,
    JawProviderPreference,
    ProviderEventEmitter,
    ProviderInterface,
    RequestArguments,
    Mode,
} from './interface.js';

import {
    hexStringFromNumber,
    checkErrorForInvalidRequestArgs,
} from '../utils/index.js';

import { correlationIds } from '../store/index.js';

import { handleGetCallsStatusRequest } from '../rpc/wallet_getCallStatus.js';
import { handleGetAssetsRequest } from '../rpc/wallet_getAssets.js';
import { handleGetPermissionsRequest, handleGetCapabilitiesRequest } from '../rpc/index.js';
import { Signer } from '../signer/index.js';

import {
    createSigner,
    loadSignerType,
    storeSignerType,
} from '../signer/index.js';

export class JAWProvider extends ProviderEventEmitter implements ProviderInterface {
    private readonly metadata: AppMetadata;
    private readonly preference: JawProviderPreference;
    private readonly communicator: Communicator;
    private readonly apiKey: string;
    private readonly paymasterUrls?: Record<number, string>;

    private signer: Signer | null = null;

    constructor({ metadata, preference, apiKey, paymasterUrls }: Readonly<ConstructorOptions>) {
        super();
        this.metadata = metadata;
        this.preference = preference;
        this.apiKey = apiKey;
        this.paymasterUrls = paymasterUrls;
        this.communicator = new Communicator({
            metadata,
            preference,
        });

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
        try {
            await this.signer?.cleanup();
        } catch (cleanupError) {
            // Log cleanup error but continue with disconnection
            console.warn('Signer cleanup failed during disconnect:', cleanupError);
        }
        this.signer = null;
        correlationIds.clear();
        this.emit('accountsChanged', []);
        this.emit('disconnect', standardErrors.provider.disconnected('User initiated disconnection'));
    }

    private async _request<T>(args: RequestArguments): Promise<T> {
        console.log('[JAWProvider] _request called with method:', args.method);
        console.log('[JAWProvider] preference.mode:', this.preference.mode);
        console.log('[JAWProvider] Mode.AppSpecific:', Mode.AppSpecific);
        console.log('[JAWProvider] mode === AppSpecific:', this.preference.mode === Mode.AppSpecific);

        const signerType = this.preference.mode === Mode.AppSpecific
            ? 'appSpecific'
            : 'crossPlatform';

        console.log('[JAWProvider] signerType:', signerType);

        try {
            checkErrorForInvalidRequestArgs(args);
            if (!this.signer) {
                console.log('[JAWProvider] No signer, creating new signer for method:', args.method);
                switch (args.method) {
                    case 'eth_requestAccounts': {
                        console.log('[JAWProvider] Initializing signer for eth_requestAccounts');
                        const signer = this.initSigner(signerType);
                        console.log('[JAWProvider] Signer created, calling handshake');
                        await signer.handshake(args);
                        console.log('[JAWProvider] Handshake complete');

                        this.signer = signer;
                        storeSignerType(signerType);
                        break;
                    }
                    case 'wallet_connect': {
                        const signer = this.initSigner(signerType);
                        await signer.handshake({ method: 'handshake' }); // exchange session keys
                        const result = await signer.request(args); // send diffie-hellman encrypted request
                        this.signer = signer;
                        return result as T;
                    }
                    case 'wallet_disconnect': {
                        await this.disconnect();
                        return null as T;
                    }
                    case 'wallet_sendCalls': 
                    case 'wallet_sign': {
                        const ephemeralSigner = this.initSigner(signerType);
                        await ephemeralSigner.handshake({ method: 'handshake' }); // exchange session keys
                        const result = await ephemeralSigner.request(args); // send diffie-hellman encrypted request
                        try {
                            await ephemeralSigner.cleanup(); // clean up (rotate) the ephemeral session keys
                        } catch (cleanupError) {
                            // Log cleanup error but don't fail the request
                            console.warn('Ephemeral signer cleanup failed:', cleanupError);
                        }
                        return result as T;
                    }
                    case 'wallet_getAssets': {
                        const result = await handleGetAssetsRequest(
                            args,
                            this.apiKey,
                            this.preference.showTestnets ?? false
                        );
                        return result as T;
                    }
                    case 'wallet_getCallsStatus': {

                        const result = await handleGetCallsStatusRequest(args);

                        return result as T;
                    }
                    case 'wallet_getPermissions': {
                        // wallet_getPermissions requires an explicit address when not authenticated
                        const result = await handleGetPermissionsRequest(args, this.apiKey);

                        return result as T;
                    }
                    case 'wallet_getCapabilities': {
                        const result = handleGetCapabilitiesRequest(args);

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

            // Handle wallet_disconnect when signer exists
            if (args.method === 'wallet_disconnect') {
                await this.disconnect();
                return null as T;
            }

            // Handle requests when signer exists
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
            communicator: signerType === 'crossPlatform' ? this.communicator : undefined,
            uiHandler: signerType === 'appSpecific' ? this.preference.uiHandler : undefined,
            callback: this.emit.bind(this),
            apiKey: signerType === 'appSpecific' ? this.apiKey: undefined,
            paymasterUrls: signerType === 'appSpecific' ? this.paymasterUrls: undefined,
        });
    }

}
