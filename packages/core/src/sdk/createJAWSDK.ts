import {JAW_KEYS_URL, JAW_PASSKEYS_URL} from '../constants.js';
import { ProviderInterface, AppMetadata, JawProviderPreference, ConstructorOptions, Mode } from '../provider/interface.js';
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
  mode: Mode.CrossPlatform,
  keysUrl: JAW_KEYS_URL,
  serverUrl:  JAW_PASSKEYS_URL,
  showTestnets: false,
};
/**
 * Create a JAW SDK instance (factory function pattern).
 *
 * @param params - Configuration options for the SDK.
 * @returns An object with SDK methods and provider access.
 *
 * @example
 * ```typescript
 * import { JAW } from '@jaw.id/core';
 *
 * const jaw = JAW.create({
 *   apiKey: 'your-api-key',
 *   appName: 'My DApp',
 *   appLogoUrl: 'https://example.com/logo.png',
 *   defaultChainId: 1,
 *   preference: {
 *     keysUrl: 'http://localhost:3001',
 *     showTestnets: true
 *   }
 * });
 *
 * await jaw.provider.request({ method: 'eth_requestAccounts' });
 *
 * ```
 */

export function create(params: CreateJAWSDKOptions) {
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

  return {
    /**
     * Get the JAW Provider instance.
     * Direct access to the provider for making requests.
     * Creates a new provider if one doesn't exist yet (lazy initialization).
     */
    get provider(): ProviderInterface {
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
  };
}