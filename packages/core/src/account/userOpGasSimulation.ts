import { Address, Client, Hex, encodeFunctionData } from 'viem';
import { simulateBlocks } from 'viem/actions';
import { entryPoint08Address, toPackedUserOperation, type UserOperation } from 'viem/account-abstraction';

/** Gas actually consumed by the userOp phases, measured via eth_simulateV1. */
export interface MeasuredUserOpGas {
    verificationGasUsed: bigint;
    executionGasUsed: bigint;
}

/** The prepared-userOp fields needed to replay its phases. `signature` must be the stub. */
export interface SimulatableUserOp {
    sender: Address;
    nonce: bigint;
    factory?: Address | undefined;
    factoryData?: Hex | undefined;
    callData: Hex;
    callGasLimit: bigint;
    verificationGasLimit: bigint;
    preVerificationGas: bigint;
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
    paymaster?: Address | undefined;
    paymasterVerificationGasLimit?: bigint | undefined;
    paymasterPostOpGasLimit?: bigint | undefined;
    paymasterData?: Hex | undefined;
    signature: Hex;
}

const packedUserOpComponents = [
    { name: 'sender', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'initCode', type: 'bytes' },
    { name: 'callData', type: 'bytes' },
    { name: 'accountGasLimits', type: 'bytes32' },
    { name: 'preVerificationGas', type: 'uint256' },
    { name: 'gasFees', type: 'bytes32' },
    { name: 'paymasterAndData', type: 'bytes' },
    { name: 'signature', type: 'bytes' },
] as const;

const accountAbi = [
    {
        type: 'function',
        name: 'validateUserOp',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'userOp', type: 'tuple', components: packedUserOpComponents },
            { name: 'userOpHash', type: 'bytes32' },
            { name: 'missingAccountFunds', type: 'uint256' },
        ],
        outputs: [{ name: 'validationData', type: 'uint256' }],
    },
] as const;

// The hash value doesn't affect verification gas — the stub signature fails against
// any hash after the full (gas-representative) check runs.
const DUMMY_USER_OP_HASH = `0x${'11'.repeat(32)}` as Hex;

/**
 * Measures the gas the userOp will actually consume by replaying its two phases
 * against current chain state in one eth_simulateV1 batch, both called from the
 * EntryPoint so the account's sender guard passes:
 *
 * 1. `validateUserOp` with the stub signature — a WebAuthn check burns the same
 *    gas whether or not the signature verifies, so the result is representative.
 *    `missingAccountFunds` is 0, matching the real flow when a paymaster pays.
 * 2. The prepared `callData` verbatim, capturing the account's dispatch overhead.
 *
 * Best-effort: returns null (caller falls back to gas limits) for undeployed
 * accounts, when the execution call fails, or when the node lacks eth_simulateV1.
 */
export async function simulateUserOpGasUsage(
    client: Client,
    userOp: SimulatableUserOp
): Promise<MeasuredUserOpGas | null> {
    // No code deployed yet — nothing to simulate against.
    if (userOp.factory) return null;

    try {
        const packed = toPackedUserOperation(userOp as UserOperation);
        const [block] = await simulateBlocks(client, {
            blocks: [
                {
                    calls: [
                        {
                            account: entryPoint08Address,
                            to: userOp.sender,
                            data: encodeFunctionData({
                                abi: accountAbi,
                                functionName: 'validateUserOp',
                                args: [packed, DUMMY_USER_OP_HASH, 0n],
                            }),
                        },
                        {
                            account: entryPoint08Address,
                            to: userOp.sender,
                            data: userOp.callData,
                        },
                    ],
                },
            ],
        });

        const [validation, execution] = block.calls;
        // A failed execution makes the measurement meaningless; a failed validation
        // is expected (stub signature) and its gas is still representative.
        if (execution.status !== 'success') return null;

        return { verificationGasUsed: validation.gasUsed, executionGasUsed: execution.gasUsed };
    } catch {
        return null;
    }
}
