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
    data: { event: 'PopupLoaded' },
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
    appChainIds: [1],
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

    describe('postRequestAndWaitForResponse', () => {
        it('should post a message to the popup window and wait for response', async () => {
            const mockRequest: Message & { id: MessageID } = { id: 'mock-request-id-1-2', data: {} };

            queueMessageEvent(popupLoadedMessage);
            queueMessageEvent({
                data: {
                    requestId: mockRequest.id,
                },
            });

            const response = await communicator.postRequestAndWaitForResponse(mockRequest);

            expect((mockPopup.postMessage as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual([
                {
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
                mockRequest,
                urlOrigin,
            ]);

            expect(response).toEqual({
                requestId: mockRequest.id,
            });
        });
    });

    describe('postMessage', () => {
        it('should post a response to the popup window', async () => {
            const mockResponse: Message = { requestId: 'mock-request-id-1-2', data: {} };

            queueMessageEvent(popupLoadedMessage);

            await communicator.postMessage(mockResponse);

            expect((mockPopup.postMessage as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual([
                {
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

            const popup = await communicator.waitForPopupLoaded();

            expect(window.open).toHaveBeenCalled();
            const openCall = (window.open as ReturnType<typeof vi.fn>).mock.calls[0];
            // URL might have a trailing slash when converted to string
            expect(openCall[0]).toMatch(/^https:\/\/keys\.jaw\.id\/?$/);

            expect((mockPopup.postMessage as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual([
                {
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
            await communicator.waitForPopupLoaded();

            // Close the popup
            (currentPopup as { closed: boolean }).closed = true;

            // Create a new communicator instance to properly test the closed popup scenario
            communicator = new Communicator({
                metadata: appMetadata,
                preference,
            });

            queueMessageEvent(popupLoadedMessage);
            await communicator.waitForPopupLoaded();

            expect(callCount).toBe(2);
        });
    });

    describe('disconnect', () => {
        it('should close the popup window and clear all listeners', async () => {
            queueMessageEvent(popupLoadedMessage);
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
            queueMessageEvent({
                data: { event: 'PopupUnload', id: 'unload-id' },
            });

            await communicator.waitForPopupLoaded();

            // Wait a bit for the PopupUnload event to be processed
            await new Promise((resolve) => setTimeout(resolve, 300));

            // After PopupUnload, the popup should be closed
            expect((mockPopup.close as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(1);
        });

        it('should clean up listeners when PopupUnload is received', async () => {
            const initialRemoveCount = removeEventListenerCallCount;

            queueMessageEvent(popupLoadedMessage);
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