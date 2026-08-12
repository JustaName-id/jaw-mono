import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleGetCallsStatusRequest } from './wallet_getCallStatus.js';
import { standardErrorCodes } from '../errors/index.js';
import { store } from '../store/index.js';

describe('handleGetCallsStatusRequest', () => {
    beforeEach(() => {
        store.callStatuses.clear?.();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('rejects a missing batchId with -32602 (the params are wrong)', async () => {
        await expect(
            handleGetCallsStatusRequest({ method: 'wallet_getCallsStatus', params: [] })
        ).rejects.toMatchObject({ code: standardErrorCodes.rpc.invalidParams });
    });

    it('rejects an unrecognized batchId with EIP-5792 5730, not -32602', async () => {
        // A well-formed id this wallet has never seen — issued in another
        // browser, or local storage cleared. viem maps 5730 to
        // UnknownBundleIdError, which a dapp can branch on.
        await expect(
            handleGetCallsStatusRequest({ method: 'wallet_getCallsStatus', params: ['0xnotours'] })
        ).rejects.toMatchObject({
            code: standardErrorCodes.eip5792.unknownBundleId,
            message: expect.stringContaining('0xnotours'),
        });
    });

    it('returns the stored status for a known batchId', async () => {
        store.callStatuses.set('0xbatch', { status: 'completed', chainId: 1, receipts: [] });

        const result = await handleGetCallsStatusRequest({
            method: 'wallet_getCallsStatus',
            params: ['0xbatch'],
        });

        expect(result).toMatchObject({ id: '0xbatch', version: '2.0.0' });
    });
});
