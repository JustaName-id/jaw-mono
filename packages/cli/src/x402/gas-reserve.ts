import type { UsdcAsset } from './asset-registry.js';

/**
 * The USDC balance below which an account cannot pay a userOp fee, in base
 * units of `asset`. A permission op on the chains here costs a fraction of a
 * cent, so anything under 0.01 cannot plausibly cover one, and the bridge asks
 * the paymaster to sponsor rather than charge an account it cannot charge.
 */
export function gasFloor(asset: UsdcAsset): bigint {
  return 10n ** BigInt(asset.decimals) / 100n;
}

/**
 * The USDC a refill leaves behind so the next one can pay its own fee, in base
 * units of `asset`.
 *
 * Ten times the floor on purpose: the fee taken after each refill comes out of
 * this reserve, and a reserve sitting at the floor would dip under it every
 * time, flipping the next refill back to sponsored. With room above it the
 * balance settles just below the reserve and stays self-funded.
 *
 * 0.10 is also 1% of the default 10/day cap, so what it takes out of the
 * granted allowance is not worth tuning.
 */
export function gasReserve(asset: UsdcAsset): bigint {
  return 10n ** BigInt(asset.decimals) / 10n;
}
