import { ConstructorOptions } from './interface.js';
import { JAWProvider } from './JAWProvider.js';

export type CreateProviderOptions = ConstructorOptions;

/**
 * Create a JAW Provider instance.
 * @param options - Options to create a JAW Provider instance.
 * @returns A JAW Provider object.
 */
export function createJAWProvider(options: CreateProviderOptions): JAWProvider {
  return new JAWProvider(options);
}