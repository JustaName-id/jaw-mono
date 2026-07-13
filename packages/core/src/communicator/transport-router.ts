import {
    RouteContext,
    Transport,
    TransportKind,
    TransportMode,
    TransportOptions,
    TransportRouter as TransportRouterContract,
} from './transport.js';
import { PopupTransport } from './popup-transport.js';
import { IframeTransport } from './iframe-transport.js';
import { isSafari, supportsIOv2 } from '../utils/user-agent.js';
import { isTrustedHost } from '../trusted-hosts.js';
import type { JawTheme } from '../ui/theme.js';

/** Methods that may create a passkey — unsupported in Safari cross-origin iframes. */
export const CREDENTIAL_CREATING_METHODS: readonly string[] = ['eth_requestAccounts', 'wallet_connect'];

type RouteReason =
    | 'mode-popup' // transportMode unset or 'popup'
    | 'insecure-protocol' // host page is not a secure HTTPS origin
    | 'safari-credential-method' // Safari cannot create passkeys in iframes
    | 'clickjacking-guard' // visibility not verifiable and host not trusted
    | 'iframe'; // default: embedded dialog

export type TransportRouterConfig = TransportOptions & {
    /** Transport preference (default: 'popup'). 'auto' is an alias of 'iframe' in v1. */
    mode?: TransportMode;

    // Injection points for tests — production uses the real implementations.
    createPopupTransport?: (options: TransportOptions) => PopupTransport;
    createIframeTransport?: (options: TransportOptions) => IframeTransport;
    isSafariFn?: () => boolean;
    supportsIOv2Fn?: () => boolean;
    isTrustedHostFn?: (hostname: string) => boolean;
    /** Secure-context check (true on HTTPS and localhost — WebAuthn requirement). */
    isSecureContextFn?: () => boolean;
    /**
     * HTTPS-origin check. Distinct from the secure-context check: `http://localhost`
     * is a secure context but not HTTPS, so the iframe requires both — a plain-http
     * dev server falls back to popup.
     */
    isHttpsFn?: () => boolean;
    getLocation?: () => { hostname: string };
};

/**
 * Picks the transport per request. Routing rules, evaluated in order
 * (first match wins):
 *
 *  1. mode unset or 'popup'                          -> popup
 *  2. host page not a secure HTTPS origin            -> popup (+ one warning)
 *  3. Safari and the method may create a credential  -> popup, iframe resyncs after
 *  4. no IOv2 and embedder not trusted               -> popup
 *  5. otherwise                                      -> iframe
 */
export class TransportRouter implements TransportRouterContract {
    private readonly options: TransportOptions;
    private readonly mode: TransportMode;
    private readonly createPopup: (options: TransportOptions) => PopupTransport;
    private readonly createIframe: (options: TransportOptions) => IframeTransport;
    private readonly isSafariFn: () => boolean;
    private readonly supportsIOv2Fn: () => boolean;
    private readonly isTrustedHostFn: (hostname: string) => boolean;
    private readonly isSecureContextFn: () => boolean;
    private readonly isHttpsFn: () => boolean;
    private readonly getLocation: () => { hostname: string };

    private popup: PopupTransport | null = null;
    private iframe: IframeTransport | null = null;

    /** Iframe must resync (reload) before its next use after a popup-fallback flow. */
    private pendingIframeReload = false;
    /** Next acquire is forced to popup (user/dialog requested a transport switch). */
    private popupForced = false;
    /** Next acquire is forced to the (live) iframe for a session reconnect. */
    private iframeReconnectForced = false;
    private warnedInsecure = false;

    /** Serializes acquires: no parallel popup + iframe setup races. */
    private queue: Promise<unknown> = Promise.resolve();

