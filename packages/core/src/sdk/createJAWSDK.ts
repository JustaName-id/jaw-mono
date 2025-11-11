import {JAW_KEYS_URL, JAW_PASSKEYS_URL} from '../constants.js';
import { ProviderInterface, AppMetadata, JawProviderPreference, ConstructorOptions } from '../provider/interface.js';
import { createJAWProvider } from '../provider/createJAWProvider.js';
import { store, createInitialChains, ChainClients, createClients } from '../store/index.js';

export type CreateJAWSDKOptions = Partial<AppMetadata> & {
  apiKey: string;
  preference?: Partial<JawProviderPreference>;
  paymasterUrls?: Record<number, string>;
  /** Used to issue subnames*/
  ens?: string;
};

const DEFAULT_PREFERENCE: JawProviderPreference = {
  appSpecific: false,
  keysUrl: JAW_KEYS_URL,
  serverUrl:  JAW_PASSKEYS_URL,
  showTestnets: false,
};
/**
 * Create a JAW SDK instance (factory function pattern).
 *
 * @param params - Configuration options for the SDK.
 * @returns An object with SDK methods.
 *
 * @example
 * ```typescript
 * import { createJAWSDK } from '@jaw.id/core';
 *
 * const jaw = createJAWSDK({
 *   apiKey: 'your-api-key',
 *   appName: 'My DApp',
 *   appLogoUrl: 'https://example.com/logo.png',
 *   defaultChainId: 8453, // Optional: defaults to mainnet (1)
 * });
 *
 * const provider = jaw.getProvider();
 * await provider.request({ method: 'eth_requestAccounts' });
 * ```
 */

export function createJAWSDK(params: CreateJAWSDKOptions) {
  const options: ConstructorOptions = {
    apiKey: params.apiKey,
    metadata: {
      appName: params.appName || 'DApp',
      appLogoUrl: params.appLogoUrl || null,
      defaultChainId: params.defaultChainId,
    },
    preference: {
      ...DEFAULT_PREFERENCE,
      ...params.preference,
      ...(params.ens ? { ens: params.ens } : {}),
    },
    paymasterUrls: params.paymasterUrls,
  };

  // Store the config
  const storedOptions = {
    metadata: options.metadata,
    preference: options.preference,
    paymasterUrls: options.paymasterUrls,
    apiKey: params.apiKey,
  }
  store.config.set(storedOptions);

  // Always clear and reinitialize chains on SDK creation to ensure consistency
  store.chains.clear();
  ChainClients.setState({});

  if (params.apiKey) {
    const initialChains = createInitialChains(
      params.apiKey,
      params.paymasterUrls,
      options.preference.showTestnets
    );
    store.chains.set(initialChains);
    createClients(initialChains);
  }

  let provider: ProviderInterface | null = null;

  const jaw = {
    /**
     * Get the JAW Provider instance.
     * Creates a new provider if one doesn't exist yet (lazy initialization).
     * @returns The JAW Provider instance.
     */
    getProvider(): ProviderInterface {
      if (!provider) {
        provider = createJAWProvider(options);
      }
      return provider;
    },

    /**
     * Disconnect the provider and clean up resources.
     * @returns A promise that resolves when disconnection is complete.
     */
    async disconnect(): Promise<void> {
      if (provider) {
        await provider.disconnect();
        provider = null;
      }
    },

    /**
     * Check if the provider is currently connected.
     * @returns True if a provider exists and is connected.
     */
    isConnected(): boolean {
      return provider !== null;
    },
  };

  return jaw;
}