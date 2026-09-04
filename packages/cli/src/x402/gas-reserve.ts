import type { UsdcAsset } from './asset-registry.js';

/**
 * The USDC a refill leaves behind so the next one can pay its own fee, in base
 * units of `asset`.
 *
 * Measured rather than guessed: a session's first operation, the most expensive
 * one it sends because it carries the EIP-7702 authorization and bootstraps the
 * permission manager as a co-owner, cost 0.0094 USDC on Base Sepolia. A tenth of
 * a token leaves ten times that.
 *
 * The grant seeds the session too, but it prices its own amount off the
 * paymaster's rate for the token (`account/spenderPrefund.ts` in @jaw.id/core),
 * so this is no longer a copy of that number and the two do not have to match.
 * All that is asked of either is that it covers an operation.
 *
 * It costs the granted allowance 0.10 once per session and not once per refill:
 * a refill fills the payer to price plus reserve, the payment takes the price,
 * and the reserve stays for the next one.
 *
 * An `upto` session asks for a second one on the payment that grants the
 * Permit2 allowance. That approval is an operation the payer pays for out of
 * its own balance, and a payer holding exactly the price cannot, so the bar for
 * skipping the refill rises by a reserve on top of the one every refill leaves.
 * The approval spends about a hundredth of it and the rest stays in the payer,
 * the same as the first.
 */
export function gasReserve(asset: UsdcAsset): bigint {
  return 10n ** BigInt(asset.decimals) / 10n;
}

/**
 * What one operation costs the session, in base units of `asset`.
 *
 * A cent, rounded up from the 0.0094 measured above so the figure stays a round
 * number rather than pretending to a precision a gas price does not have. It is
 * the floor a session has to clear to be able to send anything at all, which is
 * a different question from `gasReserve`: that one decides how much to leave
 * behind, this one decides whether there is enough to act.
 */
export function firstOperationCost(asset: UsdcAsset): bigint {
  return 10n ** BigInt(asset.decimals) / 100n;
}

/**
 * Headroom a clamped refill has to leave for the fee it is about to be charged.
 *
 * `firstOperationCost` was the bar, and it is the wrong instrument for this
 * question: it is a cent, rounded up from one measurement on one chain, and the
 * refill guard sits exactly on it. A cap landing precisely at the bar passes,
 * the clamp then cuts the refill to that figure, and the payment is left with
 * 6% over a gas estimate. Past that the payment is signed for more than the
 * payer holds, and the transfer has already drawn the period allowance, so the
 * retry is short with no cap left to fix it.
 *
 * Derived from the reserve rather than written as a fourth literal, so a
 * re-measurement moves one number and the relationship survives it. Half is
 * 0.05, roughly five operations at the measured cost, and it is bounded above by
 * the reserve itself: a bar over 0.1 would refuse refills the unclamped path
 * already treats as fine. The multiple is a choice about how far a gas price can
 * run, not a measurement, and it is written here as one.
 *
 * It is the bar for refusing before anything moves. What decides whether the
 * payment can actually be made is the payer's balance after the refill lands,
 * which `ensurePayerFunds` reads rather than predicts.
 */
export function topUpFeeHeadroom(asset: UsdcAsset): bigint {
  return gasReserve(asset) / 2n;
}
