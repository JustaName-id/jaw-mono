import { Message } from './message.js';

export interface ConfigMessage extends Message {
    event: ConfigEvent;
}

export type ConfigEvent =
    | 'PopupLoaded'
    | 'PopupUnload'
    | 'PopupReady'
    | 'selectSignerType'
    /** keys -> SDK: embedded flow completed/cancelled; replaces window.close() (no-op in iframes) */
    | 'DialogClose'
    /** keys -> SDK: user or visibility guard requests escaping the iframe to a popup */
    | 'SwitchTransport';

/** Payload of a DialogClose config message. */
export type DialogCloseData = {
    reason: 'completed' | 'cancelled';
};

/** Payload of a SwitchTransport config message. */
export type SwitchTransportData = {
    to: 'popup';
    reason: 'user' | 'visibility' | 'webauthn-unsupported';
};

export type SignerType = 'crossPlatform' | 'appSpecific';
