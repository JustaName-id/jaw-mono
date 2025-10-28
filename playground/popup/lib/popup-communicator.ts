import type { Message, MessageID } from '@jaw.id/core';

export class PopupCommunicator {
  private opener: Window | null = null;
  private origin: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.opener = window.opener;
    }
  }

  /**
   * Notify the opener that the popup has loaded
   */
  sendPopupLoaded(): void {
    const message = {
      id: crypto.randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
      event: 'PopupLoaded',
    };
    console.log('Sending PopupLoaded:', message);
    this.postMessage(message);
  }

  /**
   * Notify the opener that the popup is unloading
   */
  sendPopupUnload(): void {
    const message = {
      id: crypto.randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
      event: 'PopupUnload',
    };
    this.postMessage(message);
  }

  /**
   * Send a response message back to the opener
   */
  sendResponse(requestId: MessageID, data: unknown): void {
    const message = {
      requestId,
      data,
    };
    this.postMessage(message);
  }

  /**
   * Send an error response back to the opener
   */
  sendError(requestId: MessageID, error: { code: number; message: string }): void {
    const message = {
      requestId,
      data: { error },
    };
    this.postMessage(message);
  }

  /**
   * Post message to the opener window
   */
  private postMessage(message: Message): void {
    if (!this.opener) {
      console.warn('No opener window available');
      return;
    }

    // For the first message (PopupLoaded), we need to accept any origin
    // The origin will be set when we receive the first message back
    const targetOrigin = this.origin || '*';

    console.log('Posting message to opener:', { message, targetOrigin });

    try {
      this.opener.postMessage(message, targetOrigin);
    } catch (error) {
      console.error('Failed to post message to opener:', error);
    }
  }

  /**
   * Listen for messages from the opener
   */
  onMessage<T = unknown>(callback: (message: Message & { data?: T }) => void): () => void {
    const handler = (event: MessageEvent) => {
      console.log('Popup received postMessage event:', {
        origin: event.origin,
        source: event.source === this.opener ? 'opener' : 'other',
        data: event.data,
      });

      // Store the origin from the first valid message
      if (!this.origin && event.origin) {
        this.origin = event.origin;
        console.log('Set popup origin to:', this.origin);
      }

      // Validate that the message is from the opener
      if (event.source !== this.opener) {
        console.warn('Message not from opener, ignoring');
        return;
      }

      callback(event.data);
    };

    window.addEventListener('message', handler);

    // Return cleanup function
    return () => {
      window.removeEventListener('message', handler);
    };
  }

  /**
   * Check if the popup has a valid opener
   */
  hasOpener(): boolean {
    return this.opener !== null && !this.opener.closed;
  }
}
