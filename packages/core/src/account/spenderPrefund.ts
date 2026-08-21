import { encodeFunctionData, erc20Abi, type Address, type Hex } from 'viem';
import { NATIVE_TOKEN } from '../rpc/permissions.js';
import type { PermissionsDetail } from '../rpc/permissions.js';

/**
 * The spender of a permission sends every userOp that permission authorises, and
 * the ERC-20 paymaster charges the sender. Nothing funds the spender before its
 * first op, so without help that op has no fee source and has to be sponsored.
 *
 * The grant is the one transaction the account owner already signs, so it is
 * where the spender gets what it needs. This builds the transfer that rides
 * along in it.
 *
 * The destination is always the spender being approved and the token is always
 * one the permission itself authorises spending, neither of them anything a
 * caller supplies: the grant screen must not become a place a dapp can ask to
 * move funds.
 */

/**
 * What a session's first operation is left to pay its fee with, as a fraction of
 * one whole token (a tenth, so 0.10 USDC).
 *
 * @jaw.id/cli mirrors this in `x402/gas-reserve.ts` rather than importing it,
 * because the CLI lazy-loads this package to keep it off startup. Keep the two
 * in step.
 */
const PREFUND_DIVISOR = 10n;

/** Opt-in for the grant. Off by default: a wallet does not move funds unasked. */
export interface GrantPermissionsOptions {
    /**
     * Include a small transfer to the spender in the grant transaction, so its
     * first userOp can pay its own fee instead of needing a sponsor.
     */
    prefundSpender?: boolean;
}

/** Reads this needs, injected so the caller owns the client and the caching. */
export interface PrefundReader {
    decimals(token: Address): Promise<number>;
    balanceOf(token: Address, owner: Address): Promise<bigint>;
}

export interface PrefundArgs {
    /** The account granting the permission, which the transfer comes out of. */
    account: Address;
    /** The address being approved as spender, and the only possible destination. */
    spender: Address;
    permissions: PermissionsDetail;
    /**
     * What the paymaster will take from `account` for this very transaction, in
     * the same token, when it is being paid in one. The prefund has to leave it
     * behind: an account with exactly enough for the fee would pass the keys
     * screen's estimate, which runs before this call exists, and then fail when
     * the paymaster charges in postOp, reverting the whole grant.
     */
    feeInToken?: bigint;
    read: PrefundReader;
}

/**
 * The transfer that funds the spender's first operation, or null when it is not
 * needed or not affordable.
 *
 * Null rather than a throw for every one of those: the grant is what the user
 * came to do, and none of these are reasons to fail it.
 */
export async function buildSpenderPrefundCall(
    args: PrefundArgs
): Promise<{ to: Address; value: bigint; data: Hex } | null> {
    const token = firstErc20Spend(args.permissions);
    // A permission that authorises no ERC-20 spend has no token to prefund in,
    // and picking one ourselves would move funds the permission never mentioned.
    if (!token) return null;

    const decimals = await args.read.decimals(token);
    const amount = 10n ** BigInt(decimals) / PREFUND_DIVISOR;

    // Re-granting to the same spender, which the CLI does whenever a session is
    // recreated with the same key. It still holds the last one.
    const spenderBalance = await args.read.balanceOf(token, args.spender);
    if (spenderBalance >= amount) return null;

    const accountBalance = await args.read.balanceOf(token, args.account);
    if (accountBalance < amount + (args.feeInToken ?? 0n)) return null;

    return {
        to: token,
        value: 0n,
        data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [args.spender, amount] }),
    };
}

/** The first token the permission authorises spending, native ones aside. */
function firstErc20Spend(permissions: PermissionsDetail): Address | null {
    for (const spend of permissions.spends ?? []) {
        const token = spend.token?.trim();
        if (!token) continue;
        if (token.toLowerCase() === NATIVE_TOKEN.toLowerCase()) continue;
        return token as Address;
    }
    return null;
}
