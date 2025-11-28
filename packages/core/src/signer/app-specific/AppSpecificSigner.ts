import { Address } from 'viem';
import { JAWSigner } from '../JAWSigner.js';
import {
    UIHandler,
    UIError,
    ConnectUIRequest,
    SignatureUIRequest,
    TypedDataUIRequest,
    TransactionUIRequest,
    PermissionUIRequest,
    RevokePermissionUIRequest,
    WalletSignUIRequest,
} from '../../ui/interface.js';
import { AppMetadata, ProviderEventCallback, RequestArguments } from '../../provider/interface.js';
import { WalletConnectResponse } from '../../rpc/index.js';
import { store } from '../../store/index.js';

type ConstructorOptions = {
    metadata: AppMetadata;
    uiHandler: UIHandler;
    callback: ProviderEventCallback | null;
    apiKey?: string;
    paymasterUrls?: Record<number, string>;
};

export class AppSpecificSigner extends JAWSigner {
    private readonly uiHandler: UIHandler;

    constructor(params: ConstructorOptions) {
        super({
            metadata: params.metadata,
            callback: params.callback,
        });
        this.uiHandler = params.uiHandler;

        // Initialize the UI handler with SDK configuration
        if (this.uiHandler.init) {
            this.uiHandler.init({
                apiKey: params.apiKey,
                defaultChainId: params.metadata.defaultChainId,
                paymasterUrls: params.paymasterUrls,
                appName: params.metadata.appName,
                appLogoUrl: params.metadata.appLogoUrl,
            });
        }
    }

    /**
     * Handshake establishes connection with user approval
     */
    async handshake(args: RequestArguments): Promise<void> {
        const correlationId = this.getCorrelationId(args);

        // Create connect UI request
        const uiRequest: ConnectUIRequest = {
            id: crypto.randomUUID(),
            type: 'wallet_connect',
            timestamp: Date.now(),
            correlationId,
            data: {
                appName: this.metadata.appName,
                appLogoUrl: this.metadata.appLogoUrl,
                origin: typeof window !== 'undefined' ? window.location.origin : 'unknown',
                chainId: this.chain.id,
            },
        };

        // Request user approval via UI handler
        const response = await this.uiHandler.request<WalletConnectResponse>(uiRequest);

        if (!response.approved) {
            throw response.error || UIError.userRejected();
        }

        // Extract accounts from response
        const accounts = response.data?.accounts?.map((acc) => acc.address) ?? [];
        this.accounts = accounts;

        store.account.set({
            accounts,
            chain: this.chain,
        });

        this.callback?.('accountsChanged', accounts);
    }

    protected async handleWalletConnect(request: RequestArguments): Promise<unknown> {
        const correlationId = this.getCorrelationId(request);

        const uiRequest: ConnectUIRequest = {
            id: crypto.randomUUID(),
            type: 'wallet_connect',
            timestamp: Date.now(),
            correlationId,
            data: {
                appName: this.metadata.appName,
                appLogoUrl: this.metadata.appLogoUrl,
                origin: typeof window !== 'undefined' ? window.location.origin : 'unknown',
                chainId: this.chain.id,
                capabilities: (request.params as any)?.[0]?.capabilities,
            },
        };

        const response = await this.uiHandler.request<WalletConnectResponse>(uiRequest);

        if (!response.approved) {
            throw response.error || UIError.userRejected();
        }

        const accounts = response.data?.accounts?.map((acc) => acc.address) ?? [];
        this.accounts = accounts;

        store.account.set({
            accounts,
            chain: this.chain,
        });

        this.callback?.('accountsChanged', accounts);
        return response.data;
    }

    protected async handleWalletConnectUnauthenticated(request: RequestArguments): Promise<unknown> {
        return this.handleWalletConnect(request);
    }

