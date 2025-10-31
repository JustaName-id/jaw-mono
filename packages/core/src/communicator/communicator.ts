import { JAW_KEYS_URL } from '../constants.js';
import { SDK_VERSION } from '../sdk-info.js';
import { Message, MessageID } from '../messages/message.js';
import { standardErrors } from '../errors/errors.js';

import {AppMetadata, JawProviderPreference} from '../provider/interface.js';
import {ConfigMessage} from "../messages/configMessage.js";

export type CommunicatorOptions = {
    metadata: AppMetadata;
    preference: JawProviderPreference;
};

// Constants
const POPUP_WIDTH = 420;
const POPUP_HEIGHT = 730;

/**
 * Communicates with a popup window for JAW keys.jaw.id (or another url)
 * to send and receive messages.
 *
 * This class is responsible for opening a popup window, posting messages to it,
 * and listening for responses.
 *
 * It also handles cleanup of event listeners and the popup window itself when necessary.
 */
export class Communicator {
    private readonly metadata: AppMetadata;
    private readonly preference: JawProviderPreference;
    private readonly url: URL;
    private popup: Window | null = null;
    private listeners = new Map<(_: MessageEvent) => void, { reject: (_: Error) => void }>();

    constructor({ metadata, preference }: CommunicatorOptions) {
        this.url = new URL(preference.keysUrl ?? JAW_KEYS_URL);
        this.metadata = metadata;
        this.preference = preference;
    }

    /**
     * Wait for popup to load
     */
    async waitForPopupLoaded(): Promise<Window> {
        // If popup exists and is not closed, return it
        if (this.popup && !this.popup.closed) {
            this.popup.focus();
            return this.popup;
        }

        this.popup = await this.openPopup();

        this.onMessage<ConfigMessage>(({ event }) => event === 'PopupUnload')
            .then(() => {
                this.disconnect();
            })
            .catch(() => { /* empty */ });


        return this.onMessage<ConfigMessage>(({ event }) => event === 'PopupLoaded')
            .then((message) => {
                this.postMessage({
                    requestId: message.id,
                    data: {
                        version: SDK_VERSION,
                        metadata: this.metadata,
                        preference: this.preference,
                        location: window.location.toString()
                    },
                });
            })
            .then(() => {
                if (!this.popup) throw standardErrors.rpc.internal();
                return this.popup;
            });
    }

    /**
     * Open popup window
     */
    private async openPopup(): Promise<Window> {
        const left = Math.max(0, (window.screen.width - POPUP_WIDTH) / 2);
        const top = Math.max(0, (window.screen.height - POPUP_HEIGHT) / 2);

        const popupId = `jaw_${crypto.randomUUID()}`;

        const popup = window.open(
            this.url.toString(),
            popupId,
            `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top}`
        );

        if (!popup) {
            throw standardErrors.provider.userRejectedRequest(
                'Failed to open popup. Please allow popups for this site.'
            );
        }

        popup.focus();
        return popup;
    }

    /**
     * Posts a message to the popup window
     */
    postMessage = async (message: Message) => {
        const popup = await this.waitForPopupLoaded();

        popup.postMessage(message, this.url.origin);
    };

    /**
     * Post request and wait for response
     * @param request - The request message with an ID
     * @returns Promise resolving to the response message
     */
    async postRequestAndWaitForResponse<M extends Message>(
        request: Message & { id: MessageID }
    ): Promise<M> {
        const responsePromise = this.onMessage<M>(({ requestId }) => requestId === request.id);
        await this.postMessage(request);
        return await responsePromise;
    }

    /**
     * Listen for messages matching predicate
     * @param predicate - Function to test if a message matches
     * @param timeout - Timeout in milliseconds (default: defaultTimeout)
     * @returns Promise resolving to the matching message
     */
    async onMessage<M extends Message>(
        predicate: (msg: Partial<M>) => boolean
    ): Promise<M> {
        return new Promise((resolve, reject) => {
            const listener = (event: MessageEvent) => {
                // Validate origin
                if (event.origin !== this.url.origin) return;

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

    /**
     * Cleanup all resources
     */
    disconnect(): void {
        if (this.popup && !this.popup.closed) {
            this.popup.close();
        }
        this.popup = null;

        // Clean up all listeners and their timeouts
        this.listeners.forEach(({ reject }, listener) => {
            reject(standardErrors.provider.userRejectedRequest('Request rejected'));
            window.removeEventListener('message', listener);
        });
        this.listeners.clear();
    }
}