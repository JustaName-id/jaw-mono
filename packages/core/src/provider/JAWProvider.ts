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

import { correlationIds, store } from '../store/index.js';
import { storeCallStatus, waitForReceiptInBackground, getCallStatus } from '../rpc/index.js';

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
                  

                        const resultObj = result as {id: string, chainId: number};
                        const userOpHash = resultObj.id;
                        const chainId = resultObj.chainId;
                        
                        // Store call status and start background task if we have a userOpHash
                        if (userOpHash) {
                            storeCallStatus(userOpHash, chainId);
                            // Start background task (don't await - runs in background)
                            waitForReceiptInBackground(userOpHash, chainId).catch((error) => {
                                console.error('Background receipt wait failed:', error);
                            });
                        }

                        try {
                            await ephemeralSigner.cleanup(); // clean up (rotate) the ephemeral session keys
                        } catch (cleanupError) {
                            // Log cleanup error but don't fail the request
                            console.warn('Ephemeral signer cleanup failed:', cleanupError);
                        }
                        
                        return {id: userOpHash} as T;
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
                        
                        // Get status from storage
                        const callStatus = getCallStatus(batchId);
                        
                        if (!callStatus) {
                            throw standardErrors.rpc.invalidParams(`No call status found for batchId: ${batchId}`);
                        }
                        
                        // Return status in expected format
                        // Status codes: 100 = pending, 200 = completed, 400 = failed
                        let statusCode = 100; // pending
                        if (callStatus.status === 'completed') {
                            statusCode = 200;
                        } else if (callStatus.status === 'failed') {
                            statusCode = 400;
                        }
                        
                        return {
                            id: batchId,
                            status: statusCode,
                            receipts: callStatus.receipts || [],
                        } as T;
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
            
            // Handle wallet_sendCalls result to store status and start background task
            if (args.method === 'wallet_sendCalls') {
                const resultObj = result as { id?: string };
                const userOpHash = resultObj?.id;
                
                if (userOpHash) {
                    // Get chainId - priority order:
                    // 1. From store account chain (set during connection/handshake)
                    // 2. From metadata defaultChainId
                    // 3. Default to 1 (mainnet)
                    let chainId = 1; // default fallback
                    const accountChain = store.account.get().chain;
                    if (accountChain?.id) {
                        chainId = accountChain.id;
                    } else if (this.metadata.defaultChainId) {
                        chainId = this.metadata.defaultChainId;
                    }
                    
                    // Store call status and start background task
                    storeCallStatus(userOpHash, chainId);
                    // Start background task (don't await - runs in background)
                    waitForReceiptInBackground(userOpHash, chainId).catch((error) => {
                        console.error('Background receipt wait failed:', error);
                    });
                }
            }
            
            // Handle wallet_getCallsStatus when signer exists
            if (args.method === 'wallet_getCallsStatus') {
                const batchId = Array.isArray(args.params) && args.params[0] 
                    ? String(args.params[0]) 
                    : undefined;
                
                if (!batchId) {
                    throw standardErrors.rpc.invalidParams('batchId is required');
                }
                
                // Get status from storage
                const callStatus = getCallStatus(batchId);
                
                if (!callStatus) {
                    throw standardErrors.rpc.invalidParams(`No call status found for batchId: ${batchId}`);
                }
                
                // Return status in expected format
                // Status codes: 100 = pending, 200 = completed, 400 = failed
                let statusCode = 100; // pending
                if (callStatus.status === 'completed') {
                    statusCode = 200;
                } else if (callStatus.status === 'failed') {
                    statusCode = 400;
                }
                
                return {
                    id: batchId,
                    status: statusCode,
                    receipts: callStatus.receipts || [],
                } as T;
            }
            
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
