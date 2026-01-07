'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { createWagmiConfig, type ModeType } from './config';
import { useState, useMemo, type PropsWithChildren } from 'react';

interface WagmiProvidersProps extends PropsWithChildren {
  mode: ModeType;
}

export function WagmiProviders({ children, mode }: WagmiProvidersProps) {
  const [queryClient] = useState(() => new QueryClient());
  const config = useMemo(() => createWagmiConfig(mode), [mode]);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
