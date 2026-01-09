import { http, createConfig, type Config } from 'wagmi';
import { mainnet, sepolia, baseSepolia } from 'wagmi/chains';
import { jaw } from '@jaw.id/wagmi';
import { Mode } from '@jaw.id/core';
import { ReactUIHandler } from '@jaw.id/ui';

export type ModeType = typeof Mode[keyof typeof Mode];

export function createWagmiConfig(mode: ModeType): Config {
  return createConfig({
    chains: [mainnet, sepolia, baseSepolia],
    connectors: [
      jaw({
        apiKey: process.env.NEXT_PUBLIC_API_KEY || '',
        appName: 'JAW Wagmi Demo',
        appLogoUrl: 'https://avatars.githubusercontent.com/u/159771991?s=200&v=4',
        defaultChainId: 84532, // Base Sepolia
        preference: {
          keysUrl: 'http://localhost:3001',
          showTestnets: true,
          mode: mode,
          uiHandler: mode === Mode.AppSpecific ? new ReactUIHandler() : undefined,
        },
        ens: "justan.id"
      }),
    ],
    transports: {
      [mainnet.id]: http(),
      [sepolia.id]: http(),
      [baseSepolia.id]: http(),
    },
  });
}

// Default config for type declarations
export const config = createWagmiConfig(Mode.AppSpecific);

declare module 'wagmi' {
  interface Register {
    config: ReturnType<typeof createWagmiConfig>;
  }
}
