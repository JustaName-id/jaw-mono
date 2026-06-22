import { http, createConfig, type Config } from 'wagmi';
import type { Chain } from 'viem';
import { jaw } from '@jaw.id/wagmi';
import { Mode, SUPPORTED_CHAINS, type PaymasterConfig, type JawTheme } from '@jaw.id/core';
import { ReactUIHandler } from '@jaw.id/ui';

export type ModeType = (typeof Mode)[keyof typeof Mode];

export type TransportModeType = 'popup' | 'iframe' | 'auto';

export function createWagmiConfig(
  mode: ModeType,
  paymasters?: Record<number, PaymasterConfig>,
  theme?: JawTheme,
  transportMode?: TransportModeType
): Config {
  const defaultChainId = process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID
    ? Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID)
    : 84532; // Base Sepolia

  const transports = Object.fromEntries(SUPPORTED_CHAINS.map((chain) => [chain.id, http()]));

  return createConfig({
    chains: SUPPORTED_CHAINS as unknown as readonly [Chain, ...Chain[]],
    connectors: [
      jaw({
        apiKey: process.env.NEXT_PUBLIC_API_KEY || '',
        appName: 'JAW Wagmi Demo',
        appLogoUrl: 'https://avatars.githubusercontent.com/u/159771991?s=200&v=4',
        defaultChainId,
        preference: {
          ...(process.env.NEXT_PUBLIC_KEYS_URL && {
            keysUrl: process.env.NEXT_PUBLIC_KEYS_URL,
          }),
          showTestnets: true,
          mode: mode,
          ...(transportMode && { transportMode }),
          uiHandler: mode === Mode.AppSpecific ? new ReactUIHandler({ theme }) : undefined,
        },
        ens: process.env.NEXT_PUBLIC_ENS || 'justan.id',
        paymasters,
        theme,
      }),
    ],
    transports,
  });
}

// Default config for type declarations
export const config = createWagmiConfig(Mode.AppSpecific);

declare module 'wagmi' {
  interface Register {
    config: ReturnType<typeof createWagmiConfig>;
  }
}
