import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { payAndFetch } from './http.js';
import type { Payer } from './payer.js';
import type { X402PaymentPayload, X402PaymentRequirement } from './types.js';

const URL_UNDER_TEST = 'https://api.example.com/paid/resource';

const REQUIREMENT: X402PaymentRequirement = {
  scheme: 'exact',
  network: 'eip155:8453',
  amount: '1000',
  asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  payTo: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  maxTimeoutSeconds: 60,
};

// A stub payer — the http loop only encodes and sends what it returns; it does
// not verify the signature, so no real key is needed here.
const payer: Payer = {
  address: '0x0000000000000000000000000000000000000001',
  pay: async (requirement): Promise<X402PaymentPayload> => ({
    x402Version: 2,
    accepted: requirement,
    payload: {
      signature: '0xstubsig',
      authorization: {
        from: '0x0000000000000000000000000000000000000001',
        to: requirement.payTo,
        value: requirement.amount,
        validAfter: '0',
        validBefore: '9999999999',
        nonce: ('0x' + '00'.repeat(32)) as `0x${string}`,
      },
    },
  }),
};

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64');

interface MockResInit {
  status: number;
  headers?: Record<string, string>;
  body?: string;
}
const mockRes = ({ status, headers = {}, body = '' }: MockResInit): Response =>
  ({
    status,
    headers: { get: (k: string) => headers[k] ?? null },
    text: async () => body,
  }) as unknown as Response;

