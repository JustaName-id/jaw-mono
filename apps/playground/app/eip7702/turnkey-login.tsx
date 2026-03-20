'use client';

import { useState } from 'react';
import type { LocalAccount } from 'viem';

interface TurnkeyLoginSectionProps {
    onAccountReady: (account: LocalAccount | null) => void;
}

const TURNKEY_ORG_ID = process.env.NEXT_PUBLIC_TURNKEY_ORG_ID || '';
const TURNKEY_API_PUBLIC_KEY = process.env.NEXT_PUBLIC_TURNKEY_API_PUBLIC_KEY || '';
const TURNKEY_API_PRIVATE_KEY = process.env.NEXT_PUBLIC_TURNKEY_API_PRIVATE_KEY || '';
const TURNKEY_WALLET_ADDRESS = process.env.NEXT_PUBLIC_TURNKEY_WALLET_ADDRESS || '';

export function TurnkeyLoginSection({ onAccountReady }: TurnkeyLoginSectionProps) {
    const [loading, setLoading] = useState(false);
    const [address, setAddress] = useState<string | null>(null);
    const [hasSignAuth, setHasSignAuth] = useState<boolean | null>(null);
    const [error, setError] = useState<string | null>(null);

    const missingEnv = !TURNKEY_ORG_ID || !TURNKEY_API_PUBLIC_KEY || !TURNKEY_API_PRIVATE_KEY || !TURNKEY_WALLET_ADDRESS;

    const connect = async () => {
        setLoading(true);
        setError(null);

        try {
            const { TurnkeyClient } = await import('@turnkey/http');
            const { ApiKeyStamper } = await import('@turnkey/api-key-stamper');
            const { createAccount } = await import('@turnkey/viem');

            const stamper = new ApiKeyStamper({
                apiPublicKey: TURNKEY_API_PUBLIC_KEY,
                apiPrivateKey: TURNKEY_API_PRIVATE_KEY,
            });

            const client = new TurnkeyClient(
                { baseUrl: 'https://api.turnkey.com' },
                stamper,
            );

            const turnkeyAccount = await createAccount({
                client,
                organizationId: TURNKEY_ORG_ID,
                signWith: TURNKEY_WALLET_ADDRESS,
            });

            console.log('[Turnkey] Account created:', {
                address: turnkeyAccount.address,
                hasSignAuthorization: typeof turnkeyAccount.signAuthorization === 'function',
            });

            setAddress(turnkeyAccount.address);
            setHasSignAuth(typeof turnkeyAccount.signAuthorization === 'function');
            onAccountReady(turnkeyAccount as LocalAccount);
        } catch (err) {
            console.error('[Turnkey] Connection failed:', err);
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4 border rounded-lg mb-4">
            <h2 className="text-lg font-semibold mb-3">Turnkey Login</h2>

            {!address ? (
                <div className="space-y-2">
                    {missingEnv && (
                        <p className="text-xs text-amber-500">
                            Set NEXT_PUBLIC_TURNKEY_ORG_ID, NEXT_PUBLIC_TURNKEY_API_PUBLIC_KEY,
                            NEXT_PUBLIC_TURNKEY_API_PRIVATE_KEY, and NEXT_PUBLIC_TURNKEY_WALLET_ADDRESS in .env
                        </p>
                    )}

                    <button
                        onClick={connect}
                        disabled={loading || missingEnv}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50"
                    >
                        {loading ? 'Connecting...' : 'Connect with Turnkey'}
                    </button>

                    {error && (
                        <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950 p-2 rounded">
                            {error}
                        </p>
                    )}
                </div>
            ) : (
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <span className="inline-block w-2 h-2 bg-green-500 rounded-full" />
                        <span className="text-sm font-medium">Connected</span>
                    </div>

                    <div className="p-2 bg-muted rounded text-sm space-y-0.5">
                        <div>Address: <code className="text-xs">{address}</code></div>
                        <div>
                            signAuthorization: {hasSignAuth ? (
                                <span className="text-green-600">yes (Tier 1)</span>
                            ) : (
                                <span className="text-amber-600">no (Tier 2 fallback)</span>
                            )}
                        </div>
                    </div>

                    <button
                        onClick={() => { setAddress(null); setHasSignAuth(null); onAccountReady(null); }}
                        className="px-3 py-1 text-sm bg-muted text-muted-foreground rounded hover:bg-muted/80"
                    >
                        Disconnect
                    </button>
                </div>
            )}
        </div>
    );
}
