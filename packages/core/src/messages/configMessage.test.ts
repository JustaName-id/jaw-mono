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
 * the SDK persists it into dApp-side storage and the keys app seeds its
 * partitioned storage from it — so a malformed or forged payload must never
 * pass.
 */
describe('isValidAccountHint', () => {
    const valid = {
        username: 'ghadi.jaw.id',
        credentialId: 'A1b2-C3d4_E5f6',
        publicKey: '0xdeadbeef',
    };

    it('returns true for a well-formed hint', () => {
        expect(isValidAccountHint(valid)).toBe(true);
    });

    it('returns false for non-object / nullish values', () => {
        expect(isValidAccountHint(null)).toBe(false);
        expect(isValidAccountHint(undefined)).toBe(false);
        expect(isValidAccountHint('hint')).toBe(false);
        expect(isValidAccountHint(42)).toBe(false);
    });

    it('returns false when credentialId is empty or has invalid characters', () => {
        expect(isValidAccountHint({ ...valid, credentialId: '' })).toBe(false);
        expect(isValidAccountHint({ ...valid, credentialId: '<script>' })).toBe(false);
        expect(isValidAccountHint({ ...valid, credentialId: undefined })).toBe(false);
    });

    it('returns false when username is empty or not a string', () => {
        expect(isValidAccountHint({ ...valid, username: '' })).toBe(false);
        expect(isValidAccountHint({ ...valid, username: 7 })).toBe(false);
    });

    it('returns false when publicKey is not 0x-prefixed hex', () => {
        expect(isValidAccountHint({ ...valid, publicKey: 'deadbeef' })).toBe(false);
        expect(isValidAccountHint({ ...valid, publicKey: '0xNOTHEX' })).toBe(false);
        expect(isValidAccountHint({ ...valid, publicKey: undefined })).toBe(false);
    });
});
