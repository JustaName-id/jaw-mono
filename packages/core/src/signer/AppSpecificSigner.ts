import { EventBus } from '../events/EventBus.js';
import { Signer } from './interface.js';
import { AppMetadata, ProviderEventCallback, RequestArguments } from '../provider/interface.js';
import {store} from "../store/index.js";

type ConstructorOptions = {
    metadata: AppMetadata;
    callback: ProviderEventCallback;
};

/**
 * App-specific signer for embedded wallet experiences
 *
 * This signer emits events via EventBus instead of using popup communication.
 * UI components subscribe to these events to render approval dialogs within the app.
 *
 * @example
 * ```typescript
 * const signer = new AppSpecificSigner({
 *   metadata: { appName: 'My DApp', appChainIds: [1], appLogoUrl: null },
 *   callback: emit.bind(this)
 * });
 *
 * // Subscribe to auth events
 * signer.events.on('authRequired', (data, resolve, reject) => {
 *   showAuthModal(data).then(resolve).catch(reject);
 * });
 *
 * // Trigger authentication
 * await signer.request({ method: 'eth_requestAccounts' });
 * ```
 */
export class AppSpecificSigner implements Signer {
    /**
     * Event bus for UI communication
     * Exposed publicly so UI components can subscribe to events
     */
    public readonly events: EventBus;

    // private readonly metadata: AppMetadata;
    // private callback: ProviderEventCallback;
    //
    //
    // private accounts: Address[];
    // private chain: SDKChain;

    constructor(params: ConstructorOptions) {
        // this.metadata = params.metadata;
        // this.callback = params.callback;
        this.events = new EventBus();

        // const { account, chains } = store.getState();
        // this.accounts = account.accounts ?? [];
        // this.chain = account.chain ?? {
        //     id: params.metadata.appChainIds?.[0] ?? 1,
        // };

        // if (chains) {
        //     createClients(chains);
        // }
    }

    /**
     * Handle initial authentication/handshake
     *
     * No-op for app-specific mode - handshake is skipped in JAWProvider
     * since no encryption setup is needed (unlike popup mode with ECDH key exchange).
     * All authentication and signing happens via EventBus emissions in request() method.
     *
     * @param _args - The request arguments (intentionally unused)
     */
    async handshake(_args: RequestArguments): Promise<void> {
        // No-op: handshake is only needed for popup mode (key exchange)
        // JAWProvider skips calling this method for appSpecific signers anyway
    }

    /**
     * Handle wallet requests by emitting appropriate events
     * Routes different RPC methods to their corresponding event types
     *
     * @param args - The request arguments
     * @returns The result from the UI handler
     */
    async request<T>(args: RequestArguments): Promise<T> {
        // TODO: Implement request routing via EventBus
        throw new Error('AppSpecificSigner.request() not yet implemented');
    }

    /**
     * Cleanup resources and clear event listeners
     */
    async cleanup(): Promise<void> {
        // const metadata = store.config.get().metadata;

        this.events.clear();

        // clear the store
        store.account.clear();
        store.chains.clear();

        // reset the signer
        // this.accounts = [];
        // this.chain = {
        //     id: metadata?.appChainIds?.[0] ?? 1,
        // };
    }
}