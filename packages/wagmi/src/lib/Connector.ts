import {
  type CreateJAWSDKOptions,
  type ProviderInterface,
  type WalletConnectCapabilities,
  type WalletConnectResponse,
  JAW,
  JAW_WALLET_ICON,
} from '@jaw.id/core';
import { ChainNotConfiguredError, type Connector, createConnector } from '@wagmi/core';
import {
  getAddress,
  numberToHex,
  type ProviderConnectInfo,
  SwitchChainError,
  UserRejectedRequestError,
  withRetry,
} from 'viem';
import { JAW_WALLET_ID, JAW_WALLET_NAME, JAW_WALLET_RDNS } from '@jaw.id/core';

export type JawParameters = CreateJAWSDKOptions;

// Re-export WalletConnectCapabilities for convenience
export type { WalletConnectCapabilities } from '@jaw.id/core';

jaw.type = 'jaw' as const;

/**
 * Helper to parse accounts from various response formats
 */
function parseAccounts(accountsResult: unknown): `0x${string}`[] {
  if (Array.isArray(accountsResult)) {
    return (accountsResult as string[]).map((x) => getAddress(x));
  }
  if (accountsResult && typeof accountsResult === 'object' && 'accounts' in accountsResult) {
    const response = accountsResult as { accounts: { address: string }[] | string[] };
    if (Array.isArray(response.accounts) && response.accounts.length > 0) {
      const first = response.accounts[0];
      if (typeof first === 'string') {
        return (response.accounts as string[]).map((x) => getAddress(x));
      }
      return (response.accounts as { address: string }[]).map((acc) => getAddress(acc.address));
    }
  }
  return [];
}

type ConnectParameters = {
  chainId?: number | undefined;
  isReconnecting?: boolean | undefined;
  /**
   * Capabilities to request during wallet_connect.
   * When provided, uses wallet_connect instead of eth_requestAccounts.
   */
  capabilities?: WalletConnectCapabilities | undefined;
};

/** Account with capabilities returned from wallet_connect */
export type AccountWithCapabilities = {
  address: `0x${string}`;
  capabilities?: WalletConnectResponse['accounts'][number]['capabilities'];
};

type ConnectorProperties = {
  connect(parameters?: ConnectParameters): Promise<{
    accounts: readonly `0x${string}`[] | readonly AccountWithCapabilities[];
    chainId: number;
  }>;
  onConnect(connectInfo: ProviderConnectInfo): void;
};

