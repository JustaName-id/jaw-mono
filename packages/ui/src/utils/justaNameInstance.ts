import { JustaName } from '@justaname.id/sdk';

let justaNameInstance: ReturnType<typeof JustaName.init> | null = null;
let currentProviderUrl: string | null = null;

/**
 * Get or create the singleton JustaName SDK instance
 * @param providerUrl - The Ethereum mainnet RPC URL for ENS resolution
 */
export function getJustaNameInstance(providerUrl: string) {
  // Re-initialize if providerUrl changes (supports different configurations)
  if (!justaNameInstance || currentProviderUrl !== providerUrl) {
    currentProviderUrl = providerUrl;
    justaNameInstance = JustaName.init({
      networks: [
        {
          chainId: 1,
          providerUrl
        }
      ]
    });
  }
  return justaNameInstance;
}

