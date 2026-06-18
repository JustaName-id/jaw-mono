'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { createWagmiConfig, type ModeType, type TransportModeType } from './config';
import { type PaymasterConfig, type JawTheme } from '@jaw.id/core';
import { useState, useMemo, useRef, type PropsWithChildren } from 'react';

interface WagmiProvidersProps extends PropsWithChildren {
  mode: ModeType;
  paymasters?: Record<number, PaymasterConfig>;
  theme?: JawTheme;
  transportMode?: TransportModeType;
}

export function WagmiProviders({ children, mode, paymasters, theme, transportMode }: WagmiProvidersProps) {
  const [queryClient] = useState(() => new QueryClient());
  // Build the connector once with the INITIAL theme. Later theme changes are
  // pushed to the live keys dialog via connector.setTheme (see WagmiPageContent),
  // NOT by rebuilding the connector — a rebuild re-prewarms a fresh iframe and
  // can leave a stale one behind (the theme-sync timing bug this fix closes).
  const initialTheme = useRef(theme).current;
  const config = useMemo(
    () => createWagmiConfig(mode, paymasters, initialTheme, transportMode),
    [mode, paymasters, initialTheme, transportMode]
  );

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
