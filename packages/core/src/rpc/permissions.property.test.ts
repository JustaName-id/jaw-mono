/**
 * Properties of the permission encoding, checked against what
 * `JustaPermissionManager` declares.
 *
 * Every one of these is a mapping with no compile-time link to the contract:
 * the period reaches it as a bare integer, the multiplier as a bare number, and
 * a wrong value there is not a crash, it is a spend limit enforced over a
 * different window than the user approved. So the assertions are written
 * against the Solidity rather than against our own constants.
 *
 * contracts/permissions/src/JustaPermissionManager.sol:206
 *
 *     enum PeriodUnit { Minute, Hour, Day, Week, Month, Forever }
 *
 * contracts/permissions/src/JustaPermissionManager.sol:234
 *
 *     struct SpendLimit {
 *         address token;
 *         uint160 allowance;
 *         PeriodUnit unit;
 *         uint16 multiplier;   // 1-65535, ignored for Forever only
 *     }
 */
import fc from 'fast-check';
import { decodeFunctionData } from 'viem';
import { describe, it, expect } from 'vitest';

import { buildGrantPermissionCall, SPEND_PERMISSIONS_MANAGER_ABI, type SpendPeriod } from './permissions.js';

// A fixed seed, so a red build means someone broke something rather than that
// the generator picked differently today.
fc.configureGlobal({ seed: 0x1a7, numRuns: 200 });

const ACCOUNT = '0x1111111111111111111111111111111111111111' as const;
const SPENDER = '0x2222222222222222222222222222222222222222' as const;
const TOKEN = '0x3333333333333333333333333333333333333333' as const;

/** Copied from the enum above, in its declared order. */
const PERIOD_UNIT = { Minute: 0, Hour: 1, Day: 2, Week: 3, Month: 4, Forever: 5 } as const;

/** Read back what actually goes on the wire, rather than trusting the input. */
function encodedSpends(spends: Array<{ token: string; allowance: string; unit: SpendPeriod; multiplier?: number }>) {
    const { data } = buildGrantPermissionCall(ACCOUNT, SPENDER, 2_000_000_000, { spends } as never);
    const decoded = decodeFunctionData({ abi: SPEND_PERMISSIONS_MANAGER_ABI, data });
    return (decoded.args[0] as { spends: readonly { unit: number; multiplier: number; allowance: bigint }[] }).spends;
}

const anySpendPeriod = fc.constantFrom<SpendPeriod>('minute', 'hour', 'day', 'week', 'month', 'forever');

describe('the period a spend limit is enforced over', () => {
    it('reaches the contract as the integer its enum declares', () => {
        fc.assert(
            fc.property(anySpendPeriod, fc.integer({ min: 1, max: 65_535 }), (unit, multiplier) => {
                const [spend] = encodedSpends([{ token: TOKEN, allowance: '1000', unit, multiplier }]);

                const expected = PERIOD_UNIT[(unit[0].toUpperCase() + unit.slice(1)) as keyof typeof PERIOD_UNIT];
                expect(spend.unit).toBe(expected);
                expect(spend.multiplier).toBe(multiplier);
            })
        );
    });

    it('turns a year into that many months, since the contract has no year', () => {
        // Anything above 5461 would overflow the uint16 multiplier. Real grants
        // are nowhere near it, so the property is stated over the range that
        // encodes rather than pretending the ceiling is not there.
        fc.assert(
            fc.property(fc.integer({ min: 1, max: 5_461 }), (years) => {
                const [spend] = encodedSpends([
                    { token: TOKEN, allowance: '1000', unit: 'year' as SpendPeriod, multiplier: years },
                ]);

                expect(spend.unit).toBe(PERIOD_UNIT.Month);
                expect(spend.multiplier).toBe(years * 12);
            })
        );
    });

    it('refuses a year multiplier whose months overflow the uint16', () => {
        // The ceiling on this path is 5461, not the 65535 the struct allows,
        // because the year is multiplied out before it is encoded. Nothing
        // guards it, so it surfaces as a raw viem range error rather than as
        // invalidParams. Pinned as it behaves; worth a guard in the source.
        fc.assert(
            fc.property(fc.integer({ min: 5_462, max: 65_535 }), (years) => {
                expect(() =>
                    encodedSpends([{ token: TOKEN, allowance: '1000', unit: 'year' as SpendPeriod, multiplier: years }])
                ).toThrow(/not in safe 16-bit unsigned integer range/);
            })
        );
    });

    it('defaults the multiplier to 1 when the caller omits it', () => {
        fc.assert(
            fc.property(anySpendPeriod, (unit) => {
                const [spend] = encodedSpends([{ token: TOKEN, allowance: '1000', unit }]);
                expect(spend.multiplier).toBe(1);
            })
        );
    });
});

describe('what the contract will not hold', () => {
    it('carries any allowance that fits in the uint160 the struct declares', () => {
        fc.assert(
            fc.property(fc.bigInt({ min: 0n, max: 2n ** 160n - 1n }), (allowance) => {
                const [spend] = encodedSpends([
                    { token: TOKEN, allowance: allowance.toString(), unit: 'day', multiplier: 1 },
                ]);
                expect(spend.allowance).toBe(allowance);
            })
        );
    });

    it('refuses an allowance the struct cannot hold, rather than truncating it', () => {
        // Our Permission types an allowance as an unbounded bigint, so nothing
        // before the encoder rejects this. Silently keeping the low 160 bits
        // would grant a limit nobody asked for.
        fc.assert(
            fc.property(fc.bigInt({ min: 2n ** 160n, max: 2n ** 200n }), (allowance) => {
                expect(() =>
                    encodedSpends([{ token: TOKEN, allowance: allowance.toString(), unit: 'day', multiplier: 1 }])
                ).toThrow(/not in safe 160-bit unsigned integer range/);
            })
        );
    });

    it('refuses a multiplier past the uint16 the struct declares', () => {
        fc.assert(
            fc.property(fc.integer({ min: 65_536, max: 1_000_000 }), (multiplier) => {
                expect(() => encodedSpends([{ token: TOKEN, allowance: '1000', unit: 'day', multiplier }])).toThrow(
                    /not in safe 16-bit unsigned integer range/
                );
            })
        );
    });
});
