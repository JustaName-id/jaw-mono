import { SDK_VERSION } from '../sdk-info.js';
import { Message, MessageID } from '../messages/message.js';
import { ConfigMessage, DialogCloseData } from '../messages/configMessage.js';
import { standardErrors } from '../errors/errors.js';
import { IframeTransport as IframeTransportContract, TransportOptions } from './transport.js';
import type { JawTheme } from '../ui/theme.js';

const HANDSHAKE_TIMEOUT_MS = 10_000;

const DIALOG_ATTR = 'data-jaw';
const BACKDROP_STYLE_ID = 'jaw-dialog-backdrop-style';

export type IframeTransportConfig = TransportOptions & {
    /** Handshake timeout override (tests). Defaults to 10s. */
    handshakeTimeoutMs?: number;
    /** Prewarm retry backoff in ms between attempts. Defaults to [1000, 3000]. */
    prewarmBackoffMs?: number[];
};

/**
 * Iframe transport: embeds the keys URL in a native top-layer <dialog>.
 *
 * Same handshake and message protocol as PopupTransport — only the carrier
 * changes. The iframe is revealed only after the keys app signals
 * PopupReady (no unstyled white frame), and stays mounted across flows so
 * a dismissal does not require a new handshake.
 */
export class IframeTransport implements IframeTransportContract {
    readonly kind = 'iframe' as const;

    /**
     * The single iframe transport currently mounted in the document. The
     * embedded keys dialog is a global, top-layer modal — there is only ever one.
     * When a new instance mounts (a connector rebuilt on a config change, or a
     * React StrictMode / Fast Refresh double-mount in dev), it tears down the
     * previous one so stale prewarmed dialogs don't accumulate in the DOM.
     */
    private static mounted: IframeTransport | null = null;

    private readonly url: URL;
    private readonly options: TransportOptions;
    private readonly handshakeTimeoutMs: number;
    private readonly prewarmBackoffMs: number[];

    private dialog: HTMLDialogElement | null = null;
    private iframe: HTMLIFrameElement | null = null;
    private inertObserver: MutationObserver | null = null;
    private configListener: ((event: MessageEvent) => void) | null = null;
    private listeners = new Map<(_: MessageEvent) => void, { reject: (_: Error) => void }>();

    private ready = false;
    private reloading = false;
    private visible = false;
    private readyPromise: Promise<Window> | null = null;
    private previouslyFocused: Element | null = null;
    private previousBodyOverflow = '';

    constructor(config: IframeTransportConfig) {
        this.url = config.url;
        this.options = config;
        this.handshakeTimeoutMs = config.handshakeTimeoutMs ?? HANDSHAKE_TIMEOUT_MS;
        this.prewarmBackoffMs = config.prewarmBackoffMs ?? [1000, 3000];
    }

    /**
     * Mount hidden and complete the handshake without showing UI.
     *
     * Best-effort: a failed handshake (slow keys app / transient network) is
     * retried with bounded backoff, reloading the iframe so the keys app
     * re-emits its load event. It bails the moment a real request has warmed
     * the transport (`ready`/`readyPromise` set), so it never fights an
     * in-flight acquire, and it never throws — the first real use still routes
     * (or falls back) on its own.
     */
    async prewarm(): Promise<void> {
        try {
            await this.ensureReady();
            return;
        } catch {
            /* fall through to bounded retries */
        }
        // Resolve to true only once the transport is actually ready. If a real
        // request is mid-handshake, defer to it (await its outcome) rather than
        // bailing — so a concurrent handshake that *fails* doesn't silently
        // consume a retry. Leaves no `readyPromise` in flight on return false,
        // so the reload below never stomps a live acquire.
        const settledReady = async (): Promise<boolean> => {
            if (this.ready) return true;
            if (this.readyPromise) await this.readyPromise.catch(() => undefined);
            return this.ready;
        };
        for (const delay of this.prewarmBackoffMs) {
            if (await settledReady()) return;
            await new Promise((resolve) => setTimeout(resolve, delay));
            if (await settledReady()) return;
            try {
                await this.reload();
                return;
            } catch {
                /* try the next backoff step */
            }
        }
        // All attempts exhausted. Harmless on its own (the first real request
        // routes/falls back), but a persistent prewarm failure usually means a
        // misconfigured or unreachable keys origin — surface a one-time hint.
        // Fires at most once: prewarm runs a single time, at construction.
        console.warn(
            `[JAW] Iframe transport could not prewarm after ${this.prewarmBackoffMs.length + 1} attempts; ` +
                'the dialog will retry (or fall back to a popup) on first use.'
        );
    }

