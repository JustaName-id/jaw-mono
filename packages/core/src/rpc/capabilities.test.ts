import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../utils/index.js', async () => {
    const actual = await vi.importActual<typeof import('../utils/index.js')>('../utils/index.js');
    return { ...actual, fetchRPCRequest: vi.fn() };
});

import { fetchRPCRequest } from '../utils/index.js';
import { handleGetCapabilitiesRequest, clearCapabilitiesCache } from './capabilities.js';

const API_KEY = 'test-api-key';
const REQUEST = { method: 'wallet_getCapabilities', params: [] } as const;
const RESPONSE = { '0x1': { atomic: { status: 'supported' } } };

/**
 * The transaction dialog fetches capabilities to build its fee-token list, and
 * that fetch sits between the dialog opening and its Confirm button unlocking.
 * These cover the memoization that keeps it off the critical path — including
 * the cases where serving a cached answer would be wrong.
 */
describe('handleGetCapabilitiesRequest caching', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearCapabilitiesCache();
        vi.mocked(fetchRPCRequest).mockResolvedValue(RESPONSE);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('serves a repeat call from cache instead of re-fetching', async () => {
        const first = await handleGetCapabilitiesRequest({ ...REQUEST }, API_KEY);
        const second = await handleGetCapabilitiesRequest({ ...REQUEST }, API_KEY);

        expect(fetchRPCRequest).toHaveBeenCalledTimes(1);
        expect(second).toEqual(first);
        expect(second).toEqual(RESPONSE);
    });

    it('collapses concurrent callers onto a single request', async () => {
        const [a, b, c] = await Promise.all([
            handleGetCapabilitiesRequest({ ...REQUEST }, API_KEY),
            handleGetCapabilitiesRequest({ ...REQUEST }, API_KEY),
            handleGetCapabilitiesRequest({ ...REQUEST }, API_KEY),
        ]);

        expect(fetchRPCRequest).toHaveBeenCalledTimes(1);
        expect(a).toEqual(RESPONSE);
        expect(b).toEqual(RESPONSE);
        expect(c).toEqual(RESPONSE);
    });

    it('keeps different api keys apart', async () => {
        await handleGetCapabilitiesRequest({ ...REQUEST }, 'key-a');
        await handleGetCapabilitiesRequest({ ...REQUEST }, 'key-b');

        expect(fetchRPCRequest).toHaveBeenCalledTimes(2);
    });

    it('keeps different chain filters apart', async () => {
        await handleGetCapabilitiesRequest({ method: 'wallet_getCapabilities', params: [undefined, ['0x1']] }, API_KEY);
        await handleGetCapabilitiesRequest(
            { method: 'wallet_getCapabilities', params: [undefined, ['0x2105']] },
            API_KEY
        );

        expect(fetchRPCRequest).toHaveBeenCalledTimes(2);
    });

    it('keeps the testnet and mainnet scopes apart', async () => {
        await handleGetCapabilitiesRequest({ ...REQUEST }, API_KEY, false);
        await handleGetCapabilitiesRequest({ ...REQUEST }, API_KEY, true);

        expect(fetchRPCRequest).toHaveBeenCalledTimes(2);
    });

    it('does not cache a failure', async () => {
        vi.mocked(fetchRPCRequest).mockRejectedValueOnce(new Error('network down'));

        await expect(handleGetCapabilitiesRequest({ ...REQUEST }, API_KEY)).rejects.toThrow('network down');

        // A transient failure must not stick for the rest of the TTL.
        await expect(handleGetCapabilitiesRequest({ ...REQUEST }, API_KEY)).resolves.toEqual(RESPONSE);
        expect(fetchRPCRequest).toHaveBeenCalledTimes(2);
    });

    it('re-fetches once the entry goes stale', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

        await handleGetCapabilitiesRequest({ ...REQUEST }, API_KEY);
        expect(fetchRPCRequest).toHaveBeenCalledTimes(1);

        vi.setSystemTime(new Date('2026-01-01T00:00:30Z'));
        await handleGetCapabilitiesRequest({ ...REQUEST }, API_KEY);
        expect(fetchRPCRequest).toHaveBeenCalledTimes(1);

        // Past the TTL, an operator-side config change becomes visible again.
        vi.setSystemTime(new Date('2026-01-01T00:01:01Z'));
        await handleGetCapabilitiesRequest({ ...REQUEST }, API_KEY);
        expect(fetchRPCRequest).toHaveBeenCalledTimes(2);
    });

    it('re-fetches after the cache is cleared', async () => {
        await handleGetCapabilitiesRequest({ ...REQUEST }, API_KEY);
        clearCapabilitiesCache();
        await handleGetCapabilitiesRequest({ ...REQUEST }, API_KEY);

        expect(fetchRPCRequest).toHaveBeenCalledTimes(2);
    });
});
