import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { errorMessage } from '../lib/errors.js';
import { parseBigInt } from './amount.js';
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
  /** Base units already spent in the current grant period (for `maxPerPeriod`). */
  spentThisPeriod?: bigint;
  /** When the current grant period ends, so a refusal can say when it frees up. */
  periodEndsAt?: Date;
  /**
   * Stop after choosing a requirement: no funding, no signature, no money. The
   * same request, challenge parse and policy evaluation a real payment runs, so
   * a clean dry run means a real one would have been allowed too.
   */
  dryRun?: boolean;
  /** Hard ceiling for this single call, on top of the policy. */
  maxAmount?: string;
  /** Require a specific asset (contract address). */
  asset?: string;
  /** Require a specific CAIP-2 network. */
  network?: string;
  /**
   * Optional funding hook, run after the policy approved a requirement and
   * before the payment is signed. Flow 2b plugs the permission top-up in here;
   * a `{ok:false}` outcome becomes a refusal with its reason, never a throw.
   */
  ensureFunds?: (
    requirement: X402PaymentRequirement,
    payerAddress: `0x${string}`
  ) => Promise<{ ok: boolean; reason?: string; amount?: string; batchId?: string; skipped?: boolean }>;
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
  /**
   * Present when the payer was refilled from the user's account through the
   * on-chain permission before this payment. User funds moved: always surfaced.
   */
  topUp?: { amount?: string; batchId?: string };
  /** Set when a `402` could not (or should not) be paid. */
  refusedReason?: string;
  /**
   * On a `dryRun`, the requirement that would have been paid. Absent when the
   * resource was free or the policy refused (see `refusedReason`). Carries no
   * nonce, deliberately: a nonce only exists once an authorization is signed,
   * and a dry run never signs one.
   */
  wouldPay?: Omit<PaymentDetails, 'nonce'>;
}

const b64json = <T>(header: string | null): T | null => {
  if (!header) return null;
  try {
    return JSON.parse(Buffer.from(header, 'base64').toString()) as T;
  } catch {
    return null;
  }
};

/**
 * The settle receipt's tx hash, or nothing when the server sent something that
 * isn't one. Every other field off the wire is shape-checked (`accepts` by
 * `requirementSchema`, addresses by `hexAddress`, `network` by the CAIP-2
 * regex); this one is decoded from a bare base64 header and then reaches a
 * terminal line (`x402 pay` prints it unsanitized, so `\x1b[2K\r` would repaint
 * what the CLI just wrote) and the MCP meta block, which claims to hold only
 * validated shapes that cannot carry an instruction. Checking it here is what
 * makes that claim true, and closes every sink at once. A receipt that fails
 * the check still reconciles by nonce, which the ledger also records.
 */
function settledTxHash(receipt: X402SettleResponse | null): `0x${string}` | undefined {
  const tx = receipt?.transaction;
  return tx && /^0x[0-9a-fA-F]{64}$/.test(tx) ? tx : undefined;
}

// Cap the response body a server can make us buffer. The body is untrusted and
// only ever carries a small JSON envelope; without a cap a malicious server
// could stream gigabytes and OOM the agent process.
const MAX_BODY_BYTES = 2 * 1024 * 1024;