    /**
     * Mount the iframe (if needed) and complete the handshake.
     */
    async ensureReady(): Promise<Window> {
        if (this.ready && this.isAlive()) {
            return this.getTargetWindow();
        }
        if (this.readyPromise) {
            return this.readyPromise;
        }

        this.mount();

        this.readyPromise = this.runHandshake().finally(() => {
            this.readyPromise = null;
        });
        return this.readyPromise;
    }

    /**
     * Posts a business message: every request requires user-visible UI in v1,
     * so the dialog is shown once the handshake completes.
     */
    postMessage = async (message: Message): Promise<void> => {
        const target = await this.ensureReady();
        this.show();
        target.postMessage(message, this.url.origin);
    };

    isAlive(): boolean {
        return this.iframe !== null && this.iframe.isConnected && this.ready;
    }

    /**
     * Listen for messages from the keys origin matching a predicate.
     */
    async onMessage<M extends Message>(predicate: (msg: Partial<M>) => boolean): Promise<M> {
        return new Promise((resolve, reject) => {
            const listener = (event: MessageEvent) => {
                // Validate origin and source (our iframe's contentWindow)
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
        return !source || source === (this.iframe?.contentWindow ?? null);
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
     * Make the dialog visible. The iframe itself is only revealed once the
     * handshake has completed (reveal gating).
     */
    show(): void {
        if (!this.dialog || this.visible) return;

        this.previouslyFocused = document.activeElement;
        this.previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        // showModal() puts the dialog in the top layer with a backdrop — the
        // only way to render a real modal. Supported by every browser that
        // reaches the iframe transport (Safari 15.4+, Chrome 37+, Firefox 98+).
        this.dialog.showModal();

        this.visible = true;
        this.applyRevealGating();
        this.iframe?.focus();
    }

    /**
     * Hide the dialog without destroying the iframe (it stays mounted and
     * handshaken for the next request).
     */
    hide(): void {
        if (!this.dialog || !this.visible) return;

        this.dialog.close();

        document.body.style.overflow = this.previousBodyOverflow;
        if (this.previouslyFocused instanceof HTMLElement) {
            this.previouslyFocused.focus();
        }
        this.previouslyFocused = null;
        this.visible = false;
    }

    /**
     * Push a new dApp theme to the live keys app. Updates the stored theme so a
     * later handshake/reload carries it, and — when the handshake is already
     * done — posts a SetTheme message so the embedded dialog re-themes in place
     * (no reload, no stale one-shot from prewarm).
     */
    setTheme(theme: JawTheme | undefined): void {
        this.options.theme = theme;
        if (!this.ready || !this.isAlive()) return;
        try {
            this.getTargetWindow().postMessage({ event: 'SetTheme', data: { theme } }, this.url.origin);
        } catch {
            /* window gone; the updated theme rides the next handshake/reload */
        }
    }

    /**
     * Reset iframe.src to resync state after a popup-fallback flow.
     */
    async reload(): Promise<void> {
        if (!this.iframe) {
            await this.ensureReady();
            return;
        }

        // Don't stomp an in-flight handshake (ensureReady/prewarm): let it
        // settle first so its listeners aren't orphaned by a second one.
        if (this.readyPromise) {
            await this.readyPromise.catch(() => undefined);
        }

        // destroy() may have run during the await above, nulling the iframe.
        // Don't resurrect a destroyed transport (the router has already
        // dropped its reference) — fail cleanly and let the caller re-route.
        if (!this.iframe) {
            throw standardErrors.rpc.internal('Iframe transport was destroyed during reload');
        }

        this.ready = false;
        this.reloading = true;
        try {
            this.iframe.src = this.url.toString();
            this.readyPromise = this.runHandshake().finally(() => {
                this.readyPromise = null;
            });
            await this.readyPromise;
        } finally {
            this.reloading = false;
        }
    }

    /**
     * Remove the dialog, reject all pending listeners, release resources.
     */
    destroy(): void {
        this.rejectPending();
        this.hide();

        if (IframeTransport.mounted === this) {
            IframeTransport.mounted = null;
        }

        if (this.configListener) {
            window.removeEventListener('message', this.configListener);
            this.configListener = null;
        }
        this.inertObserver?.disconnect();
        this.inertObserver = null;

        this.dialog?.remove();
        document.getElementById(BACKDROP_STYLE_ID)?.remove();
        this.dialog = null;
        this.iframe = null;
        this.ready = false;
        this.readyPromise = null;
    }

    // ------------------------------------------------------------------ //

    private mount(): void {
        if (this.dialog) return;

        // Only one keys dialog may be live at a time. Tear down a previously
        // mounted instance (defunct provider from a connector rebuild, or a dev
        // StrictMode / Fast Refresh double-mount) so its dialog, listeners and
        // observer are removed instead of leaking into the DOM.
        if (IframeTransport.mounted && IframeTransport.mounted !== this) {
            IframeTransport.mounted.destroy();
        }
        IframeTransport.mounted = this;

        this.injectBackdropStyle();

        const dialog = document.createElement('dialog');
        dialog.setAttribute(DIALOG_ATTR, '');
        dialog.setAttribute('aria-label', 'JAW Wallet');
        Object.assign(dialog.style, {
            position: 'fixed',
            inset: '0',
            width: '100%',
            height: '100%',
            maxWidth: 'none',
            maxHeight: 'none',
            margin: '0',
            padding: '0',
            border: 'none',
            background: 'transparent',
            // Own our interactivity: a host that opens the SDK from inside its
            // own modal (e.g. Radix Dialog) sets `body { pointer-events: none }`.
            // We are a DOM child of body and would inherit `none`, making the
            // iframe unclickable — `auto` keeps the keys UI usable regardless.
            pointerEvents: 'auto',
        });

        const iframe = document.createElement('iframe');
        iframe.src = this.url.toString();
        iframe.setAttribute(
            'allow',
            // WebAuthn delegation (passkeys) + clipboard-write so the embedded
            // keys dialog's "copy" actions (address, tx data, SIWE message) work:
            // a cross-origin iframe is denied clipboard-write by default unless
            // the embedder delegates it here.
            `publickey-credentials-get ${this.url.origin}; ` +
                `publickey-credentials-create ${this.url.origin}; ` +
                `clipboard-write ${this.url.origin}`
        );
        iframe.setAttribute(
            'sandbox',
            'allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox'
        );
        iframe.setAttribute('title', 'JAW');
        iframe.setAttribute('tabindex', '0');
        Object.assign(iframe.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            border: 'none',
            // A recognized `color-scheme` (light/dark) makes the browser paint an
            // OPAQUE canvas behind the iframe document (white in light), hiding
            // the host dApp even when the embedded html/body are transparent.
            // `normal` keeps the iframe genuinely see-through; the keys app still
            // gets its dark visuals from the `.dark` token class, not from
            // color-scheme. Mirrors the `html.jaw-embedded` rule on the keys side.
            colorScheme: 'normal',
            visibility: 'hidden',
        });

        dialog.appendChild(iframe);

        // Escape key: reject pending requests, keep the iframe mounted
        dialog.addEventListener('cancel', (event) => {
            event.preventDefault();
            this.dismiss();
        });
        // Clicks landing on the dialog itself (outside the iframe)
        dialog.addEventListener('click', (event) => {
            if (event.target === dialog) this.dismiss();
        });

        // Our dialog is the active top-layer modal (showModal). Strip
        // attributes that external focus managers wrongly put on it:
        // - `inert` (e.g. the 1Password extension), which breaks interactivity;
        // - `aria-hidden` (e.g. a sibling Radix/focus-trap modal in the host),
        //   which both hides our dialog from assistive tech and triggers
        //   Chrome's "aria-hidden on a focused ancestor" warning because the
        //   iframe inside holds focus.
        this.inertObserver = new MutationObserver(() => {
            if (dialog.hasAttribute('inert')) dialog.removeAttribute('inert');
            if (dialog.hasAttribute('aria-hidden')) dialog.removeAttribute('aria-hidden');
        });
        this.inertObserver.observe(dialog, {
            attributes: true,
            attributeFilter: ['inert', 'aria-hidden'],
        });

        // Persistent config-event listener (DialogClose / PopupUnload)
        this.configListener = (event: MessageEvent) => {
            if (event.origin !== this.url.origin) return;
            if (!this.matchesSource(event.source)) return;
            const message = event.data as ConfigMessage | undefined;

            if (message?.event === 'DialogClose') {
                const data = message.data as DialogCloseData | undefined;
                if (data?.reason === 'cancelled') {
                    // User cancelled from inside the keys app — reject the
                    // in-flight dApp request (via dismiss → onDismiss), don't
                    // just hide. 'completed' carries a real response already, so
                    // it only hides.
                    this.dismiss();
                } else {
                    this.hide();
                }
            }

            // Only an established, current session may be torn down by a
            // PopupUnload. The keys app fires `pagehide` (→ PopupUnload) for any
            // transient document teardown, including the initial cold-start load
            // and the document the SDK itself navigates away from during a prewarm
            // reload. Honouring those would dismiss a dialog that is still
            // handshaking (`!ready`) or being reloaded (`reloading`) — rejecting
            // the in-flight handshake and closing the dialog before the user can
            // act. Gate on a live, non-reloading session so only a genuine unload
            // of the current keys document resets the transport.
            if (message?.event === 'PopupUnload' && this.ready && !this.reloading) {
                this.ready = false;
                this.dismiss();
            }
        };
        window.addEventListener('message', this.configListener);

        document.body.appendChild(dialog);
        this.dialog = dialog;
        this.iframe = iframe;
    }

    private async runHandshake(): Promise<Window> {
        // Definitely assigned synchronously by the timeout Promise executor below.
        let timer!: ReturnType<typeof setTimeout>;

        const handshake = this.onMessage<ConfigMessage>(({ event }) => event === 'PopupLoaded')
            .then((message) => {
                this.getTargetWindow().postMessage(
                    {
                        requestId: message.id,
                        data: {
                            version: SDK_VERSION,
                            metadata: this.options.metadata,
                            preference: this.options.preference,
                            theme: this.options.theme,
                            location: window.location.toString(),
                            lastAccount: this.options.getLastAccount?.(),
                        },
                    },
                    this.url.origin
                );
                return message.id;
            })
            .then((handshakeId) => {
                // Bind PopupReady to this handshake's id so a stale one can't resolve it.
                return this.onMessage<ConfigMessage>(
                    ({ event, requestId }) => event === 'PopupReady' && requestId === handshakeId
                );
            })
            .then(() => {
                this.ready = true;
                this.applyRevealGating();
                return this.getTargetWindow();
            });

        // If the timeout wins the race, the handshake chain stays pending on its
        // onMessage(PopupReady) listener. rejectPending() (below) rejects it so
        // the listener is cleaned up — swallow that late rejection here so it
        // doesn't surface as an unhandled rejection.
        handshake.catch(() => undefined);

        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
                reject(standardErrors.rpc.internal('Iframe transport handshake timed out'));
            }, this.handshakeTimeoutMs);
        });

