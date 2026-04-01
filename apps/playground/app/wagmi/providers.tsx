"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { createWagmiConfig, type ModeType } from "./config";
import { type PaymasterConfig, type JawTheme } from "@jaw.id/core";
import { useState, useMemo, type PropsWithChildren } from "react";

interface WagmiProvidersProps extends PropsWithChildren {
  mode: ModeType;
  paymasters?: Record<number, PaymasterConfig>;
  theme?: JawTheme;
}

export function WagmiProviders({
  children,
  mode,
  paymasters,
  theme,
}: WagmiProvidersProps) {
  const [queryClient] = useState(() => new QueryClient());
  const config = useMemo(
    () => createWagmiConfig(mode, paymasters, theme),
    [mode, paymasters, theme],
  );

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
