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
 * The gas a session's first operation is left able to pay for.
 *
 * Gas rather than an amount of token: a tenth of a token is $0.10 in USDC and
 * three hundred in WETH, and the permission's spend token is whatever the
 * requester wrote. The paymaster's exchange rate turns this into that token.
 *
 * Sized against that first op, the most expensive one a session sends, since it
 * carries the EIP-7702 authorization and bootstraps the permission manager as a
 * co-owner: something under a million of gas in limits, so this is roughly three
 * times it. That covers the market moving between this grant and that op, and
 * covers the paymaster charging at `maxFeePerGas` while this prices at the
 * current one.
 *
 * Not less than roughly that, because the op has to land. After it does, the
 * spender is topped up by refills rather than by this. What keeps it from being
 * too much on a chain where gas is expensive is the ceiling below, not this
 * number.
 */
const PREFUND_GAS = 2_000_000n;

/**
 * The ceiling on what the prefund may move, and the reason it is the
 * permission's own allowance rather than a number.
 *
 * `PREFUND_GAS` prices in gas, which is what the fee is denominated in, and that
 * is right until gas is expensive. The same multiplier is a fraction of a cent
 * on Base and tens of dollars on mainnet, and all of it lands on the session
 * address, outside the permission, where nothing meters it any more.
 *
 * A fixed cap in the token cannot be written down once: a tenth is $0.10 in
 * USDC and three hundred in WETH, which is the reason the amount is priced in
 * gas to begin with. A cap in native value has the same problem across chains,
 * since a unit of ETH and a unit of POL are not the same money.
 *
 * The permission already carries a number in the right token: what it lets the
 * session spend in a period. Sending more than that to the spender funds it past
 * anything it could do with the authority it was given, so that is the ceiling.
 * It needs no table, it moves when the grant moves, and it is a figure the user
 * approved on the same screen.
 *
 * A permission may carry several periods for one token, and the contract applies
 * every one of them, so the effective cap is their intersection: the tightest
 * entry is the one that binds, and it is the number the chain actually enforces.
 * A `forever` entry never renews, so there is no window long enough for a wider
 * one to matter. Taking the minimum keeps the result independent of the order
 * the requester happened to write them in.
 *
 * A clamped prefund can be too small to cover the first operation on an
 * expensive chain. That operation is then sponsored, which is what happened for
 * every session before this transfer existed, so the failure mode is the old
 * behaviour rather than a broken grant.
 */
function ceilingFor(permissions: PermissionsDetail, token: Address): bigint | null {
    let tightest: bigint | null = null;
    for (const spend of permissions.spends ?? []) {
        if (!isSameToken(spend.token, token)) continue;
        try {
            const allowance = BigInt(spend.allowance);
            if (tightest === null || allowance < tightest) tightest = allowance;
        } catch {
            // The allowance reaches here from the grant request, so it is a
            // number the requester wrote. Null like every other unreadable input
            // in this module: a ceiling we cannot size is one we cannot hold to,
            // and skipping just the unreadable entry would silently widen the
            // ceiling to whatever the readable ones say.
            return null;
        }
    }
    return tightest !== null && tightest > 0n ? tightest : null;
}

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
    balanceOf(token: Address, owner: Address): Promise<bigint>;
    /** Price per gas on this chain right now, in wei. */
    gasPrice(): Promise<bigint>;
    /**
     * The paymaster's rate for this token, wei to its smallest unit, or null
     * when the paymaster does not take it. Null is also an answer: a token the
     * paymaster will not accept cannot pay the spender's fee, so sending it
     * would not do what the prefund is for.
     */
    exchangeRate(token: Address): Promise<bigint | null>;
}

export interface PrefundArgs {
    /** The account granting the permission, which the transfer comes out of. */
    account: Address;
    /** The address being approved as spender, and the only possible destination. */
    spender: Address;
    permissions: PermissionsDetail;
    /**
     * The paymaster context for this transaction. When it names the same token
     * the prefund goes out in, its `gas` is what the paymaster will take from
     * `account`, and the prefund has to leave that behind: an account with
     * exactly enough for the fee would pass the keys screen's estimate, which
     * runs before this call exists, and then fail when the paymaster charges in
     * postOp, reverting the whole grant.
     */
    paymasterContext?: Record<string, unknown>;
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

    const ceiling = ceilingFor(args.permissions, token);
    if (ceiling === null) return null;

    // `exchangeRate` is wei to the token's smallest unit, so this reads as
    // "what PREFUND_GAS costs, in this token, at this moment, on this chain".
    const exchangeRate = await args.read.exchangeRate(token);
    if (exchangeRate === null) return null;
    const priced = (PREFUND_GAS * (await args.read.gasPrice()) * exchangeRate) / 10n ** 18n;
    const amount = priced < ceiling ? priced : ceiling;
    if (amount === 0n) return null;

    // Re-granting to the same spender, which the CLI does whenever a session is
    // recreated with the same key. It still holds the last one.
    const spenderBalance = await args.read.balanceOf(token, args.spender);
    if (spenderBalance >= amount) return null;

    const fee = paymasterFeeIn(token, args.paymasterContext);
    if (fee === null) return null;

    const accountBalance = await args.read.balanceOf(token, args.account);
    if (accountBalance < amount + fee) return null;

    return {
        to: token,
        value: 0n,
        data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [args.spender, amount] }),
    };
}

/**
 * What the paymaster will charge for this transaction, when it charges in the
 * same token the prefund goes out in. Anything else, or a sponsored transaction,
 * takes nothing from the balance the prefund comes out of.
 */
function paymasterFeeIn(token: Address, context?: Record<string, unknown>): bigint | null {
    const contextToken = context?.token as string | undefined;
    const gas = context?.gas as string | bigint | undefined;
    if (contextToken?.toLowerCase() !== token.toLowerCase()) return 0n;
    // A context that names this token but no `gas` is the path where
    // `createErc20ApprovalCall` sizes the ceiling itself, so the paymaster does
    // charge here and there is a fee to leave behind; we just cannot see it from
    // this side. Null, like an unreadable one: sending the transfer against a
    // fee we cannot size is how the account ends up short in postOp.
    if (gas === undefined) return null;
    try {
        return BigInt(gas);
    } catch {
        // The context reaches here from the grant request, so this is a number
        // the requester wrote. Null rather than zero: a fee we cannot read is
        // one we cannot leave room for, and sending the transfer anyway is how
        // the account ends up short and takes the grant down with it.
        return null;
    }
}

/**
 * Whether a spend entry names `token`.
 *
 * The address arrives as whatever the requester wrote, so the comparison is
 * case-insensitive and tolerates surrounding space. One place, because the two
 * callers below would otherwise each carry their own copy of that rule and only
 * one of them would get fixed the day it turns out to be wrong.
 */
function isSameToken(candidate: string | undefined, token: Address): boolean {
    return candidate?.trim().toLowerCase() === token.toLowerCase();
}

/** The first token the permission authorises spending, native ones aside. */
function firstErc20Spend(permissions: PermissionsDetail): Address | null {
    for (const spend of permissions.spends ?? []) {
        const token = spend.token?.trim();
        if (!token) continue;
        if (isSameToken(token, NATIVE_TOKEN)) continue;
        return token as Address;
    }
    return null;
}