    protected async handleSigningRequest(request: RequestArguments): Promise<unknown> {
        const correlationId = this.getCorrelationId(request);

        switch (request.method) {
            case 'personal_sign': {
                const params = request.params as [string, Address];
                const [message, address] = params;

                const uiRequest: SignatureUIRequest = {
                    id: crypto.randomUUID(),
                    type: 'personal_sign',
                    timestamp: Date.now(),
                    correlationId,
                    data: {
                        message,
                        address,
                    },
                };

                const response = await this.uiHandler.request<string>(uiRequest);

                if (!response.approved) {
                    throw response.error || UIError.userRejected();
                }

                return response.data;
            }

            case 'eth_signTypedData_v4': {
                const params = request.params as [Address, string];
                const [address, typedData] = params;

                const uiRequest: TypedDataUIRequest = {
                    id: crypto.randomUUID(),
                    type: 'eth_signTypedData_v4',
                    timestamp: Date.now(),
                    correlationId,
                    data: {
                        address,
                        typedData,
                    },
                };

                const response = await this.uiHandler.request<string>(uiRequest);

                if (!response.approved) {
                    throw response.error || UIError.userRejected();
                }

                return response.data;
            }

            case 'wallet_sign': {
                const params = request.params as any[];
                const signParams = params[0];

                const uiRequest: WalletSignUIRequest = {
                    id: crypto.randomUUID(),
                    type: 'wallet_sign',
                    timestamp: Date.now(),
                    correlationId,
                    data: signParams,
                };

                const response = await this.uiHandler.request<string>(uiRequest);

                if (!response.approved) {
                    throw response.error || UIError.userRejected();
                }

                return response.data;
            }

            case 'wallet_sendCalls': {
                const params = request.params as any[];
                const callsData = params[0];

                const uiRequest: TransactionUIRequest = {
                    id: crypto.randomUUID(),
                    type: 'wallet_sendCalls',
                    timestamp: Date.now(),
                    correlationId,
                    data: callsData,
                };

                const response = await this.uiHandler.request<{ id: string; chainId: number }>(uiRequest);

                if (!response.approved) {
                    throw response.error || UIError.userRejected();
                }

                // Handle background receipt tracking
                if (response.data) {
                    this.trackSendCallsResult(response.data);
                }

                return response.data;
            }

            case 'eth_sendTransaction': {
                const params = request.params as any[];
                const txData = params[0];

                // Convert eth_sendTransaction format to wallet_sendCalls format
                const callsData = {
                    version: '1.0' as const,
                    from: this.accounts[0] as Address,
                    calls: [{
                        to: txData.to,
                        value: txData.value,
                        data: txData.data,
                    }],
                    chainId: this.chain.id,
                };

                const uiRequest: TransactionUIRequest = {
                    id: crypto.randomUUID(),
                    type: 'wallet_sendCalls',
                    timestamp: Date.now(),
                    correlationId,
                    data: callsData,
                };

                const response = await this.uiHandler.request<{ id: string; chainId: number }>(uiRequest);

                if (!response.approved) {
                    throw response.error || UIError.userRejected();
                }

                // Handle background receipt tracking
                if (response.data) {
                    this.trackSendCallsResult(response.data);
                }

                // For eth_sendTransaction, return just the hash (not the sendCalls format)
                return response.data?.id;
            }

            case 'wallet_grantPermissions': {
                const params = request.params as any[];
                const permissionData = params[0];

                const uiRequest: PermissionUIRequest = {
                    id: crypto.randomUUID(),
                    type: 'wallet_grantPermissions',
                    timestamp: Date.now(),
                    correlationId,
                    data: permissionData,
                };

                const response = await this.uiHandler.request(uiRequest);

                if (!response.approved) {
                    throw response.error || UIError.userRejected();
                }

                return response.data;
            }

            case 'wallet_revokePermissions': {
                const params = request.params as any[];
                const revokeData = params[0];

                const uiRequest: RevokePermissionUIRequest = {
                    id: crypto.randomUUID(),
                    type: 'wallet_revokePermissions',
                    timestamp: Date.now(),
                    correlationId,
                    data: {
                        permissionId: revokeData.permissionId,
                        address: this.accounts[0] as Address,
                        chainId: this.chain.id,
                    },
                };

                const response = await this.uiHandler.request(uiRequest);

                if (!response.approved) {
                    throw response.error || UIError.userRejected();
                }

                return response.data;
            }

            default:
                // For any other signing methods, delegate to base class behavior
                // which will throw unsupportedMethod for unknown wallet_* methods
                return super.handleAuthenticatedRequest(request);
        }
    }

    override async cleanup(): Promise<void> {
        await this.uiHandler.cleanup?.();
        await super.cleanup();
    }
}
