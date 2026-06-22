// Coinbase Developer Platform (CDP) — Onramp v2 "Headless / Guest Checkout".
//
// A native fiat→crypto flow: Create Onramp Order returns a payment-link URL that
// renders an Apple/Google Pay button embedded in an iframe. US-only.
//
// This integration runs in CDP SANDBOX (see COINBASE_ONRAMP_SANDBOX): the
// `sandbox-` partnerUserRef prefix makes orders always succeed without charging
// a card, and the payment link is embeddable on localhost with a sandbox query
// param appended.

export const CDP_HOST = 'api.cdp.coinbase.com';
export const CDP_BASE_URL = `https://${CDP_HOST}`;
// OpenAPI server base; full request path = CDP_API_PREFIX + endpoint path.
export const CDP_API_PREFIX = '/platform';

// CDP bearer-JWT auth (see ./client.ts).
export const CDP_JWT_ISSUER = 'cdp';
export const CDP_JWT_AUDIENCE = ['cdp_service'];
export const CDP_JWT_TTL_SECONDS = 120; // CDP tokens are valid 2 minutes.

// Onramp delivers to MAINNETS only — `base-sepolia` is rejected. The JAW
// smart-account address is identical across chains, so funds land on the user's
// account on the chosen mainnet even though JAW dev runs on Base Sepolia.
export const ONRAMP_DEFAULT_FIAT_CURRENCY = 'USD';
export const ONRAMP_DEFAULT_ASSET = 'USDC';
export const ONRAMP_DEFAULT_NETWORK = 'base';

// CDP-supported mainnets exposed in the network selector. Ids match CDP network
// names sent as `destinationNetwork`.
export const COINBASE_SUPPORTED_NETWORKS = ['base', 'ethereum', 'optimism', 'arbitrum', 'polygon'] as const;

export const PAYMENT_METHODS = {
  APPLE_PAY: 'GUEST_CHECKOUT_APPLE_PAY',
  GOOGLE_PAY: 'GUEST_CHECKOUT_GOOGLE_PAY',
} as const;

export type CoinbasePaymentMethod = (typeof PAYMENT_METHODS)[keyof typeof PAYMENT_METHODS];

/** Sandbox unless COINBASE_ONRAMP_SANDBOX is explicitly "false". */
export function isCoinbaseSandbox(): boolean {
  return (process.env.COINBASE_ONRAMP_SANDBOX ?? 'true').toLowerCase() !== 'false';
}
