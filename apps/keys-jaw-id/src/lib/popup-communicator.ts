/**
 * PopupCommunicator
 * Simple wrapper for postMessage communication with the opener window
 * Supports both popup mode (window.opener) and React Native WebView mode
 */

/**
 * Generate a UUID that works in both secure (HTTPS) and non-secure (HTTP) contexts.
 * crypto.randomUUID() requires a secure context, so we fall back to crypto.getRandomValues()
 * which works everywhere including React Native WebViews over HTTP.
 */
function generateUUID(): string {
  // Try native randomUUID first (only works in secure contexts)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // Fall through to fallback (happens in non-secure contexts like HTTP)
    }
  }

  // Fallback using crypto.getRandomValues (works in all contexts)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (crypto.getRandomValues(new Uint8Array(1))[0] % 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export type MessageID = string;

export interface Message {
  id?: MessageID;
  event?: string;
  requestId?: MessageID;
  data?: unknown;
  [key: string]: unknown;
}

export class PopupCommunicator {
  private opener: Window | null = null;
  private origin: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.opener = window.opener;
    }
  }

  /**
   * Check if running in React Native WebView
   */
  private checkWebView(): boolean {
    return typeof window !== 'undefined' && !!(window as any).ReactNativeWebView;
  }

  /**
   * Check if running in React Native WebView (public method)
   */
  isWebView(): boolean {
    return this.checkWebView();
  }

  /**
   * Send PopupLoaded event to opener
   */
  sendPopupLoaded(): void {
    const message: Message = {
      id: generateUUID(),
      event: 'PopupLoaded',
    };
    this.postMessage(message);
  }

  /**
   * Send PopupUnload event to opener
   */
  sendPopupUnload(): void {
    const message: Message = {
      id: generateUUID(),
      event: 'PopupUnload',
    };
    this.postMessage(message);
  }

  /**
   * Send PopupReady event to opener
   * Signals that popup is fully initialized and ready to receive business messages
   */
  sendPopupReady(): void {
    const message: Message = {
      id: generateUUID(),
      event: 'PopupReady',
    };
    this.postMessage(message);
  }

  /**
   * Send a response to a specific request
   */
  sendResponse(requestId: MessageID, data: unknown): void {
    const message: Message = {
      requestId,
      data,
    };
    this.postMessage(message);
  }

  /**
   * Send a raw message to the opener
   */
  sendMessage(message: Message): void {
    this.postMessage(message);
  }

  /**
   * Listen for messages from the opener or React Native WebView
   * Returns cleanup function
   */
  onMessage<T = unknown>(
    callback: (message: Message & { data?: T }) => void
  ): () => void {
    const handler = (event: MessageEvent) => {
      const isWebView = this.checkWebView();

      // In WebView mode, accept all messages (no opener check needed)
      // In popup mode, verify message source
      if (!isWebView) {
        if (this.opener && event.source !== this.opener) {
          return;
        }
      }

      // Lock origin on first valid message (not applicable in WebView mode)
      if (!isWebView && !this.origin && event.origin) {
        this.origin = event.origin;
      }

      // Verify origin matches (only in popup mode)
      if (!isWebView && this.origin && event.origin !== this.origin) {
        return;
      }

      // Parse message - WebView sends strings, popup sends objects
      let data = event.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (e) {
          // Not JSON, use as-is
        }
      }

      callback(data);
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }

  /**
   * Check if popup has an opener (or is in WebView mode)
   */
  hasOpener(): boolean {
    return this.opener !== null || this.checkWebView();
  }

  /**
   * Get current locked origin
   */
  getOrigin(): string | null {
    return this.origin;
  }

  /**
   * Internal method to post message to opener or WebView
   */
  private postMessage(message: Message): void {
    const isWebView = this.checkWebView();

    // WebView mode: use ReactNativeWebView.postMessage
    if (isWebView) {
      try {
        (window as any).ReactNativeWebView.postMessage(JSON.stringify(message));
      } catch (error) {
        console.error('Failed to send WebView message:', error);
      }
      return;
    }

    // Popup mode: use opener.postMessage
    if (!this.opener) {
      return;
    }

    const targetOrigin = this.origin || '*';

    try {
      this.opener.postMessage(message, targetOrigin);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }
}
