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
