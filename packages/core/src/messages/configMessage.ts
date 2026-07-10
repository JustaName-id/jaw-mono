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
    /** keys -> SDK: connected account hint, persisted dApp-side to survive partitioned/ephemeral iframe storage */
    | 'AccountHint';

/** Payload of a DialogClose config message. */
export type DialogCloseData = {
    reason: 'completed' | 'cancelled';
};

/** Payload of a SwitchTransport config message. */
export type SwitchTransportData = {
    to: 'popup';
    reason: 'user' | 'visibility' | 'webauthn-unsupported';
};

/**
 * Payload of an AccountHint config message (keys -> SDK), and the shape the
 * SDK sends back on the handshake as `lastAccount`.
 *
 * Cross-site iframe storage is partitioned everywhere and *ephemeral* in
 * Brave/Safari, so the embedded keys app forgets its accounts between visits.
 * The dApp's own first-party storage is not — so after the user approves a
 * connection, keys sends this hint, the SDK persists it, and the next
 * embedded handshake carries it back so keys can seed its "Continue as"
 * screen. It is a UI hint only: continuing still runs the full passkey
 * ceremony, and it carries nothing the dApp does not already learn at
 * connect time.
 */
export type AccountHintData = {
    /** Wallet address (checksummed) */
    address: `0x${string}`;
    /** Display name (e.g., ENS name or username) */
    username: string;
    /** Passkey credential ID used for authentication */
    credentialId: string;
    /** Passkey public key (for WebAuthn operations) */
    publicKey: `0x${string}`;
};

/**
 * Validate an account hint from the wire. Both sides gate on this: the SDK
 * before persisting into dApp-side storage, the keys app before seeding its
 * account list from a handshake.
 */
export function isValidAccountHint(hint: unknown): hint is AccountHintData {
    if (!hint || typeof hint !== 'object') return false;
    const h = hint as Record<string, unknown>;
    return (
        typeof h.address === 'string' &&
        /^0x[0-9a-fA-F]{40}$/.test(h.address) &&
        typeof h.username === 'string' &&
        h.username.length > 0 &&
        typeof h.credentialId === 'string' &&
        /^[A-Za-z0-9_-]+$/.test(h.credentialId) &&
        typeof h.publicKey === 'string' &&
        /^0x[0-9a-fA-F]+$/.test(h.publicKey)
    );
}

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
