import { randomBytes } from 'node:crypto';
import { encodePaymentPayload } from './scheme-exact-evm.js';
import { checkPolicy, type PolicyContext, type X402Policy } from './policy.js';
import type { Payer } from './payer.js';
import {
  X402_HEADERS,
  type X402PaymentRequired,
  type X402PaymentRequirement,
  type X402SettleResponse,
} from './types.js';

export interface PayAndFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Tool-level caps + allowlists. */
  policy?: X402Policy;
  /** Base units already spent this session (for `maxTotalPerSession`). */
  spentThisSession?: bigint;
  /** Hard ceiling for this single call, on top of the policy. */
  maxAmount?: string;
  /** Require a specific asset (contract address). */
  asset?: string;
  /** Require a specific CAIP-2 network. */
  network?: string;
}

/** A payment as built/signed — the fields needed to audit or reconcile it. */
export interface PaymentDetails {
  amount: string;
  asset: string;
  network: string;
  payTo: string;
  /** The EIP-3009 nonce — lets you reconcile an on-chain transfer to this attempt. */
  nonce: `0x${string}`;
  /** Settlement tx hash, once the server reports it. */
  txHash?: string;
}

export interface PayAndFetchResult {
  status: number;
  body: unknown;
  /** True once a payment was made and the resource returned. */
  paid: boolean;
  /** The address funds are paid from — where the agent's USDC must live. */
  payer: `0x${string}`;
  /** Present on a successful payment. */
  payment?: PaymentDetails;
  /**
   * Present when a payment was signed and sent but settlement did not confirm.
   * In pull mode the facilitator may still have broadcast the transfer, so this
   * carries the nonce/amount to reconcile against — never assume no money moved.
   */
  attemptedPayment?: PaymentDetails;
  /** Set when a `402` could not (or should not) be paid. */
  refusedReason?: string;
}

const b64json = <T>(header: string | null): T | null => {
  if (!header) return null;
  try {
    return JSON.parse(Buffer.from(header, 'base64').toString()) as T;
  } catch {
    return null;
  }
};

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (text.length === 0) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

function idempotencyKey(): string {
  return `jaw-${randomBytes(6).toString('hex')}`;
}

interface Selection {
  requirement?: X402PaymentRequirement;
  reason?: string;
}

/**
 * Pick the CHEAPEST `accepts` entry that satisfies the caller constraints +
 * policy. Choosing the lowest amount (rather than the first that passes) means a
 * multi-option server can't steer the agent onto a pricier option.
 */
function selectRequirement(accepts: X402PaymentRequirement[], opts: PayAndFetchOptions, ctx: PolicyContext): Selection {
  const policy = opts.policy ?? {};
  let reason = 'no acceptable payment option in the 402 challenge';
  let best: X402PaymentRequirement | undefined;
  let bestAmount = 0n;

  for (const req of accepts) {
    if (req.scheme !== 'exact') {
      reason = `unsupported scheme: ${req.scheme}`;
      continue;
    }
    if (opts.network && req.network !== opts.network) {
      reason = `network ${req.network} does not match requested ${opts.network}`;
      continue;
    }
    if (opts.asset && req.asset.toLowerCase() !== opts.asset.toLowerCase()) {
      reason = `asset ${req.asset} does not match requested ${opts.asset}`;
      continue;
    }

    let amount: bigint;
    try {
      amount = BigInt(req.amount);
    } catch {
      reason = `invalid amount: ${req.amount}`;
      continue;
    }
    if (opts.maxAmount !== undefined) {
      let cap: bigint;
      try {
        cap = BigInt(opts.maxAmount);
      } catch {
        reason = `invalid maxAmount: ${opts.maxAmount}`;
        continue;
      }
      if (amount > cap) {
        reason = `amount ${req.amount} exceeds maxAmount ${opts.maxAmount}`;
        continue;
      }
    }

    const verdict = checkPolicy(req, policy, ctx);
    if (!verdict.ok) {
      reason = verdict.reason ?? reason;
      continue;
    }

    if (!best || amount < bestAmount) {
      best = req;
      bestAmount = amount;
    }
  }

  return best ? { requirement: best } : { reason };
}

