import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import type { AppMetadata, JawProviderPreference } from '../provider/interface.js';
import type { TransportMode, TransportOptions } from './transport.js';
import type { PopupTransport } from './popup-transport.js';
import type { IframeTransport } from './iframe-transport.js';
import { TransportRouter, TransportRouterConfig, CREDENTIAL_CREATING_METHODS } from './transport-router.js';
import { JAW_KEYS_URL } from '../constants.js';

const appMetadata: AppMetadata = {
    appName: 'Test App',
    appLogoUrl: null,
    defaultChainId: 1,
};

const preference: JawProviderPreference = { keysUrl: JAW_KEYS_URL };

type MockTransportBase = {
    ensureReady: ReturnType<typeof vi.fn>;
    postMessage: ReturnType<typeof vi.fn>;
    isAlive: ReturnType<typeof vi.fn>;
    matchesSource: ReturnType<typeof vi.fn>;
    setTheme: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
};

type MockPopup = MockTransportBase & {
    kind: 'popup';
};

type MockIframe = MockTransportBase & {
    kind: 'iframe';
    prewarm: ReturnType<typeof vi.fn>;
    show: ReturnType<typeof vi.fn>;
    hide: ReturnType<typeof vi.fn>;
    reload: ReturnType<typeof vi.fn>;
};

function createMockPopup(): MockPopup {
    return {
        kind: 'popup',
        ensureReady: vi.fn(async () => ({}) as Window),
        postMessage: vi.fn(async () => undefined),
        isAlive: vi.fn(() => true),
        matchesSource: vi.fn(() => true),
        setTheme: vi.fn(),
        destroy: vi.fn(),
    };
}

function createMockIframe(): MockIframe {
    return {
        kind: 'iframe',
        ensureReady: vi.fn(async () => ({}) as Window),
        postMessage: vi.fn(async () => undefined),
        isAlive: vi.fn(() => true),
        matchesSource: vi.fn(() => true),
        setTheme: vi.fn(),
        destroy: vi.fn(),
        prewarm: vi.fn(async () => undefined),
        show: vi.fn(),
        hide: vi.fn(),
        reload: vi.fn(async () => undefined),
    };
}

type RouterEnv = {
    mode?: TransportMode;
    safari?: boolean;
    iov2?: boolean;
    trusted?: boolean;
    secureContext?: boolean;
    hostname?: string;
};

function createRouter(env: RouterEnv = {}) {
    const popupMock = createMockPopup();
    const iframeMock = createMockIframe();
    const popupFactory = vi.fn((_options: TransportOptions) => popupMock as unknown as PopupTransport);
    const iframeFactory = vi.fn((_options: TransportOptions) => iframeMock as unknown as IframeTransport);

    const config: TransportRouterConfig = {
        url: new URL(JAW_KEYS_URL),
        metadata: appMetadata,
        preference,
        mode: env.mode,
        createPopupTransport: popupFactory,
        createIframeTransport: iframeFactory,
        isSafariFn: () => env.safari ?? false,
        supportsIOv2Fn: () => env.iov2 ?? true,
        isTrustedHostFn: () => env.trusted ?? false,
        isSecureContextFn: () => env.secureContext ?? true,
        getLocation: () => ({
            hostname: env.hostname ?? 'dapp.example.com',
        }),
    };

    return { router: new TransportRouter(config), popupMock, iframeMock, popupFactory, iframeFactory };
}

describe('CREDENTIAL_CREATING_METHODS', () => {
    it('contains exactly the methods that may create a passkey', () => {
        expect(CREDENTIAL_CREATING_METHODS).toEqual(['eth_requestAccounts', 'wallet_connect']);
    });
});

