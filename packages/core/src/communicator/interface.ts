import { Message, MessageID } from '../messages/message.js';

/**
 * Configuration passed to CommunicationAdapter during initialization.
 * Contains all metadata needed to establish communication with keys.jaw.id.
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
 * CommunicationAdapter interface
 *
 * Abstracts the communication layer between the app and keys.jaw.id.
 * Implementations can use different transport mechanisms:
 * - Web: window.postMessage with popup windows
 * - Mobile: Deep links with Safari View Controller / Chrome Custom Tab
 *
 * This enables the core SDK to work across platforms without
 * depending on platform-specific APIs.
 */
export interface CommunicationAdapter {
    /**
     * Initialize the adapter with configuration.
     * Called by the SDK before any other methods.
     * Optional - only needed for adapters that require initialization.
     *
     * @param config - Configuration containing apiKey, appName, etc.
     */
    init?(config: CommunicationAdapterConfig): void;

    /**
     * Initialize and wait for the communication channel to be ready.
     * For web: Opens popup window and waits for it to load
     * For mobile: Prepares deep link listeners
     *
     * @returns Promise that resolves when ready
     */
    waitForReady(): Promise<void>;

    /**
     * Send a request and wait for a response.
     * This is the primary method used by signers.
     *
     * @param request - The request message with an ID
     * @returns Promise resolving to the response message
     */
    postRequestAndWaitForResponse<M extends Message>(
        request: Message & { id: MessageID }
    ): Promise<M>;

    /**
     * Post a message without waiting for response.
     * Used for fire-and-forget messages.
     *
     * @param message - The message to send
     */
    postMessage(message: Message): Promise<void>;

    /**
     * Listen for messages matching a predicate.
     * Returns a promise that resolves when a matching message arrives.
     *
     * @param predicate - Function to test if a message matches
     * @returns Promise resolving to the matching message
     */
    onMessage<M extends Message>(
        predicate: (msg: Partial<M>) => boolean
    ): Promise<M>;

    /**
     * Cleanup all resources.
     * For web: Closes popup and removes event listeners
     * For mobile: Removes deep link listeners
     */
    disconnect(): void;
}
