import { describe, expect, it } from 'vitest';
import type { Client, Hex } from 'viem';
import { entryPoint08Address } from 'viem/account-abstraction';
import { simulateUserOpGasUsage, type SimulatableUserOp } from './userOpGasSimulation.js';

const SENDER = '0x1111111111111111111111111111111111111111' as const;
const PAYMASTER = '0x888888888888Ec68A58AB8094Cc1AD20Ba3D2402' as const;

const userOp: SimulatableUserOp = {
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

/** Minimal eth_simulateV1 client stub that records the request it receives. */
function fakeClient(calls: RawCallResult[] | Error) {
    const captured: { method?: string; params?: unknown[] } = {};
    const client = {
        request: async (args: { method: string; params: unknown[] }) => {
            captured.method = args.method;
            captured.params = args.params;
            if (calls instanceof Error) throw calls;
            return [{ number: '0x1', calls }];
        },
    } as unknown as Client;
    return { client, captured };
}

const okCalls: RawCallResult[] = [
    { status: '0x1', gasUsed: '0x7530', returnData: '0x' }, // validation: 30_000
    { status: '0x1', gasUsed: '0xc350', returnData: '0x' }, // execution: 50_000
];

describe('simulateUserOpGasUsage', () => {
    it('measures verification and execution gas via one eth_simulateV1 batch from the EntryPoint', async () => {
        const { client, captured } = fakeClient(okCalls);
        const measured = await simulateUserOpGasUsage(client, userOp);

        expect(measured).toEqual({ verificationGasUsed: 30_000n, executionGasUsed: 50_000n });
        expect(captured.method).toBe('eth_simulateV1');

        const [{ blockStateCalls }] = captured.params as [
            { blockStateCalls: { calls: { from: string; to: string; data: Hex }[] }[] },
        ];
        const [validateCall, executeCall] = blockStateCalls[0].calls;
        for (const call of [validateCall, executeCall]) {
            expect(call.from.toLowerCase()).toBe(entryPoint08Address.toLowerCase());
            expect(call.to.toLowerCase()).toBe(SENDER.toLowerCase());
        }
        // Execution replays the prepared callData verbatim; validation encodes validateUserOp
        expect(executeCall.data).toBe(userOp.callData);
        expect(validateCall.data.length).toBeGreaterThan(userOp.callData.length);
    });

    it('returns null for an undeployed account (factory present)', async () => {
        const { client, captured } = fakeClient(okCalls);
        const withFactory = { ...userOp, factory: PAYMASTER, factoryData: '0x' as Hex };

        expect(await simulateUserOpGasUsage(client, withFactory)).toBeNull();
        expect(captured.method).toBeUndefined();
    });

    it('returns null when the execution call fails', async () => {
        const { client } = fakeClient([okCalls[0], { status: '0x0', gasUsed: '0xc350', returnData: '0x' }]);
        expect(await simulateUserOpGasUsage(client, userOp)).toBeNull();
    });

    it('tolerates a failed validation call (stub signature) and still returns its gas', async () => {
        const { client } = fakeClient([{ status: '0x0', gasUsed: '0x7530', returnData: '0x' }, okCalls[1]]);
        expect(await simulateUserOpGasUsage(client, userOp)).toEqual({
            verificationGasUsed: 30_000n,
            executionGasUsed: 50_000n,
        });
    });

    it('returns null when the RPC call fails', async () => {
        const { client } = fakeClient(new Error('eth_simulateV1 not supported'));
        expect(await simulateUserOpGasUsage(client, userOp)).toBeNull();
    });
});
