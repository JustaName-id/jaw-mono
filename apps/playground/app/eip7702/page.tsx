'use client';

import { useState } from 'react';
import { PrivyWrapper, Eip7702Providers } from './providers';
import { PrivyLoginSection } from './privy-login';
import { TurnkeyLoginSection } from './turnkey-login';
import { WagmiActions } from './wagmi-actions';
import type { LocalAccount } from 'viem';

type Provider = 'privy' | 'turnkey';

export default function Eip7702Page() {
    const [provider, setProvider] = useState<Provider>('privy');
    const [localAccount, setLocalAccount] = useState<LocalAccount | null>(null);

    return (
        <div className="min-h-screen bg-background p-6 max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold mb-2">EIP-7702 Client-Side Test</h1>
            <p className="text-muted-foreground mb-6">
                Test EIP-7702 delegation with real wallet providers through wagmi.
            </p>

            {/* Provider selector */}
            <div className="flex gap-2 mb-6">
                <button
                    onClick={() => { setProvider('privy'); setLocalAccount(null); }}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        provider === 'privy'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                >
                    Privy
                </button>
                <button
                    onClick={() => { setProvider('turnkey'); setLocalAccount(null); }}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        provider === 'turnkey'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                >
                    Turnkey
                </button>
            </div>

            {/* Login section — provider-specific */}
            {provider === 'privy' ? (
                <PrivyWrapper>
                    <PrivyLoginSection onAccountReady={setLocalAccount} />
                    {localAccount && (
                        <Eip7702Providers localAccount={localAccount}>
                            <WagmiActions />
                        </Eip7702Providers>
                    )}
                </PrivyWrapper>
            ) : (
                <>
                    <TurnkeyLoginSection onAccountReady={setLocalAccount} />
                    {localAccount && (
                        <Eip7702Providers localAccount={localAccount}>
                            <WagmiActions />
                        </Eip7702Providers>
                    )}
                </>
            )}
        </div>
    );
}
