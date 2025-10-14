import { Message } from './message.js';

export interface ConfigMessage extends Message {
    event: ConfigEvent;
}

export type ConfigEvent =
    | 'PopupLoaded'
    | 'PopupUnload'

export type SignerType = 'scw'; // Replace with JawSigner || AppSpecificSigner
