import {
  type CreateJAWSDKOptions,
  type ProviderInterface,
  type ProviderRpcError,
  JAW,
} from '@jaw.id/core';
import { createConnector } from '@wagmi/core';
import { getAddress, UserRejectedRequestError } from 'viem';

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

export function jawWallet(parameters: JawWalletParameters) {
  type Provider = ProviderInterface;

  let sdk: ReturnType<typeof JAW.create> | undefined;
  let provider_: Provider | undefined;
  let accountsChanged: ((accounts: string[]) => void) | undefined;
  let chainChanged: ((chainId: string) => void) | undefined;
  let disconnectHandler: ((error: ProviderRpcError) => void) | undefined;

  function removeListeners() {
    if (provider_) {
      if (accountsChanged) {
        provider_.removeListener('accountsChanged', accountsChanged);
        accountsChanged = undefined;
      }
      if (chainChanged) {
        provider_.removeListener('chainChanged', chainChanged);
        chainChanged = undefined;
      }
      if (disconnectHandler) {
        provider_.removeListener('disconnect', disconnectHandler);
        disconnectHandler = undefined;
      }
    }
  }

  function resetState() {
    removeListeners();
    provider_ = undefined;
    sdk = undefined;
  }

  return createConnector<Provider>((config) => ({
    id: 'jawWallet',
    name: 'JAW Wallet',
    type: jawWallet.type,
    supportsSimulation: false,

    async setup() {
      // Lazy initialization - SDK will be created on first getProvider call
    },

    async connect({ chainId, withCapabilities } = {} as { chainId?: number; withCapabilities?: boolean }) {
      try {
        const provider = await this.getProvider();

        const accountsResult = await provider.request({
          method: 'eth_requestAccounts',
        });

        const accounts = parseAccounts(accountsResult);
        if (accounts.length === 0) {
          throw new Error('No accounts returned');
        }

        // Setup event listeners (only if not already set)
        if (!accountsChanged) {
          accountsChanged = this.onAccountsChanged.bind(this);
          provider.on('accountsChanged', accountsChanged);
        }
        if (!chainChanged) {
          chainChanged = this.onChainChanged.bind(this);
          provider.on('chainChanged', chainChanged);
        }
        if (!disconnectHandler) {
          disconnectHandler = this.onDisconnect.bind(this);
          provider.on('disconnect', disconnectHandler);
        }

        // Switch chain if requested
        let currentChainId = await this.getChainId();
        if (chainId && currentChainId !== chainId) {
          const chain = await this.switchChain?.({ chainId }).catch((error) => {
            if ((error as { code?: number }).code === UserRejectedRequestError.code) throw error;
            return { id: currentChainId };
          });
          currentChainId = chain?.id ?? currentChainId;
        }

        return {
          accounts: (withCapabilities
            ? accounts.map((address) => ({ address, capabilities: {} }))
            : accounts) as never,
          chainId: currentChainId,
        };
      } catch (error) {
        // Reset state on connection failure
        resetState();

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
      try {
        removeListeners();

        if (provider_) {
          await provider_.disconnect();
        }
      } finally {
        // Always reset state, even if disconnect fails
        resetState();
      }
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
        const accounts = await this.getAccounts();
        return accounts.length > 0;
      } catch {
        return false;
      }
    },

    async switchChain({ chainId }) {
      const provider = await this.getProvider();
      const chain = config.chains.find((x) => x.id === chainId);
      if (!chain) throw new Error(`Chain ${chainId} not configured`);

      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${chainId.toString(16)}` }],
      });

      config.emitter.emit('change', { chainId });
      return chain;
    },

    onAccountsChanged(accounts) {
      if (accounts.length === 0) {
        this.onDisconnect();
      } else {
        config.emitter.emit('change', {
          accounts: accounts.map((x) => getAddress(x)),
        });
      }
    },

    onChainChanged(chainId) {
      const id = Number(chainId);
      config.emitter.emit('change', { chainId: id });
    },

    onDisconnect() {
      config.emitter.emit('disconnect');
      resetState();
    },
  }));
}