describe('TransportRouter.route', () => {
    it('routes to popup when mode is unset', () => {
        const { router } = createRouter({});
        expect(router.route({})).toBe('popup');
        expect(router.route({ method: 'wallet_sendCalls' })).toBe('popup');
    });

    it('routes to popup when mode is "popup"', () => {
        const { router } = createRouter({ mode: 'popup' });
        expect(router.route({})).toBe('popup');
    });

    it('routes to iframe for mode "iframe" on a secure Chromium host', () => {
        const { router } = createRouter({ mode: 'iframe' });
        expect(router.route({ method: 'wallet_sendCalls' })).toBe('iframe');
    });

    it('treats mode "auto" as iframe in v1', () => {
        const { router } = createRouter({ mode: 'auto' });
        expect(router.route({})).toBe('iframe');
    });

    it('routes to popup on insecure contexts regardless of other conditions', () => {
        const { router } = createRouter({ mode: 'iframe', secureContext: false });
        expect(router.route({})).toBe('popup');
    });

    it('routes credential-creating methods to popup on Safari', () => {
        const { router } = createRouter({ mode: 'iframe', safari: true });
        expect(router.route({ method: 'eth_requestAccounts' })).toBe('popup');
        expect(router.route({ method: 'wallet_connect' })).toBe('popup');
    });

    it('keeps non-credential methods on iframe on Safari', () => {
        const { router } = createRouter({ mode: 'iframe', safari: true });
        expect(router.route({ method: 'personal_sign' })).toBe('iframe');
        expect(router.route({})).toBe('iframe');
    });

    it('does not route credential methods to popup on non-Safari browsers', () => {
        const { router } = createRouter({ mode: 'iframe', safari: false });
        expect(router.route({ method: 'eth_requestAccounts' })).toBe('iframe');
    });

    it('routes to popup without IOv2 when the host is untrusted', () => {
        const { router } = createRouter({ mode: 'iframe', iov2: false, trusted: false });
        expect(router.route({})).toBe('popup');
    });

    it('allows iframe without IOv2 when the host is trusted', () => {
        const { router } = createRouter({ mode: 'iframe', iov2: false, trusted: true });
        expect(router.route({})).toBe('iframe');
    });
});

