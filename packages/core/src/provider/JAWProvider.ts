import { CommunicationAdapter, WebCommunicationAdapter } from '../communicator/index.js';
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
    PaymasterConfig,
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
    clearSignerType,
} from '../signer/index.js';
import { PasskeyManager } from '../passkey-manager/index.js';

export class JAWProvider extends ProviderEventEmitter implements ProviderInterface {
    private readonly metadata: AppMetadata;
    private readonly preference: JawProviderPreference;
    private readonly adapter: CommunicationAdapter;
    private readonly apiKey: string;
    private readonly paymasters?: Record<number, PaymasterConfig>;

    private signer: Signer | null = null;

    constructor({ metadata, preference, apiKey, paymasters }: Readonly<ConstructorOptions>) {
        super();
        this.metadata = metadata;
        this.preference = preference;
        this.apiKey = apiKey;
        this.paymasters = paymasters;

        // Use custom adapter if provided, otherwise create default WebCommunicationAdapter
        this.adapter = preference.communicationAdapter || new WebCommunicationAdapter({
            metadata,
            preference,
        });

        // Determine the expected signer type from current preference
        const expectedSignerType: SignerType = preference.mode === Mode.AppSpecific
            ? 'appSpecific'
            : 'crossPlatform';

        const storedSignerType = loadSignerType();

        // Only restore signer if the stored type matches the current preference
        // If they don't match, clear the stored type to avoid using wrong signer
        if (storedSignerType) {
            if (storedSignerType === expectedSignerType) {
                this.signer = this.initSigner(storedSignerType);
            } else {
                // Mode has changed, clear the old signer type
                clearSignerType();
            }
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

        // Clear PasskeyManager auth state (explicit logout)
        const passkeyManager = new PasskeyManager(undefined, undefined, this.apiKey);
        passkeyManager.logout();

        this.signer = null;
        correlationIds.clear();
        this.emit('accountsChanged', []);
        this.emit('disconnect', standardErrors.provider.disconnected('User initiated disconnection'));
    }

    private async _request<T>(args: RequestArguments): Promise<T> {
        const signerType = this.preference.mode === Mode.AppSpecific
            ? 'appSpecific'
            : 'crossPlatform';

        try {
            checkErrorForInvalidRequestArgs(args);
            if (!this.signer) {
                switch (args.method) {
                    case 'eth_requestAccounts': {
                        const signer = this.initSigner(signerType);
                        await signer.handshake(args);

                        this.signer = signer;
                        storeSignerType(signerType);
                        break;
                    }
                    case 'wallet_connect': {
                        const signer = this.initSigner(signerType);
                        // For both modes, pass full args to handshake so the complete
                        // wallet_connect flow happens in a single roundtrip.
                        // This avoids race conditions with popup closure in cross-platform mode.
                        await signer.handshake(args);
                        this.signer = signer;
                        storeSignerType(signerType);
                        // Handshake sets accounts/capabilities in store via handleResponse.
                        // The subsequent request will return the cached response.
                        const result = await signer.request(args);
                        return result as T;
                    }
                    case 'wallet_disconnect': {
                        await this.disconnect();
                        return null as T;
                    }
                    case 'wallet_sendCalls':
                    case 'wallet_sign':
                    case 'wallet_grantPermissions':
                    case 'wallet_revokePermissions': {
                        const ephemeralSigner = this.initSigner(signerType);

                        if (signerType === 'appSpecific') {
                            // Silent handshake: authenticate/create account without showing connect dialog.
                            // The signing UI will be shown immediately after.
                            await ephemeralSigner.handshake({
                                method: 'wallet_connect',
                                params: [{ silent: true }]
                            });
                            const result = await ephemeralSigner.request(args);
                            try {
                                await ephemeralSigner.cleanup();
                            } catch (cleanupError) {
                                console.warn('Ephemeral signer cleanup failed:', cleanupError);
                            }
                            return result as T;
                        } else {
                            // CrossPlatform uses Diffie-Hellman key exchange
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
                        const result = await handleGetCapabilitiesRequest(
                            args,
                            this.apiKey,
                            this.preference.showTestnets ?? false
                        );

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
            adapter: signerType === 'crossPlatform' ? this.adapter : undefined,
            uiHandler: signerType === 'appSpecific' ? this.preference.uiHandler : undefined,
            callback: this.emit.bind(this),
            apiKey: this.apiKey,
            paymasters: signerType === 'appSpecific' ? this.paymasters : undefined,
            ens: signerType === 'appSpecific' ? this.preference.ens : undefined,
            keysUrl: this.preference.keysUrl,
            showTestnets: this.preference.showTestnets,
        });
    }

}
