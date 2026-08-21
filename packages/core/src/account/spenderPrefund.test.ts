import { describe, it, expect } from 'vitest';
import { decodeFunctionData, erc20Abi, type Address } from 'viem';
import { buildSpenderPrefundCall, type PrefundReader } from './spenderPrefund.js';
import { NATIVE_TOKEN, type PermissionsDetail } from '../rpc/permissions.js';

const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address;
const ACCOUNT = '0x1111111111111111111111111111111111111111' as Address;
const SPENDER = '0x2222222222222222222222222222222222222222' as Address;

/** 0.10 USDC, six decimals. What one whole tenth of a token comes to. */
const PREFUND = 100_000n;

const usdcSpend: PermissionsDetail = {
    spends: [{ token: USDC, allowance: '10000000', unit: 'day' as never }],
};

function reader(balances: Partial<Record<Address, bigint>>, decimals = 6): PrefundReader {
    return {
        decimals: async () => decimals,
        balanceOf: async (_token, owner) => balances[owner] ?? 0n,
    };
}

describe('buildSpenderPrefundCall', () => {
    it('transfers a tenth of a token to the spender being approved', async () => {
        const call = await buildSpenderPrefundCall({
            account: ACCOUNT,
            spender: SPENDER,
            permissions: usdcSpend,
            read: reader({ [ACCOUNT]: 5_000_000n }),
        });

        expect(call?.to).toBe(USDC);
        const decoded = decodeFunctionData({ abi: erc20Abi, data: call!.data });
        expect(decoded.functionName).toBe('transfer');
        expect(decoded.args).toEqual([SPENDER, PREFUND]);
    });

    it('scales the amount to the token decimals', async () => {
        const call = await buildSpenderPrefundCall({
            account: ACCOUNT,
            spender: SPENDER,
            permissions: usdcSpend,
            read: reader({ [ACCOUNT]: 10n ** 18n }, 18),
        });

        const decoded = decodeFunctionData({ abi: erc20Abi, data: call!.data });
        expect(decoded.args).toEqual([SPENDER, 10n ** 17n]);
    });

    // Picking one ourselves would move funds the permission never mentioned.
    it('does nothing when the permission authorises no ERC-20 spend', async () => {
        for (const permissions of [
            {},
            { spends: [] },
            { spends: [{ token: NATIVE_TOKEN, allowance: '1', unit: 'day' as never }] },
        ] satisfies PermissionsDetail[]) {
            const call = await buildSpenderPrefundCall({
                account: ACCOUNT,
                spender: SPENDER,
                permissions,
                read: reader({ [ACCOUNT]: 5_000_000n }),
            });
            expect(call).toBeNull();
        }
    });

    // Recreating a session with the same key grants to the same spender, which
    // still holds what the last grant sent it.
    it('does nothing when the spender already holds the prefund', async () => {
        const call = await buildSpenderPrefundCall({
            account: ACCOUNT,
            spender: SPENDER,
            permissions: usdcSpend,
            read: reader({ [ACCOUNT]: 5_000_000n, [SPENDER]: PREFUND }),
        });

        expect(call).toBeNull();
    });

    it('tops the spender back up once it has spent below the prefund', async () => {
        const call = await buildSpenderPrefundCall({
            account: ACCOUNT,
            spender: SPENDER,
            permissions: usdcSpend,
            read: reader({ [ACCOUNT]: 5_000_000n, [SPENDER]: PREFUND - 1n }),
        });

        expect(call).not.toBeNull();
    });

    it('does nothing when the account cannot cover it', async () => {
        const call = await buildSpenderPrefundCall({
            account: ACCOUNT,
            spender: SPENDER,
            permissions: usdcSpend,
            read: reader({ [ACCOUNT]: PREFUND - 1n }),
        });

        expect(call).toBeNull();
    });

    // The keys screen estimates gas before this call exists, so an account with
    // exactly enough for the fee would pass there and then fail when the
    // paymaster charges in postOp, taking the whole grant down with it.
    it('leaves the transaction its own fee behind', async () => {
        const args = {
            account: ACCOUNT,
            spender: SPENDER,
            permissions: usdcSpend,
            feeInToken: 50_000n,
            read: reader({ [ACCOUNT]: PREFUND + 49_999n }),
        };

        expect(await buildSpenderPrefundCall(args)).toBeNull();
        expect(
            await buildSpenderPrefundCall({ ...args, read: reader({ [ACCOUNT]: PREFUND + 50_000n }) })
        ).not.toBeNull();
    });
});
