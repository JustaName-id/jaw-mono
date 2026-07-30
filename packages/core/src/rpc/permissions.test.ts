import { beforeEach, describe, expect, test, vi } from 'vitest';
import { handleGetPermissionsRequest } from './permissions.js';
import { fetchRPCRequest } from '../utils/index.js';

vi.mock('../utils/index.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../utils/index.js')>();
    return {
        ...actual,
        fetchRPCRequest: vi.fn().mockResolvedValue([]),
    };
});

const ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;
const CONNECTED = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const;

function sentRequest() {
    return vi.mocked(fetchRPCRequest).mock.calls[0][0] as {
        params: Array<{ address?: string; chainId?: string }>;
    };
}

describe('handleGetPermissionsRequest', () => {
    beforeEach(() => {
        vi.mocked(fetchRPCRequest).mockClear();
    });

    test('Given address and chainId in params, When handled, Then both travel to the relay untouched', async () => {
        await handleGetPermissionsRequest(
            { method: 'wallet_getPermissions', params: [{ address: ADDRESS, chainId: '0x1' }] },
            'api-key'
        );

        expect(sentRequest().params[0]).toEqual({ address: ADDRESS, chainId: '0x1' });
    });

    test('Given no address but a connected account, When handled, Then the connected address is injected', async () => {
        await handleGetPermissionsRequest({ method: 'wallet_getPermissions', params: [] }, 'api-key', CONNECTED);

        expect(sentRequest().params[0]).toEqual({ address: CONNECTED });
    });

    test('Given a chainId but no address, When the connected address is injected, Then the chain filter is preserved', async () => {
        await handleGetPermissionsRequest(
            { method: 'wallet_getPermissions', params: [{ chainId: '0x2105' }] },
            'api-key',
            CONNECTED
        );

        expect(sentRequest().params[0]).toEqual({ address: CONNECTED, chainId: '0x2105' });
    });

    test('Given no address and no connected account, When handled, Then it rejects with invalid params and nothing is sent', async () => {
        await expect(
            handleGetPermissionsRequest({ method: 'wallet_getPermissions', params: [] }, 'api-key')
        ).rejects.toMatchObject({ message: expect.stringContaining('address') });

        expect(fetchRPCRequest).not.toHaveBeenCalled();
    });
});