describe('TransportRouter.acquire', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns a ready popup transport when routed to popup', async () => {
        const { router, popupMock } = createRouter({ mode: 'popup' });

        const transport = await router.acquire({});

        expect(transport.kind).toBe('popup');
        expect(popupMock.ensureReady).toHaveBeenCalledTimes(1);
    });

    it('returns a ready iframe transport when routed to iframe', async () => {
        const { router, iframeMock } = createRouter({ mode: 'iframe' });

        const transport = await router.acquire({ method: 'personal_sign' });

        expect(transport.kind).toBe('iframe');
        expect(iframeMock.ensureReady).toHaveBeenCalledTimes(1);
    });

    it('reuses transport instances across acquires', async () => {
        const { router, iframeFactory } = createRouter({ mode: 'iframe' });

        await router.acquire({});
        await router.acquire({});

        expect(iframeFactory).toHaveBeenCalledTimes(1);
    });

    it('completes a connect via popup on the clickjacking-guard path (no IOv2, untrusted host)', async () => {
        // Firefox/Safari (no IntersectionObserver v2) on a host that is not on
        // the trusted allow-list: the connect must still complete — through the
        // popup, with no error and without ever constructing the iframe.
        const { router, popupMock, iframeMock, iframeFactory } = createRouter({
            mode: 'auto',
            iov2: false,
            trusted: false,
        });

        const connect = await router.acquire({ method: 'eth_requestAccounts' });

        expect(connect.kind).toBe('popup');
        expect(popupMock.ensureReady).toHaveBeenCalledTimes(1);
        // The iframe is never even created on this path (no clickjacking surface).
        expect(iframeFactory).not.toHaveBeenCalled();
        expect(iframeMock.ensureReady).not.toHaveBeenCalled();

        // A follow-up signing request stays on the popup too (still no IOv2).
        const sign = await router.acquire({ method: 'personal_sign' });
        expect(sign.kind).toBe('popup');
        expect(popupMock.ensureReady).toHaveBeenCalledTimes(2);
    });

    it('warns exactly once on insecure-protocol fallback', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const { router } = createRouter({ mode: 'iframe', secureContext: false });

        await router.acquire({});
        await router.acquire({});

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toMatch(/HTTPS/);
    });

    it('reloads the iframe on its next use after a Safari popup-fallback flow', async () => {
        const { router, iframeMock } = createRouter({ mode: 'iframe', safari: true });

        // Establish the iframe first (non-credential request)
        await router.acquire({ method: 'personal_sign' });
        expect(iframeMock.ensureReady).toHaveBeenCalledTimes(1);

        // Credential request routes to popup
        const popupTransport = await router.acquire({ method: 'eth_requestAccounts' });
        expect(popupTransport.kind).toBe('popup');

        // Next iframe use resyncs via reload instead of ensureReady
        await router.acquire({ method: 'personal_sign' });
        expect(iframeMock.reload).toHaveBeenCalledTimes(1);
        expect(iframeMock.ensureReady).toHaveBeenCalledTimes(1);

        // And only once — subsequent uses go back to ensureReady
        await router.acquire({ method: 'personal_sign' });
        expect(iframeMock.reload).toHaveBeenCalledTimes(1);
        expect(iframeMock.ensureReady).toHaveBeenCalledTimes(2);
    });

    it('does not schedule an iframe reload when no iframe was ever created', async () => {
        const { router, iframeMock } = createRouter({ mode: 'iframe', safari: true });

        await router.acquire({ method: 'eth_requestAccounts' }); // popup, no iframe yet
        await router.acquire({ method: 'personal_sign' });

        expect(iframeMock.reload).not.toHaveBeenCalled();
        expect(iframeMock.ensureReady).toHaveBeenCalledTimes(1);
    });

    it('falls back to popup once when the iframe setup fails', async () => {
        const { router, popupMock, iframeMock } = createRouter({ mode: 'iframe' });
        iframeMock.ensureReady.mockRejectedValueOnce(new Error('handshake timed out'));

        const transport = await router.acquire({});

        expect(transport.kind).toBe('popup');
        expect(iframeMock.destroy).toHaveBeenCalledTimes(1);
        expect(popupMock.ensureReady).toHaveBeenCalledTimes(1);
    });

    it('propagates the popup error when the fallback also fails', async () => {
        const { router, popupMock, iframeMock } = createRouter({ mode: 'iframe' });
        iframeMock.ensureReady.mockRejectedValueOnce(new Error('handshake timed out'));
        popupMock.ensureReady.mockRejectedValueOnce(new Error('Failed to open popup'));

        await expect(router.acquire({})).rejects.toThrow(/Failed to open popup/);
    });

    it('recreates the iframe on the acquire after a failure', async () => {
        const { router, iframeFactory, iframeMock } = createRouter({ mode: 'iframe' });
        iframeMock.ensureReady.mockRejectedValueOnce(new Error('boom'));

        await router.acquire({});
        await router.acquire({});

        expect(iframeFactory).toHaveBeenCalledTimes(2);
    });

    it('serializes concurrent acquires', async () => {
        const order: string[] = [];
        const { router, iframeMock } = createRouter({ mode: 'iframe' });

        let releaseFirst: () => void = () => undefined;
        iframeMock.ensureReady
            .mockImplementationOnce(async () => {
                order.push('first-start');
                await new Promise<void>((resolve) => {
                    releaseFirst = resolve;
                });
                order.push('first-end');
                return {} as Window;
            })
            .mockImplementationOnce(async () => {
                order.push('second-start');
                return {} as Window;
            });

        const first = router.acquire({});
        const second = router.acquire({});

        // Give the first acquire a chance to start
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(order).toEqual(['first-start']);

        releaseFirst();
        await Promise.all([first, second]);

        expect(order).toEqual(['first-start', 'first-end', 'second-start']);
    });

    it('keeps serving acquires after a failed one (queue stays alive)', async () => {
        const { router, popupMock, iframeMock } = createRouter({ mode: 'iframe' });
        iframeMock.ensureReady.mockRejectedValueOnce(new Error('boom'));
        popupMock.ensureReady.mockRejectedValueOnce(new Error('also boom'));

        await expect(router.acquire({})).rejects.toThrow();

        const transport = await router.acquire({});
        expect(transport.kind).toBe('iframe');
    });
});

