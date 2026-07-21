import { Message } from '../messages/message.js';
import type { AccountHintData } from '../messages/configMessage.js';
import { AppMetadata, JawProviderPreference } from '../provider/interface.js';
import type { JawTheme } from '../ui/theme.js';

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
    /** dApp theme tokens, forwarded to the keys app so the dialog matches its look & feel. */
    theme?: JawTheme;
    /**
     * Returns the last account the user connected with (persisted dApp-side
     * from the keys app's AccountHint), sent on the handshake as
     * `lastAccount`. A getter — not a value — because the hint can be stored
     * mid-session (first connect) and must ride the next handshake/reload.
     * The keys app uses it to seed its "Continue as" screen when its own
     * (partitioned, Brave/Safari-ephemeral) storage came up empty.
     */
    getLastAccount?: () => AccountHintData | undefined;
    /**
     * Returns the dApp's API key (from the SDK store), sent on the transport
     * config message so the keys app can bootstrap its account screen before the
     * handshake arrives. A getter — read at send time, not captured — and always
     * the dApp's own key, never a keys-app fallback (which would misattribute ENS
     * subname issuance and billing). The handshake's chain.rpcUrl key overrides
     * it as the authoritative source.
     */
    getApiKey?: () => string | undefined;
    /**
     * Invoked when the user dismisses the dialog/popup (Escape, click-outside,
     * window close, or a keys-side cancel) — i.e. any close that is NOT a
     * requestId-matched response. The facade (Communicator) wires this to reject
     * its own pending requests with UserRejectedRequest (4001), because the
     * dApp's in-flight promise lives on the facade, not on the transport's
     * listener map. Without it, a dismissal leaves the request hanging forever.
     */
    onDismiss?: () => void;
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
     * Whether a received message's `event.source` belongs to this transport's
     * target window. Tolerant of a null source (synthetic events) so the check
     * enforces in real browsers without breaking on engines/tests that omit it.
     */
    matchesSource(source: MessageEventSource | null): boolean;

    /**
     * Push a new dApp theme to the live target window and carry it on the next
     * handshake/reload. Best-effort: if the keys app is not ready yet, the
     * updated theme rides the handshake config instead of a live message.
     */
    setTheme(theme: JawTheme | undefined): void;

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
 * and security checks.
 */
export interface TransportRouter {
    /** Resolve which transport handles this request. Pure decision, no side effects. */
    route(ctx: RouteContext): TransportKind;

    /** Acquire the routed, ready transport. Serializes cross-transport concurrency. */
    acquire(ctx: RouteContext): Promise<Transport>;

    /** Whether a message's source belongs to any currently-owned transport window. */
    ownsSource(source: MessageEventSource | null): boolean;

    /** Push a new dApp theme to the live transport(s) and onto future handshakes. */
    updateTheme(theme: JawTheme | undefined): void;

    destroyAll(): void;
}
