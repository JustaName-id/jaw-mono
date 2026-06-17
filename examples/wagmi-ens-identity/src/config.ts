import { http, createConfig } from 'wagmi';
import type { Chain } from 'viem';
import { jaw } from '@jaw.id/wagmi';
import { SUPPORTED_CHAINS } from '@jaw.id/core';

const DEFAULT_CHAIN_ID = 84532; // Base Sepolia

/** wagmi connector, default (embedded iframe) transport. */
export const config = createConfig({
  chains: SUPPORTED_CHAINS as unknown as readonly [Chain, ...Chain[]],
  connectors: [
    jaw({
      apiKey: import.meta.env.VITE_JAW_API_KEY ?? '',
      appName: 'JAW Example — ENS identity',
      defaultChainId: DEFAULT_CHAIN_ID,
      preference: {
        ...(import.meta.env.VITE_KEYS_URL ? { keysUrl: import.meta.env.VITE_KEYS_URL } : {}),
        showTestnets: true,
      },
    }),
  ],
  transports: Object.fromEntries(SUPPORTED_CHAINS.map((c) => [c.id, http()])),
});

declare module 'wagmi' {
  interface Register {
    config: typeof config;
  }
}
