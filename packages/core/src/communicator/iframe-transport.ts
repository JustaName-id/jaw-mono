import { SDK_VERSION } from '../sdk-info.js';
import { Message, MessageID } from '../messages/message.js';
import { ConfigMessage, DialogCloseData } from '../messages/configMessage.js';
import { standardErrors } from '../errors/errors.js';
import { IframeTransport as IframeTransportContract, TransportOptions } from './transport.js';

const HANDSHAKE_TIMEOUT_MS = 10_000;

const DIALOG_ATTR = 'data-jaw';
const BACKDROP_STYLE_ID = 'jaw-dialog-backdrop-style';

export type IframeTransportConfig = TransportOptions & {
    /** Handshake timeout override (tests). Defaults to 10s. */
    handshakeTimeoutMs?: number;
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

    private readonly url: URL;
    private readonly options: TransportOptions;
    private readonly handshakeTimeoutMs: number;

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
    }

    /**
     * Mount hidden and complete the handshake without showing UI.
     */
    async prewarm(): Promise<void> {
        await this.ensureReady();
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

        // jsdom (tests) and very old engines do not implement showModal()
        if (typeof this.dialog.showModal === 'function') {
            try {
                this.dialog.showModal();
            } catch {
                this.dialog.setAttribute('open', '');
            }
        } else {
            this.dialog.setAttribute('open', '');
        }

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

        if (typeof this.dialog.close === 'function') {
            try {
                this.dialog.close();
            } catch {
                this.dialog.removeAttribute('open');
            }
        } else {
            this.dialog.removeAttribute('open');
        }

        document.body.style.overflow = this.previousBodyOverflow;
        if (this.previouslyFocused instanceof HTMLElement) {
            this.previouslyFocused.focus();
        }
        this.previouslyFocused = null;
        this.visible = false;
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
        });

        const iframe = document.createElement('iframe');
        iframe.src = this.url.toString();
        iframe.setAttribute(
            'allow',
            `publickey-credentials-get ${this.url.origin}; publickey-credentials-create ${this.url.origin}`
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
            colorScheme: 'light dark',
            visibility: 'hidden',
        });

        dialog.appendChild(iframe);

        // Escape key: reject pending requests, keep the iframe mounted (AC-8)
        dialog.addEventListener('cancel', (event) => {
            event.preventDefault();
            this.dismiss();
        });
        // Clicks landing on the dialog itself (outside the iframe)
        dialog.addEventListener('click', (event) => {
            if (event.target === dialog) this.dismiss();
        });

        // Some extensions (1Password) set `inert` on top-layer dialogs,
        // breaking interactivity — revert it.
        this.inertObserver = new MutationObserver(() => {
            if (dialog.hasAttribute('inert')) dialog.removeAttribute('inert');
        });
        this.inertObserver.observe(dialog, { attributes: true, attributeFilter: ['inert'] });

        // Persistent config-event listener (DialogClose / PopupUnload)
        this.configListener = (event: MessageEvent) => {
            if (event.origin !== this.url.origin) return;
            if (!this.matchesSource(event.source)) return;
            const message = event.data as ConfigMessage | undefined;

            if (message?.event === 'DialogClose') {
                const data = message.data as DialogCloseData | undefined;
                if (data?.reason === 'cancelled') {
                    this.rejectPending();
                }
                this.hide();
            }

            if (message?.event === 'PopupUnload' && !this.reloading) {
                this.ready = false;
                this.dismiss();
            }
        };
        window.addEventListener('message', this.configListener);

        document.body.appendChild(dialog);
        this.dialog = dialog;
        this.iframe = iframe;
    }

    private runHandshake(): Promise<Window> {
        let timer: ReturnType<typeof setTimeout>;

        const handshake = this.onMessage<ConfigMessage>(({ event }) => event === 'PopupLoaded')
            .then((message) => {
                this.getTargetWindow().postMessage(
                    {
                        requestId: message.id,
                        data: {
                            version: SDK_VERSION,
                            metadata: this.options.metadata,
                            preference: this.options.preference,
                            location: window.location.toString(),
                        },
                    },
                    this.url.origin
                );
            })
            .then(() => {
                return this.onMessage<ConfigMessage>(({ event }) => event === 'PopupReady');
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

        return Promise.race([handshake, timeout]).finally(() => {
            clearTimeout(timer);
            // On timeout (handshake didn't complete), reject the orphaned
            // PopupLoaded/PopupReady listeners so they don't leak.
            if (!this.ready) this.rejectPending();
        });
    }

    /** Reject pending requests and hide the dialog; the iframe stays mounted. */
    private dismiss(): void {
        this.rejectPending();
        this.hide();
    }

    private rejectPending(): void {
        this.listeners.forEach(({ reject }, listener) => {
            reject(standardErrors.provider.userRejectedRequest('Request rejected'));
            window.removeEventListener('message', listener);
        });
        this.listeners.clear();
    }

    /** Reveal the iframe only when both visible and handshaken (AC-10). */
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
