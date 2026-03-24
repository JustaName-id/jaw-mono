'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import type { PropsWithChildren } from 'react';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || '';

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
