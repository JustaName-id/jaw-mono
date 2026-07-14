import { JAW_KEYS_URL } from '../constants.js';
import { Message, MessageID } from '../messages/message.js';
import { isValidAccountHint } from '../messages/configMessage.js';
import { standardErrors } from '../errors/errors.js';
import { account as accountStore, config as configStore } from '../store/store.js';

import { AppMetadata, JawProviderPreference } from '../provider/interface.js';
import type { JawTheme } from '../ui/theme.js';
import { TrustedHostsRegistry } from '../trusted-hosts.js';
import { RouteContext, Transport, TransportMode } from './transport.js';
import { TransportRouter } from './transport-router.js';

/**
 * How often (ms) to poll the live transport's window while awaiting a response.
 * The graceful close signal (beforeunload → PopupUnload) is best-effort: a popup
 * killed abruptly never posts it, so we poll `isAlive()` as a backstop and reject
 * the pending request rather than hang. Only runs while a request is in flight.
 */
const TRANSPORT_LIVENESS_POLL_MS = 500;

export type CommunicatorOptions = {
    metadata: AppMetadata;
    preference: JawProviderPreference;
    /** dApp theme tokens, forwarded to the keys app to match its look & feel. */
    theme?: JawTheme;
};

const VALID_TRANSPORT_MODES: readonly TransportMode[] = ['popup', 'iframe', 'auto'];

/**
 * Normalize the transport preference. Unset defaults to 'auto' (iframe
 * primary with automatic popup fallback); set 'popup' explicitly to keep the
 * legacy popup-only behavior. Invalid values fall back to 'popup' (the most
 * conservative transport), warning once.
 */
