import { describe, it, expect } from 'vitest';
import { RECONNECT_REQUIRED, isReconnectRequiredFailure } from './configMessage.js';

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