export function jaw(parameters: JawParameters) {
  type Provider = ProviderInterface;

  let sdk: ReturnType<typeof JAW.create> | undefined;
  let provider_: Provider | undefined;
  let accountsChanged: Connector['onAccountsChanged'] | undefined;
  let chainChanged: Connector['onChainChanged'] | undefined;
  let connect: Connector['onConnect'] | undefined;
  let disconnect: Connector['onDisconnect'] | undefined;

  return createConnector<Provider, ConnectorProperties>((config) => ({
    id: JAW_WALLET_ID,
    name: JAW_WALLET_NAME,
    type: jaw.type,
    rdns: JAW_WALLET_RDNS,
    icon: JAW_WALLET_ICON,

    async setup() {
      // Setup connect listener for auto-reconnection
      if (!connect) {
        const provider = await this.getProvider();
        connect = this.onConnect.bind(this);
        provider.on('connect', connect as never);
      }
    },

    async connect({ chainId, isReconnecting, capabilities }: ConnectParameters = {}) {
      const targetChainId = chainId;

      let accounts: `0x${string}`[] = [];
      let accountsWithCapabilities: AccountWithCapabilities[] = [];
      let currentChainId: number | undefined;

      // Handle reconnection
      if (isReconnecting) {
        [accounts, currentChainId] = await Promise.all([
          this.getAccounts().catch(() => []),
          this.getChainId().catch(() => undefined),
        ]);

        if (targetChainId && currentChainId !== targetChainId) {
          const chain = await this.switchChain?.({ chainId: targetChainId }).catch((error) => {
            if (error.code === UserRejectedRequestError.code) throw error;
            return { id: currentChainId };
          });
          currentChainId = chain?.id ?? currentChainId;
        }
      }

      const provider = await this.getProvider();

      try {
        if (!accounts?.length && !isReconnecting) {
          // Use wallet_connect if capabilities are requested, otherwise use eth_requestAccounts
          if (capabilities && Object.keys(capabilities).length > 0) {
            const walletConnectResponse = (await provider.request({
              method: 'wallet_connect',
              params: [{ capabilities }],
            })) as WalletConnectResponse;

            // Extract accounts with their capabilities
            accountsWithCapabilities = walletConnectResponse.accounts.map((acc) => ({
              address: getAddress(acc.address),
              capabilities: acc.capabilities,
            }));
            accounts = accountsWithCapabilities.map((acc) => acc.address);
          } else {
            const accountsResult = await provider.request({
              method: 'eth_requestAccounts',
            });
            accounts = parseAccounts(accountsResult);
          }
          currentChainId = await this.getChainId();
        }

        if (!currentChainId) throw new ChainNotConfiguredError();

        // Manage EIP-1193 event listeners
        if (connect) {
          provider.removeListener('connect', connect as never);
          connect = undefined;
        }
        if (!accountsChanged) {
          accountsChanged = this.onAccountsChanged.bind(this);
          provider.on('accountsChanged', accountsChanged as never);
        }
        if (!chainChanged) {
          chainChanged = this.onChainChanged.bind(this);
          provider.on('chainChanged', chainChanged as never);
        }
        if (!disconnect) {
          disconnect = this.onDisconnect.bind(this);
          provider.on('disconnect', disconnect as never);
        }

        // Switch chain if requested and different from current (skip if handled during reconnection)
        if (targetChainId && currentChainId !== targetChainId && !isReconnecting) {
          const chain = await this.switchChain?.({ chainId: targetChainId }).catch((error) => {
            if ((error as { code?: number }).code === UserRejectedRequestError.code) throw error;
            return { id: currentChainId };
          });
          currentChainId = chain?.id ?? currentChainId;
        }

        // Return accounts with capabilities if wallet_connect was used, otherwise plain accounts
        return {
          accounts: (accountsWithCapabilities.length > 0 ? accountsWithCapabilities : accounts) as never,
          chainId: currentChainId!,
        };
      } catch (error) {
        if (
          /(user closed modal|accounts received is empty|user denied account|request rejected)/i.test(
            (error as Error).message
          )
        )
          throw new UserRejectedRequestError(error as Error);
        throw error;
      }
    },

    async disconnect() {
      const provider = await this.getProvider();

      // Remove listeners
      if (accountsChanged) {
        provider.removeListener('accountsChanged', accountsChanged as never);
        accountsChanged = undefined;
      }
      if (chainChanged) {
        provider.removeListener('chainChanged', chainChanged as never);
        chainChanged = undefined;
      }
      if (disconnect) {
        provider.removeListener('disconnect', disconnect as never);
        disconnect = undefined;
      }

      // Re-add connect listener for future connections
      if (!connect) {
        connect = this.onConnect.bind(this);
        provider.on('connect', connect as never);
      }

      // Call provider disconnect
      await provider.disconnect();
    },

    async getAccounts() {
      const provider = await this.getProvider();
      const accountsResult = await provider.request({
        method: 'eth_accounts',
      });
      return parseAccounts(accountsResult);
    },

    async getChainId() {
      const provider = await this.getProvider();
      const chainId = await provider.request({ method: 'eth_chainId' });
      return Number(chainId);
    },

    async getProvider(): Promise<Provider> {
      if (!provider_) {
        sdk = JAW.create(parameters);
        provider_ = sdk.provider;
      }
      return provider_;
    },

    async isAuthorized() {
      try {
        // Use retry strategy for reliability
        const accounts = await withRetry(() => this.getAccounts());
        return accounts.length > 0;
      } catch {
        return false;
      }
    },

    async switchChain({ chainId }) {
      const chain = config.chains.find((x) => x.id === chainId);
      if (!chain) throw new SwitchChainError(new ChainNotConfiguredError());

      const provider = await this.getProvider();
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: numberToHex(chainId) }],
      });

      return chain;
    },

    onAccountsChanged(accounts) {
      if (accounts.length === 0) this.onDisconnect();
      else
        config.emitter.emit('change', {
          accounts: accounts.map((x) => getAddress(x)),
        });
    },

    onChainChanged(chain) {
      const chainId = Number(chain);
      config.emitter.emit('change', { chainId });
    },

    async onConnect(connectInfo) {
      const accounts = await this.getAccounts();
      if (accounts.length === 0) return;

      const chainId = Number(connectInfo.chainId);
      config.emitter.emit('connect', { accounts, chainId });

      // Manage EIP-1193 event listeners
      const provider = await this.getProvider();
      if (connect) {
        provider.removeListener('connect', connect as never);
        connect = undefined;
      }
      if (!accountsChanged) {
        accountsChanged = this.onAccountsChanged.bind(this);
        provider.on('accountsChanged', accountsChanged as never);
      }
      if (!chainChanged) {
        chainChanged = this.onChainChanged.bind(this);
        provider.on('chainChanged', chainChanged as never);
      }
      if (!disconnect) {
        disconnect = this.onDisconnect.bind(this);
        provider.on('disconnect', disconnect as never);
      }
    },

    async onDisconnect(_error) {
      const provider = await this.getProvider();

      config.emitter.emit('disconnect');

      // Manage EIP-1193 event listeners
      if (accountsChanged) {
        provider.removeListener('accountsChanged', accountsChanged as never);
        accountsChanged = undefined;
      }
      if (chainChanged) {
        provider.removeListener('chainChanged', chainChanged as never);
        chainChanged = undefined;
      }
      if (disconnect) {
        provider.removeListener('disconnect', disconnect as never);
        disconnect = undefined;
      }
      if (!connect) {
        connect = this.onConnect.bind(this);
        provider.on('connect', connect as never);
      }
    },
  }));
}
