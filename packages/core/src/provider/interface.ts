import { EventEmitter } from 'eventemitter3';

export interface RequestArguments {
    readonly method: string;
    readonly params?: readonly unknown[] | object;
}

export type Address = `0x${string}`;
export interface ProviderRpcError extends Error {
    message: string;
    code: number;
    data?: unknown;
}

export interface ProviderConnectInfo {
    readonly chainId: string;
}

type ProviderEventMap = {
    connect: ProviderConnectInfo;
    disconnect: ProviderRpcError;
    chainChanged: string;
    accountsChanged: string[];
};

export interface ProviderInterface extends EventEmitter<keyof ProviderEventMap> {
    request(args: RequestArguments): Promise<unknown>;
    disconnect(): Promise<void>;
    emit<K extends keyof ProviderEventMap>(event: K, ...args: [ProviderEventMap[K]]): boolean;
    on<K extends keyof ProviderEventMap>(event: K, listener: (_: ProviderEventMap[K]) => void): this;
}

export interface AppMetadata {
    /** Application name */
    appName: string;
    /** Application logo image URL; favicon is used if unspecified */
    appLogoUrl: string | null;
    /** Default chain ID to use on first connection (defaults to mainnet if not specified) */
    defaultChainId?: number;
}

export interface JawProviderPreference {
    /**
     * App-specific mode: signs directly in the app without popup (default: false)
     * - false: Cross-platform mode with popup authentication (default)
     * - true: App-specific mode with direct signing
     */
    appSpecific?: boolean;
    /** Popup URL for cross-platform mode (default: https://keys.jaw.id) */
    keysUrl?: string;
    /** Backend server URL for passkey storage (default: https://api.justaname.id/wallet/v2/passkeys) */
    serverUrl?: string;
    /** Used to issue subnames **/
    ens?: string;
}

export type ProviderEventCallback = ProviderInterface['emit'];

export class ProviderEventEmitter extends EventEmitter<keyof ProviderEventMap> {}

export interface ConstructorOptions {
    metadata: AppMetadata;
    preference: JawProviderPreference;
    apiKey: string;
    paymasterUrls?: Record<number, string>;
}