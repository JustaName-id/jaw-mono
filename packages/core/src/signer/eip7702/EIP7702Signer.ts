import type { LocalAccount } from 'viem';
import { JAWSigner } from '../JAWSigner.js';
import { Account } from '../../account/Account.js';
import { AppMetadata, ProviderEventCallback, RequestArguments } from '../../provider/index.js';
import { store } from '../../store/index.js';

type ConstructorOptions = {
    metadata: AppMetadata;
    callback: ProviderEventCallback;
    localAccount: LocalAccount;
    apiKey: string;
};

export class EIP7702Signer extends JAWSigner {
    private readonly localAccount: LocalAccount;
    private readonly apiKey: string;
    private account: Account | null = null;

    constructor(params: ConstructorOptions) {
        super({
            metadata: params.metadata,
            callback: params.callback,
        });
        this.localAccount = params.localAccount;
        this.apiKey = params.apiKey;
    }

    async handshake(_args: RequestArguments): Promise<void> {
        const config = store.config.get();
        const chainId = this.chain.id ?? config.metadata?.defaultChainId ?? 1;

        this.account = await Account.fromLocalAccount(
            { chainId, apiKey: this.apiKey },
            this.localAccount,
            { eip7702: true }
        );

        this.accounts = [this.localAccount.address];
        store.account.set({
            accounts: this.accounts,
            chain: this.chain,
        });

        this.callback?.('accountsChanged', this.accounts);
        this.emitConnect();
    }

    protected async handleWalletConnect(_request: RequestArguments): Promise<unknown> {
        if (!this.account) {
            await this.handshake(_request);
        }
        return {
            accounts: [{
                address: this.localAccount.address,
            }],
        };
    }

    protected async handleWalletConnectUnauthenticated(request: RequestArguments): Promise<unknown> {
        return this.handleWalletConnect(request);
    }

    protected async handleSigningRequest(request: RequestArguments): Promise<unknown> {
        if (!this.account) {
            await this.handshake(request);
        }

        switch (request.method) {
            case 'personal_sign':
            case 'wallet_sign': {
                const params = request.params as [string, string];
                const message = params[0];
                return await this.account!.signMessage(message);
            }

            case 'eth_signTypedData_v4': {
                const params = request.params as [string, string];
                const typedData = JSON.parse(params[1]);
                return await this.account!.signTypedData(typedData);
            }

            case 'wallet_sendCalls': {
                const params = request.params as any[];
                const callsParam = params[0];
                const calls = callsParam.calls || [];
                const result = await this.account!.sendCalls(calls);
                return result;
            }

            case 'eth_sendTransaction': {
                const params = request.params as any[];
                const tx = params[0];
                const hash = await this.account!.sendTransaction([{
                    to: tx.to,
                    value: tx.value ? BigInt(tx.value) : undefined,
                    data: tx.data,
                }]);
                return hash;
            }

            default:
                throw new Error(`Unsupported method: ${request.method}`);
        }
    }

    override async cleanup(): Promise<void> {
        this.account = null;
        await super.cleanup();
    }
}
