import { RequestArguments } from '../provider/interface.js';

/**
 * Event types emitted by the EmbeddedSigner
 * These correspond to user interactions that require UI approval
 *
 * Note on wallet_sign (ERC-7871):
 * The ERC-7871 wallet_sign method is a unified signing API that covers multiple EIP-191 versions:
 * - 0x45: Personal Sign (plain messages)
 * - 0x01: EIP-712 Typed Data (structured data)
 * - 0x00: Data with validator
 *
 * The EmbeddedSigner should parse wallet_sign requests and route them to the appropriate event:
 * - wallet_sign with version 0x45 → emit 'signMessage' event with method='personal_sign'
 * - wallet_sign with version 0x01 → emit 'signTypedData' event with method='eth_signTypedData_v4'
 *
 */
export type EventType =
    | 'authRequired'      // User needs to authenticate (eth_requestAccounts, wallet_connect)
    | 'signMessage'       // User needs to approve message signing (personal_sign)
    | 'signTypedData'     // User needs to approve typed data signing (eth_signTypedData variants)
    | 'transactionRequest' // User needs to approve transaction (eth_sendTransaction, wallet_sendCalls)
    | 'switchChain'       // User needs to approve chain switch (wallet_switchEthereumChain)
    | 'watchAsset';       // User needs to approve watching an asset (wallet_watchAsset)

/**
 * Event payload data structures for each event type
 */
export type EventPayload = {
    authRequired: {
        method: 'eth_requestAccounts' | 'wallet_connect';
        params?: RequestArguments['params'];
        chainId: number;
    };
    signMessage: {
        method: 'personal_sign';
        params: RequestArguments['params'];
        chainId: number;
        account: string;
    };
    signTypedData: {
        method: 'eth_signTypedData' | 'eth_signTypedData_v1' | 'eth_signTypedData_v3' | 'eth_signTypedData_v4';
        params: RequestArguments['params'];
        chainId: number;
        account: string;
    };
    transactionRequest: {
        method: 'eth_sendTransaction' | 'wallet_sendCalls';
        params: RequestArguments['params'];
        chainId: number;
        account: string;
    };
    switchChain: {
        chainId: number;
        currentChainId: number;
    };
    watchAsset: {
        params: RequestArguments['params'];
    };
};

/**
 * Callback function signature for event listeners
 * @param data - The event-specific payload data
 * @param resolve - Function to call with the result when the user approves
 * @param reject - Function to call with an error when the user rejects
 */
export type EventCallback<T extends EventType> = (
    data: EventPayload[T],
    resolve: (value: unknown) => void,
    reject: (error: Error) => void
) => void;

/**
 * Framework-agnostic event bus for handling embedded signer events
 *
 * This EventBus enables communication between the EmbeddedSigner and UI components
 * without coupling the core logic to any specific UI framework.
 *
 * @example
 * ```typescript
 * const eventBus = new EventBus();
 *
 * // Subscribe to auth events
 * const unsubscribe = eventBus.on('authRequired', (data, resolve, reject) => {
 *   showAuthModal(data)
 *     .then(accounts => resolve(accounts))
 *     .catch(err => reject(err));
 * });
 *
 * // Emit an event (returns a Promise)
 * const accounts = await eventBus.emit('authRequired', {
 *   method: 'eth_requestAccounts',
 *   chainId: 1
 * });
 *
 * // Clean up
 * unsubscribe();
 * ```
 */
export class EventBus {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private listeners = new Map<EventType, Set<EventCallback<any>>>();

    /**
     * Subscribe to an event
     * @param event - The event type to listen for
     * @param callback - The callback function to execute when the event is emitted
     * @returns An unsubscribe function to remove the listener
     */
    on<T extends EventType>(event: T, callback: EventCallback<T>): () => void {
        let callbacks = this.listeners.get(event);
        if (!callbacks) {
            callbacks = new Set();
            this.listeners.set(event, callbacks);
        }
        callbacks.add(callback);

        // Return unsubscribe function
        return () => this.off(event, callback);
    }

    /**
     * Unsubscribe from an event
     * @param event - The event type to stop listening for
     * @param callback - The callback function to remove
     */
    off<T extends EventType>(event: T, callback: EventCallback<T>): void {
        this.listeners.get(event)?.delete(callback);
    }

    /**
     * Emit an event and wait for a UI handler to resolve/reject
     * @param event - The event type to emit
     * @param data - The event-specific payload data
     * @returns A Promise that resolves with the result from the UI handler
     * @throws Error if no handler is registered for the event
     */
    async emit<T extends EventType>(
        event: T,
        data: EventPayload[T]
    ): Promise<unknown> {
        const callbacks = this.listeners.get(event);

        if (!callbacks || callbacks.size === 0) {
            throw new Error(
                `No handler registered for event: ${event}. ` +
                `Make sure JAWUIProvider is mounted or a manual handler is configured.`
            );
        }

        // Create a promise that will be resolved/rejected by the UI handler
        return new Promise((resolve, reject) => {
            // In auto mode, there will typically be only one listener
            // In manual mode, there could be multiple listeners
            // We call all of them, but the first one to resolve/reject wins
            callbacks.forEach(callback => {
                try {
                    callback(data, resolve, reject);
                } catch (error) {
                    // If the callback itself throws, reject the promise
                    reject(error instanceof Error ? error : new Error(String(error)));
                }
            });
        });
    }

    /**
     * Check if there are any listeners for a specific event
     * @param event - The event type to check
     * @returns true if there are listeners, false otherwise
     */
    hasListeners(event: EventType): boolean {
        const callbacks = this.listeners.get(event);
        return callbacks !== undefined && callbacks.size > 0;
    }

    /**
     * Remove all listeners for a specific event or all events
     * @param event - Optional event type to clear. If not provided, clears all events
     */
    clear(event?: EventType): void {
        if (event) {
            this.listeners.delete(event);
        } else {
            this.listeners.clear();
        }
    }

    /**
     * Get the number of listeners for a specific event
     * @param event - The event type to check
     * @returns The number of listeners
     */
    listenerCount(event: EventType): number {
        return this.listeners.get(event)?.size ?? 0;
    }
}
