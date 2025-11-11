import { Message } from './message.js';

export interface ConfigMessage extends Message {
    event: ConfigEvent;
}

export type ConfigEvent =
    | 'PopupLoaded'
    | 'PopupUnload'
    | 'PopupReady'
    | 'selectSignerType'

export type SignerType = 'crossPlatform'; // Add appSpecific
