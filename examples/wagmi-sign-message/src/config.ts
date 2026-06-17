import { http, createConfig } from 'wagmi';
import type { Chain } from 'viem';
import { jaw } from '@jaw.id/wagmi';
import { SUPPORTED_CHAINS } from '@jaw.id/core';

const DEFAULT_CHAIN_ID = 84532; // Base Sepolia

/**
 * Canonical wagmi integration. transportMode is left unset, so the SDK uses its
 * default — the embedded, see-through iframe (with automatic popup fallback).
 */
export const config = createConfig({
  chains: SUPPORTED_CHAINS as unknown as readonly [Chain, ...Chain[]],
  connectors: [
    jaw({
      apiKey: import.meta.env.VITE_JAW_API_KEY ?? '',
      appName: 'JAW Example — Sign Message',
      defaultChainId: DEFAULT_CHAIN_ID,
      preference: {
        ...(import.meta.env.VITE_KEYS_URL ? { keysUrl: import.meta.env.VITE_KEYS_URL } : {}),
        showTestnets: true,
        // transportMode unset → 'auto' (embedded iframe is the default).
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
