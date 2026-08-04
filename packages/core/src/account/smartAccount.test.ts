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

import { getCode, readContract, getGasPrice } from 'viem/actions';
import { createBundlerClient } from 'viem/account-abstraction';
import { toJustanAccount } from './toJustanAccount.js';
import {
    createSmartAccount,
    createSmartAccountForAddress,
    findOwnerIndex,
    getBundlerClient,
    clearBundlerClientCache,
    calculateGas,
} from './smartAccount.js';

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
            .mockResolvedValueOnce(2n) // ownerCount
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
            .mockResolvedValueOnce(1n) // ownerCount
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
            .mockResolvedValueOnce(3n) // ownerCount
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
            .mockResolvedValueOnce(1n) // ownerCount
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

    it('throws if local account is not an owner', async () => {
        vi.mocked(getCode).mockResolvedValue('0x1234' as Hex);
        vi.mocked(readContract)
            .mockResolvedValueOnce(1n) // ownerCount
            .mockResolvedValueOnce('0x00000000000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex); // ownerAtIndex(0) - no match

        await expect(
            createSmartAccountForAddress(MOCK_TARGET_ADDRESS, MOCK_LOCAL_ACCOUNT, MOCK_BUNDLER_CLIENT)
        ).rejects.toThrow(`Signer is not an owner on account ${MOCK_TARGET_ADDRESS}`);
    });
});

/**
 * These cover the round trips the transaction dialog spends before it can be
 * confirmed. They assert request *shape and count*, not just results: the
 * results were already correct when each of these ran serially, and a
 * regression here is invisible except as latency.
 */
