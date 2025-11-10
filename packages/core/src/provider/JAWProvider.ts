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

import { hexStringFromNumber, checkErrorForInvalidRequestArgs, fetchRPCRequest, buildHandleJawRpcUrl } from '../utils/index.js';

import { correlationIds } from '../store/index.js';
import { getCallStatusEIP5792 } from '../rpc/index.js';

import { Signer } from '../signer/index.js';

import {
    createSigner,
    loadSignerType,
    storeSignerType,
} from '../signer/index.js';

export class JAWProvider extends ProviderEventEmitter implements ProviderInterface {
    private readonly metadata: AppMetadata;
    // @ts-expect-error - Will be used in future implementation
    private readonly preference: JawProviderPreference;
    private readonly communicator: Communicator;
    private readonly apiKey: string;

    private signer: Signer | null = null;

    constructor({ metadata, preference, apiKey }: Readonly<ConstructorOptions>) {
        super();
        this.metadata = metadata;
        this.preference = preference;
        this.apiKey = apiKey;
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
        await this.signer?.cleanup();
        this.signer = null;
        correlationIds.clear();
        this.emit('disconnect', standardErrors.provider.disconnected('User initiated disconnection'));
    }

    private async _request<T>(args: RequestArguments): Promise<T> {
        try {
            checkErrorForInvalidRequestArgs(args);
            if (!this.signer) {
                switch (args.method) {
                    case 'eth_requestAccounts': {
                        const signerType = "crossPlatform";
                        const signer = this.initSigner(signerType);
                        await signer.handshake(args);

                        this.signer = signer;
                        storeSignerType(signerType);
                        break;
                    }
                    case 'wallet_connect': {
                        const signer = this.initSigner('crossPlatform');
                        await signer.handshake({ method: 'handshake' }); // exchange session keys
                        const result = await signer.request(args); // send diffie-hellman encrypted request
                        this.signer = signer;
                        return result as T;
                    }
                    case 'wallet_sendCalls': {
                        const ephemeralSigner = this.initSigner('crossPlatform');
                        await ephemeralSigner.handshake({ method: 'handshake' }); // exchange session keys
                        const result = await ephemeralSigner.request(args); // send diffie-hellman encrypted request
                        // Note: Call status storage and background task are handled by the signer's handleResponse

                        try {
                            await ephemeralSigner.cleanup(); // clean up (rotate) the ephemeral session keys
                        } catch (cleanupError) {
                            // Log cleanup error but don't fail the request
                            console.warn('Ephemeral signer cleanup failed:', cleanupError);
                        }
                        
                        return result as T;
                    }

                    case 'wallet_sign': {
                        const ephemeralSigner = this.initSigner('crossPlatform');
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
                        const rpcUrl = buildHandleJawRpcUrl(JAW_RPC_URL, this.apiKey);
                        const result = await fetchRPCRequest(args, rpcUrl);
                        return result as T;
                    }
                    case 'wallet_getCallsStatus': {
                        // Extract batchId from params
                        const batchId = Array.isArray(args.params) && args.params[0] 
                            ? String(args.params[0]) 
                            : undefined;
                        
                        if (!batchId) {
                            throw standardErrors.rpc.invalidParams('batchId is required');
                        }
                        
                        // Get status in EIP-5792 format
                        const result = getCallStatusEIP5792(batchId); // Default to chain 1 if not available
                        
                        if (!result) {
                            throw standardErrors.rpc.invalidParams(`No call status found for batchId: ${batchId}`);
                        }
                        
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
            communicator: this.communicator,
            callback: this.emit.bind(this),
        });
    }

}
