import {
  type CreateJAWSDKOptions,
  type ProviderInterface,
  JAW,
} from '@jaw.id/core';
import {
  ChainNotConfiguredError,
  type Connector,
  createConnector,
} from '@wagmi/core';
import {
  getAddress,
  numberToHex,
  type ProviderConnectInfo,
  SwitchChainError,
  UserRejectedRequestError,
  withRetry,
} from 'viem';

export type JawWalletParameters = CreateJAWSDKOptions;

jawWallet.type = 'jawWallet' as const;

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
  withCapabilities?: boolean | undefined;
};

type ConnectorProperties = {
  connect(parameters?: ConnectParameters): Promise<{
    accounts: readonly `0x${string}`[];
    chainId: number;
  }>;
  onConnect(connectInfo: ProviderConnectInfo): void;
};

export function jawWallet(parameters: JawWalletParameters) {
  type Provider = ProviderInterface;

  let sdk: ReturnType<typeof JAW.create> | undefined;
  let provider_: Provider | undefined;
  let accountsChanged: Connector['onAccountsChanged'] | undefined;
  let chainChanged: Connector['onChainChanged'] | undefined;
  let connect: Connector['onConnect'] | undefined;
  let disconnect: Connector['onDisconnect'] | undefined;

  return createConnector<Provider, ConnectorProperties>((config) => ({
    id: 'jawWallet',
    name: 'JAW Wallet',
    type: jawWallet.type,
    rdns: 'keys.jaw.id',

    async setup() {
      // Setup connect listener for auto-reconnection
      if (!connect) {
        const provider = await this.getProvider();
        connect = this.onConnect.bind(this);
        provider.on('connect', connect as never);
      }
    },

    async connect({ chainId, isReconnecting, withCapabilities }: ConnectParameters = {}) {
      const chains = config.chains;
      const targetChainId = chainId ?? chains[0]?.id;

      let accounts: `0x${string}`[] = [];
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
          const accountsResult = await provider.request({
            method: 'eth_requestAccounts',
          });
          accounts = parseAccounts(accountsResult);
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

        return {
          accounts: (withCapabilities
            ? accounts.map((address) => ({ address, capabilities: {} }))
            : accounts) as never,
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
