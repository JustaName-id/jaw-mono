'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { createWagmiConfig, type ModeType, type TransportModeType } from './config';
import { type PaymasterConfig, type JawTheme } from '@jaw.id/core';
import { useState, useMemo, type PropsWithChildren } from 'react';

interface WagmiProvidersProps extends PropsWithChildren {
  mode: ModeType;
  paymasters?: Record<number, PaymasterConfig>;
  theme?: JawTheme;
  transportMode?: TransportModeType;
}

export function WagmiProviders({ children, mode, paymasters, theme, transportMode }: WagmiProvidersProps) {
  const [queryClient] = useState(() => new QueryClient());
  const config = useMemo(
    () => createWagmiConfig(mode, paymasters, theme, transportMode),
    [mode, paymasters, theme, transportMode]
  );

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
