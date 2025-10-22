import { AppMetadata, ConstructorOptions, JawProviderPreference } from './interface.js';
import { JAWProvider } from './JAWProvider.js';

export type CreateProviderOptions = {
  metadata: AppMetadata;
  preference: JawProviderPreference;
};

/**
 * Create a JAW Provider instance.
 * @param options - Options to create a JAW Provider instance.
 * @returns A JAW Provider object.
 */
export function createJAWProvider(options: CreateProviderOptions): JAWProvider {
  const params: ConstructorOptions = {
    metadata: options.metadata,
    preference: options.preference,
  };

  return new JAWProvider(params);
}