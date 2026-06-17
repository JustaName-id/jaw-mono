import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

import type { AppMetadata, JawProviderPreference } from '../provider/interface.js';
import { SDK_VERSION } from '../sdk-info.js';
import type { Message } from '../messages/message.js';
import { IframeTransport } from './iframe-transport.js';
import { JAW_KEYS_URL } from '../constants.js';

// Set up jsdom environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost:3000/',
});
global.window = dom.window as unknown as Window & typeof globalThis;
global.document = dom.window.document;
global.MessageEvent = dom.window.MessageEvent;
global.MutationObserver = dom.window.MutationObserver;
global.HTMLElement = dom.window.HTMLElement;

// jsdom (all versions) recognizes <dialog> but does not implement
// showModal()/close(). Production calls the real methods (available in every
// browser that reaches the iframe transport); provide minimal versions here.
const dialogProto = dom.window.HTMLDialogElement.prototype as HTMLDialogElement & {
    showModal: () => void;
    close: () => void;
};
dialogProto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
};
dialogProto.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
};

function dispatchMessageEvent({ data, origin }: { data: unknown; origin: string }) {
    const messageEvent = new MessageEvent('message', {
        data,
        origin,
    });
    window.dispatchEvent(messageEvent);
}

const popupLoadedMessage = {
    data: { event: 'PopupLoaded', id: 'popup-loaded-id' },
};

const popupReadyMessage = {
    data: { event: 'PopupReady' },
};

/** Queues a message event simulating the keys app (see communicator.test.ts). */
function queueMessageEvent({
    data,
    origin = new URL(JAW_KEYS_URL).origin,
}: {
    data: Record<string, unknown>;
    origin?: string;
}) {
    setTimeout(() => dispatchMessageEvent({ data, origin }), 200);
}

const appMetadata: AppMetadata = {
    appName: 'Test App',
    appLogoUrl: null,
    defaultChainId: 1,
};

const preference: JawProviderPreference = { keysUrl: JAW_KEYS_URL };

const urlOrigin = new URL(JAW_KEYS_URL).origin;

function createTransport(handshakeTimeoutMs = 2000): IframeTransport {
    return new IframeTransport({
        url: new URL(JAW_KEYS_URL),
        metadata: appMetadata,
        preference,
        handshakeTimeoutMs,
    });
}

function getDialog(): HTMLDialogElement | null {
    return document.querySelector('dialog[data-jaw]');
}

function getIframe(): HTMLIFrameElement | null {
    return document.querySelector('dialog[data-jaw] iframe');
}

/** jsdom does not load remote iframes — inject a mock contentWindow. */
function mockContentWindow(): { postMessage: ReturnType<typeof vi.fn> } {
    const iframe = getIframe();
    if (!iframe) throw new Error('iframe not mounted');
    const mockTarget = { postMessage: vi.fn() };
    Object.defineProperty(iframe, 'contentWindow', {
        value: mockTarget,
        configurable: true,
    });
    return mockTarget;
}

/** Starts the handshake, mocks the target window and queues the keys events. */
function startHandshake(transport: IframeTransport) {
    const readyPromise = transport.ensureReady();
    const target = mockContentWindow();
    queueMessageEvent(popupLoadedMessage);
    queueMessageEvent(popupReadyMessage);
    return { readyPromise, target };
}

