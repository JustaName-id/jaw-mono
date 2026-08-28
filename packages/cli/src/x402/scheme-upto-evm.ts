import { randomBytes } from 'node:crypto';
import { usdcForNetwork } from './asset-registry.js';
import {
  PERMIT_WITNESS_TRANSFER_FROM_TYPES,
  X402_UPTO_PROXY_ADDRESS,
  permit2Domain,
  type UptoPermitMessage,
} from './permit2.js';
import type { X402PaymentPayload, X402Permit2Authorization, X402PaymentRequirement } from './types.js';

/**
 * The `upto` scheme on EVM: authorize a ceiling, get charged for what was used.
 *
 * The client signs a Permit2 `permitWitnessTransferFrom` for the ceiling the
 * server advertised. The facilitator later calls `x402UptoPermit2Proxy.settle`
 * with the amount the run actually consumed, and the proxy reverts with
 * `AmountExceedsPermitted` above the ceiling and with `UnauthorizedFacilitator`
 * unless the caller is the address named in the witness. So the exposure of one
 * signature is exactly the ceiling, paid to the recipient the witness names, by
 * the facilitator the witness names, once.
 *
 * Two preconditions this module does not enforce, because they are not its job:
 * the payer must have approved Permit2 on the token, and the policy must have
 * already agreed to the ceiling. Signing before either is a payment that cannot
 * settle, or one that should not have been made.
 */

/** The fully-formed EIP-712 payload handed to the injected signer. */
export interface UptoTypedData {
  domain: ReturnType<typeof permit2Domain>;
  types: typeof PERMIT_WITNESS_TRANSFER_FROM_TYPES;
  primaryType: 'PermitWitnessTransferFrom';
  message: UptoPermitMessage;
}

/** Signs the typed data and returns the signature, raw or ERC-7739 wrapped. */
export type UptoSigner = (typedData: UptoTypedData) => Promise<`0x${string}`>;

export interface BuildUptoOptions {
  /** Override "now" (unix seconds) for deterministic tests. */
  now?: number;
  /** Override the 32-byte nonce for deterministic tests. */
  nonce?: `0x${string}`;
}

/**
 * The authorization must stay valid until the facilitator's settlement is
 * MINED. Servers advertise timeouts as low as 60s, which is not enough for
 * verify, submit and a block, so the exact scheme learned to floor it at ten
 * minutes and this one inherits the lesson. A longer window costs nothing: the
 * Permit2 nonce is single-use, so the signature dies on first settlement
 * whether or not the deadline has passed.
 */
const SETTLEMENT_WINDOW_FLOOR = 600;

/**
 * Backdating for clock skew. `validAfter` is a floor the proxy checks against
 * block time, and a client running a minute ahead of the chain would sign an
 * authorization that is not valid yet. Widening it downward only shortens the
 * window in which nothing could have settled anyway, since the deadline is what
 * bounds the exposure.
 */
const VALID_AFTER_SLACK = 60;

const isAddress = (value: unknown): value is `0x${string}` =>
  typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value);

/**
 * Build and sign the `upto` payment for one chosen requirement. `from` is the
 * payer, the account Permit2 will pull from. Each call uses a fresh nonce;
 * Permit2's bitmap rejects a reused one.
 */
export async function buildUptoPayment(
  requirement: X402PaymentRequirement,
  from: `0x${string}`,
  sign: UptoSigner,
  opts: BuildUptoOptions = {}
): Promise<X402PaymentPayload> {
  if (requirement.scheme !== 'upto') {
    throw new Error(`Not an upto requirement: ${requirement.scheme}`);
  }

  const asset = usdcForNetwork(requirement.network);
  if (!asset) throw new Error(`Unsupported x402 network: ${requirement.network}`);
  // Same rule the exact scheme applies: `requirement.asset` is server-supplied,
  // and signing over an arbitrary token would authorize a transfer of something
  // we never agreed to move. The registry is the source of truth.
  if (requirement.asset.toLowerCase() !== asset.address.toLowerCase()) {
    throw new Error(
      `x402 asset mismatch on ${requirement.network}: server asked for ${requirement.asset}, known USDC is ${asset.address}`
    );
  }

  // The witness names the only address the proxy will accept as the settling
  // caller. Without it there is nothing to bind, and a payment nobody can settle
  // is worse than a refusal: it consumes the ceiling in the ledger for nothing.
  const facilitator = requirement.extra?.['facilitatorAddress'];
  if (!isAddress(facilitator)) {
    throw new Error(
      `x402 upto requires extra.facilitatorAddress on ${requirement.network}, got ${JSON.stringify(facilitator)}`
    );
  }

  const nowSec = opts.now ?? Math.floor(Date.now() / 1000);
  const deadline = BigInt(nowSec + Math.max(requirement.maxTimeoutSeconds || 0, SETTLEMENT_WINDOW_FLOOR));
  const validAfter = BigInt(Math.max(nowSec - VALID_AFTER_SLACK, 0));
  const nonce = opts.nonce ?? (`0x${randomBytes(32).toString('hex')}` as `0x${string}`);

  const message: UptoPermitMessage = {
    permitted: { token: asset.address, amount: BigInt(requirement.amount) },
    spender: X402_UPTO_PROXY_ADDRESS,
    nonce: BigInt(nonce),
    deadline,
    witness: { to: requirement.payTo, facilitator, validAfter },
  };

  const signature = await sign({
    domain: permit2Domain(asset.chainId),
    types: PERMIT_WITNESS_TRANSFER_FROM_TYPES,
    primaryType: 'PermitWitnessTransferFrom',
    message,
  });

  // Numbers go back out as strings, the way they arrived. `nonce` stays hex
  // because that is the width it is: 32 bytes of bitmap coordinate, not a count.
  const permit2Authorization: X402Permit2Authorization = {
    permitted: { token: message.permitted.token, amount: message.permitted.amount.toString() },
    from,
    spender: message.spender,
    nonce,
    deadline: deadline.toString(),
    witness: { to: message.witness.to, facilitator, validAfter: validAfter.toString() },
  };

  return { x402Version: 2, accepted: requirement, payload: { signature, permit2Authorization } };
}