describe('TransportRouter.forcePopupOnce', () => {
    it('forces the next acquire onto popup even when routing picks iframe', async () => {
        const { router, popupMock, iframeMock } = createRouter({ mode: 'iframe' });

        await router.acquire({}); // iframe established
        router.forcePopupOnce();

        const transport = await router.acquire({});
        expect(transport.kind).toBe('popup');
        expect(popupMock.ensureReady).toHaveBeenCalledTimes(1);
        expect(iframeMock.hide).toHaveBeenCalledTimes(1);
    });

    it('is consumed once and schedules an iframe resync', async () => {
        const { router, iframeMock } = createRouter({ mode: 'iframe' });

        await router.acquire({}); // iframe established
        router.forcePopupOnce();
        await router.acquire({}); // popup (forced)

        const next = await router.acquire({});
        expect(next.kind).toBe('iframe');
        expect(iframeMock.reload).toHaveBeenCalledTimes(1);
    });
});

describe('TransportRouter.forceIframeReconnectOnce', () => {
    it('forces the next acquire onto iframe even when routing would pick popup', async () => {
        // Safari + trusted host: a credential method (wallet_connect) normally
        // routes to popup. The reconnect override sends it to the iframe instead
        // (it is a credential *get*, allowed in Safari iframes).
        const { router, iframeMock } = createRouter({ mode: 'iframe', safari: true, trusted: true });
        expect(router.route({ method: 'wallet_connect' })).toBe('popup');

        router.forceIframeReconnectOnce();
        const transport = await router.acquire({ method: 'wallet_connect' });

        expect(transport.kind).toBe('iframe');
        expect(iframeMock.ensureReady).toHaveBeenCalled();
    });

    it('is consumed once — the next acquire reverts to normal routing', async () => {
        const { router } = createRouter({ mode: 'iframe', safari: true, trusted: true });

        router.forceIframeReconnectOnce();
        const first = await router.acquire({ method: 'wallet_connect' });
        expect(first.kind).toBe('iframe');

        const second = await router.acquire({ method: 'wallet_connect' });
        expect(second.kind).toBe('popup'); // back to the Safari-credential rule
    });

    it('reuses the live iframe without reloading it', async () => {
        const { router, iframeMock } = createRouter({ mode: 'iframe', safari: true, trusted: true });

        await router.acquire({ method: 'wallet_sendCalls' }); // iframe established + ready
        router.forceIframeReconnectOnce();
        await router.acquire({ method: 'wallet_connect' });

        expect(iframeMock.reload).not.toHaveBeenCalled();
    });

    it('does not affect non-reconnect routing decisions', async () => {
        const { router } = createRouter({ mode: 'iframe', safari: true, trusted: true });
        // Without the override, a signing method on a trusted Safari host still
        // routes to the iframe; a credential method still routes to popup.
        expect(router.route({ method: 'wallet_sendCalls' })).toBe('iframe');
        expect(router.route({ method: 'wallet_connect' })).toBe('popup');
    });
});

describe('TransportRouter.prewarm', () => {
    it('prewarms the iframe when routing would pick it', async () => {
        const { router, iframeMock } = createRouter({ mode: 'iframe' });

        await router.prewarm();

        expect(iframeMock.prewarm).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when routing picks popup', async () => {
        const { router, iframeMock, iframeFactory } = createRouter({ mode: 'popup' });

        await router.prewarm();

        expect(iframeFactory).not.toHaveBeenCalled();
        expect(iframeMock.prewarm).not.toHaveBeenCalled();
    });
});

