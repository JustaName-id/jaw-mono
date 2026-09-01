import { getAddress, isAddress } from 'viem';

/**
 * Shape check only, so a refusal can name the field that was wrong. Casing is
 * deliberately not checked: it is not a reason to refuse, because
 * `checksummed` fixes it.
 */
export const isHexAddress = (value: unknown): value is `0x${string}` =>
  typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value);

/**
 * Server-supplied addresses reach viem as `address` fields of the typed data,
 * and viem checksums those at signing: an all-uppercase or mis-cased hex
 * string passes the shape check above and then throws inside the signer. That
 * throw lands after the payer has been funded, so a server that merely cased
 * an address badly would cost the user a top-up and refuse the payment.
 *
 * Checksumming is a re-casing, and an `address` encodes lowercased either
 * way, so the signature is byte-identical to the one the raw string would
 * have produced. Applied to the typed-data message only: the wire payload
 * keeps each address exactly as the challenge advertised it, so a facilitator
 * comparing strings sees its own casing come back. Only called on values
 * already known to match the shape check.
 *
 * This deliberately accepts an EIP-55 checksum that is wrong, where viem
 * would refuse it. That refusal was never protection here, since an
 * all-lowercase string sails past it, and these values are machine-generated
 * by the server: the bytes are the bytes, whatever case they arrived in.
 */
export const checksummed = (value: `0x${string}`): `0x${string}` => getAddress(value);

/**
 * address(0) passes the shape check and is never a counterparty anyone can be
 * paid through. As a facilitator the proxy reverts with `UnauthorizedFacilitator`
 * for every caller, since nobody calls from the zero address; as a `payTo` USDC
 * itself reverts, since FiatToken's `_transfer` requires a non-zero recipient
 * and the Permit2 path reaches the same check. Neither burns anything, but both
 * cost the payer a top-up and then reserve their full figure against the caps,
 * on the rule that a failed attempt may still have been broadcast. Refusing
 * during selection costs nothing.
 */
export const isZeroAddress = (value: string): boolean => /^0x0{40}$/.test(value);

/**
 * How an address goes back out on the wire, as opposed to into the signature.
 *
 * The payload echoes what the challenge advertised, so a facilitator matching
 * it against its own strings sees its own casing. That only works while the
 * echoed value is one a counterparty can actually parse: viem's `isAddress` is
 * strict by default, so an all-lowercase string is fine and a correctly
 * checksummed one is fine, but a mis-cased hex string is refused, and a
 * facilitator that cannot re-hash the permit or encode the settle calldata
 * fails after the payer has been funded. That is this commit series' own bug,
 * handed one hop downstream.
 *
 * So: echo the challenge verbatim when it round-trips, and fall back to
 * lowercase when it does not. Lowercase always parses, always compares equal
 * case-insensitively, and is the same 20 bytes, so the only value that ever
 * changes is one no counterparty could have consumed anyway.
 */
export const wireAddress = <T extends string>(value: T): T | Lowercase<T> =>
  value === value.toLowerCase() || (isAddress(value) && getAddress(value) === value)
    ? value
    : (value.toLowerCase() as Lowercase<T>);
