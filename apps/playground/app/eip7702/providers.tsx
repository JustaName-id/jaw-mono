'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { useState, useMemo, type PropsWithChildren } from 'react';
import { createEip7702WagmiConfig } from './config';
import type { LocalAccount } from 'viem';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || '';

interface Eip7702ProvidersProps extends PropsWithChildren {
    localAccount: LocalAccount | null;
}

export function Eip7702Providers({ children, localAccount }: Eip7702ProvidersProps) {
    const [queryClient] = useState(() => new QueryClient());
    const config = useMemo(
        () => createEip7702WagmiConfig(localAccount),
        [localAccount],
    );

    return (
        <WagmiProvider config={config} key={localAccount?.address ?? 'no-account'}>
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        </WagmiProvider>
    );
}

export function PrivyWrapper({ children }: PropsWithChildren) {
    return (
        <PrivyProvider
            appId={PRIVY_APP_ID}
            config={{
                appearance: {
                    theme: 'dark',
                },
                embeddedWallets: {
                    ethereum: {
                        createOnLogin: 'users-without-wallets',
                    },
                    showWalletUIs: true,
                },
                
            }}
        >
            {children}
        </PrivyProvider>
    );
}
