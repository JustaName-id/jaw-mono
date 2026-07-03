import { Client, Hex, encodeFunctionData } from 'viem';
import { readContract, simulateBlocks } from 'viem/actions';
import {
    entryPoint08Abi,
    entryPoint08Address,
    toPackedUserOperation,
    type UserOperation,
} from 'viem/account-abstraction';

/** Gas actually consumed by the userOp phases, measured via eth_simulateV1. */
export interface MeasuredUserOpGas {
    verificationGasUsed: bigint;
    executionGasUsed: bigint;
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

const senderCreatorAbi = [
    {
        type: 'function',
        name: 'createSender',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'initCode', type: 'bytes' }],
        outputs: [{ name: 'sender', type: 'address' }],
    },
] as const;

// Any hash works: the stub signature fails the full (gas-representative) WebAuthn check regardless.
const DUMMY_USER_OP_HASH = `0x${'11'.repeat(32)}` as Hex;

/**
 * Transaction intrinsic gas (21k + calldata). eth_simulateV1 bills it per call;
 * the EntryPoint covers it once via preVerificationGas, so each measured phase
 * subtracts it. Un-floored (pre-EIP-7623) so it can never over-subtract.
 */
export function intrinsicGas(data: Hex): bigint {
    const body = data.slice(2);
    let calldataGas = 0n;
    for (let i = 0; i < body.length; i += 2) {
        calldataGas += body.slice(i, i + 2) === '00' ? 4n : 16n;
    }
    return 21_000n + calldataGas;
}

// Below this a phase did no real work (sender looked codeless) — not representative.
const MIN_PHASE_GAS = 1_000n;

/**
 * Measures the userOp's real gas by replaying its phases in one eth_simulateV1
 * batch, each call made from the EntryPoint so the AA sender guards pass:
 * optional deploy via SenderCreator.createSender (undeployed accounts; gas counts
 * as verification, matching EntryPoint billing), validateUserOp with the stub
 * signature, then the callData verbatim. Per-call intrinsic gas is subtracted.
 *
 * Best-effort: returns null (caller falls back to the gas limits) on any revert,
 * sanity-floor breach, or RPC error. Pass a client with bounded retries/timeout.
 */
export async function simulateUserOpGasUsage(
    client: Client,
    userOp: UserOperation<'0.8'>
): Promise<MeasuredUserOpGas | null> {
    try {
        const packed = toPackedUserOperation(userOp);
        const validateData = encodeFunctionData({
            abi: accountAbi,
            functionName: 'validateUserOp',
            args: [packed, DUMMY_USER_OP_HASH, 0n],
        });

        let deployCall: { account: typeof entryPoint08Address; to: Hex; data: Hex } | undefined;
        if (userOp.factory) {
            const senderCreator = await readContract(client, {
                address: entryPoint08Address,
                abi: entryPoint08Abi,
                functionName: 'senderCreator',
            });
            deployCall = {
                account: entryPoint08Address,
                to: senderCreator,
                data: encodeFunctionData({
                    abi: senderCreatorAbi,
                    functionName: 'createSender',
                    args: [packed.initCode],
                }),
            };
        }

        const [block] = await simulateBlocks(client, {
            blocks: [
                {
                    calls: [
                        ...(deployCall ? [deployCall] : []),
                        { account: entryPoint08Address, to: userOp.sender, data: validateData },
                        { account: entryPoint08Address, to: userOp.sender, data: userOp.callData },
                    ],
                },
            ],
        });

        // JustanAccount doesn't revert on a bad signature — any failure is a genuine revert.
        if (block.calls.some((call) => call.status !== 'success')) return null;

        const [validation, execution] = block.calls.slice(deployCall ? 1 : 0);
        let verificationGasUsed = validation.gasUsed - intrinsicGas(validateData);
        if (deployCall) verificationGasUsed += block.calls[0].gasUsed - intrinsicGas(deployCall.data);
        const executionGasUsed = execution.gasUsed - intrinsicGas(userOp.callData);
        if (verificationGasUsed < MIN_PHASE_GAS || executionGasUsed < MIN_PHASE_GAS) return null;

        return { verificationGasUsed, executionGasUsed };
    } catch {
        return null;
    }
}
