import { describe, it, expect, vi, beforeEach } from 'vitest';

// publicClientFor's transport depends on the configured apiKey, and its client
// cache must key on that apiKey so the long-lived `jaw mcp` server picks up a key
// set AFTER a first (keyless) read instead of caching the public-RPC client for
// good. These tests pin that: transport selection by apiKey, and cache reuse vs
// invalidation. Each case re-imports the module so its per-process cache is fresh.

const loadConfigMock = vi.fn();
vi.mock('../lib/config.js', () => ({ loadConfig: () => loadConfigMock() }));

const createPublicClientMock = vi.fn((..._args: unknown[]) => ({}) as unknown);
const httpMock = vi.fn((url?: string) => ({ __url: url }));
vi.mock('viem', async (importActual) => {
  const actual = await importActual<typeof import('viem')>();
  return { ...actual, createPublicClient: createPublicClientMock, http: httpMock };
});

async function freshPublicClientFor() {
  vi.resetModules();
  createPublicClientMock.mockClear();
  httpMock.mockClear();
  return (await import('./balance.js')).publicClientFor;
}

const transportUrlOf = (call: number) =>
  (createPublicClientMock.mock.calls[call]?.[0] as unknown as { transport: { __url?: string } }).transport.__url;

beforeEach(() => {
  loadConfigMock.mockReset();
});

describe('publicClientFor transport + cache', () => {
  it('uses the public RPC (no url) when no apiKey is configured', async () => {
    loadConfigMock.mockReturnValue({});
    const publicClientFor = await freshPublicClientFor();
    publicClientFor(8453);
    expect(createPublicClientMock).toHaveBeenCalledTimes(1);
    expect(transportUrlOf(0)).toBeUndefined();
  });

  it('routes through the JAW proxy with the apiKey when one is configured', async () => {
    loadConfigMock.mockReturnValue({ apiKey: 'pk_test_123' });
    const publicClientFor = await freshPublicClientFor();
    publicClientFor(8453);
    expect(transportUrlOf(0)).toBe('https://api.justaname.id/proxy/v1/rpc?chainId=8453&api-key=pk_test_123');
  });

  it('reuses the cached client for the same chain and apiKey', async () => {
    loadConfigMock.mockReturnValue({ apiKey: 'pk_test_123' });
    const publicClientFor = await freshPublicClientFor();
    publicClientFor(8453);
    publicClientFor(8453);
    expect(createPublicClientMock).toHaveBeenCalledTimes(1);
  });

  it('builds a new client when the apiKey changes (no stale public-RPC client)', async () => {
    const publicClientFor = await freshPublicClientFor();
    loadConfigMock.mockReturnValue({}); // keyless first read
    publicClientFor(8453);
    loadConfigMock.mockReturnValue({ apiKey: 'pk_live_456' }); // key set later
    publicClientFor(8453);
    expect(createPublicClientMock).toHaveBeenCalledTimes(2);
    expect(transportUrlOf(0)).toBeUndefined();
    expect(transportUrlOf(1)).toContain('api-key=pk_live_456');
  });
});