describe('critical-path round trips', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearBundlerClientCache();
    });

    describe('findOwnerIndex', () => {
        const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

        it('issues every ownerAtIndex read before any of them resolves', async () => {
            vi.mocked(getCode).mockResolvedValue('0x1234' as Hex);
            const pending: ((value: Hex) => void)[] = [];
            vi.mocked(readContract).mockImplementation((_client: any, params: any) => {
                if (params.functionName === 'ownerCount') return Promise.resolve(3n) as any;
                return new Promise<Hex>((resolve) => pending.push(resolve)) as any;
            });

            const result = findOwnerIndex({
                address: MOCK_TARGET_ADDRESS,
                client: MOCK_BUNDLER_CLIENT,
                publicKey: MOCK_PUBLIC_KEY,
            });

            await flushMicrotasks();

            // All three are in flight at once. A serial walk would have exactly
            // one outstanding read here.
            expect(pending).toHaveLength(3);

            pending[0]('0x00000000000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex);
            pending[1](MOCK_PUBLIC_KEY);
            pending[2]('0x00000000000000000000000000000000bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex);

            await expect(result).resolves.toBe(1);
        });

        it('reads the code and the owner count concurrently', async () => {
            let codeIssued = false;
            let ownerCountIssuedBeforeCodeResolved = false;
            vi.mocked(getCode).mockImplementation(
                () =>
                    new Promise((resolve) => {
                        codeIssued = true;
                        setTimeout(() => resolve('0x1234' as Hex), 0);
                    }) as any
            );
            vi.mocked(readContract).mockImplementation((_client: any, params: any) => {
                if (params.functionName === 'ownerCount') {
                    ownerCountIssuedBeforeCodeResolved = codeIssued;
                    return Promise.resolve(1n) as any;
                }
                return Promise.resolve(MOCK_PUBLIC_KEY) as any;
            });

            await findOwnerIndex({
                address: MOCK_TARGET_ADDRESS,
                client: MOCK_BUNDLER_CLIENT,
                publicKey: MOCK_PUBLIC_KEY,
            });

            expect(ownerCountIssuedBeforeCodeResolved).toBe(true);
        });

        it('returns 0 for an undeployed account without consulting the owner reads', async () => {
            vi.mocked(getCode).mockResolvedValue(undefined);
            // Mirrors a real node: ownerCount reverts against an address with no code.
            vi.mocked(readContract).mockRejectedValue(new Error('execution reverted'));

            await expect(
                findOwnerIndex({
                    address: MOCK_TARGET_ADDRESS,
                    client: MOCK_BUNDLER_CLIENT,
                    publicKey: MOCK_PUBLIC_KEY,
                })
            ).resolves.toBe(0);
        });

        it('propagates a failed code read rather than reporting index 0', async () => {
            vi.mocked(getCode).mockRejectedValue(new Error('rpc down'));
            vi.mocked(readContract).mockResolvedValue(1n as any);

            await expect(
                findOwnerIndex({
                    address: MOCK_TARGET_ADDRESS,
                    client: MOCK_BUNDLER_CLIENT,
                    publicKey: MOCK_PUBLIC_KEY,
                })
            ).rejects.toThrow('rpc down');
        });

        it('falls back to index 0 when the owner count cannot be read', async () => {
            vi.mocked(getCode).mockResolvedValue('0x1234' as Hex);
            vi.mocked(readContract).mockRejectedValue(new Error('execution reverted'));

            await expect(
                findOwnerIndex({
                    address: MOCK_TARGET_ADDRESS,
                    client: MOCK_BUNDLER_CLIENT,
                    publicKey: MOCK_PUBLIC_KEY,
                })
            ).resolves.toBe(0);
        });

        it('returns the lowest matching index when an owner appears more than once', async () => {
            vi.mocked(getCode).mockResolvedValue('0x1234' as Hex);
            vi.mocked(readContract).mockImplementation((_client: any, params: any) => {
                if (params.functionName === 'ownerCount') return Promise.resolve(3n) as any;
                return Promise.resolve(MOCK_PUBLIC_KEY) as any;
            });

            await expect(
                findOwnerIndex({
                    address: MOCK_TARGET_ADDRESS,
                    client: MOCK_BUNDLER_CLIENT,
                    publicKey: MOCK_PUBLIC_KEY,
                })
            ).resolves.toBe(0);
        });
    });

    describe('createSmartAccount', () => {
        it('reuses the derived address instead of making the factory recompute it', async () => {
            const tempAccount = { getAddress: vi.fn().mockResolvedValue(MOCK_TARGET_ADDRESS) } as any;
            const finalAccount = { address: MOCK_TARGET_ADDRESS } as any;
            vi.mocked(toJustanAccount).mockResolvedValueOnce(tempAccount).mockResolvedValueOnce(finalAccount);
            vi.mocked(getCode).mockResolvedValue('0x1234' as Hex);
            vi.mocked(readContract).mockImplementation((_client: any, params: any) => {
                if (params.functionName === 'ownerCount') return Promise.resolve(1n) as any;
                return Promise.resolve(MOCK_PUBLIC_KEY) as any;
            });

            const result = await createSmartAccount(MOCK_WEBAUTHN_ACCOUNT, MOCK_BUNDLER_CLIENT);

            expect(result).toBe(finalAccount);
            // The first construction is what derives the address (one factory
            // read); the second must be handed that address, or it pays for the
            // identical read a second time.
            expect(vi.mocked(toJustanAccount).mock.calls[0][0]).not.toHaveProperty('address');
            expect(vi.mocked(toJustanAccount).mock.calls[1][0]).toMatchObject({
                address: MOCK_TARGET_ADDRESS,
                ownerIndex: 0,
            });
        });
    });

    describe('getBundlerClient', () => {
        beforeEach(() => {
            let created = 0;
            vi.mocked(createBundlerClient).mockImplementation((() => ({ id: ++created })) as any);
        });

        it('hands back the same client for an identical configuration', () => {
            const chain = { id: 1, rpcUrl: 'https://rpc.test/1' };

            const first = getBundlerClient(chain);
            const second = getBundlerClient(chain);

            expect(second).toBe(first);
            expect(createBundlerClient).toHaveBeenCalledTimes(1);
        });

        it('treats a different chain, rpc url, paymaster or context as a different client', () => {
            const base = { id: 1, rpcUrl: 'https://rpc.test/1' };

            const plain = getBundlerClient(base);
            const otherChain = getBundlerClient({ id: 8453, rpcUrl: 'https://rpc.test/1' });
            const otherRpc = getBundlerClient({ id: 1, rpcUrl: 'https://rpc.test/other' });
            const withPaymaster = getBundlerClient(base, 'https://paymaster.test');
            const withContext = getBundlerClient(base, 'https://paymaster.test', { token: '0xabc' });

            const clients = [plain, otherChain, otherRpc, withPaymaster, withContext];
            expect(new Set(clients).size).toBe(clients.length);
        });

        it('does not confuse paymaster contexts that differ only in value', () => {
            const chain = { id: 1, rpcUrl: 'https://rpc.test/1' };

            const usdc = getBundlerClient(chain, 'https://paymaster.test', { token: '0xusdc' });
            const dai = getBundlerClient(chain, 'https://paymaster.test', { token: '0xdai' });
            const usdcAgain = getBundlerClient(chain, 'https://paymaster.test', { token: '0xusdc' });

            expect(dai).not.toBe(usdc);
            expect(usdcAgain).toBe(usdc);
        });

        it('still returns a working client when the context cannot be serialized', () => {
            const chain = { id: 1, rpcUrl: 'https://rpc.test/1' };
            const circular: Record<string, unknown> = {};
            circular.self = circular;

            const first = getBundlerClient(chain, 'https://paymaster.test', circular);
            const second = getBundlerClient(chain, 'https://paymaster.test', circular);

            // Uncacheable, so each call builds a fresh client rather than
            // risking a wrong hit.
            expect(first).toBeDefined();
            expect(second).not.toBe(first);
        });
    });

    describe('calculateGas', () => {
        it('skips the gas price fetch when the caller already has one', async () => {
            const result = await calculateGas({ id: 1, rpcUrl: 'https://rpc.test/1' }, 21_000n, undefined, 2n);

            expect(getGasPrice).not.toHaveBeenCalled();
            expect(result).toBe('0.000000000000042');
        });

        it('fetches the gas price when none is supplied', async () => {
            vi.mocked(getGasPrice).mockResolvedValue(2n);

            const result = await calculateGas({ id: 1, rpcUrl: 'https://rpc.test/1' }, 21_000n);

            expect(getGasPrice).toHaveBeenCalledTimes(1);
            expect(result).toBe('0.000000000000042');
        });
    });
});
