import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

import type { AppMetadata, JawProviderPreference } from '../provider/interface.js';
import type { Message, MessageID } from '../messages/message.js';
import { Communicator } from './communicator.js';
import { JAW_KEYS_URL } from '../constants.js';
import { sdkstore, store } from '../store/store.js';

/** Full reset: account.clear() deliberately preserves lastAccount, tests must not. */
function resetAccountSlice() {
    sdkstore.setState((state) => ({ ...state, account: {} }));
}

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

function queueMessageEvent({ data, origin = urlOrigin }: { data: Record<string, unknown>; origin?: string }) {
    setTimeout(() => dispatchMessageEvent({ data, origin }), 200);
}

const appMetadata: AppMetadata = {
    appName: 'Test App',
    appLogoUrl: null,
    defaultChainId: 1,
};

const preference: JawProviderPreference = { keysUrl: JAW_KEYS_URL };

const validHint = {
    address: '0x1234567890abcdef1234567890abcdef12345678',
    username: 'ghadi.jaw.id',
    credentialId: 'A1b2-C3d4_E5f6',
    publicKey: '0xdeadbeef',
};

/**
 * The keys app posts an AccountHint after the user approves a connection. The
 * Communicator must persist it into the dApp-side store — the only storage
 * that survives Brave/Safari wiping the embedded keys app's partitioned
 * storage — so the next handshake can seed the "Continue as" screen.
 */
describe('Communicator AccountHint handling', () => {
    let communicator: Communicator;
    let mockPopup: Pick<Window, 'postMessage' | 'close' | 'closed' | 'focus'>;
    let originalWindowOpen: typeof window.open;

    /** Complete a round-trip so a transport exists and the config listener is armed. */
    async function completeFlow(id: MessageID) {
        const request: Message & { id: MessageID } = { id, data: {} };
        queueMessageEvent({ data: { event: 'PopupLoaded', id: 'popup-loaded-id' } });
        queueMessageEvent({ data: { event: 'PopupReady', requestId: 'popup-loaded-id' } });
        queueMessageEvent({ data: { requestId: request.id } });
        await communicator.postRequestAndWaitForResponse(request);
    }

    beforeEach(() => {
        originalWindowOpen = window.open;
        resetAccountSlice();
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
        resetAccountSlice();
        window.open = originalWindowOpen;
    });

    it('persists a valid AccountHint from the keys origin into the store', async () => {
        await completeFlow('req-hint-1-1-1');

        dispatchMessageEvent({
            data: { event: 'AccountHint', data: validHint },
            origin: urlOrigin,
        });

        await vi.waitFor(() => {
            expect(store.account.get().lastAccount).toEqual(validHint);
        });
    });

    it('ignores AccountHint messages from other origins', async () => {
        await completeFlow('req-hint-2-2-2');

        dispatchMessageEvent({
            data: { event: 'AccountHint', data: validHint },
            origin: 'https://evil.example.com',
        });

        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(store.account.get().lastAccount).toBeUndefined();
    });

    it('ignores malformed AccountHint payloads', async () => {
        await completeFlow('req-hint-3-3-3');

        dispatchMessageEvent({
            data: { event: 'AccountHint', data: { ...validHint, address: 'not-an-address' } },
            origin: urlOrigin,
        });
        dispatchMessageEvent({
            data: { event: 'AccountHint', data: null },
            origin: urlOrigin,
        });

        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(store.account.get().lastAccount).toBeUndefined();
    });

    it('overwrites a previously stored hint with the latest one', async () => {
        await completeFlow('req-hint-4-4-4');

        dispatchMessageEvent({
            data: { event: 'AccountHint', data: validHint },
            origin: urlOrigin,
        });
        const newer = { ...validHint, username: 'newer.jaw.id' };
        dispatchMessageEvent({
            data: { event: 'AccountHint', data: newer },
            origin: urlOrigin,
        });

        await vi.waitFor(() => {
            expect(store.account.get().lastAccount).toEqual(newer);
        });
    });

    it('stops persisting hints after disconnect', async () => {
        await completeFlow('req-hint-5-5-5');
        communicator.disconnect();

        dispatchMessageEvent({
            data: { event: 'AccountHint', data: validHint },
            origin: urlOrigin,
        });

        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(store.account.get().lastAccount).toBeUndefined();
    });
});
