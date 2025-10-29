import { Address, hexToNumber, isAddressEqual, numberToHex } from 'viem';

import { Signer } from './interface.js';
import {
    assertGetCapabilitiesParams,
    assertParamsChainId,
    getCachedWalletConnectResponse,
    injectRequestCapabilities,
} from './SignerUtils.js';

import { Communicator } from '../communicator/index.js';
import { standardErrors } from '../errors/index.js';
import { RPCRequestMessage, RPCResponseMessage, RPCResponse } from '../messages/index.js';
import { KeyManager } from '../key-manager/index.js';
import { AppMetadata, ProviderEventCallback, RequestArguments } from '../provider/index.js';
import { SDKChain, createClients, correlationIds, store } from '../store/index.js';
import { WalletConnectResponse } from '../rpc/index.js';
import {
    decryptContent,
    encryptContent,
    exportKeyToHexString,
    importKeyFromHexString,
    fetchRPCRequest,
    ensureIntNumber,
    hexStringFromNumber
} from '../utils/index.js';

type ConstructorOptions = {
    metadata: AppMetadata;
    communicator: Communicator;
    callback: ProviderEventCallback | null;
};

export class JAWSigner implements Signer {
    private readonly communicator: Communicator;
    private readonly keyManager: KeyManager;
    private callback: ProviderEventCallback | null;

    private accounts: Address[];
    private chain: SDKChain;

    constructor(params: ConstructorOptions) {
        this.communicator = params.communicator;
        this.callback = params.callback;
        this.keyManager = new KeyManager();

        const state = store.getState();
        const { account, chains } = state;

        this.accounts = account.accounts ?? [];
        this.chain = account.chain ?? {
            id: params.metadata.appChainIds?.[0] ?? 1,
        };

        if (chains) {
            createClients(chains);
        }
    }

