import { Message } from './message.js';

export interface ConfigMessage extends Message {
    event: ConfigEvent;
}

export type ConfigEvent =
    | 'PopupLoaded'
    | 'PopupUnload'
    | 'selectSignerType'

/**
 * Signer type determines which signer implementation to use
 * - 'crossPlatform': Smart Contract Wallet signer with popup authentication (cross-platform)
 * - 'appSpecific': App-specific signer with embedded UI via EventBus
 */
export type SignerType = 'crossPlatform' | 'appSpecific';
