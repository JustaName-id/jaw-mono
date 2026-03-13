import { Message, MessageID } from "../messages/message.js";

/**
 * Configuration passed to adapter's init() method.
 * Contains app metadata and SDK settings needed by mobile adapters.
 */
export interface CommunicationAdapterConfig {
  apiKey: string;
  appName: string;
  appLogoUrl?: string;
  defaultChainId?: number;
  keysUrl?: string;
  showTestnets?: boolean;
}

/**
 * Abstract communication interface for the SDK.
 * Implementations handle the transport layer between the SDK and the signing surface.
 *
 * - Web: Uses popup windows via `WebCommunicationAdapter` (wraps `Communicator`)
 * - Mobile: Uses deep links or custom transports via platform-specific adapters
 */
export interface CommunicationAdapter {
  /**
   * Initialize the adapter with configuration.
   * Called by the SDK before any other methods.
   * Optional — only needed for adapters that require initialization (e.g., mobile).
   */
  init?(config: CommunicationAdapterConfig): void;

  /**
   * Prepare the adapter to send/receive messages.
   * For web: Opens popup window and waits for it to load.
   * For mobile: Prepares deep link listeners or opens the signing app.
   *
   * MUST be idempotent — may be called multiple times per session.
   * Subsequent calls should reuse the existing transport if already ready.
   */
  waitForReady(): Promise<void>;

  /**
   * Send a request message and wait for a matching response.
   * The response is matched by the request's message ID.
   */
  postRequestAndWaitForResponse<M extends Message>(
    request: Message & { id: MessageID },
  ): Promise<M>;

  /**
   * Send a one-way message (no response expected).
   * For web: Posts a message to the popup window.
   * For mobile: Sends via deep link or custom transport.
   */
  postMessage(message: Message): Promise<void>;

  /**
   * Wait for a message matching the given predicate.
   * Returns a promise that resolves when a matching message is received.
   */
  onMessage<M extends Message>(
    predicate: (msg: Partial<M>) => boolean,
  ): Promise<M>;

  /**
   * Disconnect and clean up resources.
   * For web: Closes the popup window and removes event listeners.
   * For mobile: Cleans up deep link listeners.
   */
  disconnect(): void;
}
