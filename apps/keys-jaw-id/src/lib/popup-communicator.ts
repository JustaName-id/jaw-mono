/**
 * PopupCommunicator
 * Simple wrapper for postMessage communication with the opener window
 */

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
    // Get opener reference
    if (typeof window !== 'undefined') {
      this.opener = window.opener;

      // Auto-send PopupUnload when window closes (handles browser X button)
      if (this.opener) {
        window.addEventListener('beforeunload', () => {
          this.sendPopupUnload();
        });
      }
    }
  }

  /**
   * Send PopupLoaded event to opener
   */
  sendPopupLoaded(): void {
    console.log('📤 Sending PopupLoaded event');
    const message: Message = {
      id: crypto.randomUUID(),
      event: 'PopupLoaded',
    };
    this.postMessage(message);
  }

  /**
   * Send PopupUnload event to opener
   */
  sendPopupUnload(): void {
    console.log('📤 Sending PopupUnload event');
    const message: Message = {
      id: crypto.randomUUID(),
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
      id: crypto.randomUUID(),
      event: 'PopupReady',
    };
    this.postMessage(message);
  }

  /**
   * Send a response to a specific request
   */
  sendResponse(requestId: MessageID, data: unknown): void {
    console.log('📤 Sending response:', { requestId, data });
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
   * Listen for messages from the opener
   * Returns cleanup function
   */
  onMessage<T = unknown>(callback: (message: Message & { data?: T }) => void): () => void {
    const handler = (event: MessageEvent) => {
      // Ignore messages not from opener
      if (this.opener && event.source !== this.opener) {
        return;
      }

      // Lock origin on first valid message
      if (!this.origin && event.origin) {
        console.log('🔒 Locking origin to:', event.origin);
        this.origin = event.origin;
      }

      // Verify origin matches
      if (this.origin && event.origin !== this.origin) {
        console.warn('⚠️ Message from different origin, ignoring:', event.origin);
        return;
      }

      console.log('📥 Received message:', event.data);
      callback(event.data);
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }

  /**
   * Check if popup has an opener
   */
  hasOpener(): boolean {
    return this.opener !== null;
  }

  /**
   * Get current locked origin
   */
  getOrigin(): string | null {
    return this.origin;
  }

  /**
   * Internal method to post message to opener
   */
  private postMessage(message: Message): void {
    if (!this.opener) {
      console.error('❌ No opener window available');
      return;
    }

    // Use locked origin if available, otherwise '*'
    const targetOrigin = this.origin || '*';

    try {
      this.opener.postMessage(message, targetOrigin);
    } catch (error) {
      console.error('❌ Failed to send message:', error);
    }
  }
}
