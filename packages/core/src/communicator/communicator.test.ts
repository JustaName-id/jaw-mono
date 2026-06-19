import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

import type { AppMetadata, JawProviderPreference } from '../provider/interface.js';
import { SDK_VERSION } from '../sdk-info.js';
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

// Dispatches a message event to simulate postMessage calls from the popup
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

// The popup echoes the PopupLoaded id back as requestId on PopupReady so the
// SDK can bind the handshake. popupLoadedMessage uses id 'popup-loaded-id'.
const popupReadyMessage = {
    data: { event: 'PopupReady', requestId: 'popup-loaded-id' },
};

/**
 * Queues a message event to be dispatched after a delay.
 *
 * This is used to simulate messages dispatched by the popup. Because there is
 * no event emitted by the SDK to denote whether it's ready to receive, this
 * leverages a simple timeout of 200ms.
 */
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

describe('Communicator', () => {
    let urlOrigin: string;
    let communicator: Communicator;
    let mockPopup: Pick<Window, 'postMessage' | 'close' | 'closed' | 'focus'>;
    let originalWindowOpen: typeof window.open;
    let originalAddEventListener: typeof window.addEventListener;
    let originalRemoveEventListener: typeof window.removeEventListener;
    let addEventListenerCallCount: number;
    let removeEventListenerCallCount: number;

    beforeEach(() => {
        // Reset call counts
        addEventListenerCallCount = 0;
        removeEventListenerCallCount = 0;

        // Store originals
        originalWindowOpen = window.open;
        originalAddEventListener = window.addEventListener;
        originalRemoveEventListener = window.removeEventListener;

        // Mock window.addEventListener and window.removeEventListener
        window.addEventListener = ((event: string, listener: EventListener) => {
            addEventListenerCallCount++;
            return originalAddEventListener.call(window, event, listener);
        }) as typeof window.addEventListener;

        window.removeEventListener = ((event: string, listener: EventListener) => {
            removeEventListenerCallCount++;
            return originalRemoveEventListener.call(window, event, listener);
        }) as typeof window.removeEventListener;

        // url defaults to JAW_KEYS_URL
        communicator = new Communicator({
            metadata: appMetadata,
            preference,
        });
        urlOrigin = new URL(JAW_KEYS_URL).origin;

        mockPopup = {
            postMessage: vi.fn(() => {
                // Mock implementation
            }),
            close: vi.fn(() => {
                // Mock implementation
            }),
            closed: false,
            focus: vi.fn(() => {
                // Mock implementation
            }),
        };

        // Mock window.open
        window.open = vi.fn(() => mockPopup as Window);
    });

    afterEach(() => {
        // Restore originals
        window.open = originalWindowOpen;
        window.addEventListener = originalAddEventListener;
        window.removeEventListener = originalRemoveEventListener;
    });

    describe('onMessage', () => {
        it('should add and remove event listener', async () => {
            const mockRequest: Message = {
                requestId: 'mock-request-id-1-2',
                data: 'test',
            };

            queueMessageEvent({ data: mockRequest as unknown as Record<string, unknown> });

            const promise = communicator.onMessage(() => true);

            expect(addEventListenerCallCount).toBe(1);
            expect(await promise).toEqual(mockRequest);
            expect(removeEventListenerCallCount).toBe(1);
        });
    });

    describe('onMessage timeout', () => {
        it('should reject after the configured timeout when no matching message arrives', async () => {
            await expect(communicator.onMessage(() => false, { timeout: 50 })).rejects.toThrow(/Timed out/);
        }, 1000);

        it('should remove its message listener when the timeout elapses', async () => {
            const before = removeEventListenerCallCount;
            await communicator.onMessage(() => false, { timeout: 50 }).catch(() => undefined);
            expect(removeEventListenerCallCount).toBe(before + 1);
        }, 1000);

        it('should resolve with the matching message when one arrives before the timeout', async () => {
            const mockRequest: Message = { requestId: 'mock-request-id-timeout-1', data: 'test' };
            queueMessageEvent({ data: mockRequest as unknown as Record<string, unknown> });

            const message = await communicator.onMessage(() => true, { timeout: 5000 });

            expect(message).toEqual(mockRequest);
        });

        it('should stay pending when no timeout is configured and nothing matches', async () => {
            const settled = vi.fn();
            communicator.onMessage(() => false).then(settled, settled);

            await new Promise((resolve) => setTimeout(resolve, 100));

            expect(settled).not.toHaveBeenCalled();
            communicator.disconnect();
        });
    });

    describe('postRequestAndWaitForResponse', () => {
        it('should post a message to the popup window and wait for response', async () => {
            const mockRequest: Message & { id: MessageID } = { id: 'mock-request-id-1-2', data: {} };

            queueMessageEvent(popupLoadedMessage);
            queueMessageEvent(popupReadyMessage);
            queueMessageEvent({
                data: {
                    requestId: mockRequest.id,
                },
            });

            const response = await communicator.postRequestAndWaitForResponse(mockRequest);

            expect((mockPopup.postMessage as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual([
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
            expect((mockPopup.postMessage as ReturnType<typeof vi.fn>).mock.calls[1]).toEqual([mockRequest, urlOrigin]);

            expect(response).toEqual({
                requestId: mockRequest.id,
            });
        });
    });

    describe('postMessage', () => {
        it('should post a response to the popup window', async () => {
            const mockResponse: Message = { requestId: 'mock-request-id-1-2', data: {} };

            queueMessageEvent(popupLoadedMessage);
            queueMessageEvent(popupReadyMessage);

            await communicator.postMessage(mockResponse);

            expect((mockPopup.postMessage as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual([
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
            expect((mockPopup.postMessage as ReturnType<typeof vi.fn>).mock.calls[1]).toEqual([
                mockResponse,
                urlOrigin,
            ]);
        });
    });

    describe('waitForPopupLoaded', () => {
        it('should open a popup window and finish handshake', async () => {
            queueMessageEvent(popupLoadedMessage);
            queueMessageEvent(popupReadyMessage);

            const popup = await communicator.waitForPopupLoaded();

            expect(window.open).toHaveBeenCalled();
            const openCall = (window.open as ReturnType<typeof vi.fn>).mock.calls[0];
            // URL might have a trailing slash when converted to string
            expect(openCall[0]).toMatch(/^https:\/\/keys\.jaw\.id\/?$/);

            expect((mockPopup.postMessage as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual([
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
            expect(popup).toBeTruthy();
        });

        it('should re-focus and return the existing popup window if one is already open', async () => {
            mockPopup = {
                postMessage: vi.fn(() => {
                    // Mock implementation
                }),
                close: vi.fn(() => {
                    // Mock implementation
                }),
                closed: false,
                focus: vi.fn(() => {
                    // Mock implementation
                }),
            };

            let callCount = 0;
            window.open = vi.fn(() => {
                callCount++;
                return mockPopup as Window;
            });

            queueMessageEvent(popupLoadedMessage);
            queueMessageEvent(popupReadyMessage);
            await communicator.waitForPopupLoaded();

            // Call again - should reuse existing popup
            await communicator.waitForPopupLoaded();

            expect((mockPopup.focus as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(1);
            expect(callCount).toBe(1);
        });

        it('should open a popup window if an existing one is defined but closed', async () => {
            let callCount = 0;
            let currentPopup = mockPopup;

            window.open = vi.fn(() => {
                callCount++;
                // Return a new popup each time
                const newPopup = {
                    postMessage: vi.fn(() => {
                        // Mock implementation
                    }),
                    close: vi.fn(() => {
                        // Mock implementation
                    }),
                    closed: false,
                    focus: vi.fn(() => {
                        // Mock implementation
                    }),
                };
                currentPopup = newPopup;
                return newPopup as unknown as Window;
            });

            queueMessageEvent(popupLoadedMessage);
            queueMessageEvent(popupReadyMessage);
            await communicator.waitForPopupLoaded();

            // Close the popup
            (currentPopup as { closed: boolean }).closed = true;

            // Create a new communicator instance to properly test the closed popup scenario
            communicator = new Communicator({
                metadata: appMetadata,
                preference,
            });

            queueMessageEvent(popupLoadedMessage);
            queueMessageEvent(popupReadyMessage);
            await communicator.waitForPopupLoaded();

            expect(callCount).toBe(2);
        });

        it('should complete the handshake when PopupReady requestId matches the PopupLoaded id', async () => {
            queueMessageEvent(popupLoadedMessage);
            queueMessageEvent({ data: { event: 'PopupReady', requestId: 'popup-loaded-id' } });

            const popup = await communicator.waitForPopupLoaded();

            expect(popup).toBeTruthy();
        });

        it('should not complete the handshake when PopupReady has a mismatched requestId', async () => {
            queueMessageEvent(popupLoadedMessage);
            queueMessageEvent({ data: { event: 'PopupReady', requestId: 'mismatched-id-a-b' } });

            const settled = vi.fn();
            communicator.waitForPopupLoaded().then(settled, settled);

            // Allow the queued events (dispatched at ~200ms) to be processed
            await new Promise((resolve) => setTimeout(resolve, 400));

            expect(settled).not.toHaveBeenCalled();
            communicator.disconnect();
        });
    });

    describe('disconnect', () => {
        it('should close the popup window and clear all listeners', async () => {
            queueMessageEvent(popupLoadedMessage);
            queueMessageEvent(popupReadyMessage);
            await communicator.waitForPopupLoaded();

            // Set up a pending message listener
            const messagePromise = communicator.onMessage(() => false);

            // Disconnect
            communicator.disconnect();

            // Verify popup was closed
            expect((mockPopup.close as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);

            // Verify the pending message listener was rejected
            try {
                await messagePromise;
                expect(true).toBe(false); // Should not reach here
            } catch (error) {
                expect((error as Error).message).toContain('Request rejected');
            }

            // Verify event listener was removed
            expect(removeEventListenerCallCount).toBeGreaterThan(0);
        });

        it('should handle disconnect when popup is already closed', () => {
            // Create a mock with closed=true
            const closedPopup = {
                postMessage: vi.fn(() => {
                    // Mock implementation
                }),
                close: vi.fn(() => {
                    // Mock implementation
                }),
                closed: true,
                focus: vi.fn(() => {
                    // Mock implementation
                }),
            };

            window.open = vi.fn(() => closedPopup as unknown as Window);

            // Should not throw
            expect(() => communicator.disconnect()).not.toThrow();
        });

        it('should handle disconnect when no popup was opened', () => {
            // Should not throw
            expect(() => communicator.disconnect()).not.toThrow();
        });

        it('should reject all pending listeners on disconnect', async () => {
            queueMessageEvent(popupLoadedMessage);
            queueMessageEvent(popupReadyMessage);
            await communicator.waitForPopupLoaded();

            // Set up multiple pending message listeners
            const messagePromise1 = communicator.onMessage(() => false);
            const messagePromise2 = communicator.onMessage(() => false);
            const messagePromise3 = communicator.onMessage(() => false);

            // Disconnect
            communicator.disconnect();

            // All should be rejected
            const results = await Promise.allSettled([messagePromise1, messagePromise2, messagePromise3]);

            results.forEach((result) => {
                expect(result.status).toBe('rejected');
                if (result.status === 'rejected') {
                    expect(result.reason.message).toContain('Request rejected');
                }
            });
        });
    });

    describe('PopupUnload event', () => {
        it('should handle PopupUnload event and disconnect', async () => {
            queueMessageEvent(popupLoadedMessage);
            queueMessageEvent(popupReadyMessage);
            queueMessageEvent({
                data: { event: 'PopupUnload', id: 'unload-id' },
            });

            await communicator.waitForPopupLoaded();

            // Wait a bit for the PopupUnload event to be processed
            await new Promise((resolve) => setTimeout(resolve, 300));

            // After PopupUnload, the popup should be closed
            expect((mockPopup.close as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(1);
        });

        it('rejects an in-flight request when the user closes the popup (regression)', async () => {
            // The dApp's response promise lives on the Communicator's listener
            // map, not the transport's. A dismissal (here: closing the popup ->
            // PopupUnload) must bridge to the facade and reject it with 4001 —
            // before the fix the transport rejected only its own listeners and
            // this promise hung forever.
            const request: Message & { id: MessageID } = { id: 'pending-dismiss-req-id-1', data: {} };

            // Handshake completes (so the request is actually posted), but no
            // requestId-matched response ever arrives — the user closes the
            // popup instead.
            queueMessageEvent(popupLoadedMessage);
            queueMessageEvent(popupReadyMessage);
            setTimeout(
                () => dispatchMessageEvent({ data: { event: 'PopupUnload', id: 'unload-id' }, origin: urlOrigin }),
                350
            );

            await expect(communicator.postRequestAndWaitForResponse(request)).rejects.toThrow(/Request rejected/);
        }, 2000);

        it('rejects an in-flight request when the popup is closed abruptly without PopupUnload (follow-up)', async () => {
            // beforeunload → PopupUnload is best-effort: a popup killed before it
            // can post the message leaves the SDK with no signal. The liveness
            // poll must catch popup.closed flipping and reject the request.
            const request: Message & { id: MessageID } = { id: 'abrupt-close-req-id-1', data: {} };

            queueMessageEvent(popupLoadedMessage);
            queueMessageEvent(popupReadyMessage);
            // The window vanishes (closed flips) but NO PopupUnload is dispatched.
            setTimeout(() => {
                (mockPopup as { closed: boolean }).closed = true;
            }, 300);

            await expect(communicator.postRequestAndWaitForResponse(request)).rejects.toThrow(/Request rejected/);
        }, 3000);

        it('should clean up listeners when PopupUnload is received', async () => {
            const initialRemoveCount = removeEventListenerCallCount;

            queueMessageEvent(popupLoadedMessage);
            queueMessageEvent(popupReadyMessage);
            queueMessageEvent({
                data: { event: 'PopupUnload', id: 'unload-id' },
            });

            await communicator.waitForPopupLoaded();

            // Wait for PopupUnload to be processed
            await new Promise((resolve) => setTimeout(resolve, 300));

            // Event listeners should have been removed (PopupLoaded and PopupUnload listeners)
            expect(removeEventListenerCallCount).toBeGreaterThan(initialRemoveCount);

            // Popup should be closed
            expect((mockPopup.close as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(1);
        });
    });
});
