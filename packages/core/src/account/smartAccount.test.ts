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

import { getCode, readContract } from 'viem/actions';
import { http } from 'viem';
import { createBundlerClient, createPaymasterClient } from 'viem/account-abstraction';
import { toJustanAccount } from './toJustanAccount.js';
import { createPaymasterFunctions } from './paymaster.js';
import { getPermissionFromRelay, encodeExecuteBatchWithPermission } from '../rpc/permissions.js';
import { createSmartAccountForAddress, getBundlerClient, sendCallsWithPermission } from './smartAccount.js';

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

// The url and the context used to resolve through two independent `||`, so they
// could come from different sources: a caller overriding only the url, on a chain
// configured with a context, sent that context to the other paymaster. Pairing
// this in `Account` alone would not hold — a `context: undefined` passed down
// here fell back to the chain's again.
describe('getBundlerClient — paymaster resolution', () => {
    const CHAIN = {
        id: 1,
        rpcUrl: 'https://rpc.example',
        paymaster: { url: 'https://configured.example', context: { token: '0xUSDC' } },
    } as never;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(createBundlerClient).mockReturnValue({} as never);
        vi.mocked(createPaymasterClient).mockReturnValue({} as never);
    });

    // The context is the 4th argument to createPaymasterFunctions.
    const contextSentToPaymaster = () => vi.mocked(createPaymasterFunctions).mock.calls[0][3];

    it('takes both halves from the chain when no override is given', () => {
        getBundlerClient(CHAIN);

        expect(http).toHaveBeenCalledWith('https://configured.example');
        expect(contextSentToPaymaster()).toEqual({ token: '0xUSDC' });
    });

    it('takes both halves from the override when one is given', () => {
        getBundlerClient(CHAIN, 'https://override.example', { sponsorshipPolicyId: 'sp_1' });

        expect(http).toHaveBeenCalledWith('https://override.example');
        expect(contextSentToPaymaster()).toEqual({ sponsorshipPolicyId: 'sp_1' });
    });

    it('does not carry the chain context to a paymaster named by override', () => {
        getBundlerClient(CHAIN, 'https://override.example');

        expect(http).toHaveBeenCalledWith('https://override.example');
        expect(contextSentToPaymaster()).toBeUndefined();
    });
});

// The ERC-20 approval is sized over the permission-manager call the caller builds
// with `buildPermissionManagerCall`. That only means anything if the call it sized
// is the one that goes out, rather than one re-encoded here.
describe('sendCallsWithPermission — the sized call is the sent one', () => {
    const CHAIN = { id: 1, rpcUrl: 'https://rpc.example' } as never;
    const PERMISSION_ID = '0xabc123' as Hex;
    const CALLS = [{ to: '0x1234567890123456789012345678901234567890' as Address }];
    const APPROVAL = {
        to: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address,
        value: 0n,
        data: '0xapprove' as Hex,
    };
    const PERMISSION_CALL = {
        to: '0x0000000000000000000000000000000000009999' as Address,
        value: 0n,
        data: '0xbeefbeef' as Hex,
    };

    let sendUserOperation: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        sendUserOperation = vi.fn().mockResolvedValue('0xuserophash');
        vi.mocked(createBundlerClient).mockReturnValue({ sendUserOperation } as never);
        vi.mocked(encodeExecuteBatchWithPermission).mockReturnValue('0xencodedhere' as Hex);
    });

    it('sends the caller-built permission call, without fetching the permission twice', async () => {
        await sendCallsWithPermission(
            {} as never,
            CALLS,
            CHAIN,
            PERMISSION_ID,
            'test-key',
            undefined,
            undefined,
            undefined,
            APPROVAL,
            PERMISSION_CALL
        );

        expect(getPermissionFromRelay).not.toHaveBeenCalled();
        // Approval first, at the spender level: the permission manager checks each
        // call in its batch against the permission and would reject `approve`.
        expect(sendUserOperation.mock.calls[0][0].calls).toEqual([APPROVAL, PERMISSION_CALL]);
    });

    it('builds the permission call itself when the caller passed none', async () => {
        await sendCallsWithPermission({} as never, CALLS, CHAIN, PERMISSION_ID, 'test-key');

        expect(getPermissionFromRelay).toHaveBeenCalledWith(PERMISSION_ID, 'test-key');
        expect(sendUserOperation.mock.calls[0][0].calls).toEqual([
            { to: '0xf1b40E3D5701C04d86F7828f0EB367B9C90901D8', value: 0n, data: '0xencodedhere' },
        ]);
    });
});