export function normalizeTransportMode(mode: unknown, warn: (message: string) => void = console.warn): TransportMode {
    if (mode === undefined) return 'auto';
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
    /**
     * Requests awaiting a response, replayed if the dialog switches transports.
     * Each entry carries the request (to re-post) and a reject handle (to fail
     * the caller if the replay transport can't be acquired — otherwise the
     * response listener, which has no timeout, would hang forever).
     */
    private inflight = new Map<MessageID, { request: Message & { id: MessageID }; reject: (error: Error) => void }>();

    private switchListenerArmed = false;

    /**
     * Trusted embedders, queried synchronously on every routing decision and
     * refreshed once (out of band) from the keys app. Fail-closed: the refresh
     * can only ever *add* operator-vetted hosts; a missing/broken endpoint
     * leaves the compiled-in baseline, so the router keeps routing untrusted
     * embedders to the popup.
     */
    private readonly trustedHosts = new TrustedHostsRegistry();

    constructor({ metadata, preference, theme }: CommunicatorOptions) {
        this.url = new URL(preference.keysUrl ?? JAW_KEYS_URL);
        this.router = new TransportRouter({
            url: this.url,
            metadata,
            preference,
            theme,
            // Handshake-time read: the hint lands in the store mid-session
            // (AccountHint after the first connect approval) and must ride
            // the next handshake, not the state at construction.
            getLastAccount: () => accountStore.get().lastAccount,
            // Read at send time so the transport config message carries the
            // dApp's own key (bootstraps the keys account screen before the
            // handshake); the handshake's rpcUrl key then takes over.
            getApiKey: () => configStore.get().apiKey,
            mode: normalizeTransportMode(preference.transportMode),
            isTrustedHostFn: (hostname) => this.trustedHosts.has(hostname),
            // Bridge transport-level dismissal (Escape, click-outside, window
            // close, keys-side cancel) to the facade: the dApp's in-flight
            // response promise lives here on `listeners`, not on the transport,
            // so a dismissal must reject it from here or it hangs forever.
            onDismiss: () => this.rejectPendingRequests(),
        });

        // Best-effort, non-blocking: routing works off the baseline until (and
        // if) this resolves. Swallow failures — refreshFrom is already fail-soft.
        void this.trustedHosts.refreshFrom(this.url).catch(() => {
            /* fail-soft: keep the baseline */
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
        window.addEventListener('message', this.handleAccountHint);
    }

    /**
     * Persists the keys app's AccountHint into the dApp-side store. The
     * embedded keys iframe's storage is partitioned (and wiped between visits
     * in Brave/Safari), so the dApp's first-party storage is the only place
     * the "last account" can durably live; the next handshake carries it back
     * as `lastAccount` so keys can seed its "Continue as" screen.
     */
    private handleAccountHint = (event: MessageEvent): void => {
        if (event.origin !== this.url.origin) return;
        if (!this.router.ownsSource(event.source)) return;
        const message = event.data as { event?: string; data?: unknown } | undefined;
        if (message?.event !== 'AccountHint') return;
        if (!isValidAccountHint(message.data)) return;

        // Persist a picked copy, never the raw wire object — anything extra
        // riding on the message must not reach storage or later handshakes.
        const { username, credentialId, publicKey } = message.data;
        accountStore.set({ lastAccount: { username, credentialId, publicKey } });
    };

    /** Routes SwitchTransport requests from the keys dialog. */
    private handleSwitchTransport = (event: MessageEvent): void => {
        if (event.origin !== this.url.origin) return;
        if (!this.router.ownsSource(event.source)) return;
        const message = event.data as { event?: string } | undefined;
        if (message?.event !== 'SwitchTransport') return;

        this.router.forcePopupOnce();

        // Replay ALL in-flight requests on the popup. We acquire the popup
        // once (the first acquire consumes the forced-popup flag) and reuse
        // it for every request, so requests after the first don't route back
        // to the now-hidden iframe. Response listeners are transport-agnostic
        // (matched by requestId), so they stay armed.
        void (async () => {
            const entries = [...this.inflight.values()];
            if (entries.length === 0) return;
            try {
                const transport = await this.router.acquire(getRouteContext(entries[0].request));
                for (const { request } of entries) {
                    await transport.postMessage(request);
                }
            } catch (error) {
                // Popup blocked or acquire failed — nothing will deliver a
                // response on the new transport, and the response listeners have
                // no timeout, so reject the in-flight requests instead of
                // leaving the callers to hang forever.
                const reason = error instanceof Error ? error : standardErrors.rpc.internal('Transport switch failed');
                for (const { reject } of entries) reject(reason);
            }
        })();
    };

    /**
     * Wait for the keys app to load and complete the handshake.
     *
     * Pass the RPC method ONLY when the outgoing message is a handshake
     * envelope — those carry the method on the wire, so the send-time acquire
     * (getRouteContext) routes by it and the transport readied here matches.
     * This matters on Safari: a connect that routes to the popup must call
     * window.open as the FIRST thing after the user's click — a method-less
     * acquire would ready the iframe instead, and the popup opened afterwards
     * (past the gesture) gets blocked.
     *
     * Encrypted envelopes route method-less; their ready must be method-less
     * too, or the two acquires diverge (Safari would open a popup while the
     * encrypted request goes to the iframe).
     */
    async waitForPopupLoaded(method?: string): Promise<Window> {
        const transport = await this.router.acquire(method !== undefined ? { method } : {});
        return transport.ensureReady();
    }

    /**
     * Push a new dApp theme to the live keys dialog (and onto future
     * handshakes), so theme changes apply without rebuilding the connector.
     */
    updateTheme(theme: JawTheme | undefined): void {
        this.router.updateTheme(theme);
    }

    /**
     * Mount and handshake the iframe in the background (no-op in popup mode).
     */
    async prewarm(): Promise<void> {
        await this.router.prewarm();
    }

    /**
     * Force the next acquire onto the live iframe (Safari session reconnect).
     * Used by the signer to direct a credential-*get* reconnect handshake at the
     * iframe instead of the popup. See TransportRouter.forceIframeReconnectOnce.
     */
    forceIframeReconnect(): void {
        this.router.forceIframeReconnectOnce();
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
        const { promise, cancel, reject } = this.listenForMessage<M>(({ requestId }) => requestId === request.id);
        this.inflight.set(request.id, { request, reject });
        try {
            // Inline postMessage to keep the acquired transport handle: we poll
            // its window for an abrupt close (popup killed before it can post
            // PopupUnload) so the request rejects instead of hanging.
            this.ensureSwitchListener();
            const transport = await this.router.acquire(getRouteContext(request));
            await transport.postMessage(request);
            return await this.awaitResponseOrClosed(transport, promise);
        } catch (error) {
            // postMessage failed (popup blocked, handshake timeout, acquire
            // error): tear down the orphaned response listener so it doesn't
            // leak until disconnect().
            cancel();
            throw error;
        } finally {
            this.inflight.delete(request.id);
        }
    }

    /**
     * Resolve with the response, or reject with UserRejectedRequest (4001) if
     * the transport's window dies before it arrives. Backstops the best-effort
     * PopupUnload signal (a popup closed abruptly never posts it). The interval
     * is always cleared on settle, so nothing leaks past the request.
     */
    private awaitResponseOrClosed<M extends Message>(transport: Transport, response: Promise<M>): Promise<M> {
        return new Promise<M>((resolve, reject) => {
            let settled = false;
            const finish = (run: () => void): void => {
                if (settled) return;
                settled = true;
                clearInterval(poller);
                run();
            };
            const poller = setInterval(() => {
                if (!transport.isAlive()) {
                    finish(() => reject(standardErrors.provider.userRejectedRequest('Request rejected')));
                }
            }, TRANSPORT_LIVENESS_POLL_MS);
            response.then(
                (value) => finish(() => resolve(value)),
                (error) => finish(() => reject(error))
            );
        });
    }

    /**
     * Listen for messages matching predicate
     * @param predicate - Function to test if a message matches
     * @param options.timeout - Optional ms timeout; rejects and cleans up on expiry. Omit to wait indefinitely.
     * @returns Promise resolving to the matching message
     */
    async onMessage<M extends Message>(
        predicate: (msg: Partial<M>) => boolean,
        { timeout }: { timeout?: number } = {}
    ): Promise<M> {
        return this.listenForMessage<M>(predicate, { timeout }).promise;
    }

    /**
     * Register an origin/source-validated message listener, returning the
     * matching promise plus a cancel handle that removes the listener without
     * resolving (used to clean up when the request never gets sent).
     */
    private listenForMessage<M extends Message>(
        predicate: (msg: Partial<M>) => boolean,
        { timeout }: { timeout?: number } = {}
    ): {
        promise: Promise<M>;
        cancel: () => void;
        reject: (error: Error) => void;
    } {
        let listener!: (event: MessageEvent) => void;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let rejectFn!: (error: Error) => void;

        // Remove the listener and clear the timeout on any settle path.
        const cleanup = () => {
            window.removeEventListener('message', listener);
            this.listeners.delete(listener);
            if (timer !== undefined) clearTimeout(timer);
        };

        const promise = new Promise<M>((resolve, reject) => {
            listener = (event: MessageEvent) => {
                // Validate origin and source (an owned transport window)
                if (event.origin !== this.url.origin) return;
                if (!this.router.ownsSource(event.source)) return;

                const message = event.data;
                if (predicate(message)) {
                    cleanup();
                    resolve(message);
                }
            };
            window.addEventListener('message', listener);
            rejectFn = (error: Error) => {
                cleanup();
                reject(error);
            };
            this.listeners.set(listener, { reject: rejectFn });

            if (timeout !== undefined && timeout !== Infinity) {
                timer = setTimeout(() => {
                    this.listeners
                        .get(listener)
                        ?.reject(standardErrors.rpc.internal('Timed out waiting for popup message'));
                }, timeout);
            }
        });

        const cancel = () => cleanup();

        return { promise, cancel, reject: rejectFn };
    }

    /**
     * Reject every in-flight dApp request with UserRejectedRequest (4001) and
     * clear the pending state. Used both when the user dismisses the dialog
     * (via the transport `onDismiss` bridge) and on full {@link disconnect}.
     * Each reject() cleans up its own listener via cleanup().
     */
    private rejectPendingRequests(): void {
        this.inflight.clear();
        this.listeners.forEach(({ reject }) => {
            reject(standardErrors.provider.userRejectedRequest('Request rejected'));
        });
        this.listeners.clear();
    }

    /**
     * Cleanup all resources
     */
    disconnect(): void {
        this.router.destroyAll();

        if (this.switchListenerArmed) {
            window.removeEventListener('message', this.handleSwitchTransport);
            window.removeEventListener('message', this.handleAccountHint);
            this.switchListenerArmed = false;
        }

        this.rejectPendingRequests();
    }
}
