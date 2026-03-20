import { http, createConfig, type Config } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { jaw } from '@jaw.id/wagmi';
import type { LocalAccount } from 'viem';

const API_KEY = process.env.NEXT_PUBLIC_API_KEY || '';
const DEFAULT_CHAIN_ID = process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID
    ? Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID)
    : 84532;

export function createEip7702WagmiConfig(localAccount: LocalAccount | null): Config {
    return createConfig({
        chains: [baseSepolia],
        connectors: localAccount
            ? [
                jaw({
                    apiKey: API_KEY,
                    appName: 'EIP-7702 Test',
                    defaultChainId: DEFAULT_CHAIN_ID,
                    localAccount,
                    preference: {
                        showTestnets: true,
                    },
                }),
            ]
            : [],
        transports: {
            [baseSepolia.id]: http(),
        },
    });
}