    constructor(config: TransportRouterConfig) {
        this.options = {
            url: config.url,
            metadata: config.metadata,
            preference: config.preference,
            theme: config.theme,
            getLastAccount: config.getLastAccount,
            getApiKey: config.getApiKey,
            onDismiss: config.onDismiss,
        };
        this.mode = config.mode ?? 'popup';
        this.createPopup = config.createPopupTransport ?? ((options) => new PopupTransport(options));
        this.createIframe = config.createIframeTransport ?? ((options) => new IframeTransport(options));
        this.isSafariFn = config.isSafariFn ?? isSafari;
        this.supportsIOv2Fn = config.supportsIOv2Fn ?? supportsIOv2;
        this.isTrustedHostFn = config.isTrustedHostFn ?? isTrustedHost;
        this.isSecureContextFn = config.isSecureContextFn ?? (() => window.isSecureContext);
        this.isHttpsFn = config.isHttpsFn ?? (() => window.location.protocol === 'https:');
        this.getLocation = config.getLocation ?? (() => ({ hostname: window.location.hostname }));
    }

    /**
     * Resolve which transport handles this request. Pure decision, no side effects.
     */
    route(ctx: RouteContext): TransportKind {
        return this.decide(ctx).kind;
    }

    /**
     * Acquire the routed, ready transport. Calls are serialized; an iframe
     * setup failure falls back to popup once before propagating.
     */
    async acquire(ctx: RouteContext): Promise<Transport> {
        const run = () => this.doAcquire(ctx);
        const result = this.queue.then(run, run);
        this.queue = result.catch(() => {
            /* keep the chain alive after failures */
        });
        return result;
    }

    /**
     * Whether a message's source belongs to any currently-owned transport
     * window. A non-null source (always present on a real cross-window
     * postMessage) must match a transport — this is what rejects a second,
     * same-origin keys iframe trying to spoof control messages. A null source
     * is tolerated: it only occurs for synthetic events (tests) or a source
     * window destroyed in flight; crafting one requires same-page script
     * execution (XSS), which already implies full host compromise.
     */
    ownsSource(source: MessageEventSource | null): boolean {
        if (!source) return true;
        return (this.popup?.matchesSource(source) ?? false) || (this.iframe?.matchesSource(source) ?? false);
    }

    /**
     * Update the dApp theme: store it for transports created later, and push it
     * to any live transport so the keys dialog re-themes without a rebuild.
     */
    updateTheme(theme: JawTheme | undefined): void {
        this.options.theme = theme;
        this.iframe?.setTheme(theme);
        this.popup?.setTheme(theme);
    }

    destroyAll(): void {
        this.popup?.destroy();
        this.popup = null;
        this.iframe?.destroy();
        this.iframe = null;
        this.pendingIframeReload = false;
        this.popupForced = false;
        // Clear the reconnect override too: a stale flag could otherwise route a
        // later credential-*create* onto the iframe, bypassing the Safari rule.
        this.iframeReconnectForced = false;
    }

    /**
     * Mount and handshake the iframe in the background. No-op when
     * routing would not pick the iframe.
     */
    async prewarm(): Promise<void> {
        if (this.decide({}).kind !== 'iframe') return;
        await this.getOrCreateIframe().prewarm();
    }

    /**
     * Force the next acquire onto the popup transport (the dialog
     * or the user asked to continue in a new window). The iframe hides and
     * resyncs before its next use.
     */
    forcePopupOnce(): void {
        this.popupForced = true;
        if (this.iframe) {
            this.iframe.hide();
            this.pendingIframeReload = true;
        }
    }

    /**
     * Force the next acquire onto the (live) iframe, bypassing the normal
     * routing decision for one call. Used to re-establish a session inside the
     * iframe on Safari, where the routing rule would otherwise send the
     * credential method (wallet_connect) to the popup. This is safe only for a
     * credential *get* (a reconnect where the passkey already exists) — the
     * caller is responsible for that gating; the router just honors the override.
     *
     * The existing iframe is reused as-is (no reload): it is the live frame that
     * requested the reconnect, so its app state must be preserved.
     */
    forceIframeReconnectOnce(): void {
        this.iframeReconnectForced = true;
        // A reconnect supersedes a pending reload — we want the live frame, intact.
        this.pendingIframeReload = false;
    }

    // ------------------------------------------------------------------ //

