import { SUPPORTED_CHAINS } from '../account/index.js';
import { CreateJAWSDKOptions } from './createJAWSDK.js';

/**
 * Validates the SDK configuration options.
 * Throws an error if any validation fails.
 *
 * @param params - The SDK configuration options to validate.
 * @throws {Error} If appChainIds contains unsupported chain IDs.
 */
export function validateConfig(params: CreateJAWSDKOptions): void {
  // Validate appChainIds
  if (params.appChainIds && params.appChainIds.length > 0) {
    const supportedChainIds = SUPPORTED_CHAINS.map(chain => chain.id as number);
    const unsupportedChains = params.appChainIds.filter(
      chainId => !(supportedChainIds as number[]).includes(chainId)
    );

    if (unsupportedChains.length > 0) {
      throw new Error(
        `Unsupported chain IDs: ${unsupportedChains.join(', ')}. ` +
        `Supported chains: ${supportedChainIds.join(', ')}`
      );
    }
  }
}