const challengeHeader = b64({
  x402Version: 2,
  resource: { url: URL_UNDER_TEST },
  accepts: [REQUIREMENT],
});
const receiptHeader = b64({ success: true, transaction: '0xdeadbeef' });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('payAndFetch', () => {
  it('passes a free (non-402) resource straight through without paying', async () => {
    fetchMock.mockResolvedValueOnce(mockRes({ status: 200, body: JSON.stringify({ free: true }) }));

    const result = await payAndFetch(URL_UNDER_TEST, payer);

    expect(result.paid).toBe(false);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ free: true });
    expect(fetchMock).toHaveBeenCalledTimes(1); // no retry
  });

  it('refuses to sign a payment over a cleartext http URL (MITM could rewrite payTo)', async () => {
    fetchMock.mockResolvedValueOnce(
      mockRes({ status: 402, headers: { 'PAYMENT-REQUIRED': challengeHeader }, body: '{}' })
    );

    const result = await payAndFetch('http://api.example.com/paid/resource', payer);

    expect(result.paid).toBe(false);
    expect(result.status).toBe(402);
    expect(result.refusedReason).toMatch(/non-HTTPS/);
    expect(fetchMock).toHaveBeenCalledTimes(1); // never signed, never retried
  });

  it('still passes a free (non-402) http resource straight through', async () => {
    // The HTTPS gate is only for signing — a plain http fetch must still work.
    fetchMock.mockResolvedValueOnce(mockRes({ status: 200, body: JSON.stringify({ free: true }) }));

    const result = await payAndFetch('http://api.example.com/free', payer);

    expect(result.paid).toBe(false);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ free: true });
  });

  it('allows signing over http for loopback (local dev/test servers)', async () => {
    fetchMock
      .mockResolvedValueOnce(mockRes({ status: 402, headers: { 'PAYMENT-REQUIRED': challengeHeader }, body: '{}' }))
      .mockResolvedValueOnce(
        mockRes({ status: 200, headers: { 'PAYMENT-RESPONSE': receiptHeader }, body: JSON.stringify({ data: 'ok' }) })
      );

    const result = await payAndFetch('http://localhost:8080/paid', payer);

    expect(result.paid).toBe(true);
  });

  it('pays a 402 and returns the resource + receipt', async () => {
    fetchMock
      .mockResolvedValueOnce(mockRes({ status: 402, headers: { 'PAYMENT-REQUIRED': challengeHeader }, body: '{}' }))
      .mockResolvedValueOnce(
        mockRes({ status: 200, headers: { 'PAYMENT-RESPONSE': receiptHeader }, body: JSON.stringify({ data: 'ok' }) })
      );

    const result = await payAndFetch(URL_UNDER_TEST, payer);

    expect(result.paid).toBe(true);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ data: 'ok' });
    expect(result.payment).toMatchObject({ amount: '1000', payTo: REQUIREMENT.payTo, txHash: '0xdeadbeef' });

    // The retry carried the PAYMENT-SIGNATURE proof.
    const retryInit = fetchMock.mock.calls[1][1] as { headers: Record<string, string> };
    expect(retryInit.headers['PAYMENT-SIGNATURE']).toBeTruthy();
    expect(retryInit.headers['Idempotency-Key']).toBeTruthy();
  });

  it('runs the funding hook before paying and surfaces the top-up in the result', async () => {
    fetchMock
      .mockResolvedValueOnce(mockRes({ status: 402, headers: { 'PAYMENT-REQUIRED': challengeHeader }, body: '{}' }))
      .mockResolvedValueOnce(
        mockRes({ status: 200, headers: { 'PAYMENT-RESPONSE': receiptHeader }, body: JSON.stringify({ data: 'ok' }) })
      );

    const result = await payAndFetch(URL_UNDER_TEST, payer, {
      ensureFunds: async () => ({ ok: true, amount: '750000', batchId: '0xbatch1' }),
    });

    expect(result.paid).toBe(true);
    expect(result.topUp).toEqual({ amount: '750000', batchId: '0xbatch1' });
  });

  it('refuses with the funding reason when the hook cannot cover the price, without signing anything', async () => {
    fetchMock.mockResolvedValueOnce(
      mockRes({ status: 402, headers: { 'PAYMENT-REQUIRED': challengeHeader }, body: '{}' })
    );

    const result = await payAndFetch(URL_UNDER_TEST, payer, {
      ensureFunds: async () => ({ ok: false, reason: 'spending cap reached' }),
    });

    expect(result.paid).toBe(false);
    expect(result.refusedReason).toBe('spending cap reached');
    expect(fetchMock).toHaveBeenCalledTimes(1); // never retried with a payment
  });

  it('keeps the top-up trace when funding is refused after a broadcast (reconciliation)', async () => {
    fetchMock.mockResolvedValueOnce(
      mockRes({ status: 402, headers: { 'PAYMENT-REQUIRED': challengeHeader }, body: '{}' })
    );

    const result = await payAndFetch(URL_UNDER_TEST, payer, {
      ensureFunds: async () => ({
        ok: false,
        reason: 'top-up not confirmed after 90000ms',
        amount: '750000',
        batchId: '0xbatch9',
      }),
    });

    expect(result.paid).toBe(false);
    expect(result.topUp).toEqual({ amount: '750000', batchId: '0xbatch9' });
  });

  it('refuses to pay above the policy cap (no payment attempt)', async () => {
    fetchMock.mockResolvedValueOnce(
      mockRes({ status: 402, headers: { 'PAYMENT-REQUIRED': challengeHeader }, body: '{}' })
    );

    const result = await payAndFetch(URL_UNDER_TEST, payer, { policy: { maxAmountPerPayment: '500' } });

    expect(result.paid).toBe(false);
    expect(result.status).toBe(402);
    expect(result.refusedReason).toMatch(/exceeds maxAmountPerPayment/);
    expect(fetchMock).toHaveBeenCalledTimes(1); // never retried / paid
  });

  it('refuses when the 402 has no PAYMENT-REQUIRED challenge', async () => {
    fetchMock.mockResolvedValueOnce(mockRes({ status: 402, body: '{}' }));

    const result = await payAndFetch(URL_UNDER_TEST, payer);

    expect(result.paid).toBe(false);
    expect(result.refusedReason).toMatch(/PAYMENT-REQUIRED/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses a malformed accepts entry with a clear reason (no payment attempt)', async () => {
    // payTo is not an address and amount is not an integer string — the schema
    // at the challenge boundary must refuse, not fail deep in the signing path.
    const malformed = b64({
      x402Version: 2,
      resource: { url: URL_UNDER_TEST },
      accepts: [{ ...REQUIREMENT, payTo: 'not-an-address', amount: '1.5' }],
    });
    fetchMock.mockResolvedValueOnce(mockRes({ status: 402, headers: { 'PAYMENT-REQUIRED': malformed }, body: '{}' }));

    const result = await payAndFetch(URL_UNDER_TEST, payer);

    expect(result.paid).toBe(false);
    expect(result.refusedReason).toMatch(/malformed payment option/);
    expect(fetchMock).toHaveBeenCalledTimes(1); // never retried / paid
  });

  it('echoes the accepted option exactly as advertised (nothing injected or stripped)', async () => {
    // No maxTimeoutSeconds and an unknown future field: the server verifies
    // `accepted` against what it advertised, so validation must not inject
    // defaults into it nor strip fields it does not know.
    const { maxTimeoutSeconds: _omitted, ...rest } = REQUIREMENT;
    const wireEntry = { ...rest, futureField: 'kept' };
    const challenge = b64({ x402Version: 2, resource: { url: URL_UNDER_TEST }, accepts: [wireEntry] });
    fetchMock
      .mockResolvedValueOnce(mockRes({ status: 402, headers: { 'PAYMENT-REQUIRED': challenge }, body: '{}' }))
      .mockResolvedValueOnce(mockRes({ status: 200, headers: { 'PAYMENT-RESPONSE': receiptHeader }, body: '{}' }));

    const result = await payAndFetch(URL_UNDER_TEST, payer);

    expect(result.paid).toBe(true);
    const retryInit = fetchMock.mock.calls[1][1] as { headers: Record<string, string> };
    const proof = JSON.parse(Buffer.from(retryInit.headers['PAYMENT-SIGNATURE'], 'base64').toString());
    expect(proof.accepted).toEqual(wireEntry);
  });

  it('still pays a valid option when a malformed sibling entry sits beside it', async () => {
    const mixed = b64({
      x402Version: 2,
      resource: { url: URL_UNDER_TEST },
      accepts: [{ ...REQUIREMENT, asset: 'garbage' }, REQUIREMENT],
    });
    fetchMock
      .mockResolvedValueOnce(mockRes({ status: 402, headers: { 'PAYMENT-REQUIRED': mixed }, body: '{}' }))
      .mockResolvedValueOnce(
        mockRes({ status: 200, headers: { 'PAYMENT-RESPONSE': receiptHeader }, body: JSON.stringify({ data: 'ok' }) })
      );

    const result = await payAndFetch(URL_UNDER_TEST, payer);

    expect(result.paid).toBe(true);
    expect(result.payment?.payTo).toBe(REQUIREMENT.payTo);
  });

  it('surfaces a settlement failure reason + the attempted payment (nonce) instead of throwing', async () => {
    fetchMock
      .mockResolvedValueOnce(mockRes({ status: 402, headers: { 'PAYMENT-REQUIRED': challengeHeader }, body: '{}' }))
      .mockResolvedValueOnce(
        mockRes({
          status: 402,
          headers: { 'PAYMENT-RESPONSE': b64({ success: false, errorReason: 'insufficient_funds' }) },
          body: '{}',
        })
      );

    const result = await payAndFetch(URL_UNDER_TEST, payer);

    expect(result.paid).toBe(false);
    expect(result.refusedReason).toBe('insufficient_funds');
    // The signed payment must be recoverable — money may have moved in pull mode.
    expect(result.attemptedPayment).toMatchObject({
      amount: '1000',
      payTo: REQUIREMENT.payTo,
      nonce: '0x' + '00'.repeat(32),
    });
    expect(result.payer).toBe(payer.address);
  });

  it('surfaces the re-challenge error when settlement fails without a receipt', async () => {
    // What JAW's own staging server actually does: reject with a fresh 402 whose
    // PAYMENT-REQUIRED.error carries the reason, and no PAYMENT-RESPONSE.
    const reChallenge = b64({
      x402Version: 2,
      error: 'invalid_exact_evm_insufficient_balance',
      resource: { url: URL_UNDER_TEST },
      accepts: [REQUIREMENT],
    });
    fetchMock
      .mockResolvedValueOnce(mockRes({ status: 402, headers: { 'PAYMENT-REQUIRED': challengeHeader }, body: '{}' }))
      .mockResolvedValueOnce(mockRes({ status: 402, headers: { 'PAYMENT-REQUIRED': reChallenge }, body: '{}' }));

    const result = await payAndFetch(URL_UNDER_TEST, payer);

    expect(result.paid).toBe(false);
    expect(result.refusedReason).toBe('invalid_exact_evm_insufficient_balance');
    expect(result.attemptedPayment?.nonce).toBe('0x' + '00'.repeat(32));
  });

  it('picks the cheapest acceptable option when the server offers several', async () => {
    const dearer: X402PaymentRequirement = { ...REQUIREMENT, amount: '5000' };
    const cheaper: X402PaymentRequirement = { ...REQUIREMENT, amount: '750' };
    const multi = b64({ x402Version: 2, resource: { url: URL_UNDER_TEST }, accepts: [dearer, cheaper] });

    fetchMock
      .mockResolvedValueOnce(mockRes({ status: 402, headers: { 'PAYMENT-REQUIRED': multi }, body: '{}' }))
      .mockResolvedValueOnce(
        mockRes({ status: 200, headers: { 'PAYMENT-RESPONSE': receiptHeader }, body: JSON.stringify({ data: 'ok' }) })
      );

    const result = await payAndFetch(URL_UNDER_TEST, payer);

    expect(result.paid).toBe(true);
    expect(result.payment?.amount).toBe('750'); // the cheaper option, not the first-listed
  });
});
describe('payAndFetch against a demo-server-shaped x402 endpoint', () => {
  it('reads the price, refills via the hook, pays with the proof, and returns the resource + receipt', async () => {
    const priced = { ...REQUIREMENT, amount: '10000' };
    const challenge = b64({ x402Version: 2, resource: { url: URL_UNDER_TEST }, accepts: [priced] });
    const receipt = b64({ success: true, transaction: '0xfeed', network: priced.network, amount: '10000' });

    fetchMock
      .mockResolvedValueOnce(mockRes({ status: 402, headers: { 'PAYMENT-REQUIRED': challenge }, body: '{}' }))
      .mockResolvedValueOnce(
        mockRes({
          status: 200,
          headers: { 'PAYMENT-RESPONSE': receipt },
          body: JSON.stringify({ email: 'agent@example.com' }),
        })
      );

    let sawRequirementAmount: string | undefined;
    const result = await payAndFetch(URL_UNDER_TEST, payer, {
      ensureFunds: async (req) => {
        sawRequirementAmount = req.amount; // the hook sees the real priced requirement
        return { ok: true, amount: '2000000', batchId: '0xtop' };
      },
    });

    // Funding ran before payment, for the advertised price.
    expect(sawRequirementAmount).toBe('10000');
    // The proof carried the exact advertised amount + payTo (server would accept it).
    const retryInit = fetchMock.mock.calls[1][1] as { headers: Record<string, string> };
    const proof = JSON.parse(Buffer.from(retryInit.headers['PAYMENT-SIGNATURE'], 'base64').toString());
    expect(proof.accepted.amount).toBe('10000');
    expect(proof.payload.authorization.to.toLowerCase()).toBe(priced.payTo.toLowerCase());
    // Result surfaces the resource, receipt tx, and the top-up trace together.
    expect(result.paid).toBe(true);
    expect(result.body).toEqual({ email: 'agent@example.com' });
    expect(result.payment?.txHash).toBe('0xfeed');
    expect(result.topUp).toEqual({ amount: '2000000', batchId: '0xtop' });
  });
});
