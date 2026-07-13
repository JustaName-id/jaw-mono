import { describe, it, expect } from 'vitest';
import { RECONNECT_REQUIRED, isReconnectRequiredFailure, isValidAccountHint } from './configMessage.js';

/**
 * isReconnectRequiredFailure is the gate for the Safari iframe reconnect path.
 * It MUST return true only for the reconnect sentinel and false for every other
 * error, so existing/popup flows never trigger a reconnect+retry.
 */
describe('isReconnectRequiredFailure', () => {
    it('returns true for a failure carrying the reconnect sentinel', () => {
        const failure = {
            code: 4900,
            message: 'No session in this context; reconnect required',
            data: { reason: RECONNECT_REQUIRED },
        };
        expect(isReconnectRequiredFailure(failure)).toBe(true);
    });

    it('returns false for a normal protocol failure (no data)', () => {
        expect(isReconnectRequiredFailure({ code: 4001, message: 'User rejected' })).toBe(false);
    });

    it('returns false when data.reason is a different value', () => {
        expect(isReconnectRequiredFailure({ code: 4900, data: { reason: 'something-else' } })).toBe(false);
    });

    it('returns false for non-object / nullish errors', () => {
        expect(isReconnectRequiredFailure(null)).toBe(false);
        expect(isReconnectRequiredFailure(undefined)).toBe(false);
        expect(isReconnectRequiredFailure('reconnect')).toBe(false);
        expect(isReconnectRequiredFailure(new Error('boom'))).toBe(false);
    });

    it('returns false for an error whose data has no reason', () => {
        expect(isReconnectRequiredFailure({ code: 4900, data: {} })).toBe(false);
        expect(isReconnectRequiredFailure({ code: 4900, data: null })).toBe(false);
    });

    it('sentinel value is stable (shared wire contract with the keys app)', () => {
        expect(RECONNECT_REQUIRED).toBe('JAW_RECONNECT_REQUIRED');
    });
});

/**
 * isValidAccountHint gates the "last account" hint on both sides of the wire:
 * the SDK persists it into dApp-side storage and the keys app resolves it
 * against the backend on a handshake — so a malformed payload must never
 * pass. The hint is credentialId-only by design: publicKey and display name
 * never travel, they are looked up server-side at seed time.
 */
describe('isValidAccountHint', () => {
    const valid = {
        credentialId: 'A1b2-C3d4_E5f6',
    };

    it('returns true for a well-formed hint', () => {
        expect(isValidAccountHint(valid)).toBe(true);
    });

    it('tolerates extra fields (consumers pick credentialId only)', () => {
        expect(isValidAccountHint({ ...valid, username: 'x', publicKey: '0xdead' })).toBe(true);
    });

    it('returns false for non-object / nullish values', () => {
        expect(isValidAccountHint(null)).toBe(false);
        expect(isValidAccountHint(undefined)).toBe(false);
        expect(isValidAccountHint('hint')).toBe(false);
        expect(isValidAccountHint(42)).toBe(false);
    });

    it('returns false when credentialId is empty, missing, or has invalid characters', () => {
        expect(isValidAccountHint({ ...valid, credentialId: '' })).toBe(false);
        expect(isValidAccountHint({ ...valid, credentialId: '<script>' })).toBe(false);
        expect(isValidAccountHint({ ...valid, credentialId: undefined })).toBe(false);
        expect(isValidAccountHint({ ...valid, credentialId: 7 })).toBe(false);
    });

    it('returns false when credentialId exceeds the length cap', () => {
        // The validator gates writes into localStorage on both sides of the
        // wire — an unbounded string could blow the storage quota.
        expect(isValidAccountHint({ credentialId: 'a'.repeat(1024) })).toBe(true);
        expect(isValidAccountHint({ credentialId: 'a'.repeat(1025) })).toBe(false);
    });
});