describe('TransportRouter.updateTheme', () => {
    it('pushes the theme to a live iframe', async () => {
        const { router, iframeMock } = createRouter({ mode: 'iframe' });
        await router.acquire({}); // iframe established

        router.updateTheme({ mode: 'dark' });

        expect(iframeMock.setTheme).toHaveBeenCalledWith({ mode: 'dark' });
    });

    it('pushes the theme to a live popup', async () => {
        const { router, popupMock } = createRouter({ mode: 'popup' });
        await router.acquire({}); // popup established

        router.updateTheme({ mode: 'light' });

        expect(popupMock.setTheme).toHaveBeenCalledWith({ mode: 'light' });
    });

    it('carries the updated theme to transports created after the update', async () => {
        const { router, iframeFactory } = createRouter({ mode: 'iframe' });

        router.updateTheme({ mode: 'dark' }); // before any transport exists
        await router.acquire({}); // iframe created now

        expect(iframeFactory).toHaveBeenCalledTimes(1);
        expect(iframeFactory.mock.calls[0][0].theme).toEqual({ mode: 'dark' });
    });

    it('does nothing harmful when no transport is live', () => {
        const { router } = createRouter({ mode: 'iframe' });
        expect(() => router.updateTheme({ mode: 'dark' })).not.toThrow();
    });
});

describe('TransportRouter.destroyAll', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        warnSpy.mockRestore();
    });

    it('destroys both transports and recreates them on the next acquire', async () => {
        const { router, popupMock, iframeMock, iframeFactory } = createRouter({
            mode: 'iframe',
            safari: true,
        });

        await router.acquire({ method: 'personal_sign' }); // iframe
        await router.acquire({ method: 'eth_requestAccounts' }); // popup

        router.destroyAll();

        expect(popupMock.destroy).toHaveBeenCalledTimes(1);
        expect(iframeMock.destroy).toHaveBeenCalledTimes(1);

        await router.acquire({ method: 'personal_sign' });
        expect(iframeFactory).toHaveBeenCalledTimes(2);
        // Pending reload was cleared by destroyAll — fresh iframe uses ensureReady
        expect(iframeMock.reload).not.toHaveBeenCalled();
    });

    it('is safe to call before any acquire', () => {
        const { router } = createRouter({ mode: 'iframe' });
        expect(() => router.destroyAll()).not.toThrow();
    });

    it('clears a pending forced-popup so it does not leak past teardown (H2)', async () => {
        const { router, iframeMock } = createRouter({ mode: 'iframe' });

        await router.acquire({}); // iframe established
        router.forcePopupOnce(); // arm forced popup
        router.destroyAll(); // teardown must clear it

        // Next acquire routes normally (iframe), not the stale forced popup
        const transport = await router.acquire({});
        expect(transport.kind).toBe('iframe');
        expect(iframeMock.reload).not.toHaveBeenCalled();
    });
});

describe('TransportRouter.ownsSource', () => {
    it('is tolerant of a null source', () => {
        const { router } = createRouter({ mode: 'iframe' });
        expect(router.ownsSource(null)).toBe(true);
    });

    it('delegates to the owned transports matchesSource', async () => {
        const { router, iframeMock } = createRouter({ mode: 'iframe' });
        await router.acquire({});

        const src = { tag: 'src' } as unknown as MessageEventSource;
        iframeMock.matchesSource.mockReturnValue(false);
        expect(router.ownsSource(src)).toBe(false);

        iframeMock.matchesSource.mockReturnValue(true);
        expect(router.ownsSource(src)).toBe(true);
    });

    it('returns false for a source when no transport is owned', () => {
        const { router } = createRouter({ mode: 'iframe' });
        const src = { tag: 'src' } as unknown as MessageEventSource;
        expect(router.ownsSource(src)).toBe(false);
    });
});