describe('IframeTransport', () => {
    let transport: IframeTransport;

    beforeEach(() => {
        transport = createTransport();
    });

    afterEach(() => {
        transport.destroy();
        document.body.innerHTML = '';
        document.head.innerHTML = '';
    });

    describe('kind', () => {
        it('is "iframe"', () => {
            expect(transport.kind).toBe('iframe');
        });
    });

    describe('mount', () => {
        it('creates a hidden dialog/iframe with the exact security attributes', async () => {
            const pending = transport.ensureReady().catch(() => {
                /* handshake never completes in this test */
            });

            const dialog = getDialog();
            const iframe = getIframe();

            expect(dialog).toBeTruthy();
            expect(dialog?.hasAttribute('open')).toBe(false);
            expect(dialog?.getAttribute('aria-label')).toBe('JAW Wallet');

            expect(iframe).toBeTruthy();
            expect(iframe?.getAttribute('allow')).toBe(
                `publickey-credentials-get ${urlOrigin}; publickey-credentials-create ${urlOrigin}`
            );
            expect(iframe?.getAttribute('sandbox')).toBe(
                'allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox'
            );
            expect(iframe?.getAttribute('title')).toBe('JAW');
            expect(iframe?.getAttribute('tabindex')).toBe('0');
            expect(iframe?.style.visibility).toBe('hidden');
            // Regression: a recognized color-scheme paints an opaque iframe
            // canvas (white), hiding the host dApp. Must stay `normal` so the
            // embedded chrome is genuinely see-through.
            expect(iframe?.style.colorScheme).toBe('normal');
            expect(iframe?.src).toMatch(/^https:\/\/keys\.jaw\.id\/?$/);

            transport.destroy();
            await pending;
        });

        it('injects the transparent-backdrop style once', async () => {
            const pending = transport.ensureReady().catch(() => {
                /* noop */
            });

            const styles = document.querySelectorAll('#jaw-dialog-backdrop-style');
            expect(styles.length).toBe(1);
            expect(styles[0].textContent).toContain('::backdrop');

            transport.destroy();
            await pending;
        });

        it('reverts the `inert` attribute set by extensions (1Password workaround)', async () => {
            const pending = transport.ensureReady().catch(() => {
                /* noop */
            });

            const dialog = getDialog();
            dialog?.setAttribute('inert', '');
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(dialog?.hasAttribute('inert')).toBe(false);

            transport.destroy();
            await pending;
        });

        it('strips `aria-hidden` put on the dialog by a host focus manager', async () => {
            const pending = transport.ensureReady().catch(() => {
                /* noop */
            });

            const dialog = getDialog();
            dialog?.setAttribute('aria-hidden', 'true');
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(dialog?.hasAttribute('aria-hidden')).toBe(false);

            transport.destroy();
            await pending;
        });
    });

    describe('ensureReady', () => {
        it('completes the handshake over the iframe contentWindow', async () => {
            const { readyPromise, target } = startHandshake(transport);

            const resolved = await readyPromise;

            expect(target.postMessage.mock.calls[0]).toEqual([
                {
                    requestId: 'popup-loaded-id',
                    data: {
                        version: SDK_VERSION,
                        metadata: appMetadata,
                        preference,
                        location: 'http://localhost:3000/',
                    },
                },
                urlOrigin,
            ]);
            expect(resolved).toBe(target as unknown as Window);
            expect(transport.isAlive()).toBe(true);
        });

        it('does not show the dialog during the handshake', async () => {
            const { readyPromise } = startHandshake(transport);
            await readyPromise;

            expect(getDialog()?.hasAttribute('open')).toBe(false);
            expect(getIframe()?.style.visibility).toBe('hidden');
        });

        it('rejects when the handshake times out (AC-E2)', async () => {
            transport = createTransport(50);
            const promise = transport.ensureReady();
            mockContentWindow();
            // No PopupLoaded/PopupReady dispatched

            await expect(promise).rejects.toThrow(/timed out/i);
            expect(transport.isAlive()).toBe(false);
        });

        it('cleans up orphaned handshake listeners on timeout (E4 leak)', async () => {
            const removeSpy = vi.spyOn(window, 'removeEventListener');
            transport = createTransport(120);
            const promise = transport.ensureReady();
            mockContentWindow();

            // Complete only the first handshake step (dispatched synchronously,
            // well before the 120ms timeout), then stall — this leaves the
            // PopupReady listener pending until the timeout fires.
            dispatchMessageEvent({ data: { event: 'PopupLoaded', id: 'popup-loaded-id' }, origin: urlOrigin });

            await expect(promise).rejects.toThrow(/timed out/i);

            // Both handshake listeners were torn down (PopupLoaded removed itself
            // on resolve; PopupReady removed by rejectPending on timeout).
            expect(removeSpy.mock.calls.filter(([type]) => type === 'message').length).toBeGreaterThanOrEqual(2);

            // A late PopupReady must not flip the transport to alive
            dispatchMessageEvent({ data: { event: 'PopupReady' }, origin: urlOrigin });
            expect(transport.isAlive()).toBe(false);
            removeSpy.mockRestore();
        });

        it('ignores handshake messages from other origins', async () => {
            transport = createTransport(400);
            const promise = transport.ensureReady();
            const target = mockContentWindow();

            queueMessageEvent({ ...popupLoadedMessage, origin: 'https://evil.example.com' });

            await expect(promise).rejects.toThrow(/timed out/i);
            expect(target.postMessage).not.toHaveBeenCalled();
        });
    });

    describe('prewarm (AC-9)', () => {
        it('completes the handshake without showing UI and is idempotent', async () => {
            const prewarmPromise = transport.prewarm();
            mockContentWindow();
            queueMessageEvent(popupLoadedMessage);
            queueMessageEvent(popupReadyMessage);
            await prewarmPromise;

            expect(transport.isAlive()).toBe(true);
            expect(getDialog()?.hasAttribute('open')).toBe(false);

            await transport.prewarm();
            expect(document.querySelectorAll('dialog[data-jaw]').length).toBe(1);
        });

        it('retries with backoff after a failed handshake, reloading the iframe', async () => {
            // Timing: the first attempt times out at 120ms (before the messages
            // arrive at ~200ms), so it fails; the retry reloads at ~140ms and its
            // handshake (timeout 240ms) picks up the 200ms messages. ~60ms margin
            // on the tightest step (reload listener attached before the messages).
            const retrying = new IframeTransport({
                url: new URL(JAW_KEYS_URL),
                metadata: appMetadata,
                preference,
                handshakeTimeoutMs: 120,
                prewarmBackoffMs: [20],
            });
            try {
                const prewarmPromise = retrying.prewarm();
                mockContentWindow(); // iframe is mounted synchronously by prewarm
                queueMessageEvent(popupLoadedMessage);
                queueMessageEvent(popupReadyMessage);

                await prewarmPromise;

                expect(retrying.isAlive()).toBe(true);
            } finally {
                retrying.destroy();
            }
        });
    });

    describe('postMessage', () => {
        it('shows the dialog, reveals the iframe and posts to the keys origin (AC-1, AC-10)', async () => {
            const { target } = startHandshake(transport);
            const message: Message = { requestId: 'req-id-1-1-1', data: {} };

            await transport.postMessage(message);

            expect(getDialog()?.hasAttribute('open')).toBe(true);
            expect(getIframe()?.style.visibility).toBe('visible');
            expect(document.body.style.overflow).toBe('hidden');
            expect(target.postMessage.mock.calls[1]).toEqual([message, urlOrigin]);
        });
    });

    describe('dismissal (AC-8)', () => {
        it('Escape rejects pending requests with 4001 and hides, keeping the iframe alive', async () => {
            startHandshake(transport);
            await transport.postMessage({ requestId: 'req-id-1-1-1', data: {} });

            const pending = transport.onMessage(() => false);

            getDialog()?.dispatchEvent(new dom.window.Event('cancel', { cancelable: true }));

            await expect(pending).rejects.toThrow(/Request rejected/);
            expect(getDialog()?.hasAttribute('open')).toBe(false);
            expect(document.body.style.overflow).toBe('');
            expect(transport.isAlive()).toBe(true);
        });

        it('reopens successfully after a dismissal', async () => {
            const { target } = startHandshake(transport);
            await transport.postMessage({ requestId: 'req-id-1-1-1', data: {} });

            getDialog()?.dispatchEvent(new dom.window.Event('cancel', { cancelable: true }));
            expect(getDialog()?.hasAttribute('open')).toBe(false);

            await transport.postMessage({ requestId: 'req-id-2-2-2', data: {} });

            expect(getDialog()?.hasAttribute('open')).toBe(true);
            expect(target.postMessage.mock.calls.length).toBe(3); // config + req-1 + req-2
        });
    });

    describe('DialogClose (AC-5b)', () => {
        it('hides on reason "completed" without rejecting pending listeners', async () => {
            startHandshake(transport);
            await transport.postMessage({ requestId: 'req-id-1-1-1', data: {} });

            let rejected = false;
            transport
                .onMessage(() => false)
                .catch(() => {
                    rejected = true;
                });

            dispatchMessageEvent({
                data: { event: 'DialogClose', data: { reason: 'completed' } },
                origin: urlOrigin,
            });
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(getDialog()?.hasAttribute('open')).toBe(false);
            expect(transport.isAlive()).toBe(true);
            expect(rejected).toBe(false);
        });

        it('rejects pending listeners on reason "cancelled" and hides', async () => {
            startHandshake(transport);
            await transport.postMessage({ requestId: 'req-id-1-1-1', data: {} });

            const pending = transport.onMessage(() => false);

            dispatchMessageEvent({
                data: { event: 'DialogClose', data: { reason: 'cancelled' } },
                origin: urlOrigin,
            });

            await expect(pending).rejects.toThrow(/Request rejected/);
            expect(getDialog()?.hasAttribute('open')).toBe(false);
        });

        it('ignores DialogClose from other origins (AC-E3)', async () => {
            startHandshake(transport);
            await transport.postMessage({ requestId: 'req-id-1-1-1', data: {} });

            dispatchMessageEvent({
                data: { event: 'DialogClose', data: { reason: 'cancelled' } },
                origin: 'https://evil.example.com',
            });
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(getDialog()?.hasAttribute('open')).toBe(true);
        });
    });

    describe('PopupUnload', () => {
        it('marks the transport not alive and hides when the iframe unloads', async () => {
            startHandshake(transport);
            await transport.postMessage({ requestId: 'req-id-1-1-1', data: {} });

            dispatchMessageEvent({
                data: { event: 'PopupUnload', id: 'unload-id' },
                origin: urlOrigin,
            });
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(transport.isAlive()).toBe(false);
            expect(getDialog()?.hasAttribute('open')).toBe(false);
        });
    });

    describe('reload (AC-2)', () => {
        it('re-runs the handshake and becomes alive again', async () => {
            const { readyPromise } = startHandshake(transport);
            await readyPromise;
            expect(transport.isAlive()).toBe(true);

            const reloadPromise = transport.reload();
            expect(transport.isAlive()).toBe(false);

            queueMessageEvent(popupLoadedMessage);
            queueMessageEvent(popupReadyMessage);
            await reloadPromise;

            expect(transport.isAlive()).toBe(true);
        });

        it('fails cleanly (no null-deref, no resurrection) when destroy() runs mid-reload (E7 race)', async () => {
            // Start a handshake that never completes, then reload (which awaits
            // the in-flight readyPromise) and destroy concurrently.
            transport = createTransport(120);
            const ready = transport.ensureReady();
            mockContentWindow();

            const reloadPromise = transport.reload();
            transport.destroy(); // nulls the iframe while reload awaits

            await expect(ready).rejects.toThrow();
            // reload must reject cleanly (never a TypeError) and must NOT
            // resurrect the destroyed transport by re-mounting a dialog.
            await expect(reloadPromise).rejects.toThrow(/destroyed during reload/i);
            expect(getDialog()).toBeNull();
            expect(transport.isAlive()).toBe(false);
        });
    });

    describe('destroy', () => {
        it('removes the dialog, rejects pending listeners and is not alive', async () => {
            const { readyPromise } = startHandshake(transport);
            await readyPromise;

            const pending = transport.onMessage(() => false);

            transport.destroy();

            await expect(pending).rejects.toThrow(/Request rejected/);
            expect(getDialog()).toBeNull();
            expect(transport.isAlive()).toBe(false);
        });

        it('is safe to call before mounting', () => {
            expect(() => createTransport().destroy()).not.toThrow();
        });
    });
});
