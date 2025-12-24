import { http, createConfig } from 'wagmi';
import { mainnet, sepolia, baseSepolia } from 'wagmi/chains';
import { jawWallet } from '@jaw/wagmi';
import { Mode } from '@jaw.id/core';
import { ReactUIHandler } from '@jaw/ui';

export const config = createConfig({
  chains: [mainnet, sepolia, baseSepolia],
  connectors: [
    jawWallet({
      apiKey: process.env.NEXT_PUBLIC_API_KEY || '',
      appName: 'JAW Wagmi Demo',
      appLogoUrl: 'https://avatars.githubusercontent.com/u/159771991?s=200&v=4',
      defaultChainId: 84532, // Base Sepolia
      preference: {
        // keysUrl: 'http://localhost:3001',
        showTestnets: true,
        mode: Mode.AppSpecific,
        uiHandler: new ReactUIHandler(),
      },
      ens:"justan.id"
    }),
  ],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
    [baseSepolia.id]: http(),
  },
});

declare module 'wagmi' {
  interface Register {
    config: typeof config;
  }
}
