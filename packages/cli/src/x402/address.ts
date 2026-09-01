import { getAddress } from 'viem';

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
