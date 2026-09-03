import { describe, expect, it } from 'vitest';
import { parseAddFundsParams } from './addFundsParams.js';
import { standardErrorCodes } from '../errors/index.js';

const invalidParams = expect.objectContaining({ code: standardErrorCodes.rpc.invalidParams });

describe('parseAddFundsParams', () => {
    it('treats an absent parameter as an empty request', () => {
        expect(parseAddFundsParams(undefined)).toEqual({ chainId: undefined });
        expect(parseAddFundsParams([])).toEqual({ chainId: undefined });
        expect(parseAddFundsParams([{}])).toEqual({ chainId: undefined });
    });

    it('reads a decimal chainId', () => {
        expect(parseAddFundsParams([{ chainId: 8453 }])).toEqual({ chainId: 8453 });
    });

    it('accepts a hex chainId, since a viem-shaped caller already holds one', () => {
        expect(parseAddFundsParams([{ chainId: '0x2105' }]).chainId).toBe(8453);
    });

    // The destination is the connected account. A dapp naming it could point the
    // QR at an address the user does not own, so the key is dropped, not honoured.
    it('ignores a dapp-supplied address', () => {
        const parsed = parseAddFundsParams([
            { address: '0x9999999999999999999999999999999999999999', chainId: 8453 },
        ]) as Record<string, unknown>;

        expect(parsed.address).toBeUndefined();
        expect(Object.keys(parsed)).toEqual(['chainId']);
    });

    it('ignores any other unknown key', () => {
        expect(parseAddFundsParams([{ fiatAmount: '25', provider: 'coinbase' }])).toEqual({ chainId: undefined });
    });

    it('refuses a non-object parameter', () => {
        expect(() => parseAddFundsParams([42])).toThrowError(invalidParams);
        expect(() => parseAddFundsParams({ chainId: 8453 })).toThrowError(invalidParams);
    });

    it('refuses a chainId that is not a positive integer', () => {
        expect(() => parseAddFundsParams([{ chainId: 0 }])).toThrowError(invalidParams);
        expect(() => parseAddFundsParams([{ chainId: -1 }])).toThrowError(invalidParams);
        expect(() => parseAddFundsParams([{ chainId: 1.5 }])).toThrowError(invalidParams);
        expect(() => parseAddFundsParams([{ chainId: 'base' }])).toThrowError(invalidParams);
    });
});
