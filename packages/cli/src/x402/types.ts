// x402 v2 wire types — the client-side subset the CLI needs. Names mirror the
// backend's `apps/ens/src/external/payment/x402-types.ts` so the buyer and
// seller sides stay wire-compatible. v2 only (no v1 `X-PAYMENT` / `maxAmountRequired`).

/** One acceptable payment option from the server's `accepts` list. */
export interface X402PaymentRequirement {
  scheme: 'exact';
  /** CAIP-2 network id, e.g. `eip155:8453`. */
  network: string;
  /** Base units, decimal string. */
  amount: string;
  asset: `0x${string}`;
  payTo: `0x${string}`;
  maxTimeoutSeconds: number;
  /** Scheme-specific extension (for exact-evm, the EIP-712 domain name/version). */
  extra?: Record<string, unknown>;
}

/** Top-level resource metadata, hoisted out of per-accepts in v2. */
export interface X402Resource {
  url: string;
  description?: string;
  mimeType?: string;
  serviceName?: string;
  tags?: string[];
  iconUrl?: string;
}

/**
 * The v2 PaymentRequired challenge — base64-decoded from the `PAYMENT-REQUIRED`
 * response header (the HTTP body stays an opaque `{}`).
 */
export interface X402PaymentRequired {
  x402Version: 2;
  error?: string;
  resource: X402Resource;
  accepts: X402PaymentRequirement[];
  extensions?: Record<string, unknown>;
}

/** EIP-3009 `transferWithAuthorization` signed message (shared by x402 and MPP). */
export interface X402EIP3009Authorization {
  from: `0x${string}`;
  to: `0x${string}`;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: `0x${string}`;
}

/** Signed message + signature — the payload of the `exact` scheme on EVM. */
export interface X402ExactPayload {
  signature: `0x${string}`;
  authorization: X402EIP3009Authorization;
}

/**
 * What the client sends back base64-encoded in `PAYMENT-SIGNATURE`. `accepted`
 * (singular) echoes the chosen requirement so the server verifies against what
 * it advertised.
 */
export interface X402PaymentPayload {
  x402Version: 2;
  accepted: X402PaymentRequirement;
  payload: X402ExactPayload;
  extensions?: Record<string, unknown>;
}

/** Facilitator settle/verify result — decoded from `PAYMENT-RESPONSE`. */
export interface X402SettleResponse {
  success: boolean;
  transaction?: `0x${string}`;
  network?: string;
  payer?: `0x${string}`;
  errorReason?: string;
  amount?: string;
}

/** v2 HTTP header names (no `X-` prefix; case-insensitive on the wire). */
export const X402_HEADERS = {
  required: 'PAYMENT-REQUIRED',
  signature: 'PAYMENT-SIGNATURE',
  response: 'PAYMENT-RESPONSE',
} as const;
