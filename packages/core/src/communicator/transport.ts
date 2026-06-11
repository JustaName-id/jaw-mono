import { Message } from '../messages/message.js';
import { AppMetadata, JawProviderPreference } from '../provider/interface.js';

export type TransportKind = 'popup' | 'iframe';

/**
 * Transport selection for CrossPlatform mode.
 * - 'popup': window.open to the keys URL (current behavior, default).
 * - 'iframe': embedded dialog primary, automatic popup fallback.
 * - 'auto': alias of 'iframe' in v1; reserved to become the default later.
 */
export type TransportMode = 'popup' | 'iframe' | 'auto';

export type TransportOptions = {
    /** Keys origin, from preference.keysUrl ?? JAW_KEYS_URL */
    url: URL;
    metadata: AppMetadata;
    preference: JawProviderPreference;
};

/**
 * Contract every transport (popup, iframe) fulfills. The carrier changes;
 * the message protocol, handshake order and encryption do not.
 */
export interface Transport {
    readonly kind: TransportKind;

    /**
     * Ensure the target window exists and has completed the handshake
     * (loaded -> config -> ready). Idempotent: returns the existing window
     * if alive. Rejects when the popup is blocked (PopupTransport) or the
     * handshake times out (IframeTransport).
     */
    ensureReady(): Promise<Window>;

    /** Post to the target window with explicit targetOrigin = url.origin. Never '*'. */
    postMessage(message: Message): Promise<void>;

    /**
     * Target window is alive:
     * popup -> !popup.closed; iframe -> element.isConnected && handshake valid.
     */
    isAlive(): boolean;

    /**
     * Hide/close UI, reject all pending listeners with
     * UserRejectedRequest (4001), release resources.
     */
    destroy(): void;
}

/** Additional surface of the iframe transport. */
export interface IframeTransport extends Transport {
    readonly kind: 'iframe';

    /** Mount hidden + run handshake without showing UI. No-op if already mounted. */
    prewarm(): Promise<void>;

    /** Make the dialog visible (showModal, scroll lock, focus capture). */
    show(): void;

    /** Hide the dialog without destroying the iframe. */
    hide(): void;

    /** Reset iframe.src to resync storage after a popup-fallback flow. Re-runs handshake. */
    reload(): Promise<void>;
}

export type RouteContext = {
    /** RPC method of the pending request, if any. */
    method?: string;
};

/**
 * Picks the transport per request based on preference, browser capability
 * and security checks. See contracts/transport-interface.md for the
 * normative routing table.
 */
export interface TransportRouter {
    /** Resolve which transport handles this request. Pure decision, no side effects. */
    route(ctx: RouteContext): TransportKind;

    /** Acquire the routed, ready transport. Serializes cross-transport concurrency. */
    acquire(ctx: RouteContext): Promise<Transport>;

    destroyAll(): void;
}
