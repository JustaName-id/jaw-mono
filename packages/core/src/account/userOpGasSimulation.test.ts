import { describe, expect, it } from 'vitest';
import type { Client, Hex } from 'viem';
import { entryPoint08Address, type UserOperation } from 'viem/account-abstraction';
import { intrinsicGas, simulateUserOpGasUsage } from './userOpGasSimulation.js';

const SENDER = '0x1111111111111111111111111111111111111111' as const;
const PAYMASTER = '0x888888888888Ec68A58AB8094Cc1AD20Ba3D2402' as const;

const userOp: UserOperation<'0.8'> = {
    sender: SENDER,
    nonce: 0n,
    callData: '0xb61d27f6000000000000000000000000000000000000000000000000000000000000dead' as Hex,
    callGasLimit: 70_000n,
    verificationGasLimit: 60_000n,
    preVerificationGas: 50_000n,
    maxFeePerGas: 100n,
    maxPriorityFeePerGas: 2n,
    paymaster: PAYMASTER,
    paymasterData: '0x' as Hex,
    paymasterVerificationGasLimit: 40_000n,
    paymasterPostOpGasLimit: 69_000n,
    signature: '0xdeadbeef' as Hex,
};

interface RawCallResult {
    status: string;
    gasUsed: string;
    returnData: string;
}

const SENDER_CREATOR = '0x449ED7C3e6Fee6a97311d4b55475DF59C44AdD33' as const;

/** Minimal client stub: answers senderCreator() eth_calls, records eth_simulateV1. */
function fakeClient(calls: RawCallResult[] | Error) {
    const captured: { method?: string; params?: unknown[] } = {};
    const client = {
        request: async (args: { method: string; params: unknown[] }) => {
            if (args.method === 'eth_call') {
                return `0x${SENDER_CREATOR.slice(2).toLowerCase().padStart(64, '0')}`;
            }
            captured.method = args.method;
            captured.params = args.params;
            if (calls instanceof Error) throw calls;
            return [{ number: '0x1', calls }];
        },
    } as unknown as Client;
    return { client, captured };
}

const okCalls: RawCallResult[] = [
    { status: '0x1', gasUsed: '0xea60', returnData: '0x' }, // validation: 60_000 raw
    { status: '0x1', gasUsed: '0xea60', returnData: '0x' }, // execution: 60_000 raw
];

describe('intrinsicGas', () => {
    it('is 21k for empty calldata and adds 4/16 per zero/non-zero byte', () => {
        expect(intrinsicGas('0x')).toBe(21_000n);
        expect(intrinsicGas('0x00')).toBe(21_004n);
        expect(intrinsicGas('0xff')).toBe(21_016n);
        // userOp.callData: 6 non-zero + 30 zero bytes -> 21000 + 96 + 120
        expect(intrinsicGas(userOp.callData)).toBe(21_216n);
    });
});

describe('simulateUserOpGasUsage', () => {
    it('measures each phase and subtracts the per-call transaction intrinsic', async () => {
        const { client, captured } = fakeClient(okCalls);
        const measured = await simulateUserOpGasUsage(client, userOp);

        expect(captured.method).toBe('eth_simulateV1');
        const [{ blockStateCalls }] = captured.params as [
            { blockStateCalls: { calls: { from: string; to: string; data: Hex }[] }[] },
        ];
        const [validateCall, executeCall] = blockStateCalls[0].calls;

        // Raw 60_000 per phase, minus that call's own intrinsic (21k + calldata).
        expect(measured).toEqual({
            verificationGasUsed: 60_000n - intrinsicGas(validateCall.data),
            executionGasUsed: 60_000n - 21_216n, // execute calldata == userOp.callData
        });

        for (const call of [validateCall, executeCall]) {
            expect(call.from.toLowerCase()).toBe(entryPoint08Address.toLowerCase());
            expect(call.to.toLowerCase()).toBe(SENDER.toLowerCase());
        }
        // Execution replays the prepared callData verbatim; validation encodes validateUserOp
        expect(executeCall.data).toBe(userOp.callData);
        expect(validateCall.data.length).toBeGreaterThan(userOp.callData.length);
    });

    it('deploys an undeployed account through SenderCreator, counting deploy gas as verification', async () => {
        const deployResult = { status: '0x1', gasUsed: '0x186a0', returnData: '0x' }; // 100_000 raw
        const { client, captured } = fakeClient([deployResult, ...okCalls]);
        const withFactory = { ...userOp, factory: PAYMASTER, factoryData: '0xabcd' as Hex };

        const measured = await simulateUserOpGasUsage(client, withFactory);

        const [{ blockStateCalls }] = captured.params as [
            { blockStateCalls: { calls: { from: string; to: string; data: Hex }[] }[] },
        ];
        const [deployCall, validateCall, executeCall] = blockStateCalls[0].calls;
        // Deploy replays the real AA path: EntryPoint -> SenderCreator.createSender(initCode)
        expect(deployCall.from.toLowerCase()).toBe(entryPoint08Address.toLowerCase());
        expect(deployCall.to.toLowerCase()).toBe(SENDER_CREATOR.toLowerCase());
        expect(deployCall.data.startsWith('0x570e1a36')).toBe(true); // createSender selector
        expect(validateCall.to.toLowerCase()).toBe(SENDER.toLowerCase());
        expect(executeCall.data).toBe(userOp.callData);

        expect(measured).toEqual({
            verificationGasUsed: 100_000n - intrinsicGas(deployCall.data) + (60_000n - intrinsicGas(validateCall.data)),
            executionGasUsed: 60_000n - 21_216n,
        });
    });

    it('returns null when the deploy call reverts', async () => {
        const { client } = fakeClient([{ status: '0x0', gasUsed: '0x186a0', returnData: '0x' }, ...okCalls]);
        const withFactory = { ...userOp, factory: PAYMASTER, factoryData: '0xabcd' as Hex };
        expect(await simulateUserOpGasUsage(client, withFactory)).toBeNull();
    });

    it('returns null when the execution call reverts', async () => {
        const { client } = fakeClient([okCalls[0], { status: '0x0', gasUsed: '0xea60', returnData: '0x' }]);
        expect(await simulateUserOpGasUsage(client, userOp)).toBeNull();
    });

    it('returns null when validation reverts (a genuine revert, not the stub)', async () => {
        const { client } = fakeClient([{ status: '0x0', gasUsed: '0xea60', returnData: '0x' }, okCalls[1]]);
        expect(await simulateUserOpGasUsage(client, userOp)).toBeNull();
    });

    it('returns null when a phase runs below the sanity floor (sender looked codeless)', async () => {
        // Execution gasUsed == its intrinsic -> 0 real gas after subtraction -> below floor.
        const codeless = [okCalls[0], { status: '0x1', gasUsed: '0x52e0', returnData: '0x' }]; // 0x52e0 = 21_216
        const { client } = fakeClient(codeless);
        expect(await simulateUserOpGasUsage(client, userOp)).toBeNull();
    });

    it('returns null when the RPC call fails', async () => {
        const { client } = fakeClient(new Error('eth_simulateV1 not supported'));
        expect(await simulateUserOpGasUsage(client, userOp)).toBeNull();
    });
});
