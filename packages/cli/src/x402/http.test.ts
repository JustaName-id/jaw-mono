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

  it('surfaces a settlement failure reason instead of throwing', async () => {
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
  });
});
