import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type Hex, type Address } from 'viem';

vi.mock('viem/actions', () => ({
    getCode: vi.fn(),
    readContract: vi.fn(),
    getGasPrice: vi.fn(),
    call: vi.fn(),
}));

vi.mock('./toJustanAccount.js', () => ({
    toJustanAccount: vi.fn(),
    abi: [
        {
            name: 'nextOwnerIndex',
            type: 'function',
            stateMutability: 'view',
            inputs: [],
            outputs: [{ type: 'uint256' }],
        },
        {
            name: 'ownerCount',
            type: 'function',
            stateMutability: 'view',
            inputs: [],
            outputs: [{ type: 'uint256' }],
        },
        {
            name: 'ownerAtIndex',
            type: 'function',
            stateMutability: 'view',
            inputs: [{ type: 'uint256' }],
            outputs: [{ type: 'bytes' }],
        },
    ],
    factoryAbi: [],
    JustanAccountImplementation: {},
}));

vi.mock('../constants.js', () => ({
    PERMISSIONS_MANAGER_ADDRESS: '0xf1b40E3D5701C04d86F7828f0EB367B9C90901D8',
    FACTORY_ADDRESS: '0x0000000000000000000000000000000000factory',
}));

vi.mock('../errors/errors.js', async () => {
    const actual = await vi.importActual<typeof import('../errors/errors.js')>('../errors/errors.js');
    return actual;
});

vi.mock('./delegation.js', () => ({
    isDelegatedToImplementation: vi.fn(),
}));

vi.mock('./paymaster.js', () => ({
    createPaymasterFunctions: vi.fn(),
}));

vi.mock('../rpc/permissions.js', () => ({
    getPermissionFromRelay: vi.fn(),
    relayPermissionToPermission: vi.fn(),
    encodeExecuteBatchWithPermission: vi.fn(),
}));

vi.mock('../analytics/index.js', () => ({
    notifyReceiptReceived: vi.fn(),
}));

vi.mock('viem', async () => {
    const actual = await vi.importActual<typeof import('viem')>('viem');
    return {
        ...actual,
        createPublicClient: vi.fn().mockReturnValue({}),
        http: vi.fn(),
    };
});

vi.mock('viem/account-abstraction', () => ({
    createBundlerClient: vi.fn(),
    createPaymasterClient: vi.fn(),
    toWebAuthnAccount: vi.fn(),
}));

import { getCode, readContract } from 'viem/actions';
import { toJustanAccount } from './toJustanAccount.js';
import { createSmartAccountForAddress, findOwnerIndex } from './smartAccount.js';

const MOCK_TARGET_ADDRESS = '0x1234567890123456789012345678901234567890' as Address;
const MOCK_PUBLIC_KEY =
    '0x04abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab' as Hex;
const MOCK_LOCAL_ADDRESS = '0xabcdef0123456789abcdef0123456789abcdef01' as Address;
const MOCK_LOCAL_ADDRESS_PADDED = '0x000000000000000000000000abcdef0123456789abcdef0123456789abcdef01' as Hex;
const MOCK_BUNDLER_CLIENT = { chain: { id: 1 } } as any;
const MOCK_WEBAUTHN_ACCOUNT = {
    type: 'webAuthn' as const,
    publicKey: MOCK_PUBLIC_KEY,
    sign: vi.fn(),
} as any;
/**
 * Answers reads by function name, so `ownerCount` and `nextOwnerIndex` can
 * disagree the way they do on an account that has removed an owner. Sequential
 * `mockResolvedValueOnce` chains cannot tell the two reads apart.
 */
function mockAccountWithRemovedOwner(owners: (Hex | undefined)[]) {
    vi.mocked(readContract).mockImplementation((async (_client: unknown, params: any) => {
        if (params.functionName === 'nextOwnerIndex') return BigInt(owners.length);
        if (params.functionName === 'ownerCount') return BigInt(owners.filter(Boolean).length);
        if (params.functionName === 'ownerAtIndex') return owners[Number(params.args[0])] ?? '0x';
        throw new Error(`unexpected read: ${params.functionName}`);
    }) as any);
}

const MOCK_LOCAL_ACCOUNT = {
    type: 'local' as const,
    address: MOCK_LOCAL_ADDRESS,
    sign: vi.fn(),
    signMessage: vi.fn(),
    signTransaction: vi.fn(),
    signTypedData: vi.fn(),
} as any;

