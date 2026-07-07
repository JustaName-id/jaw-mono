import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startOnramp, validateOtp, getOnrampOrder, OnrampApiError } from './client';

const BASE = 'https://api.example.test/proxy/v2/onramp';
const ok = (data: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ statusCode: 200, result: { data, error: null } }) }) as Response;
const bad = (error: string, status = 400) =>
  ({ ok: false, status, json: async () => ({ result: { data: null, error } }) }) as unknown as Response;

const mockFetch = () => fetch as unknown as ReturnType<typeof vi.fn>;

describe('onramp client', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('startOnramp posts x-api-key + body and unwraps result.data', async () => {
    mockFetch().mockResolvedValue(ok({ sessionId: 's1', expiresAt: 'T', otpRequired: true, otpChannel: 'sms' }));
    const res = await startOnramp(
      { phoneNumber: '+12025550123', email: 'a@b.co', fiatAmount: '25', destinationAddress: '0xabc' },
      'KEY',
      BASE
    );
    expect(res.sessionId).toBe('s1');
    const [url, init] = mockFetch().mock.calls[0];
    expect(url).toBe(`${BASE}/start`);
    expect(init.method).toBe('POST');
    expect(init.headers['x-api-key']).toBe('KEY');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body).phoneNumber).toBe('+12025550123');
  });

  it('validateOtp unwraps { order, embeddable }', async () => {
    mockFetch().mockResolvedValue(
      ok({ order: { providerOrderId: 'o1', status: 'PENDING' }, embeddable: { type: 'IFRAME_URL', url: 'u' } })
    );
    const res = await validateOtp({ sessionId: 's1', code: '000000' }, 'KEY', BASE);
    expect(res.order.providerOrderId).toBe('o1');
    expect(res.embeddable.url).toBe('u');
    expect(mockFetch().mock.calls[0][0]).toBe(`${BASE}/validate-otp`);
  });

  it('getOnrampOrder GETs orders/:id and unwraps', async () => {
    mockFetch().mockResolvedValue(ok({ providerOrderId: 'o1', status: 'COMPLETED' }));
    const res = await getOnrampOrder('o1', 'KEY', BASE);
    expect(res.status).toBe('COMPLETED');
    const [url, init] = mockFetch().mock.calls[0];
    expect(url).toBe(`${BASE}/orders/o1`);
    expect(init.method).toBe('GET');
    expect(init.headers['x-api-key']).toBe('KEY');
  });

  it('throws result.error on failure', async () => {
    mockFetch().mockResolvedValue(bad('phoneNumber invalid'));
    await expect(
      startOnramp({ phoneNumber: 'x', email: 'a@b.co', fiatAmount: '1', destinationAddress: '0x' }, 'K', BASE)
    ).rejects.toThrow('phoneNumber invalid');
  });

  it('errors carry the HTTP status so callers can detect dead sessions (400/409)', async () => {
    mockFetch().mockResolvedValue(bad('session already used', 409));
    const err = await validateOtp({ sessionId: 's1', code: '000000' }, 'K', BASE).catch((e) => e);
    expect(err).toBeInstanceOf(OnrampApiError);
    expect(err.status).toBe(409);

    mockFetch().mockResolvedValue(bad('invalid otp'));
    const err400 = await validateOtp({ sessionId: 's1', code: '111111' }, 'K', BASE).catch((e) => e);
    expect(err400).toBeInstanceOf(OnrampApiError);
    expect(err400.status).toBe(400);
  });
});
