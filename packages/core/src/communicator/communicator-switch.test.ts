import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

import type { AppMetadata, JawProviderPreference } from '../provider/interface.js';
import type { Message, MessageID } from '../messages/message.js';
import { Communicator } from './communicator.js';
import { JAW_KEYS_URL } from '../constants.js';

// Set up jsdom environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost:3000/',
});
global.window = dom.window as unknown as Window & typeof globalThis;
global.document = dom.window.document;
global.MessageEvent = dom.window.MessageEvent;

const urlOrigin = new URL(JAW_KEYS_URL).origin;

function dispatchMessageEvent({ data, origin }: { data: unknown; origin: string }) {
    window.dispatchEvent(new MessageEvent('message', { data, origin }));
}

function queueMessageEvent({
    data,
    origin = urlOrigin,
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

describe('Communicator SwitchTransport handling (AC-11)', () => {
    let communicator: Communicator;
    let mockPopup: Pick<Window, 'postMessage' | 'close' | 'closed' | 'focus'>;
    let originalWindowOpen: typeof window.open;

    beforeEach(() => {
        originalWindowOpen = window.open;
        communicator = new Communicator({ metadata: appMetadata, preference });

        mockPopup = {
            postMessage: vi.fn(),
            close: vi.fn(),
            closed: false,
            focus: vi.fn(),
        };
        window.open = vi.fn(() => mockPopup as Window);
    });

    afterEach(() => {
        communicator.disconnect();
        window.open = originalWindowOpen;
    });

    it('replays in-flight requests after a SwitchTransport message', async () => {
        const request: Message & { id: MessageID } = { id: 'req-id-1-1-1', data: {} };

        queueMessageEvent({ data: { event: 'PopupLoaded', id: 'popup-loaded-id' } });
        queueMessageEvent({ data: { event: 'PopupReady' } });

        const responsePromise = communicator.postRequestAndWaitForResponse(request);

        // Wait for the handshake + initial post to complete
        await vi.waitFor(() => {
            const posted = (mockPopup.postMessage as ReturnType<typeof vi.fn>).mock.calls;
            expect(posted.length).toBe(2); // config + request
        });

        // Keys dialog asks to continue in a popup
        dispatchMessageEvent({
            data: { event: 'SwitchTransport', data: { to: 'popup', reason: 'user' } },
            origin: urlOrigin,
        });

        // The same request is re-posted (popup already open in popup mode)
        await vi.waitFor(() => {
            const posted = (mockPopup.postMessage as ReturnType<typeof vi.fn>).mock.calls;
            expect(posted.length).toBe(3);
            expect(posted[2][0]).toEqual(request);
        });

        // The original response listener is still armed
        dispatchMessageEvent({ data: { requestId: request.id }, origin: urlOrigin });
        await expect(responsePromise).resolves.toEqual({ requestId: request.id });
    });

    it('ignores SwitchTransport messages from other origins (AC-E3)', async () => {
        const request: Message & { id: MessageID } = { id: 'req-id-2-2-2', data: {} };

        queueMessageEvent({ data: { event: 'PopupLoaded', id: 'popup-loaded-id' } });
        queueMessageEvent({ data: { event: 'PopupReady' } });

        const responsePromise = communicator.postRequestAndWaitForResponse(request);

        await vi.waitFor(() => {
            expect((mockPopup.postMessage as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
        });

        dispatchMessageEvent({
            data: { event: 'SwitchTransport', data: { to: 'popup', reason: 'user' } },
            origin: 'https://evil.example.com',
        });

        await new Promise((resolve) => setTimeout(resolve, 50));
        expect((mockPopup.postMessage as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);

        dispatchMessageEvent({ data: { requestId: request.id }, origin: urlOrigin });
        await responsePromise;
    });

    it('settled requests are not replayed', async () => {
        const request: Message & { id: MessageID } = { id: 'req-id-3-3-3', data: {} };

        queueMessageEvent({ data: { event: 'PopupLoaded', id: 'popup-loaded-id' } });
        queueMessageEvent({ data: { event: 'PopupReady' } });
        queueMessageEvent({ data: { requestId: request.id } });

        await communicator.postRequestAndWaitForResponse(request);

        dispatchMessageEvent({
            data: { event: 'SwitchTransport', data: { to: 'popup', reason: 'user' } },
            origin: urlOrigin,
        });

        await new Promise((resolve) => setTimeout(resolve, 50));
        // config + original request only — nothing replayed
        expect((mockPopup.postMessage as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
    });
});