describe('createSmartAccountForAddress', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('throws if account is not deployed (getCode returns undefined)', async () => {
        vi.mocked(getCode).mockResolvedValue(undefined);

        await expect(
            createSmartAccountForAddress(MOCK_TARGET_ADDRESS, MOCK_WEBAUTHN_ACCOUNT, MOCK_BUNDLER_CLIENT)
        ).rejects.toThrow(`Account ${MOCK_TARGET_ADDRESS} is not deployed`);
    });

    it('throws if passkey is not an owner (iterates all owners, none match)', async () => {
        vi.mocked(getCode).mockResolvedValue('0x1234' as Hex);
        vi.mocked(readContract)
            .mockResolvedValueOnce(2n) // nextOwnerIndex
            .mockResolvedValueOnce('0x00000000000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex) // ownerAtIndex(0)
            .mockResolvedValueOnce('0x00000000000000000000000000000000bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex); // ownerAtIndex(1)

        await expect(
            createSmartAccountForAddress(MOCK_TARGET_ADDRESS, MOCK_WEBAUTHN_ACCOUNT, MOCK_BUNDLER_CLIENT)
        ).rejects.toThrow(`Signer is not an owner on account ${MOCK_TARGET_ADDRESS}`);
    });

    it('creates smart account when passkey is owner at index 0', async () => {
        const mockSmartAccount = { address: MOCK_TARGET_ADDRESS } as any;
        vi.mocked(getCode).mockResolvedValue('0x1234' as Hex);
        vi.mocked(readContract)
            .mockResolvedValueOnce(1n) // nextOwnerIndex
            .mockResolvedValueOnce(MOCK_PUBLIC_KEY); // ownerAtIndex(0) matches
        vi.mocked(toJustanAccount).mockResolvedValue(mockSmartAccount);

        const result = await createSmartAccountForAddress(
            MOCK_TARGET_ADDRESS,
            MOCK_WEBAUTHN_ACCOUNT,
            MOCK_BUNDLER_CLIENT
        );

        expect(result).toBe(mockSmartAccount);
        expect(toJustanAccount).toHaveBeenCalledWith({
            client: MOCK_BUNDLER_CLIENT,
            owners: [MOCK_WEBAUTHN_ACCOUNT, '0xf1b40E3D5701C04d86F7828f0EB367B9C90901D8'],
            ownerIndex: 0,
            address: MOCK_TARGET_ADDRESS,
        });
    });

    it('finds passkey at non-zero owner index', async () => {
        const mockSmartAccount = { address: MOCK_TARGET_ADDRESS } as any;
        vi.mocked(getCode).mockResolvedValue('0x1234' as Hex);
        vi.mocked(readContract)
            .mockResolvedValueOnce(3n) // nextOwnerIndex
            .mockResolvedValueOnce('0x00000000000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex) // ownerAtIndex(0) - no match
            .mockResolvedValueOnce('0x00000000000000000000000000000000bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex) // ownerAtIndex(1) - no match
            .mockResolvedValueOnce(MOCK_PUBLIC_KEY); // ownerAtIndex(2) - match!
        vi.mocked(toJustanAccount).mockResolvedValue(mockSmartAccount);

        const result = await createSmartAccountForAddress(
            MOCK_TARGET_ADDRESS,
            MOCK_WEBAUTHN_ACCOUNT,
            MOCK_BUNDLER_CLIENT
        );

        expect(result).toBe(mockSmartAccount);
        expect(toJustanAccount).toHaveBeenCalledWith({
            client: MOCK_BUNDLER_CLIENT,
            owners: [MOCK_WEBAUTHN_ACCOUNT, '0xf1b40E3D5701C04d86F7828f0EB367B9C90901D8'],
            ownerIndex: 2,
            address: MOCK_TARGET_ADDRESS,
        });
    });

    it('creates smart account when local account address matches (padded to 32 bytes)', async () => {
        const mockSmartAccount = { address: MOCK_TARGET_ADDRESS } as any;
        vi.mocked(getCode).mockResolvedValue('0x1234' as Hex);
        vi.mocked(readContract)
            .mockResolvedValueOnce(1n) // nextOwnerIndex
            .mockResolvedValueOnce(MOCK_LOCAL_ADDRESS_PADDED); // ownerAtIndex(0) matches padded address
        vi.mocked(toJustanAccount).mockResolvedValue(mockSmartAccount);

        const result = await createSmartAccountForAddress(MOCK_TARGET_ADDRESS, MOCK_LOCAL_ACCOUNT, MOCK_BUNDLER_CLIENT);

        expect(result).toBe(mockSmartAccount);
        expect(toJustanAccount).toHaveBeenCalledWith({
            client: MOCK_BUNDLER_CLIENT,
            owners: [MOCK_LOCAL_ACCOUNT, '0xf1b40E3D5701C04d86F7828f0EB367B9C90901D8'],
            ownerIndex: 0,
            address: MOCK_TARGET_ADDRESS,
        });
    });

    // Regression: the scan used to stop at `ownerCount()`, which the contract
    // derives as `nextOwnerIndex - removedOwnersCount`. Remove one owner from
    // an account of three and the current owner at index 2 sits past the count,
    // so it was never read and the signer was told it owns nothing.
    it('finds an owner sitting past the owner count, after a removal', async () => {
        const mockSmartAccount = { address: MOCK_TARGET_ADDRESS } as any;
        vi.mocked(getCode).mockResolvedValue('0x1234' as Hex);
        // Index 0 removed, so ownerCount reads 2 while the owner lives at 2.
        mockAccountWithRemovedOwner([
            undefined,
            '0x00000000000000000000000000000000bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex,
            MOCK_PUBLIC_KEY,
        ]);
        vi.mocked(toJustanAccount).mockResolvedValue(mockSmartAccount);

        const result = await createSmartAccountForAddress(
            MOCK_TARGET_ADDRESS,
            MOCK_WEBAUTHN_ACCOUNT,
            MOCK_BUNDLER_CLIENT
        );

        expect(result).toBe(mockSmartAccount);
        expect(readContract).toHaveBeenCalledWith(
            MOCK_BUNDLER_CLIENT,
            expect.objectContaining({ functionName: 'nextOwnerIndex' })
        );
        expect(toJustanAccount).toHaveBeenCalledWith({
            client: MOCK_BUNDLER_CLIENT,
            owners: [MOCK_WEBAUTHN_ACCOUNT, '0xf1b40E3D5701C04d86F7828f0EB367B9C90901D8'],
            ownerIndex: 2,
            address: MOCK_TARGET_ADDRESS,
        });
    });

    it('throws if local account is not an owner', async () => {
        vi.mocked(getCode).mockResolvedValue('0x1234' as Hex);
        vi.mocked(readContract)
            .mockResolvedValueOnce(1n) // nextOwnerIndex
            .mockResolvedValueOnce('0x00000000000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex); // ownerAtIndex(0) - no match

        await expect(
            createSmartAccountForAddress(MOCK_TARGET_ADDRESS, MOCK_LOCAL_ACCOUNT, MOCK_BUNDLER_CLIENT)
        ).rejects.toThrow(`Signer is not an owner on account ${MOCK_TARGET_ADDRESS}`);
    });
});

describe('findOwnerIndex', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns 0 for an account with no code, without reading it', async () => {
        vi.mocked(getCode).mockResolvedValue(undefined);

        await expect(
            findOwnerIndex({ address: MOCK_TARGET_ADDRESS, client: MOCK_BUNDLER_CLIENT, publicKey: MOCK_PUBLIC_KEY })
        ).resolves.toBe(0);
        expect(readContract).not.toHaveBeenCalled();
    });

    // Same regression as above, on the path that picks the index for signing.
    // Falling back to 0 here wraps the signature for a different owner, which
    // the account rejects.
    it('finds an owner sitting past the owner count, after a removal', async () => {
        vi.mocked(getCode).mockResolvedValue('0x1234' as Hex);
        mockAccountWithRemovedOwner([
            undefined,
            '0x00000000000000000000000000000000bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex,
            MOCK_PUBLIC_KEY,
        ]);

        await expect(
            findOwnerIndex({ address: MOCK_TARGET_ADDRESS, client: MOCK_BUNDLER_CLIENT, publicKey: MOCK_PUBLIC_KEY })
        ).resolves.toBe(2);
    });

    it('returns 0 when the key owns nothing', async () => {
        vi.mocked(getCode).mockResolvedValue('0x1234' as Hex);
        vi.mocked(readContract)
            .mockResolvedValueOnce(1n) // nextOwnerIndex
            .mockResolvedValueOnce('0x00000000000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex); // ownerAtIndex(0)

        await expect(
            findOwnerIndex({ address: MOCK_TARGET_ADDRESS, client: MOCK_BUNDLER_CLIENT, publicKey: MOCK_PUBLIC_KEY })
        ).resolves.toBe(0);
    });

    it('returns 0 when reading the account fails', async () => {
        vi.mocked(getCode).mockResolvedValue('0x1234' as Hex);
        vi.mocked(readContract).mockRejectedValueOnce(new Error('rpc down'));
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        await expect(
            findOwnerIndex({ address: MOCK_TARGET_ADDRESS, client: MOCK_BUNDLER_CLIENT, publicKey: MOCK_PUBLIC_KEY })
        ).resolves.toBe(0);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});
