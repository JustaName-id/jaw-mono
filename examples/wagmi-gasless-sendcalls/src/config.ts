import { http, createConfig } from 'wagmi';
import type { Chain } from 'viem';
import { jaw } from '@jaw.id/wagmi';
import { SUPPORTED_CHAINS, JAW_PAYMASTER_URL } from '@jaw.id/core';

const DEFAULT_CHAIN_ID = 84532; // Base Sepolia

/**
 * Configures JAW's ERC-20 paymaster per chain. With a paymaster set, EIP-5792
 * `wallet_sendCalls` runs gasless — the smart account pays the fee in an ERC-20
 * token instead of native ETH. (The account must hold the fee token; swap in
 * your own paymaster URL for production.)
 */
export const config = createConfig({
  chains: SUPPORTED_CHAINS as unknown as readonly [Chain, ...Chain[]],
  connectors: [
    jaw({
      apiKey: import.meta.env.VITE_JAW_API_KEY ?? '',
      appName: 'JAW Example — Gasless sendCalls',
      defaultChainId: DEFAULT_CHAIN_ID,
      paymasters: { [DEFAULT_CHAIN_ID]: { url: JAW_PAYMASTER_URL } },
      preference: {
        ...(import.meta.env.VITE_KEYS_URL ? { keysUrl: import.meta.env.VITE_KEYS_URL } : {}),
        showTestnets: true,
        // transportMode unset → embedded iframe (default).
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