    /**
     * @internal Exposed for the Communicator (willRouteToIframe / the bounded
     * trusted-hosts await in acquire). Pure and side-effect-free. Not part of the
     * TransportRouter public contract — do not rely on it from outside core.
     */
    decide(ctx: RouteContext): { kind: TransportKind; reason: RouteReason } {
        if (this.mode !== 'iframe' && this.mode !== 'auto') {
            return { kind: 'popup', reason: 'mode-popup' };
        }
        // Iframe needs a secure context (WebAuthn) AND a real HTTPS origin. The
        // latter excludes http://localhost dev servers — secure contexts that are
        // not HTTPS — which must use the popup.
        if (!this.isSecureContextFn() || !this.isHttpsFn()) {
            return { kind: 'popup', reason: 'insecure-protocol' };
        }
        if (this.isSafariFn() && ctx.method !== undefined && CREDENTIAL_CREATING_METHODS.includes(ctx.method)) {
            // On Safari a credential method for a KNOWN account (the persisted
            // `lastAccount` hint) is a WebAuthn get() — which Safari permits in
            // cross-origin iframes — so it runs embedded (the clickjacking-guard
            // and secure-context rules below still apply; untrusted embedders keep
            // the popup). Without a known account the connect may need create(),
            // which Safari blocks in iframes, so it keeps the popup, where
            // creating/selecting an account already works in the original click's
            // gesture. Keying off lastAccount (not the live account list) means
            // this survives disconnect and the Brave/Safari storage wipe between
            // visits.
            const knownAccount = !!this.options.getLastAccount?.();
            if (!knownAccount) {
                return { kind: 'popup', reason: 'safari-credential-method' };
            }
        }
        if (!this.supportsIOv2Fn() && !this.isTrustedHostFn(this.getLocation().hostname)) {
            return { kind: 'popup', reason: 'clickjacking-guard' };
        }
        return { kind: 'iframe', reason: 'iframe' };
    }

    private async doAcquire(ctx: RouteContext): Promise<Transport> {
        // Priority: an explicit popup switch (user/dialog) always wins over an
        // automatic reconnect, which in turn wins over normal routing. Both
        // overrides are single-use (consumed here).
        if (this.popupForced) {
            this.popupForced = false;
            const popup = this.getOrCreatePopup();
            await popup.ensureReady();
            return popup;
        }

        // Reconnect override: hand back the LIVE iframe regardless of routing, so a
        // session can be re-established inside it (Safari partition recovery). Only
        // honored when an iframe actually exists — it is set in response to that
        // very iframe emitting a reconnect request. If there is no live iframe we
        // fall through to decide(), so the secure-context/HTTPS rules still apply
        // (a future eager-iframe change can't silently bypass them).
        if (this.iframeReconnectForced) {
            this.iframeReconnectForced = false;
            if (this.iframe) {
                await this.iframe.ensureReady();
                return this.iframe;
            }
        }

        const { kind, reason } = this.decide(ctx);

        if (kind === 'popup') {
            if (reason === 'insecure-protocol' && !this.warnedInsecure) {
                this.warnedInsecure = true;
                console.warn(
                    '[JAW] The iframe transport requires a secure HTTPS origin. ' +
                        'On a non-HTTPS origin (e.g. an http:// dev server, including http://localhost), ' +
                        'JAW falls back to the popup transport.'
                );
            }
            if (reason === 'safari-credential-method' && this.iframe) {
                // The popup flow will mutate keys-side state the (storage-
                // partitioned) iframe cannot see — resync before its next use.
                this.pendingIframeReload = true;
            }
            const popup = this.getOrCreatePopup();
            await popup.ensureReady();
            return popup;
        }

        const iframe = this.getOrCreateIframe();
        try {
            if (this.pendingIframeReload) {
                this.pendingIframeReload = false;
                await iframe.reload();
            } else {
                await iframe.ensureReady();
            }
            return iframe;
        } catch {
            // Fallback: iframe setup failed (handshake timeout, CSP, extension
            // interference) — fall back to popup once, then propagate.
            iframe.destroy();
            this.iframe = null;
            const popup = this.getOrCreatePopup();
            await popup.ensureReady();
            return popup;
        }
    }

    private getOrCreatePopup(): PopupTransport {
        if (!this.popup) {
            this.popup = this.createPopup(this.options);
        }
        return this.popup;
    }

    private getOrCreateIframe(): IframeTransport {
        if (!this.iframe) {
            this.iframe = this.createIframe(this.options);
        }
        return this.iframe;
    }
}
