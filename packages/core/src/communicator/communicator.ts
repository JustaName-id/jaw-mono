import { JAW_KEYS_URL } from '../constants.js';
import { Message, MessageID } from '../messages/message.js';
import { standardErrors } from '../errors/errors.js';

import { AppMetadata, JawProviderPreference } from '../provider/interface.js';
import { RouteContext, TransportMode } from './transport.js';
import { TransportRouter } from './transport-router.js';

export type CommunicatorOptions = {
    metadata: AppMetadata;
    preference: JawProviderPreference;
};

const VALID_TRANSPORT_MODES: readonly TransportMode[] = ['popup', 'iframe', 'auto'];

/**
 * Normalize the transport preference: unset or invalid values fall back to
 * 'popup' (the v1 default), warning once on invalid input.
 */
export function normalizeTransportMode(mode: unknown, warn: (message: string) => void = console.warn): TransportMode {
    if (mode === undefined) return 'popup';
    if (VALID_TRANSPORT_MODES.includes(mode as TransportMode)) return mode as TransportMode;
    warn(`[JAW] Invalid transportMode "${String(mode)}" — falling back to 'popup'.`);
    return 'popup';
}

/**
 * Extract the routing context from an outbound message. Only unencrypted
 * handshake messages carry a visible method (eth_requestAccounts /
 * wallet_connect — exactly the ones that may create a credential);
 * encrypted business requests route with no method, which is correct.
 */
export function getRouteContext(message: Message): RouteContext {
    const content = (message as { content?: unknown }).content;
    if (content && typeof content === 'object' && 'handshake' in content) {
        const handshake = (content as { handshake?: { method?: unknown } }).handshake;
        if (typeof handshake?.method === 'string') {
            return { method: handshake.method };
        }
    }
    return {};
}

/**
 * Communicates with the keys app (keys.jaw.id or another url) to send and
 * receive messages.
 *
 * Facade over the transport layer: the TransportRouter decides per request
 * whether the keys app is reached through a popup window or an embedded
 * iframe dialog. The message protocol is identical on both carriers.
 */
export class Communicator {
    private readonly url: URL;
    private readonly router: TransportRouter;
    private listeners = new Map<(_: MessageEvent) => void, { reject: (_: Error) => void }>();
    /** Requests awaiting a response, replayed if the dialog switches transports (AC-11). */
    private inflight = new Map<MessageID, Message & { id: MessageID }>();

    private switchListenerArmed = false;

    constructor({ metadata, preference }: CommunicatorOptions) {
        this.url = new URL(preference.keysUrl ?? JAW_KEYS_URL);
        this.router = new TransportRouter({
            url: this.url,
            metadata,
            preference,
            mode: normalizeTransportMode(preference.transportMode),
        });
    }

    /**
     * The keys dialog can ask to continue the flow in a popup (occluded UI,
     * WebAuthn-in-iframe limitations, or the user's choice). Armed lazily on
     * first business traffic.
     */
    private ensureSwitchListener(): void {
        if (this.switchListenerArmed || typeof window === 'undefined') return;
        this.switchListenerArmed = true;
        window.addEventListener('message', this.handleSwitchTransport);
    }

    /** Visible for tests. Routes SwitchTransport requests from the keys dialog. */
    handleSwitchTransport = (event: MessageEvent): void => {
        if (event.origin !== this.url.origin) return;
        const message = event.data as { event?: string } | undefined;
        if (message?.event !== 'SwitchTransport') return;

        this.router.forcePopupOnce();

        // Replay in-flight requests on the popup; their response listeners
        // are transport-agnostic (matched by requestId), so they stay armed.
        void (async () => {
            for (const request of this.inflight.values()) {
                try {
                    const transport = await this.router.acquire(getRouteContext(request));
                    await transport.postMessage(request);
                } catch {
                    // Popup blocked or failed — the original listener will
                    // surface the rejection through the normal error path.
                }
            }
        })();
    };

    /**
     * Wait for the keys app to load and complete the handshake.
     */
    async waitForPopupLoaded(): Promise<Window> {
        const transport = await this.router.acquire({});
        return transport.ensureReady();
    }

    /**
     * Mount and handshake the iframe in the background (no-op in popup mode).
     */
    async prewarm(): Promise<void> {
        await this.router.prewarm();
    }

    /**
     * Posts a message to the keys app.
     */
    postMessage = async (message: Message) => {
        this.ensureSwitchListener();
        const transport = await this.router.acquire(getRouteContext(message));
        await transport.postMessage(message);
    };

    /**
     * Post request and wait for response
     * @param request - The request message with an ID
     * @returns Promise resolving to the response message
     */
    async postRequestAndWaitForResponse<M extends Message>(request: Message & { id: MessageID }): Promise<M> {
        const responsePromise = this.onMessage<M>(({ requestId }) => requestId === request.id);
        this.inflight.set(request.id, request);
        try {
            await this.postMessage(request);
            return await responsePromise;
        } finally {
            this.inflight.delete(request.id);
        }
    }

    /**
     * Listen for messages matching predicate
     * @param predicate - Function to test if a message matches
     * @returns Promise resolving to the matching message
     */
    async onMessage<M extends Message>(predicate: (msg: Partial<M>) => boolean): Promise<M> {
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
        this.router.destroyAll();
        this.inflight.clear();

        // Clean up all listeners and their timeouts
        this.listeners.forEach(({ reject }, listener) => {
            reject(standardErrors.provider.userRejectedRequest('Request rejected'));
            window.removeEventListener('message', listener);
        });
        this.listeners.clear();
    }
}
