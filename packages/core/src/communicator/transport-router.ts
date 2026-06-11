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

/** Methods that may create a passkey — unsupported in Safari cross-origin iframes. */
export const CREDENTIAL_CREATING_METHODS: readonly string[] = ['eth_requestAccounts', 'wallet_connect'];

type RouteReason =
    | 'mode-popup' // transportMode unset or 'popup' (AC-7)
    | 'insecure-protocol' // host page is not HTTPS (AC-3)
    | 'safari-credential-method' // Safari cannot create passkeys in iframes (AC-2)
    | 'clickjacking-guard' // visibility not verifiable and host not trusted (AC-4)
    | 'iframe'; // default: embedded dialog (AC-1)

export type TransportRouterConfig = TransportOptions & {
    /** Transport preference (default: 'popup'). 'auto' is an alias of 'iframe' in v1. */
    mode?: TransportMode;

    // Injection points for tests — production uses the real implementations.
    createPopupTransport?: (options: TransportOptions) => PopupTransport;
    createIframeTransport?: (options: TransportOptions) => IframeTransport;
    isSafariFn?: () => boolean;
    supportsIOv2Fn?: () => boolean;
    isTrustedHostFn?: (hostname: string) => boolean;
    getLocation?: () => { protocol: string; hostname: string };
};

/**
 * Picks the transport per request. Routing rules, evaluated in order
 * (first match wins — see contracts/transport-interface.md):
 *
 *  1. mode unset or 'popup'                          -> popup
 *  2. host page not HTTPS                            -> popup (+ one warning)
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
    private readonly getLocation: () => { protocol: string; hostname: string };

    private popup: PopupTransport | null = null;
    private iframe: IframeTransport | null = null;

    /** Iframe must resync (reload) before its next use after a popup-fallback flow (AC-2). */
    private pendingIframeReload = false;
    private warnedInsecure = false;

    /** Serializes acquires: no parallel popup + iframe setup races (AC-E4). */
    private queue: Promise<unknown> = Promise.resolve();

    constructor(config: TransportRouterConfig) {
        this.options = { url: config.url, metadata: config.metadata, preference: config.preference };
        this.mode = config.mode ?? 'popup';
        this.createPopup = config.createPopupTransport ?? ((options) => new PopupTransport(options));
        this.createIframe = config.createIframeTransport ?? ((options) => new IframeTransport(options));
        this.isSafariFn = config.isSafariFn ?? isSafari;
        this.supportsIOv2Fn = config.supportsIOv2Fn ?? supportsIOv2;
        this.isTrustedHostFn = config.isTrustedHostFn ?? isTrustedHost;
        this.getLocation =
            config.getLocation ??
            (() => ({ protocol: window.location.protocol, hostname: window.location.hostname }));
    }

    /**
     * Resolve which transport handles this request. Pure decision, no side effects.
     */
    route(ctx: RouteContext): TransportKind {
        return this.decide(ctx).kind;
    }

    /**
     * Acquire the routed, ready transport. Calls are serialized; an iframe
     * setup failure falls back to popup once before propagating (AC-E2).
     */
    async acquire(ctx: RouteContext): Promise<Transport> {
        const run = () => this.doAcquire(ctx);
        const result = this.queue.then(run, run);
        this.queue = result.catch(() => {
            /* keep the chain alive after failures */
        });
        return result;
    }

    destroyAll(): void {
        this.popup?.destroy();
        this.popup = null;
        this.iframe?.destroy();
        this.iframe = null;
        this.pendingIframeReload = false;
    }

    /**
     * Mount and handshake the iframe in the background (AC-9). No-op when
     * routing would not pick the iframe.
     */
    async prewarm(): Promise<void> {
        if (this.decide({}).kind !== 'iframe') return;
        await this.getOrCreateIframe().prewarm();
    }

    // ------------------------------------------------------------------ //

    private decide(ctx: RouteContext): { kind: TransportKind; reason: RouteReason } {
        if (this.mode !== 'iframe' && this.mode !== 'auto') {
            return { kind: 'popup', reason: 'mode-popup' };
        }
        if (this.getLocation().protocol !== 'https:') {
            return { kind: 'popup', reason: 'insecure-protocol' };
        }
        if (this.isSafariFn() && ctx.method !== undefined && CREDENTIAL_CREATING_METHODS.includes(ctx.method)) {
            return { kind: 'popup', reason: 'safari-credential-method' };
        }
        if (!this.supportsIOv2Fn() && !this.isTrustedHostFn(this.getLocation().hostname)) {
            return { kind: 'popup', reason: 'clickjacking-guard' };
        }
        return { kind: 'iframe', reason: 'iframe' };
    }

    private async doAcquire(ctx: RouteContext): Promise<Transport> {
        const { kind, reason } = this.decide(ctx);

        if (kind === 'popup') {
            if (reason === 'insecure-protocol' && !this.warnedInsecure) {
                this.warnedInsecure = true;
                console.warn(
                    '[JAW] The iframe transport requires an HTTPS origin (WebAuthn). Falling back to popup.'
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
            // AC-E2: iframe setup failed (handshake timeout, CSP, extension
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
