import { randomBytes } from 'node:crypto';
import { usdcForNetwork } from './asset-registry.js';
import type { X402EIP3009Authorization, X402PaymentPayload, X402PaymentRequirement } from './types.js';

// EIP-712 struct for USDC's EIP-3009 `transferWithAuthorization`, the `exact`
// scheme's on-chain settlement. Ported from the backend reference payer.
export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

/** The fully-formed EIP-712 payload handed to the injected signer. */
export interface ExactTypedData {
  domain: { name: string; version: string; chainId: number; verifyingContract: `0x${string}` };
  types: typeof TRANSFER_WITH_AUTHORIZATION_TYPES;
  primaryType: 'TransferWithAuthorization';
  message: {
    from: `0x${string}`;
    to: `0x${string}`;
    value: bigint;
    validAfter: bigint;
    validBefore: bigint;
    nonce: `0x${string}`;
  };
}

/**
 * Signs the typed data and returns the 65-byte `r||s||v` signature. Injected so
 * the payer decides the key: pull mode signs with the session-key EOA; a future
 * push payer settles differently (see the x402 research, payer.ts).
 */
export type ExactSigner = (typedData: ExactTypedData) => Promise<`0x${string}`>;

export interface BuildExactOptions {
  /** Override "now" (unix seconds) for deterministic tests. */
  now?: number;
  /** Override the 32-byte nonce for deterministic tests. */
  nonce?: `0x${string}`;
}

/**
 * Build and sign the `exact`-scheme payment for one chosen requirement. `from`
 * is the payer address (the session-key EOA in pull mode). Each call uses a
 * fresh nonce; the server's replay protection rejects reuse of a stale proof.
 */
export async function buildExactPayment(
  requirement: X402PaymentRequirement,
  from: `0x${string}`,
  sign: ExactSigner,
  opts: BuildExactOptions = {}
): Promise<X402PaymentPayload> {
  const asset = usdcForNetwork(requirement.network);
  if (!asset) throw new Error(`Unsupported x402 network: ${requirement.network}`);

  // Prefer the server-advertised EIP-712 domain name/version (extra), else the
  // registry's known values for this USDC deployment.
  const name = typeof requirement.extra?.['name'] === 'string' ? (requirement.extra['name'] as string) : asset.usdcName;
  const version =
    typeof requirement.extra?.['version'] === 'string' ? (requirement.extra['version'] as string) : asset.usdcVersion;

  const nowSec = opts.now ?? Math.floor(Date.now() / 1000);
  const validAfter = '0';
  // The authorization must stay valid until the facilitator's settlement tx is
  // MINED, which includes verify + submit + block time on top of our signing.
  // A server's advertised maxTimeoutSeconds is often as low as 60s — too tight,
  // so the auth can expire before settlement and the transfer reverts. Give a
  // generous floor (the backend reference payer uses 600s); a longer-valid
  // authorization is harmless because the EIP-3009 nonce is single-use.
  const SETTLEMENT_WINDOW_FLOOR = 600;
  const window = Math.max(requirement.maxTimeoutSeconds || 0, SETTLEMENT_WINDOW_FLOOR);
  const validBefore = String(nowSec + window);
  const nonce = opts.nonce ?? (`0x${randomBytes(32).toString('hex')}` as `0x${string}`);

  const authorization: X402EIP3009Authorization = {
    from,
    to: requirement.payTo,
    value: requirement.amount,
    validAfter,
    validBefore,
    nonce,
  };

  const signature = await sign({
    domain: { name, version, chainId: asset.chainId, verifyingContract: requirement.asset },
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: {
      from,
      to: requirement.payTo,
      value: BigInt(requirement.amount),
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      nonce,
    },
  });

  return { x402Version: 2, accepted: requirement, payload: { signature, authorization } };
}

/** Base64-encode a payment payload for the `PAYMENT-SIGNATURE` header. */
export function encodePaymentPayload(payload: X402PaymentPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}
