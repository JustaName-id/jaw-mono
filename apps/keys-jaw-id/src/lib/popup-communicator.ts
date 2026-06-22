/**
 * PopupCommunicator
 *
 * postMessage wrapper for talking to the SDK, context-aware:
 * - 'popup':    opened via window.open — counterpart is window.opener
 * - 'embedded': loaded inside an iframe — counterpart is window.parent
 * - 'standalone': direct navigation — communicator is inert
 *
 * Security rules (normative):
 * - Every inbound message must come from the counterpart window (event.source check).
 * - The counterpart origin is locked from the frame ancestry / referrer at
 *   startup — never from an inbound message in embedded mode (lock poisoning).
 * - Outbound messages are never posted with a '*' target origin; they queue
 *   until the origin is locked.
 */

export type MessageID = string;

export interface Message {
  id?: MessageID;
  event?: string;
  requestId?: MessageID;
  data?: unknown;
  [key: string]: unknown;
}

export type CommunicatorContext = 'popup' | 'embedded' | 'standalone';

export type CloseReason = 'completed' | 'cancelled';

export class PopupCommunicator {
  private readonly win: Window | null;
  private readonly context: CommunicatorContext;
  private counterpart: Window | null = null;
  private origin: string | null = null;
  /** Messages queued until the origin lock is established (never sent to '*'). */
  private outbox: Message[] = [];

  constructor(win: Window | null = typeof window !== 'undefined' ? window : null) {
    this.win = win;

    if (!win) {
      this.context = 'standalone';
      return;
    }

    if (win.opener) {
      this.context = 'popup';
      this.counterpart = win.opener;
    } else if (win.parent && win.parent !== win) {
      this.context = 'embedded';
      this.counterpart = win.parent;
    } else {
      this.context = 'standalone';
      return;
    }

    this.origin = this.resolveCounterpartOrigin();

    if (this.context === 'embedded' && !this.origin) {
      // No ancestorOrigins (non-Chromium) and no referrer (embedder sent
      // `Referrer-Policy: no-referrer`): we cannot safely lock the parent
      // origin, so the communicator stays inert and the SDK handshake will
      // time out. Surface a diagnostic instead of failing silently.
      console.error(
        '[JAW keys] Could not resolve the embedder origin (no ancestorOrigins and no referrer). ' +
          'The iframe transport cannot establish a session; the host should allow a referrer or use the popup transport.'
      );
    }

    // Notify the SDK when this window goes away. `beforeunload` does not
    // fire reliably inside iframes — embedded mode uses `pagehide`.
    const unloadEvent = this.context === 'embedded' ? 'pagehide' : 'beforeunload';
    win.addEventListener(unloadEvent, () => {
      this.sendPopupUnload();
    });
  }

  /**
   * Resolve the counterpart origin from tamper-proof browser state.
   * - embedded: location.ancestorOrigins (Chromium/WebKit), referrer fallback (Firefox)
   * - popup:    document.referrer (the page that called window.open)
   * Never derived from an inbound message in embedded mode.
   */
  private resolveCounterpartOrigin(): string | null {
    if (!this.win) return null;

    if (this.context === 'embedded') {
      const ancestor = this.win.location?.ancestorOrigins?.[0];
      if (ancestor) return ancestor;
    }

    try {
      const referrer = this.win.document?.referrer;
      if (referrer) return new URL(referrer).origin;
    } catch {
      /* malformed referrer */
    }
    return null;
  }

  /**
   * Send PopupLoaded event to the counterpart
   */
  sendPopupLoaded(): void {
    this.postMessage({
      id: crypto.randomUUID(),
      event: 'PopupLoaded',
    });
  }

  /**
   * Send PopupUnload event to the counterpart
   */
  sendPopupUnload(): void {
    this.postMessage({
      id: crypto.randomUUID(),
      event: 'PopupUnload',
    });
  }

  /**
   * Send PopupReady event to opener.
   * Echoes the config message's requestId so the opener can bind it to the handshake.
   */
  sendPopupReady(requestId?: MessageID): void {
    const message: Message = {
      id: crypto.randomUUID(),
      requestId,
      event: 'PopupReady',
    };
    this.postMessage(message);
  }

  /**
   * Send a response to a specific request
   */
  sendResponse(requestId: MessageID, data: unknown): void {
    this.postMessage({
      requestId,
      data,
    });
  }

  /**
   * Send a raw message to the counterpart
   */
  sendMessage(message: Message): void {
    this.postMessage(message);
  }

  /**
   * Close the current flow in a transport-aware way. window.close() is a
   * no-op inside an iframe — embedded mode tells the SDK to hide the dialog
   * instead. ALL flow-ending close calls must go through here.
   */
  requestClose(reason: CloseReason = 'completed'): void {
    if (this.context === 'embedded') {
      this.postMessage({
        id: crypto.randomUUID(),
        event: 'DialogClose',
        data: { reason },
      });
      return;
    }
    if (this.context === 'popup') {
      this.win?.close();
    }
    // standalone: nothing to close
  }

  /**
   * Ask the SDK to continue the current flow in a popup (iframe escape
   * hatch: occluded UI, WebAuthn limitations).
   */
  requestSwitchToPopup(reason: 'user' | 'visibility' | 'webauthn-unsupported'): void {
    if (this.context !== 'embedded') return;
    this.postMessage({
      id: crypto.randomUUID(),
      event: 'SwitchTransport',
      data: { to: 'popup', reason },
    });
  }

  /**
   * Listen for messages from the counterpart
   * Returns cleanup function
   */
  onMessage<T = unknown>(callback: (message: Message & { data?: T }) => void): () => void {
    if (!this.win || this.context === 'standalone') {
      return () => undefined;
    }

    const handler = (event: MessageEvent) => {
      // Source check is unconditional: only the counterpart window is valid
      if (!this.counterpart || event.source !== this.counterpart) {
        return;
      }

      if (!this.origin) {
        if (this.context === 'popup' && event.origin) {
          // Popup fallback only (opener page sent no referrer): lock from
          // the first source-validated message. Embedded mode never locks
          // from inbound messages (lock poisoning).
          this.origin = event.origin;
          this.flushOutbox();
        } else {
          return;
        }
      }

      // Verify origin matches the lock
      if (event.origin !== this.origin) {
        console.warn('⚠️ Message from unexpected origin, ignoring:', event.origin);
        return;
      }

      callback(event.data);
    };

    this.win.addEventListener('message', handler);
    return () => this.win?.removeEventListener('message', handler);
  }

  /**
   * Whether a counterpart window exists (popup opener or iframe parent)
   */
  hasOpener(): boolean {
    return this.counterpart !== null;
  }

  /**
   * Get the detected context
   */
  getContext(): CommunicatorContext {
    return this.context;
  }

  /**
   * Get current locked origin
   */
  getOrigin(): string | null {
    return this.origin;
  }

  /**
   * Internal method to post a message to the counterpart. Messages are
   * queued (not sent to '*') until the origin lock is established.
   */
  private postMessage(message: Message): void {
    if (!this.counterpart) {
      console.error('❌ No counterpart window available');
      return;
    }

    if (!this.origin) {
      this.outbox.push(message);
      return;
    }

    try {
      this.counterpart.postMessage(message, this.origin);
    } catch (error) {
      console.error('❌ Failed to send message:', error);
    }
  }

  private flushOutbox(): void {
    const pending = this.outbox;
    this.outbox = [];
    pending.forEach((message) => this.postMessage(message));
  }
}
