import { describe, it, expect } from 'vitest';
import { normalizeSignTypedDataParams, normalizeSignTypedDataRequest } from './signTypedDataParams.js';
import { standardErrorCodes } from '../errors/index.js';

const address = '0x1234567890123456789012345678901234567890';

const typedData = {
    domain: { name: 'Test', version: '1', chainId: 421614 },
    types: {
        Permit: [
            { name: 'owner', type: 'address' },
            { name: 'value', type: 'uint256' },
        ],
    },
    primaryType: 'Permit',
    message: { owner: address, value: '1000' },
};

function expectInvalidParams(fn: () => unknown) {
    try {
        fn();
    } catch (error) {
        const { code, message } = error as { code: number; message: string };
        expect(code).toBe(standardErrorCodes.rpc.invalidParams);
        return message;
    }
    throw new Error('expected normalizeSignTypedDataParams to throw');
}

describe('normalizeSignTypedDataParams', () => {
    it('accepts the serialized payload viem sends', () => {
        const serialized = JSON.stringify(typedData);
        expect(normalizeSignTypedDataParams([address, serialized])).toEqual({ address, typedData: serialized });
    });

    it('serializes an object payload (what MetaMask-era dapps send)', () => {
        const result = normalizeSignTypedDataParams([address, typedData]);

        expect(result.address).toBe(address);
        expect(JSON.parse(result.typedData)).toEqual(typedData);
    });

    it('rejects a payload that is neither object nor JSON string', () => {
        expect(expectInvalidParams(() => normalizeSignTypedDataParams([address, 42]))).toContain('typedData');
        expectInvalidParams(() => normalizeSignTypedDataParams([address, '{not json']));
    });

    it('rejects a payload missing the fields needed to encode it', () => {
        const { primaryType, ...withoutPrimaryType } = typedData;
        expect(primaryType).toBe('Permit');
        expect(expectInvalidParams(() => normalizeSignTypedDataParams([address, withoutPrimaryType]))).toContain(
            'primaryType'
        );
    });

    it('rejects a missing or non-address signer', () => {
        expectInvalidParams(() => normalizeSignTypedDataParams([address]));
        expect(expectInvalidParams(() => normalizeSignTypedDataParams(['vitalik.eth', typedData]))).toContain(
            'address'
        );
    });
});

describe('normalizeSignTypedDataRequest', () => {
    it('serializes the payload in place, leaving other methods untouched', () => {
        const request = { method: 'eth_signTypedData_v4', params: [address, typedData] };
        const normalized = normalizeSignTypedDataRequest(request);

        expect(normalized.params).toEqual([address, JSON.stringify(typedData)]);

        const other = { method: 'personal_sign', params: ['hello', address] };
        expect(normalizeSignTypedDataRequest(other)).toBe(other);
    });
});