/**
 * Fetch a resource, paying an x402 `402` challenge with the given payer when one
 * appears. Free resources pass straight through (this doubles as a generic
 * fetch). On a `402` it parses the challenge, selects an option that satisfies
 * the constraints + policy (never overpaying), builds and signs the payment, and
 * retries with `PAYMENT-SIGNATURE`. Settlement failures surface a reason rather
 * than blind-retrying.
 */
export async function payAndFetch(
  url: string,
  payer: Payer,
  opts: PayAndFetchOptions = {}
): Promise<PayAndFetchResult> {
  const method = opts.method ?? 'GET';
  const baseHeaders: Record<string, string> = { Accept: 'application/json', ...(opts.headers ?? {}) };

  // 1. First attempt. Anything but 402 passes through unchanged.
  const first = await fetch(url, { method, headers: baseHeaders, body: opts.body });
  if (first.status !== 402) {
    return { status: first.status, body: await readBody(first), paid: false, payer: payer.address };
  }

  // 2. The v2 challenge lives in the PAYMENT-REQUIRED header (body is opaque).
  const challenge = b64json<X402PaymentRequired>(first.headers.get(X402_HEADERS.required));
  if (!challenge || !Array.isArray(challenge.accepts)) {
    return {
      status: 402,
      body: await readBody(first),
      paid: false,
      payer: payer.address,
      refusedReason: 'missing or malformed PAYMENT-REQUIRED challenge',
    };
  }

  // 3. Choose an option under the constraints + policy, or refuse clearly.
  const ctx: PolicyContext = { host: hostOf(url), spentThisSession: opts.spentThisSession };
  const { requirement, reason } = selectRequirement(challenge.accepts, opts, ctx);
  if (!requirement) {
    return { status: 402, body: await readBody(first), paid: false, payer: payer.address, refusedReason: reason };
  }

  // 4. Build + sign the payment. Keep the payload so the nonce is recoverable
  //    even if settlement later fails (money may still have moved in pull mode).
  const payload = await payer.pay(requirement);
  const details = {
    amount: requirement.amount,
    asset: requirement.asset,
    network: requirement.network,
    payTo: requirement.payTo,
    nonce: payload.payload.authorization.nonce,
  };
  const proof = encodePaymentPayload(payload);

  // 5. Retry with the proof. A fresh nonce means the server's replay
  //    protection is fine with the re-request.
  const retryHeaders: Record<string, string> = {
    ...baseHeaders,
    [X402_HEADERS.signature]: proof,
    'Idempotency-Key': idempotencyKey(),
  };
  const paid = await fetch(url, { method, headers: retryHeaders, body: opts.body });

  const receipt = b64json<X402SettleResponse>(paid.headers.get(X402_HEADERS.response));
  const body = await readBody(paid);
  if (paid.status >= 400) {
    // On rejection the server re-challenges with a fresh PAYMENT-REQUIRED whose
    // `error` carries the real reason (e.g. `invalid_exact_evm_insufficient_balance`),
    // which is far more actionable than the bare status. Prefer a settle receipt
    // error, then the re-challenge error, then the status.
    const reChallenge = b64json<X402PaymentRequired>(paid.headers.get(X402_HEADERS.required));
    return {
      status: paid.status,
      body,
      paid: false,
      payer: payer.address,
      // The payment was signed and sent; surface it so an ambiguous settlement
      // (facilitator may have broadcast) can be reconciled by nonce.
      attemptedPayment: details,
      refusedReason: receipt?.errorReason ?? reChallenge?.error ?? `settlement failed with status ${paid.status}`,
    };
  }

  return {
    status: paid.status,
    body,
    paid: true,
    payer: payer.address,
    payment: { ...details, txHash: receipt?.transaction },
  };
}
