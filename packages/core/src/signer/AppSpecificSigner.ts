import { Address, numberToHex } from 'viem';
import { Signer } from './interface.js';
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
} from '../ui/interface.js';
import { AppMetadata, ProviderEventCallback, RequestArguments } from '../provider/interface.js';
import { standardErrors } from '../errors/index.js';
import { SDKChain, correlationIds, store } from '../store/index.js';
import {
  WalletConnectResponse,
  handleGetAssetsRequest,
  handleGetPermissionsRequest,
} from '../rpc/index.js';
import { handleGetCallsStatusRequest } from '../rpc/wallet_getCallStatus.js';
import { fetchRPCRequest, ensureIntNumber, hexStringFromNumber } from '../utils/index.js';
import { waitForReceiptInBackground, storeCallStatus } from '../rpc/wallet_sendCalls.js';
import { clearSignerType } from './utils.js';

type ConstructorOptions = {
  metadata: AppMetadata;
  uiHandler: UIHandler;
  callback: ProviderEventCallback | null;
};

export class AppSpecificSigner implements Signer {
  private readonly uiHandler: UIHandler;
  private readonly metadata: AppMetadata;
  private callback: ProviderEventCallback | null;

  private accounts: Address[];
  private chain: SDKChain;

  constructor(params: ConstructorOptions) {
    this.uiHandler = params.uiHandler;
    this.metadata = params.metadata;
    this.callback = params.callback;

    const state = store.getState();
    const { account } = state;

    this.accounts = account.accounts ?? [];
    this.chain = account.chain ?? {
      id: params.metadata.defaultChainId ?? 1,
    };
  }

  /**
   * Handshake establishes connection with user approval
   */
  async handshake(args: RequestArguments): Promise<void> {
    const correlationId = correlationIds.get(args);

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

  async request<T>(request: RequestArguments): Promise<T> {
    return this._request(request) as Promise<T>;
  }

  private async _request(request: RequestArguments): Promise<unknown> {
    const correlationId = correlationIds.get(request);

    // Handle unauthenticated requests
    if (this.accounts.length === 0) {
      switch (request.method) {
        case 'eth_requestAccounts': {
          // Trigger wallet_connect to establish connection
          await this._request({
            method: 'wallet_connect',
            params: [{
              version: '1.0',
              capabilities: {},
            }],
          });
          return this.accounts;
        }

        case 'wallet_connect': {
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

        case 'wallet_switchEthereumChain': {
          const params = request.params as [{ chainId: string }];
          const chainId = ensureIntNumber(params[0].chainId);

          const chains = store.getState().chains ?? [];
          const chain = chains.find((c) => c.id === chainId);
          if (!chain) {
            throw standardErrors.provider.unsupportedMethod(
              `wallet_switchEthereumChain is not supported for chainID ${chainId}`
            );
          }

          this.chain.id = chainId;
          return null;
        }

        default:
          throw standardErrors.provider.unauthorized();
      }
    }

    // Handle authenticated requests
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

      case 'wallet_getCallsStatus':
        return await handleGetCallsStatusRequest(request);

      case 'wallet_getAssets': {
        const config = store.config.get();
        const apiKey = config.apiKey;
        const showTestnets = config.preference?.showTestnets ?? false;

        if (!apiKey) {
          throw standardErrors.rpc.internal('No API key configured');
        }

        return await handleGetAssetsRequest(request, apiKey, showTestnets);
      }

      case 'wallet_getPermissions': {
        const config = store.config.get();
        const apiKey = config.apiKey;

        if (!apiKey) {
          throw standardErrors.rpc.internal('No API key configured');
        }

        return await handleGetPermissionsRequest(request, apiKey, this.accounts[0]);
      }

      case 'wallet_switchEthereumChain':
        return this.handleSwitchChainRequest(request);

      // Methods requiring UI approval
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
        const userOpHash = response.data?.id;
        const chainId = response.data?.chainId;

        if (userOpHash && chainId) {
          storeCallStatus(userOpHash, chainId);
          waitForReceiptInBackground(userOpHash, chainId).catch((error) => {
            console.error('Background receipt wait failed:', error);
          });
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
        const userOpHash = response.data?.id;
        const chainId = response.data?.chainId;

        if (userOpHash && chainId) {
          storeCallStatus(userOpHash, chainId);
          waitForReceiptInBackground(userOpHash, chainId).catch((error) => {
            console.error('Background receipt wait failed:', error);
          });
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

      // Unsupported methods
      case 'eth_sign':
      case 'eth_ecRecover':
      case 'personal_ecRecover':
      case 'eth_signTransaction':
      case 'eth_signTypedData':
      case 'eth_signTypedData_v1':
      case 'eth_signTypedData_v3':
        throw standardErrors.provider.unsupportedMethod();

      default: {
        // Throw error for any unhandled wallet_* methods
        if (request.method.startsWith('wallet_')) {
          throw standardErrors.provider.unsupportedMethod();
        }

        // Forward to RPC provider for standard Ethereum methods
        const chains = store.getState().chains;
        const chain = chains?.find((c) => c.id === this.chain.id) ?? this.chain;
        if (!chain.rpcUrl) {
          throw standardErrors.rpc.internal('No RPC URL set for chain');
        }
        return fetchRPCRequest(request, chain.rpcUrl);
      }
    }
  }

  async cleanup(): Promise<void> {
    await this.uiHandler.cleanup?.();

    store.account.clear();
    clearSignerType();

    this.accounts = [];
    this.chain = {
      id: this.metadata.defaultChainId ?? 1,
    };
  }

  private async handleSwitchChainRequest(request: RequestArguments): Promise<null> {
    const params = request.params as [{ chainId: string }];
    const chainId = ensureIntNumber(params[0].chainId);
    const localResult = this.updateChain(chainId);

    if (localResult) return null;

    throw standardErrors.provider.unsupportedMethod(
      `wallet_switchEthereumChain is not supported for target chainID ${chainId}`
    );
  }

  private updateChain(chainId: number, newAvailableChains?: SDKChain[]): boolean {
    const state = store.getState();
    const chains = newAvailableChains ?? state.chains;
    const chain = chains?.find((c) => c.id === chainId);

    if (!chain) return false;

    if (chain !== this.chain) {
      this.chain = chain;
      store.account.set({ chain });
      this.callback?.('chainChanged', hexStringFromNumber(chain.id));
    }

    return true;
  }
}