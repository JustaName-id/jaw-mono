import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { discoverServices } from './discover.js';

const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const mockJson = (body: unknown, ok = true, status = 200): Response =>
  ({
    ok,
    status,
    json: async () => body,
  }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// URL the mock was called with, for asserting query params.
const calledUrl = (): URL => new URL(fetchMock.mock.calls[0][0] as string);

describe('discoverServices — search mode', () => {
  it('Given a query, When searching, Then it calls the Bazaar search endpoint with the params and maps the results', async () => {
    fetchMock.mockResolvedValueOnce(
      mockJson({
        searchMethod: 'hybrid',
        partialResults: false,
        resources: [
          {
            resource: 'https://api.justaname.id/ens/v2/resolve',
            serviceName: 'JustaName ENS Resolver',
            description: 'Resolve ENS',
            tags: ['ens', 'identity'],
            x402Version: 2,
            accepts: [
              {
                scheme: 'exact',
                network: 'eip155:8453',
                amount: '1000',
                asset: USDC_BASE,
                payTo: '0xabc',
                maxTimeoutSeconds: 60,
              },
            ],
            extensions: {
              bazaar: { info: { input: { type: 'http', method: 'GET', queryParams: { ens: 'vitalik.eth' } } } },
            },
            quality: { l30DaysTotalCalls: 13, l30DaysUniquePayers: 7, lastCalledAt: '2026-08-02T00:00:00Z' },
          },
        ],
      })
    );

    const result = await discoverServices({ query: 'ens resolver' });

    const url = calledUrl();
    expect(url.pathname).toContain('/discovery/search');
    expect(url.searchParams.get('query')).toBe('ens resolver');
    expect(url.searchParams.get('network')).toBe('eip155:8453');
    expect(url.searchParams.get('limit')).toBe('10');

    expect(result.mode).toBe('search');
    expect(result.count).toBe(1);
    expect(result.searchMethod).toBe('hybrid');
    const svc = result.services[0];
    expect(svc.name).toBe('JustaName ENS Resolver');
    expect(svc.url).toBe('https://api.justaname.id/ens/v2/resolve');
    expect(svc.tags).toEqual(['ens', 'identity']);
    expect(svc.price).toEqual({
      amount: '1000',
      asset: USDC_BASE,
      network: 'eip155:8453',
      payTo: '0xabc',
      scheme: 'exact',
      maxTimeoutSeconds: 60,
      approxUsd: 0.001,
    });
    expect(svc.howToCall).toEqual({ type: 'http', method: 'GET', queryParams: { ens: 'vitalik.eth' } });
    expect(svc.trust).toEqual({ curated: null, calls30d: 13, payers30d: 7, lastCalledAt: '2026-08-02T00:00:00Z' });
  });

  it('Given optional filters, When searching, Then maxUsdPrice, curatedOnly and a clamped limit are forwarded', async () => {
    fetchMock.mockResolvedValueOnce(mockJson({ resources: [] }));

    await discoverServices({ query: 'x', maxUsdPrice: '0.01', curatedOnly: true, limit: 999, network: 'eip155:84532' });

    const url = calledUrl();
    expect(url.searchParams.get('maxUsdPrice')).toBe('0.01');
    expect(url.searchParams.get('curatedOnly')).toBe('true');
    expect(url.searchParams.get('network')).toBe('eip155:84532');
    // limit clamped to the Bazaar max of 20.
    expect(url.searchParams.get('limit')).toBe('20');
  });

  it('Given multiple accepts entries, When mapping, Then it picks the cheapest option on the preferred network', async () => {
    fetchMock.mockResolvedValueOnce(
      mockJson({
        resources: [
          {
            resource: 'https://svc.example/x',
            accepts: [
              // Cheaper, but on another chain — must NOT win over the Base option.
              { scheme: 'exact', network: 'eip155:137', amount: '500', asset: '0xdef', payTo: '0x1' },
              { scheme: 'exact', network: 'eip155:8453', amount: '3000', asset: USDC_BASE, payTo: '0x2' },
              { scheme: 'exact', network: 'eip155:8453', amount: '2000', asset: USDC_BASE, payTo: '0x3' },
            ],
          },
        ],
      })
    );

    const result = await discoverServices({ query: 'x' });

    expect(result.services[0].price?.amount).toBe('2000');
    expect(result.services[0].price?.network).toBe('eip155:8453');
    expect(result.services[0].price?.approxUsd).toBe(0.002);
  });

  it('Given no accepts entry on the preferred network, When mapping, Then it falls back to the cheapest overall', async () => {
    fetchMock.mockResolvedValueOnce(
      mockJson({
        resources: [
          {
            resource: 'https://svc.example/y',
            accepts: [
              { scheme: 'exact', network: 'eip155:137', amount: '900', asset: '0xdef', payTo: '0x1' },
              { scheme: 'exact', network: 'eip155:137', amount: '400', asset: '0xdef', payTo: '0x2' },
            ],
          },
        ],
      })
    );

    const result = await discoverServices({ query: 'y' });

    expect(result.services[0].price?.amount).toBe('400');
    // Unknown asset on a non-registry chain → no USD estimate.
    expect(result.services[0].price?.approxUsd).toBeNull();
  });
});

describe('discoverServices — defensive mapping of untrusted data', () => {
  it('Given a resource with no serviceName/tags and a malformed accepts entry, When mapping, Then missing fields are null and bad options are skipped', async () => {
    fetchMock.mockResolvedValueOnce(
      mockJson({
        resources: [
          {
            resource: 'https://svc.example/z',
            // no serviceName, no tags, no quality, no extensions
            accepts: [
              { scheme: 'exact', network: 'eip155:8453', amount: 'not-a-number', asset: USDC_BASE, payTo: '0x1' },
              { scheme: 'exact', network: 'eip155:8453', amount: '5000', asset: USDC_BASE, payTo: '0x2' },
            ],
          },
        ],
      })
    );

    const result = await discoverServices({ query: 'z' });
    const svc = result.services[0];
    expect(svc.name).toBeNull();
    expect(svc.tags).toBeNull();
    expect(svc.howToCall).toBeUndefined();
    expect(svc.trust).toEqual({ curated: null, calls30d: null, payers30d: null, lastCalledAt: null });
    // The malformed 'not-a-number' amount is dropped; the valid one is chosen.
    expect(svc.price?.amount).toBe('5000');
  });

  it('Given a resource with zero usable accepts entries, When mapping, Then price is null', async () => {
    fetchMock.mockResolvedValueOnce(
      mockJson({ resources: [{ resource: 'https://svc.example/q', accepts: [{ scheme: 'exact' }] }] })
    );

    const result = await discoverServices({ query: 'q' });
    expect(result.services[0].price).toBeNull();
  });
});

describe('discoverServices — merchant mode', () => {
  it('Given a payTo, When called, Then it hits the merchant endpoint and reports merchant mode', async () => {
    fetchMock.mockResolvedValueOnce(
      mockJson({
        payTo: '0xc529edd6d47c60923902514c7c0b3993ae42c2ec',
        resources: [
          { resource: 'https://api.justaname.id/ens/v2/resolve', serviceName: 'JustaName ENS Resolver', accepts: [] },
          {
            resource: 'https://api.justaname.id/ens/v2/reverse',
            serviceName: 'JustaName ENS Reverse Resolver',
            accepts: [],
          },
        ],
      })
    );

    const result = await discoverServices({ payTo: '0xc529edd6d47c60923902514c7c0b3993ae42c2ec' });

    const url = calledUrl();
    expect(url.pathname).toContain('/discovery/merchant');
    expect(url.searchParams.get('payTo')).toBe('0xc529edd6d47c60923902514c7c0b3993ae42c2ec');
    expect(result.mode).toBe('merchant');
    expect(result.count).toBe(2);
    expect(result.services.map((s) => s.name)).toEqual(['JustaName ENS Resolver', 'JustaName ENS Reverse Resolver']);
  });
});

describe('discoverServices — errors', () => {
  it('Given a non-OK response, When called, Then it throws with the status', async () => {
    fetchMock.mockResolvedValueOnce(mockJson({}, false, 503));
    await expect(discoverServices({ query: 'x' })).rejects.toThrow('HTTP 503');
  });
});