        try {
            return await Promise.race([handshake, timeout]);
        } finally {
            clearTimeout(timer);
            // On timeout (handshake didn't complete), reject the orphaned
            // PopupLoaded/PopupReady listeners so they don't leak.
            if (!this.ready) this.rejectPending();
        }
    }

    /** Reject pending requests and hide the dialog; the iframe stays mounted. */
    private dismiss(): void {
        this.rejectPending();
        // Bridge to the facade: the dApp's response promise lives on the
        // Communicator's listener map, not this transport's, so rejectPending()
        // alone never settles it. onDismiss rejects it with 4001.
        this.options.onDismiss?.();
        this.hide();
    }

    private rejectPending(): void {
        this.listeners.forEach(({ reject }, listener) => {
            reject(standardErrors.provider.userRejectedRequest('Request rejected'));
            window.removeEventListener('message', listener);
        });
        this.listeners.clear();
    }

    /** Reveal the iframe only when both visible and handshaken. */
    private applyRevealGating(): void {
        if (!this.iframe) return;
        this.iframe.style.visibility = this.ready && this.visible ? 'visible' : 'hidden';
    }

    private getTargetWindow(): Window {
        const target = this.iframe?.contentWindow;
        if (!target) throw standardErrors.rpc.internal();
        return target;
    }

    private injectBackdropStyle(): void {
        if (document.getElementById(BACKDROP_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = BACKDROP_STYLE_ID;
        style.textContent = `dialog[${DIALOG_ATTR}]::backdrop { background: transparent; }`;
        document.head.appendChild(style);
    }
}
