import { describe, expect, it } from 'vitest';
import { parseAddFundsParams } from './addFundsParams.js';
import { standardErrorCodes } from '../errors/index.js';

const invalidParams = expect.objectContaining({ code: standardErrorCodes.rpc.invalidParams });

describe('parseAddFundsParams', () => {
    it('treats an absent parameter as an empty request', () => {
        expect(parseAddFundsParams(undefined)).toEqual({ chainId: undefined, asset: undefined });
        expect(parseAddFundsParams([])).toEqual({ chainId: undefined, asset: undefined });
        expect(parseAddFundsParams([{}])).toEqual({ chainId: undefined, asset: undefined });
    });

    it('reads a decimal chainId and an asset symbol', () => {
        expect(parseAddFundsParams([{ chainId: 8453, asset: 'USDC' }])).toEqual({ chainId: 8453, asset: 'USDC' });
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
        expect(Object.keys(parsed).sort()).toEqual(['asset', 'chainId']);
    });

    it('ignores any other unknown key', () => {
        expect(parseAddFundsParams([{ fiatAmount: '25', provider: 'coinbase' }])).toEqual({
            chainId: undefined,
            asset: undefined,
        });
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

    // The symbol is rendered as-is on a wallet surface, so a long or
    // newline-bearing value could push the address out of view.
    it('refuses an asset that is not a short symbol', () => {
        expect(() => parseAddFundsParams([{ asset: '' }])).toThrowError(invalidParams);
        expect(() => parseAddFundsParams([{ asset: 'USDC\nsend to 0xbad' }])).toThrowError(invalidParams);
        expect(() => parseAddFundsParams([{ asset: 'A'.repeat(13) }])).toThrowError(invalidParams);
        expect(() => parseAddFundsParams([{ asset: 42 }])).toThrowError(invalidParams);
    });
});
