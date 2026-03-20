'use client';

import { useEffect, useCallback, useState } from 'react';
import { usePrivy, useWallets, useCreateWallet, toViemAccount, getEmbeddedConnectedWallet } from '@privy-io/react-auth';
import type { LocalAccount } from 'viem';

interface PrivyLoginSectionProps {
    onAccountReady: (account: LocalAccount | null) => void;
}

export function PrivyLoginSection({ onAccountReady }: PrivyLoginSectionProps) {
    const { ready, authenticated, login, logout } = usePrivy();
    const { wallets, ready: walletsReady } = useWallets();
    const { createWallet } = useCreateWallet();
    const [status, setStatus] = useState<string>('');
    const [accountAddress, setAccountAddress] = useState<string | null>(null);
    const [hasSignAuth, setHasSignAuth] = useState<boolean | null>(null);

    // Create embedded wallet if user is authenticated but has none
    useEffect(() => {
        if (authenticated && walletsReady && wallets.length === 0) {
            setStatus('Creating embedded wallet...');
            createWallet()
                .then(() => setStatus('Embedded wallet created'))
                .catch((err) => {
                    console.error('[Privy] Failed to create wallet:', err);
                    setStatus(`Wallet creation failed: ${err instanceof Error ? err.message : String(err)}`);
                });
        }
    }, [authenticated, walletsReady, wallets.length, createWallet]);

    const setupAccount = useCallback(async () => {
        console.log('[Privy] wallets:', wallets.map(w => ({ type: w.walletClientType, address: w.address })));

        const embeddedWallet = getEmbeddedConnectedWallet(wallets);
        if (!embeddedWallet) {
            console.log('[Privy] No embedded wallet found. Wallet types:', wallets.map(w => w.walletClientType));
            setStatus(`Waiting for embedded wallet... (${wallets.length} wallets found)`);
            return;
        }

        setStatus(`Found embedded wallet: ${embeddedWallet.address}`);
        console.log('[Privy] Embedded wallet found:', embeddedWallet.address);

        try {
            const viemAccount = await toViemAccount({ wallet: embeddedWallet });
            console.log('[Privy] viemAccount created:', {
                address: viemAccount.address,
                hasSign: typeof viemAccount.sign === 'function',
                hasSignAuthorization: typeof viemAccount.signAuthorization === 'function',
            });

            setAccountAddress(viemAccount.address);
            setHasSignAuth(typeof viemAccount.signAuthorization === 'function');
            onAccountReady(viemAccount as unknown as LocalAccount);
            setStatus('Account ready');
        } catch (err) {
            console.error('[Privy] Failed to create viem account:', err);
            setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
        }
    }, [wallets, onAccountReady]);

    useEffect(() => {
        if (authenticated && walletsReady && wallets.length > 0) {
            setupAccount();
        }
    }, [authenticated, walletsReady, wallets, setupAccount]);

    if (!ready) {
        return <div className="p-4 border rounded-lg mb-4 text-muted-foreground">Loading Privy...</div>;
    }

    return (
        <div className="p-4 border rounded-lg mb-4">
            <h2 className="text-lg font-semibold mb-3">Privy Login</h2>

            {!authenticated ? (
                <button
                    onClick={login}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90"
                >
                    Login with Privy
                </button>
            ) : (
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <span className="inline-block w-2 h-2 bg-green-500 rounded-full" />
                        <span className="text-sm font-medium">Authenticated</span>
                    </div>

                    {/* Debug info */}
                    <div className="text-xs text-muted-foreground space-y-0.5">
                        <div>Wallets ready: {walletsReady ? 'yes' : 'no'} | Count: {wallets.length}</div>
                        {status && <div>Status: {status}</div>}
                    </div>

                    {/* Wallet list */}
                    {wallets.map((w) => (
                        <div key={w.address} className="text-sm text-muted-foreground">
                            {w.walletClientType === 'privy' ? '(embedded)' : `(${w.walletClientType})`}{' '}
                            <code className="text-xs">{w.address}</code>
                        </div>
                    ))}

                    {/* Account info */}
                    {accountAddress && (
                        <div className="p-2 bg-muted rounded text-sm space-y-0.5">
                            <div>LocalAccount: <code className="text-xs">{accountAddress}</code></div>
                            <div>
                                signAuthorization: {hasSignAuth ? (
                                    <span className="text-green-600">yes (Tier 1)</span>
                                ) : (
                                    <span className="text-amber-600">no (Tier 2 fallback)</span>
                                )}
                            </div>
                        </div>
                    )}

                    <button
                        onClick={() => { logout(); onAccountReady(null); setAccountAddress(null); setHasSignAuth(null); setStatus(''); }}
                        className="px-3 py-1 text-sm bg-muted text-muted-foreground rounded hover:bg-muted/80"
                    >
                        Logout
                    </button>
                </div>
            )}
        </div>
    );
}
