import { SDK_VERSION } from '../sdk-info.js';
import { Message, MessageID } from '../messages/message.js';
import { ConfigMessage } from '../messages/configMessage.js';
import { standardErrors } from '../errors/errors.js';
import { isMobile } from '../utils/user-agent.js';
import { Transport, TransportOptions } from './transport.js';

const POPUP_WIDTH = 420;
const POPUP_HEIGHT = 730;

/**
 * Popup transport: window.open to the keys URL.
 *
 * Extracted from Communicator with behavior intentionally identical:
 * same window features, same handshake (PopupLoaded -> config -> PopupReady),
 * same teardown semantics. The Communicator facade delegates here.
 */
export class PopupTransport implements Transport {
    readonly kind = 'popup' as const;

    private readonly url: URL;
    private readonly options: TransportOptions;
    private popup: Window | null = null;
    private listeners = new Map<(_: MessageEvent) => void, { reject: (_: Error) => void }>();

    constructor(options: TransportOptions) {
        this.url = options.url;
        this.options = options;
    }

    /**
     * Open the popup (if needed) and complete the handshake.
     */
    async ensureReady(): Promise<Window> {
        // If popup exists and is not closed, return it
        if (this.popup && !this.popup.closed) {
            this.popup.focus();
            return this.popup;
        }

        this.popup = this.openPopup();

        this.onMessage<ConfigMessage>(({ event }) => event === 'PopupUnload')
            .then(() => {
                this.destroy();
            })
            .catch(() => {
                /* empty */
            });

        return this.onMessage<ConfigMessage>(({ event }) => event === 'PopupLoaded')
            .then((message) => {
                this.postToTarget({
                    requestId: message.id,
                    data: {
                        version: SDK_VERSION,
                        metadata: this.options.metadata,
                        preference: this.options.preference,
                        theme: this.options.theme,
                        location: window.location.toString(),
                    },
                });
            })
            .then(() => {
                // Wait for popup to signal it's ready
                return this.onMessage<ConfigMessage>(({ event }) => event === 'PopupReady');
            })
            .then(() => {
                if (!this.popup) throw standardErrors.rpc.internal();
                return this.popup;
            });
    }

    /**
     * Posts a message to the popup window, opening it first if necessary.
     */
    postMessage = async (message: Message): Promise<void> => {
        const popup = await this.ensureReady();
        popup.postMessage(message, this.url.origin);
    };

    isAlive(): boolean {
        return this.popup !== null && !this.popup.closed;
    }

    /**
     * Listen for messages from the keys origin matching a predicate.
     */
    async onMessage<M extends Message>(predicate: (msg: Partial<M>) => boolean): Promise<M> {
        return new Promise((resolve, reject) => {
            const listener = (event: MessageEvent) => {
                // Validate origin and source (the popup we opened)
                if (event.origin !== this.url.origin) return;
                if (!this.matchesSource(event.source)) return;

                const message = event.data;
                if (predicate(message)) {
                    resolve(message);
                    window.removeEventListener('message', listener);
                    this.listeners.delete(listener);
                }
            };

            window.addEventListener('message', listener);
            this.listeners.set(listener, { reject });
        });
    }

    matchesSource(source: MessageEventSource | null): boolean {
        // Tolerant of a null source (synthetic events): enforce only when present.
        return !source || source === this.popup;
    }

    /**
     * Post request and wait for the matching response.
     */
    async postRequestAndWaitForResponse<M extends Message>(request: Message & { id: MessageID }): Promise<M> {
        const responsePromise = this.onMessage<M>(({ requestId }) => requestId === request.id);
        await this.postMessage(request);
        return await responsePromise;
    }

    /**
     * Close the popup, reject all pending listeners, release resources.
     */
    destroy(): void {
        if (this.popup && !this.popup.closed) {
            this.popup.close();
        }
        this.popup = null;

        this.listeners.forEach(({ reject }, listener) => {
            reject(standardErrors.provider.userRejectedRequest('Request rejected'));
            window.removeEventListener('message', listener);
        });
        this.listeners.clear();
    }

    /**
     * Posts directly to the already-open popup (handshake internals).
     */
    private postToTarget(message: Message): void {
        if (!this.popup) throw standardErrors.rpc.internal();
        this.popup.postMessage(message, this.url.origin);
    }

    private openPopup(): Window {
        const popupId = `jaw_${crypto.randomUUID()}`;

        // On mobile, a sized popup window is hostile (tiny, often blocked or
        // backgrounded) — open as a full tab instead by omitting the window
        // features. Desktop keeps the centered popup.
        let popup: Window | null;
        if (isMobile()) {
            popup = window.open(this.url.toString(), popupId);
        } else {
            const left = Math.max(0, (window.screen.width - POPUP_WIDTH) / 2);
            const top = Math.max(0, (window.screen.height - POPUP_HEIGHT) / 2);
            popup = window.open(
                this.url.toString(),
                popupId,
                `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top}`
            );
        }

        if (!popup) {
            throw standardErrors.provider.userRejectedRequest(
                'Failed to open popup. Please allow popups for this site.'
            );
        }

        popup.focus();
        return popup;
    }
}
