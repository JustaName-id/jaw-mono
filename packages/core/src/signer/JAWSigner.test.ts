import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Address } from 'viem';

import { JAWSigner } from './JAWSigner.js';
import { sdkstore } from '../store/index.js';
import { SDK_VERSION } from '../sdk-info.js';
import { logSignature } from '../analytics/index.js';
import type { ProviderEventCallback, RequestArguments } from '../provider/index.js';

vi.mock('../analytics/index.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../analytics/index.js')>();
    return { ...actual, logSignature: vi.fn() };
});

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

describe('JAWSigner signature analytics reporting', () => {
    const API_KEY = 'test-api-key';
    const SIGNER_ADDRESS = '0x2222222222222222222222222222222222222222' as Address;

    /** Signer whose signing outcome is scripted per test. */
    class SigningTestSigner extends TestSigner {
        signingResult: Promise<unknown> = Promise.resolve('0xsignature');
        protected override async handleSigningRequest(): Promise<unknown> {
            return this.signingResult;
        }
    }

    function seedAuthenticatedSession(apiKey?: string) {
        sdkstore.setState(
            {
                chains: [],
                keys: {},
                account: { accounts: [ACCOUNT], connectedAt: Date.now() },
                config: { version: SDK_VERSION, apiKey },
                callStatuses: {},
            },
            true
        );
    }

    function makeSigningSigner(): SigningTestSigner {
        return new SigningTestSigner({
            metadata: { name: 'test', defaultChainId: 1 } as never,
            callback: null,
        });
    }

    beforeEach(() => {
        vi.mocked(logSignature).mockClear();
    });

    it('reports a signature when personal_sign succeeds, using the address from params', async () => {
        // Given an authenticated session with an API key configured
        seedAuthenticatedSession(API_KEY);
        const signer = makeSigningSigner();

        // When a personal_sign request resolves successfully
        await signer.request({ method: 'personal_sign', params: ['0xdeadbeef', SIGNER_ADDRESS] });

        // Then the signature is reported with the signer address from params
        expect(logSignature).toHaveBeenCalledExactlyOnceWith({
            address: SIGNER_ADDRESS,
            apiKey: API_KEY,
        });
    });

    it('reports a signature when eth_signTypedData_v4 succeeds, using the address from params', async () => {
        // Given an authenticated session with an API key configured
        seedAuthenticatedSession(API_KEY);
        const signer = makeSigningSigner();

        // When an eth_signTypedData_v4 request resolves successfully
        await signer.request({
            method: 'eth_signTypedData_v4',
            params: [SIGNER_ADDRESS, '{"types":{}}'],
        });

        // Then the signature is reported with the signer address from params
        expect(logSignature).toHaveBeenCalledExactlyOnceWith({
            address: SIGNER_ADDRESS,
            apiKey: API_KEY,
        });
    });

    it('reports a signature for wallet_sign, falling back to the connected account when params omit the address', async () => {
        // Given an authenticated session with an API key configured
        seedAuthenticatedSession(API_KEY);
        const signer = makeSigningSigner();

        // When a wallet_sign request without an explicit address resolves
        await signer.request({
            method: 'wallet_sign',
            params: [{ request: { type: 'personal_sign', data: { message: 'hi' } } }],
        });

        // Then the signature is reported with the connected account address
        expect(logSignature).toHaveBeenCalledExactlyOnceWith({
            address: ACCOUNT,
            apiKey: API_KEY,
        });
    });

    it('does not report anything when the user rejects the signature', async () => {
        // Given an authenticated session and a signing flow that rejects
        seedAuthenticatedSession(API_KEY);
        const signer = makeSigningSigner();
        const rejection = new Error('User rejected the request');
        signer.signingResult = Promise.reject(rejection);

        // When the personal_sign request fails
        await expect(
            signer.request({ method: 'personal_sign', params: ['0xdeadbeef', SIGNER_ADDRESS] })
        ).rejects.toThrow(rejection);

        // Then no signature is reported
        expect(logSignature).not.toHaveBeenCalled();
    });

    it('does not report non-signature signing requests (wallet_sendCalls)', async () => {
        // Given an authenticated session with an API key configured
        seedAuthenticatedSession(API_KEY);
        const signer = makeSigningSigner();

        // When a wallet_sendCalls request resolves successfully
        await signer.request({ method: 'wallet_sendCalls', params: [{ calls: [] }] });

        // Then no signature is reported
        expect(logSignature).not.toHaveBeenCalled();
    });

    it('skips reporting silently when no API key is configured', async () => {
        // Given an authenticated session without an API key
        seedAuthenticatedSession(undefined);
        const signer = makeSigningSigner();

        // When a personal_sign request resolves successfully
        const result = await signer.request({
            method: 'personal_sign',
            params: ['0xdeadbeef', SIGNER_ADDRESS],
        });

        // Then signing still succeeds and nothing is reported
        expect(result).toBe('0xsignature');
        expect(logSignature).not.toHaveBeenCalled();
    });
});