    async handshake(args: RequestArguments) {
        const correlationId = correlationIds.get(args);

        // Open the popup before constructing the request message.
        // This is to ensure that the popup is not blocked by some browsers (i.e. Safari)
        await this.communicator.waitForPopupLoaded?.();

        // Get chains from store and convert to the format expected by popup
        const storedChains = store.getState().chains;
        const chainsForPopup = storedChains && storedChains.length > 0
            ? storedChains.reduce((acc, chain) => {
                if (chain.rpcUrl) {
                    acc[chain.id] = chain.rpcUrl;
                }
                return acc;
            }, {} as { [key: number]: string })
            : undefined;

        // Get ENS from metadata if present
        const metadata = store.config.get().metadata;
        const ens = metadata?.ens;

        const handshakeMessage = await this.createRequestMessage(
            {
                handshake: {
                    method: args.method,
                    params: args.params ?? [],
                },
                ...(chainsForPopup ? { chains: chainsForPopup } : {}),
                ...(ens ? { ens } : {}),
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

    async request(request: RequestArguments) {
        const result = await this._request(request);
        return result;
    }

    async _request(request: RequestArguments) {
        if (this.accounts.length === 0) {
            switch (request.method) {
                case 'eth_requestAccounts': {
                    // Wait for the popup to be loaded before making async calls
                    await this.communicator.waitForPopupLoaded?.();

                    // Trigger wallet_connect to establish connection and get accounts
                    await this._request({
                        method: 'wallet_connect',
                        params: [{
                            version: '1.0',
                            capabilities: {}
                        }]
                    });

                    return this.accounts;
                }
                case 'wallet_switchEthereumChain': {
                    assertParamsChainId(request.params);
                    this.chain.id = Number(request.params[0].chainId);
                    return;
                }
                case 'wallet_connect': {
                    // Wait for the popup to be loaded before making async calls
                    await this.communicator.waitForPopupLoaded?.();

                    // Prepare capabilities to inject (currently empty, reserved for future use)
                    const capabilitiesToInject: Record<string, unknown> = {};

                    const modifiedRequest = injectRequestCapabilities(request, capabilitiesToInject);
                    return this.sendRequestToPopup(modifiedRequest);
                }
                case 'wallet_sendCalls':
                case 'wallet_sign': {
                    return this.sendRequestToPopup(request);
                }
                default:
                    throw standardErrors.provider.unauthorized();
            }
        }

        switch (request.method) {
            case 'eth_requestAccounts':
            case 'eth_accounts': {
                this.callback?.('connect', { chainId: numberToHex(this.chain.id) });
                return this.accounts;
            }
            case 'eth_coinbase':
                return this.accounts[0];
            case 'net_version':
                return this.chain.id;
            case 'eth_chainId':
                return numberToHex(this.chain.id);
            case 'wallet_getCapabilities':
                return this.handleGetCapabilitiesRequest(request);
            case 'wallet_switchEthereumChain':
                return this.handleSwitchChainRequest(request);
            case 'eth_ecRecover':
            case 'personal_sign':
            case 'wallet_sign':
            case 'personal_ecRecover':
            case 'eth_signTransaction':
            case 'eth_sendTransaction':
            case 'eth_signTypedData_v1':
            case 'eth_signTypedData_v3':
            case 'eth_signTypedData_v4':
            case 'eth_signTypedData':
            case 'wallet_addEthereumChain':
            case 'wallet_watchAsset':
            case 'wallet_sendCalls':
            case 'wallet_showCallsStatus':
            case 'wallet_grantPermissions':
                return this.sendRequestToPopup(request);
            case 'wallet_connect': {
                // Return cached wallet connect response if available
                const cachedResponse = await getCachedWalletConnectResponse();
                if (cachedResponse) {
                    return cachedResponse;
                }

                // Wait for the popup to be loaded before making async calls
                await this.communicator.waitForPopupLoaded?.();
                const modifiedRequest = injectRequestCapabilities(
                    request,
                    {}
                );

                this.callback?.('connect', { chainId: numberToHex(this.chain.id) });
                return this.sendRequestToPopup(modifiedRequest);
            }
            default:
                if (!this.chain.rpcUrl) {
                    throw standardErrors.rpc.internal('No RPC URL set for chain');
                }
                return fetchRPCRequest(request, this.chain.rpcUrl);
        }
    }

    private async sendRequestToPopup(request: RequestArguments) {
        // Open the popup before constructing the request message.
        // This is to ensure that the popup is not blocked by some browsers (i.e. Safari)
        await this.communicator.waitForPopupLoaded?.();

        const response = await this.sendEncryptedRequest(request);
        const decrypted = await this.decryptResponseMessage(response);

        return this.handleResponse(request, decrypted);
    }

    private async handleResponse(request: RequestArguments, decrypted: RPCResponse) {
        const result = decrypted.result;

        if ('error' in result) throw result.error;

        switch (request.method) {
            case 'eth_requestAccounts': {
                const accounts = result.value as Address[];
                this.accounts = accounts;
                store.account.set({
                    accounts,
                    chain: this.chain,
                });
                this.callback?.('accountsChanged', accounts);
                break;
            }
            case 'wallet_connect': {
                const response = result.value as WalletConnectResponse;
                const accounts = response.accounts.map((account) => account.address);
                this.accounts = accounts;
                store.account.set({
                    accounts,
                    chain: this.chain,
                });

                const accounts_ = [this.accounts[0]];

                this.callback?.('accountsChanged', accounts_);
                break;
            }
            default:
                break;
        }
        return result.value;
    }

    async cleanup() {
        const metadata = store.config.get().metadata;
        await this.keyManager.clear();

        // clear the store
        store.account.clear();
        store.chains.clear();

        // reset the signer
        this.accounts = [];
        this.chain = {
            id: metadata?.appChainIds?.[0] ?? 1,
        };
    }

    /**
     * @returns `null` if the request was successful.
     * https://eips.ethereum.org/EIPS/eip-3326#wallet_switchethereumchain
     */
    private async handleSwitchChainRequest(request: RequestArguments) {
        assertParamsChainId(request.params);

        const chainId = ensureIntNumber(request.params[0].chainId);
        const localResult = this.updateChain(chainId);
        if (localResult) return null;

        const popupResult = await this.sendRequestToPopup(request);
        if (popupResult === null) {
            this.updateChain(chainId);
        }
        return popupResult;
    }

    private async handleGetCapabilitiesRequest(request: RequestArguments) {
        assertGetCapabilitiesParams(request.params);

        const requestedAccount = request.params[0];
        const filterChainIds = request.params[1]; // Optional second parameter

        if (!this.accounts.some((account) => isAddressEqual(account, requestedAccount))) {
            throw standardErrors.provider.unauthorized(
                'no active account found when getting capabilities'
            );
        }

        const capabilities = store.getState().account.capabilities;

        // Return empty object if capabilities is undefined
        if (!capabilities) {
            return {};
        }

        // If no filter is provided, return all capabilities
        if (!filterChainIds || filterChainIds.length === 0) {
            return capabilities;
        }

        // Convert filter chain IDs to numbers once for efficient lookup
        const filterChainNumbers = new Set(filterChainIds.map((chainId) => hexToNumber(chainId)));

        // Filter capabilities
        const filteredCapabilities = Object.fromEntries(
            Object.entries(capabilities).filter(([capabilityKey]) => {
                try {
                    const capabilityChainNumber = hexToNumber(capabilityKey as `0x${string}`);
                    return filterChainNumbers.has(capabilityChainNumber);
                } catch {
                    // If capabilityKey is not a valid hex string, exclude it
                    return false;
                }
            })
        );

        return filteredCapabilities;
    }

    private async sendEncryptedRequest(request: RequestArguments): Promise<RPCResponseMessage> {
        const sharedSecret = await this.keyManager.getSharedSecret();
        if (!sharedSecret) {
            throw standardErrors.provider.unauthorized('No shared secret found when encrypting request');
        }

        const encrypted = await encryptContent(
            {
                action: request,
                chainId: this.chain.id,
            },
            sharedSecret
        );
        const correlationId = correlationIds.get(request);
        const message = await this.createRequestMessage({ encrypted }, correlationId);

        return this.communicator.postRequestAndWaitForResponse(message);
    }

    private async createRequestMessage(
        content: RPCRequestMessage['content'],
        correlationId: string | undefined
    ): Promise<RPCRequestMessage> {
        const publicKey = await exportKeyToHexString('public', await this.keyManager.getOwnPublicKey());

        return {
            id: crypto.randomUUID(),
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

        const availableChains = response.data?.chains;
        if (availableChains) {
            const nativeCurrencies = response.data?.nativeCurrencies;
            const chains: SDKChain[] = Object.entries(availableChains).map(([id, rpcUrl]) => {
                const nativeCurrency = nativeCurrencies?.[Number(id)];
                return {
                    id: Number(id),
                    rpcUrl,
                    ...(nativeCurrency ? { nativeCurrency } : {}),
                };
            });

            store.chains.set(chains);

            this.updateChain(this.chain.id, chains);
            createClients(chains);
        }

        const walletCapabilities = response.data?.capabilities;
        if (walletCapabilities) {
            store.account.set({
                capabilities: walletCapabilities,
            });
        }
        return response;
    }

    private updateChain(chainId: number, newAvailableChains?: SDKChain[]): boolean {
        const state = store.getState();
        const chains = newAvailableChains ?? state.chains;
        const chain = chains?.find((chain) => chain.id === chainId);
        if (!chain) return false;

        if (chain !== this.chain) {
            this.chain = chain;
            store.account.set({
                chain,
            });
            this.callback?.('chainChanged', hexStringFromNumber(chain.id));
        }
        return true;
    }
}
