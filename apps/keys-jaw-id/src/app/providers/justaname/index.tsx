'use client';
import { JustaNameProvider } from '@justaname.id/react';
import { createStorage, cookieStorage, WagmiProvider } from 'wagmi';
import { mainnet, sepolia } from "wagmi/chains";
import { getDefaultConfig } from '@rainbow-me/rainbowkit'

const justaNameConfig = {
    config: {
        origin: process.env.ORIGIN,
        domain: process.env.DOMAIN,
    },
    networks: [
        {
            chainId: mainnet.id,
            providerUrl: process.env.PROVIDER_URL ?? '',
        }
    ],
    // dev: process.env.NODE_ENV === 'development'
};

const wagmiConfig = getDefaultConfig({
    appName: 'Keys JAW ID',
    chains: [mainnet, sepolia],
    projectId: process.env.PROJECT_ID ?? 'test-project-id',
    storage: createStorage({
        storage: cookieStorage,
    }),
})


export const JustaNameProviderWrapper = ({ children }: { children: React.ReactNode }) => {
    return (
        <WagmiProvider config={wagmiConfig}>
            <JustaNameProvider config={justaNameConfig}>
                {children}
            </JustaNameProvider>
        </WagmiProvider>
    );
}
