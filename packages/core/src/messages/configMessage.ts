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
    | 'SwitchTransport'
    /**
     * keys -> SDK: the iframe has no usable session (e.g. Safari storage
     * partitioning isolated it from a popup-created session) and cannot decrypt
     * the request. Asks the SDK to re-establish a session against the iframe and
     * replay the request. Carries no secret.
     */
    | 'ReconnectRequired';

/** Payload of a DialogClose config message. */
export type DialogCloseData = {
    reason: 'completed' | 'cancelled';
};

/** Payload of a SwitchTransport config message. */
export type SwitchTransportData = {
    to: 'popup';
    reason: 'user' | 'visibility' | 'webauthn-unsupported';
};

/** Payload of a ReconnectRequired config message. Carries no secret. */
export type ReconnectRequiredData = {
    reason: 'no-session';
};

export type SignerType = 'crossPlatform' | 'appSpecific';
