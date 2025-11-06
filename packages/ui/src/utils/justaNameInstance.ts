import { JustaName } from '@justaname.id/sdk';

let justaNameInstance: ReturnType<typeof JustaName.init> | null = null;

/**
 * Get or create the singleton JustaName SDK instance
 */
export function getJustaNameInstance() {
  if (!justaNameInstance) {
    justaNameInstance = JustaName.init({
      networks: [
        {
          chainId: 1,
          providerUrl: 'https://eth.drpc.org'
        }
      ]
    });
  }
  return justaNameInstance;
}

