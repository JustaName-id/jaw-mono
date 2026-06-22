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

/**
 * Sentinel set on a response `failure` (in `failure.data.reason`) when the keys
 * iframe has no usable session and the SDK should re-establish one against the
 * iframe and retry — instead of surfacing a hard "reconnect" error. Carries no
 * secret. Shared by the keys app (emits) and the SDK signer (detects).
 */
export const RECONNECT_REQUIRED = 'JAW_RECONNECT_REQUIRED' as const;

/** True when a thrown protocol failure is the reconnect-required sentinel. */
export function isReconnectRequiredFailure(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const data = (error as { data?: { reason?: unknown } }).data;
    return data?.reason === RECONNECT_REQUIRED;
}

export type SignerType = 'crossPlatform' | 'appSpecific';
