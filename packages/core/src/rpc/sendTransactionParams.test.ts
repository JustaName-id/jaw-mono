import { describe, it, expect } from 'vitest';
import { normalizeSendTransactionParams } from './sendTransactionParams.js';
import { standardErrorCodes } from '../errors/index.js';

const tx = {
    from: '0x1234567890123456789012345678901234567890',
    to: '0x0987654321098765432109876543210987654321',
    value: '0x10f2c',
    data: '0xdeadbeef',
};

function expectInvalidParams(fn: () => unknown) {
    try {
        fn();
    } catch (error) {
        const { code, message } = error as { code: number; message: string };
        expect(code).toBe(standardErrorCodes.rpc.invalidParams);
        return message;
    }
    throw new Error('expected normalizeSendTransactionParams to throw');
}

describe('normalizeSendTransactionParams', () => {
    it('accepts a typical eth_sendTransaction request', () => {
        expect(normalizeSendTransactionParams([tx])).toEqual(tx);
    });

    it('drops absent fields rather than emitting undefined keys', () => {
        expect(normalizeSendTransactionParams([{ to: tx.to }])).toEqual({ to: tx.to });
    });

    it('normalizes numeric quantities and chainId to hex', () => {
        const result = normalizeSendTransactionParams([
            { to: tx.to, value: 69420, gas: 21000, nonce: 3, chainId: 421614 },
        ]);

        expect(result).toEqual({
            to: tx.to,
            value: '0x10f2c',
            gas: '0x5208',
            nonce: '0x3',
            chainId: '0x66eee',
        });
    });

    it('keeps fee fields and capabilities', () => {
        const result = normalizeSendTransactionParams([
            {
                to: tx.to,
                maxFeePerGas: '0x3b9aca00',
                maxPriorityFeePerGas: '0x5f5e100',
                gasPrice: '0x3b9aca00',
                capabilities: { paymasterService: { url: 'https://paymaster.test' } },
            },
        ]);

        expect(result.maxFeePerGas).toBe('0x3b9aca00');
        expect(result.maxPriorityFeePerGas).toBe('0x5f5e100');
        expect(result.gasPrice).toBe('0x3b9aca00');
        expect(result.capabilities).toEqual({ paymasterService: { url: 'https://paymaster.test' } });
    });

    it('rejects a missing `to` with -32602 — a smart account has nothing to execute against', () => {
        const message = expectInvalidParams(() => normalizeSendTransactionParams([{ from: tx.from, data: '0x' }]));
        expect(message).toContain('to');
    });

    it('rejects a missing params object with -32602', () => {
        expectInvalidParams(() => normalizeSendTransactionParams([]));
        expectInvalidParams(() => normalizeSendTransactionParams(undefined));
    });

    it('rejects `to`/`from` that are hex but not 20 bytes', () => {
        for (const to of ['0x', '0xabc', `0x${'ab'.repeat(21)}`]) {
            expect(expectInvalidParams(() => normalizeSendTransactionParams([{ ...tx, to }]))).toContain('to');
        }
        expect(expectInvalidParams(() => normalizeSendTransactionParams([{ ...tx, from: '0xabc' }]))).toContain('from');
    });

    it('keeps accepting decimal wei values (previously converted downstream by BigInt())', () => {
        const result = normalizeSendTransactionParams([{ to: tx.to, value: '1000000000000000' }]);
        expect(result.value).toBe('0x38d7ea4c68000');
    });

    it('rejects non-hex fields with -32602 naming the field', () => {
        expect(expectInvalidParams(() => normalizeSendTransactionParams([{ ...tx, data: 'not-hex' }]))).toContain(
            'data'
        );
        expect(expectInvalidParams(() => normalizeSendTransactionParams([{ ...tx, value: '1.5' }]))).toContain('value');
        expect(expectInvalidParams(() => normalizeSendTransactionParams([{ ...tx, from: 'vitalik.eth' }]))).toContain(
            'from'
        );
        expect(expectInvalidParams(() => normalizeSendTransactionParams([{ ...tx, gas: -1 }]))).toContain('gas');
    });
});
