import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Client } from 'viem';
import type { PaymasterClient } from 'viem/account-abstraction';
import { createPaymasterFunctions } from './paymaster.js';

// The stub-data fallback re-estimates gas over raw JSON-RPC when the paymaster
// answers with invalid limits. These tests pin what that rebuilt userOp
// carries — in particular the EIP-7702 authorization, which must survive the
// round-trip or the first userOp of a 7702 account simulates against a
// codeless sender.

const ENTRY_POINT = '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as const;

function makePaymasterClient() {
    return {
        // paymasterVerificationGasLimit <= 1 forces the estimation fallback.
        getPaymasterStubData: vi.fn().mockResolvedValue({
            paymaster: '0x00000000000000000000000000000000000000aa',
            paymasterData: '0x',
            paymasterVerificationGasLimit: 1n,
            paymasterPostOpGasLimit: 1n,
        }),
        request: vi.fn().mockResolvedValue({
            preVerificationGas: '0x100',
            verificationGasLimit: '0x200',
            callGasLimit: '0x300',
            paymasterVerificationGasLimit: '0x400',
            paymasterPostOpGasLimit: '0x500',
        }),
    };
}

const baseUserOperation = {
    sender: '0x00000000000000000000000000000000000000ff',
    nonce: 1n,
    callData: '0x',
    maxFeePerGas: 100n,
    maxPriorityFeePerGas: 10n,
    entryPointAddress: ENTRY_POINT,
};

describe('createPaymasterFunctions — estimation fallback', () => {
    let paymasterClient: ReturnType<typeof makePaymasterClient>;
    let functions: ReturnType<typeof createPaymasterFunctions>;

    beforeEach(() => {
        paymasterClient = makePaymasterClient();
        functions = createPaymasterFunctions(
            { request: vi.fn() } as unknown as Client,
            paymasterClient as unknown as PaymasterClient,
            84532
        );
    });

    it('forwards the EIP-7702 authorization as eip7702Auth in the estimation request', async () => {
        await functions.getPaymasterStubData({
            ...baseUserOperation,
            factory: '0x7702',
            factoryData: '0x',
            authorization: {
                address: '0x00000000000000000000000000000000000000ee',
                chainId: 84532,
                nonce: 7,
                r: '0x01',
                s: '0x02',
                yParity: 1,
            },
        } as unknown as Parameters<(typeof functions)['getPaymasterStubData']>[0]);

        expect(paymasterClient.request).toHaveBeenCalledTimes(1);
        const [userOpForRpc, entryPoint] = paymasterClient.request.mock.calls[0][0].params as [
            Record<string, unknown>,
            string,
        ];
        expect(entryPoint).toBe(ENTRY_POINT);
        expect(userOpForRpc['factory']).toBe('0x7702');
        // Wire format matches viem's own userOperationRequest formatter.
        expect(userOpForRpc['eip7702Auth']).toEqual({
            address: '0x00000000000000000000000000000000000000ee',
            chainId: '0x14a34',
            nonce: '0x7',
            r: '0x0000000000000000000000000000000000000000000000000000000000000001',
            s: '0x0000000000000000000000000000000000000000000000000000000000000002',
            yParity: '0x01',
        });
    });

    it('omits eip7702Auth for a non-7702 userOp', async () => {
        await functions.getPaymasterStubData(
            baseUserOperation as unknown as Parameters<(typeof functions)['getPaymasterStubData']>[0]
        );

        const [userOpForRpc] = paymasterClient.request.mock.calls[0][0].params as [Record<string, unknown>];
        expect(userOpForRpc['eip7702Auth']).toBeUndefined();
    });

    it('uses the estimated paymaster gas limits in the returned stub data', async () => {
        const result = await functions.getPaymasterStubData(
            baseUserOperation as unknown as Parameters<(typeof functions)['getPaymasterStubData']>[0]
        );

        expect(result.paymasterVerificationGasLimit).toBe(0x400n);
        expect(result.paymasterPostOpGasLimit).toBe(0x500n);
    });
});
