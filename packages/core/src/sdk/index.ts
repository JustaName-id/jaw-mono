import { create as createJAWSDK } from './createJAWSDK.js';

export { create, type CreateJAWSDKOptions } from './createJAWSDK.js';

/**
 * JAW SDK namespace with factory method.
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
 * // Use provider directly
 * await jaw.provider.request({ method: 'eth_requestAccounts' });
 * ```
 */
export const JAW = {
  create: createJAWSDK
};