async function readBody(res: Response): Promise<unknown> {
  const reader = res.body?.getReader();
  if (!reader) {
    // No stream (e.g. a mocked response): fall back to text() but still guard.
    const text = await res.text();
    if (text.length === 0) return {};
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        return { error: `response body exceeded ${MAX_BODY_BYTES} bytes` };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  if (total === 0) return {};
  const text = Buffer.concat(chunks).toString('utf-8');
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// Node's fetch has NO default timeout. A server that accepts the connection and
// never responds would otherwise hang the call forever — and because payments
// run inside a serialization mutex (see registerPayTool), one hung request
// would wedge EVERY subsequent payment. Bound every request so the mutex always
// makes progress.
const FETCH_TIMEOUT_MS = 30_000;

/**
 * A response whose deadline is still armed. `fetch` resolves as soon as the
 * HEADERS arrive, so disarming there leaves the body read unbounded in time: a
 * server that trickles one byte a minute would hold the payment mutex open
 * forever. That is worse than a hang — after a settled payment the ledger
 * append never runs, another process eventually judges the lock stale and
 * breaks it, and both payments clear the cap. So the deadline covers the body
 * read too, and `read()` is the only thing that disarms it.
 */
interface TimedResponse {
  res: Response;
  /** Consume the body under the request's deadline, then disarm. */
  read(): Promise<unknown>;
  /** Drop an unread body (nothing needs it) and disarm. */
  close(): void;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<TimedResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  // The deadline must never be what keeps the process alive: the pending socket
  // already holds the loop open while it matters, and an armed timer past that
  // point would stall exit the way a payment's own timers must not.
  timer.unref?.();
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
  return {
    res,
    read: async () => {
      try {
        return await readBody(res);
      } catch (err) {
        // An abort mid-body is the deadline firing, not a caller error. Report
        // it as body content the way an oversized body is: throwing here would
        // escape `payAndFetch` after settlement and lose a paid payment's
        // record, which is exactly the trace the ledger needs.
        if (controller.signal.aborted) {
          return { error: `response body timed out after ${FETCH_TIMEOUT_MS}ms` };
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    },
    close: () => {
      clearTimeout(timer);
      void res.body?.cancel().catch(() => undefined);
    },
  };
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

/**
 * Whether a URL is safe to SIGN a payment for. A payment over cleartext http
 * lets a network attacker rewrite the 402 challenge's payTo and walk off with
 * the signed authorization, so only TLS is trusted — except loopback, where
 * there is no wire to tamper with (local dev/test servers). Free (non-402)
 * fetches are unaffected; this gate is only consulted before signing.
 */
function isPaymentUrlSecure(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol === 'https:') return true;
    if (protocol === 'http:') return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    return false;
  } catch {
    return false;
  }
}

function idempotencyKey(): string {
  return `jaw-${randomBytes(6).toString('hex')}`;
}

const hexAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'must be a 20-byte hex address') as unknown as z.ZodType<`0x${string}`>;

/**
 * Shape of one server-supplied `accepts` entry. The challenge is untrusted
 * input: validating here turns a malformed option into one clear refusal
 * reason instead of a confusing failure deeper in the signing path. `scheme`
 * stays a plain string so unsupported schemes still get their own message.
 * The parsed object is echoed back to the server as `accepted`, which must
 * match the option as-advertised — hence passthrough (unknown fields survive)
 * and no defaults (nothing is injected that was not on the wire).
 */
const requirementSchema = z
  .object({
    scheme: z.string(),
    // CAIP-2 (`namespace:reference`). Left as a free string, an unknown
    // network flowed verbatim into the refusal reason, the ledger, and every
    // later `x402 log`. Constrained at the boundary so it cannot carry a
    // payload at all, which is cheaper than trusting each sink to disarm it.
    network: z.string().regex(/^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}$/, 'must be a CAIP-2 network id'),
    amount: z.string().regex(/^\d+$/, 'amount must be a base-10 integer string'),
    asset: hexAddress,
    payTo: hexAddress,
    // int + finite: a server sending Infinity/NaN/float here would otherwise
    // reach BigInt(validBefore) in the signer and throw an obscure error.
    maxTimeoutSeconds: z.number().int().nonnegative().finite().optional(),
    extra: z.record(z.unknown()).optional(),
  })
  .passthrough();

interface Selection {
  requirement?: X402PaymentRequirement;
  reason?: string;
}

/**
 * Pick the CHEAPEST `accepts` entry that satisfies the caller constraints +
 * policy. Choosing the lowest amount (rather than the first that passes) means a
 * multi-option server can't steer the agent onto a pricier option.
 */
function selectRequirement(accepts: unknown[], opts: PayAndFetchOptions, ctx: PolicyContext): Selection {
  const policy = opts.policy ?? {};
  let reason = 'no acceptable payment option in the 402 challenge';
  let best: X402PaymentRequirement | undefined;
  let bestAmount = 0n;

  for (const raw of accepts) {
    const parsed = requirementSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      reason = `malformed payment option${issue ? ` (${issue.path.join('.')}: ${issue.message})` : ''}`;
      continue;
    }
    const req = parsed.data as X402PaymentRequirement;
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

    const amount = parseBigInt(req.amount);
    if (amount === null) {
      reason = `invalid amount: ${req.amount}`;
      continue;
    }
    if (opts.maxAmount !== undefined) {
      const cap = parseBigInt(opts.maxAmount);
      if (cap === null) {
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
  const first = await fetchWithTimeout(url, { method, headers: baseHeaders, body: opts.body });
  if (first.res.status !== 402) {
    return { status: first.res.status, body: await first.read(), paid: false, payer: payer.address };
  }

  // A 402 means we are about to sign a payment. Gate on the FINAL url (after
  // any redirects), not the original: fetch follows https->http downgrades by
  // default, so a trusted https endpoint that redirects to http would smuggle a
  // cleartext challenge past a check on the original url. `resource` is also
  // what the policy host allowlist must judge, and where the signed proof is
  // sent (never the original, which could redirect again). Free (non-402)
  // fetches returned above, so plain http still works as a generic fetch.
  const resource = first.res.url || url;
  if (!isPaymentUrlSecure(resource)) {
    return {
      status: 402,
      body: await first.read(),
      paid: false,
      payer: payer.address,
      refusedReason: 'refusing to sign a payment over a non-HTTPS URL (use https, or localhost for testing)',
    };
  }

  // 2. The v2 challenge lives in the PAYMENT-REQUIRED header (body is opaque).
  const challenge = b64json<X402PaymentRequired>(first.res.headers.get(X402_HEADERS.required));
  if (!challenge || !Array.isArray(challenge.accepts)) {
    return {
      status: 402,
      body: await first.read(),
      paid: false,
      payer: payer.address,
      refusedReason: 'missing or malformed PAYMENT-REQUIRED challenge',
    };
  }

  // 3. Choose an option under the constraints + policy, or refuse clearly.
  const ctx: PolicyContext = {
    host: hostOf(resource),
    spentThisSession: opts.spentThisSession,
    spentThisPeriod: opts.spentThisPeriod,
    periodEndsAt: opts.periodEndsAt,
  };
  const { requirement, reason } = selectRequirement(challenge.accepts, opts, ctx);
  if (!requirement) {
    return { status: 402, body: await first.read(), paid: false, payer: payer.address, refusedReason: reason };
  }

  // 3.75 Dry run stops here, the last point before anything costs or commits.
  //      Funding moves user money and signing produces a spendable
  //      authorization, so both are past the line.
  if (opts.dryRun) {
    return {
      status: 402,
      body: await first.read(),
      paid: false,
      payer: payer.address,
      wouldPay: {
        amount: requirement.amount,
        asset: requirement.asset,
        network: requirement.network,
        payTo: requirement.payTo,
      },
    };
  }

  // 3.5 Funding hook (flow 2b): make sure the payer can actually cover the
  //     price, topping it up through the on-chain permission when it can't.
  //     A refusal here is a policy-shaped outcome, not an error.
  let topUp: { amount?: string; batchId?: string } | undefined;
  if (opts.ensureFunds) {
    const funded = await opts.ensureFunds(requirement, payer.address);
    if (!funded.ok) {
      return {
        status: 402,
        body: await first.read(),
        paid: false,
        payer: payer.address,
        refusedReason: funded.reason ?? 'payer funding failed',
        // A refused funding may still have broadcast the transfer (e.g. a
        // confirmation timeout) — keep the trace so it can be reconciled.
        ...(funded.batchId ? { topUp: { amount: funded.amount, batchId: funded.batchId } } : {}),
      };
    }
    if (!funded.skipped) {
      topUp = { amount: funded.amount, batchId: funded.batchId };
    }
  }

  // 4. Build + sign the payment. Keep the payload so the nonce is recoverable
  //    even if settlement later fails (money may still have moved in pull mode).
  //    A throw here (e.g. an eip712Domain read revert on a delegated payer)
  //    after a top-up already moved funds must NOT escape as a bare exception:
  //    surface it as a structured refusal carrying the topUp trace so the
  //    caller records the moved funds in the audit ledger.
  let payload;
  try {
    payload = await payer.pay(requirement);
  } catch (err) {
    return {
      status: 402,
      body: await first.read(),
      paid: false,
      payer: payer.address,
      refusedReason: `payment signing failed: ${errorMessage(err)}`,
      topUp,
    };
  }
  const details = {
    amount: requirement.amount,
    asset: requirement.asset,
    network: requirement.network,
    payTo: requirement.payTo,
    nonce: payload.payload.authorization.nonce,
  };
  const proof = encodePaymentPayload(payload);

  // Nothing reads the challenge's body from here on (the challenge itself came
  // from the header), so let go of it: its deadline is still armed, and leaving
  // it to expire mid-payment would abort a body no one is waiting for.
  first.close();

  // 5. Retry with the proof, against the resolved secure `resource` and with
  //    redirects DISABLED: the PAYMENT-SIGNATURE header must never be followed
  //    onto another origin (undici keeps custom headers across cross-origin
  //    redirects), which would hand the signed proof to an attacker. A fresh
  //    nonce means the server's replay protection is fine with the re-request.
  const retryHeaders: Record<string, string> = {
    ...baseHeaders,
    [X402_HEADERS.signature]: proof,
    'Idempotency-Key': idempotencyKey(),
  };
  const paid = await fetchWithTimeout(resource, {
    method,
    headers: retryHeaders,
    body: opts.body,
    redirect: 'manual',
  });

  // A settled x402 response carries the resource directly (never a redirect).
  // A 3xx here means the endpoint tried to bounce the signed proof elsewhere —
  // treat it as a settlement failure, never follow it.
  if (paid.res.status >= 300 && paid.res.status < 400) {
    return {
      status: paid.res.status,
      body: await paid.read(),
      paid: false,
      payer: payer.address,
      attemptedPayment: details,
      topUp,
      refusedReason: `settlement endpoint attempted a redirect (${paid.res.status}); not following it with the signed proof`,
    };
  }

  const receipt = b64json<X402SettleResponse>(paid.res.headers.get(X402_HEADERS.response));
  const body = await paid.read();
  if (paid.res.status >= 400) {
    // On rejection the server re-challenges with a fresh PAYMENT-REQUIRED whose
    // `error` carries the real reason (e.g. `invalid_exact_evm_insufficient_balance`),
    // which is far more actionable than the bare status. Prefer a settle receipt
    // error, then the re-challenge error, then the status.
    const reChallenge = b64json<X402PaymentRequired>(paid.res.headers.get(X402_HEADERS.required));
    return {
      status: paid.res.status,
      body,
      paid: false,
      payer: payer.address,
      // The payment was signed and sent; surface it so an ambiguous settlement
      // (facilitator may have broadcast) can be reconciled by nonce.
      attemptedPayment: details,
      topUp,
      refusedReason: receipt?.errorReason ?? reChallenge?.error ?? `settlement failed with status ${paid.res.status}`,
    };
  }

  return {
    status: paid.res.status,
    body,
    paid: true,
    topUp,
    payer: payer.address,
    payment: { ...details, txHash: settledTxHash(receipt) },
  };
}
