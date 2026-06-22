import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Address } from 'viem';

import { JAWSigner } from './JAWSigner.js';
import { sdkstore } from '../store/index.js';
import { SDK_VERSION } from '../sdk-info.js';
import type { ProviderEventCallback, RequestArguments } from '../provider/index.js';

/**
 * Minimal concrete signer to exercise the shared base-class request handling.
 * The abstract members (handshake / wallet_connect / signing) are not under
 * test here — only the silent authenticated read path (eth_accounts).
 */
class TestSigner extends JAWSigner {
    async handshake(): Promise<void> {
        /* not under test */
    }
    protected async handleWalletConnect(): Promise<unknown> {
        return null;
    }
    protected async handleWalletConnectUnauthenticated(): Promise<unknown> {
        return null;
    }
    protected async handleSigningRequest(): Promise<unknown> {
        return null;
    }
}

const ACCOUNT = '0x1111111111111111111111111111111111111111' as Address;

function seedSession(account: { accounts?: Address[]; connectedAt?: number }, authTTL?: number) {
    sdkstore.setState(
        {
            chains: [],
            keys: {},
            account,
            config: { version: SDK_VERSION, preference: authTTL === undefined ? undefined : { authTTL } },
            callStatuses: {},
        },
        true
    );
}

function makeSigner(callback: ProviderEventCallback | null = null): TestSigner {
    return new TestSigner({ metadata: { name: 'test', defaultChainId: 1 } as never, callback });
}

const ethAccounts: RequestArguments = { method: 'eth_accounts' };

describe('JAWSigner eth_accounts (silent reconnect)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-06-16T00:00:00Z'));
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns the cached accounts when the session is still within TTL', async () => {
        const connect = vi.fn();
        // connectedAt now, 1h TTL → live.
        seedSession({ accounts: [ACCOUNT], connectedAt: Date.now() }, 3600);
        const signer = makeSigner(connect);

        await expect(signer.request(ethAccounts)).resolves.toEqual([ACCOUNT]);
        // Silent reconnect still emits connect so the dApp can rehydrate.
        expect(connect).toHaveBeenCalledWith('connect', expect.anything());
    });

    it('returns an empty list (no prompt, no connect) when the session has expired', async () => {
        const connect = vi.fn();
        // connectedAt 2h ago, 1h TTL → expired.
        seedSession({ accounts: [ACCOUNT], connectedAt: Date.now() - 2 * 3600 * 1000 }, 3600);
        const signer = makeSigner(connect);

        await expect(signer.request(ethAccounts)).resolves.toEqual([]);
        // Must NOT silently re-attest a dead session.
        expect(connect).not.toHaveBeenCalled();
    });

    it('returns an empty list when caching is disabled (authTTL = 0)', async () => {
        seedSession({ accounts: [ACCOUNT], connectedAt: Date.now() }, 0);
        const signer = makeSigner();
        await expect(signer.request(ethAccounts)).resolves.toEqual([]);
    });
});
