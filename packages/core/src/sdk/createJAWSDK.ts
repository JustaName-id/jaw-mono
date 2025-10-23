import {JAW_KEYS_URL, JAW_PASSKEYS_URL} from '../constants.js';
import { ProviderInterface, AppMetadata, JawProviderPreference, ConstructorOptions } from '../provider/interface.js';
import { createJAWProvider } from '../provider/createJAWProvider.js';
import { store } from '../store/index.js';

export type CreateJAWSDKOptions = Partial<AppMetadata> & {
  preference?: Partial<JawProviderPreference>;
  paymasterUrls?: Record<number, string>;
};

const DEFAULT_PREFERENCE: JawProviderPreference = {
  appSpecific: false,
  keysUrl: JAW_KEYS_URL,
  serverUrl:  JAW_PASSKEYS_URL,
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
 *   appName: 'My DApp',
 *   appLogoUrl: 'https://example.com/logo.png',
 *   appChainIds: [1, 137],
 * });
 *
 * const provider = jaw.getProvider();
 * await provider.request({ method: 'eth_requestAccounts' });
 * ```
 */

export function createJAWSDK(params: CreateJAWSDKOptions) {
  const options: ConstructorOptions = {
    metadata: {
      appName: params.appName || 'DApp',
      appLogoUrl: params.appLogoUrl || null,
      appChainIds: params.appChainIds || [1],
    },
    preference: {
      ...DEFAULT_PREFERENCE,
      ...params.preference,
    },
    paymasterUrls: params.paymasterUrls,
  };

  // Store the config
  store.config.set(options);

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