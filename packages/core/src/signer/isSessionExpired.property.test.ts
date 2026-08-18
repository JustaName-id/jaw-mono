/**
 * `isSessionExpired` decides whether a returning user is silently reconnected
 * or made to authorize again. Getting it wrong in one direction re-attests a
 * session the user let lapse; in the other it costs a ceremony on every visit.
 *
 * The function had no test. These state the rule once, over generated clocks
 * and TTLs, instead of picking a few timestamps and hoping they are the
 * interesting ones.
 */
import fc from 'fast-check';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { isSessionExpired, DEFAULT_AUTH_TTL } from './SignerUtils.js';
import { store, sdkstore } from '../store/index.js';
import { SDK_VERSION } from '../sdk-info.js';

/**
 * `store.account.set` re-stamps `connectedAt` with the current time whenever
 * `accounts` is present, and an empty array is present as far as JavaScript is
 * concerned. So these set the stamp on its own, or the store would overwrite
 * the very value under test.
 */

/** A fixed "now" so a property never depends on how long the suite took. */
const NOW = 1_700_000_000_000;

function reset() {
    sdkstore.setState({ chains: [], keys: {}, account: {}, config: { version: SDK_VERSION }, callStatuses: {} }, true);
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    reset();
});
afterEach(() => {
    vi.useRealTimers();
});

describe('isSessionExpired', () => {
    it('expires exactly when the stamp is older than the TTL, and not a millisecond before', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 60 * 60 * 24 * 30 }), // TTL in seconds
                fc.integer({ min: -5_000, max: 5_000 }), // offset around the boundary
                (ttl, offset) => {
                    reset();
                    store.config.set({ preference: { authTTL: ttl } });
                    // Place connectedAt so that `now` lands `offset` ms past the deadline.
                    store.account.set({ connectedAt: NOW - ttl * 1000 - offset });

                    expect(isSessionExpired()).toBe(offset > 0);
                }
            )
        );
    });

    it('never expires a session it cannot date', () => {
        // No stamp means a legacy or in-memory-only session. Suppressing it
        // would log the user out on a fact we do not have.
        fc.assert(
            fc.property(fc.integer({ min: 0, max: 10_000 }), (ttl) => {
                reset();
                store.config.set({ preference: { authTTL: ttl } });
                // Nothing set at all: no stamp to judge by.

                expect(isSessionExpired()).toBe(false);
            })
        );
    });

    it('expires any dated session when caching is switched off', () => {
        fc.assert(
            fc.property(fc.integer({ min: 0, max: NOW }), (connectedAt) => {
                reset();
                store.config.set({ preference: { authTTL: 0 } });
                store.account.set({ connectedAt });

                expect(isSessionExpired()).toBe(true);
            })
        );
    });

    it('treats a stamp from the future as still live rather than as expired', () => {
        // A clock that moved backwards, or a stamp written by a machine running
        // ahead. Reading that as expired would throw away a session the user
        // just created.
        fc.assert(
            fc.property(fc.integer({ min: 1, max: 60 * 60 * 1000 }), (ahead) => {
                reset();
                store.config.set({ preference: { authTTL: DEFAULT_AUTH_TTL } });
                store.account.set({ connectedAt: NOW + ahead });

                expect(isSessionExpired()).toBe(false);
            })
        );
    });
});
