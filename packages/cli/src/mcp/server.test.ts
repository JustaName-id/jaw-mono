import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const TEST_ROOT = path.join(os.tmpdir(), 'jaw-mcp-test');

vi.mock('../lib/paths.js', () => {
  const p = require('node:path');
  const o = require('node:os');
  const root = p.join(o.tmpdir(), 'jaw-mcp-test');
  return {
    PATHS: {
      root,
      config: p.join(root, 'config.json'),
      session: p.join(root, 'session.json'),
      relay: p.join(root, 'relay.json'),
      keystore: p.join(root, 'keystore.json'),
      sessionConfig: p.join(root, 'session-config.json'),
    },
  };
});

const getBridgeMock = vi.fn();
const shutdownDaemonMock = vi.fn();
vi.mock('../lib/bridge-singleton.js', () => ({
  getBridge: (...args: unknown[]) => getBridgeMock(...args),
  shutdownDaemon: (...args: unknown[]) => shutdownDaemonMock(...args),
}));

const sessionBridgeCtorMock = vi.fn();
const sessionRequestMock = vi.fn();
vi.mock('../lib/session-bridge.js', () => ({
  SessionBridge: class {
    constructor(options: unknown) {
      sessionBridgeCtorMock(options);
    }
    request(method: string, params?: unknown) {
      return sessionRequestMock(method, params);
    }
    close() {
      // no-op — mirrors SessionBridge.close()
    }
  },
}));

const { createMcpServer } = await import('./server.js');
const { saveConfig } = await import('../lib/config.js');
const { PATHS } = await import('../lib/paths.js');

async function connectClient(version?: string) {
  const server = createMcpServer(version);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function toolText(result: { content?: unknown }): string {
  const content = result.content as Array<{ type: string; text: string }>;
  return content[0]?.text ?? '';
}

beforeEach(() => {
  if (fs.existsSync(TEST_ROOT)) fs.rmSync(TEST_ROOT, { recursive: true });
  getBridgeMock.mockReset();
  shutdownDaemonMock.mockReset();
  sessionBridgeCtorMock.mockReset();
  sessionRequestMock.mockReset();
  getBridgeMock.mockResolvedValue({
    request: vi.fn().mockResolvedValue('0xbridge-result'),
    close: vi.fn(),
  });
  sessionRequestMock.mockResolvedValue('0xsession-result');
  process.env['JAW_API_KEY'] = 'test-api-key';
  delete process.env['JAW_CHAIN_ID'];
  delete process.env['JAW_SESSION'];
});

afterEach(() => {
  if (fs.existsSync(TEST_ROOT)) fs.rmSync(TEST_ROOT, { recursive: true });
  delete process.env['JAW_API_KEY'];
  delete process.env['JAW_CHAIN_ID'];
  delete process.env['JAW_SESSION'];
});

describe('server info', () => {
  it('reports the version it was created with', async () => {
    const client = await connectClient('9.9.9');
    expect(client.getServerVersion()?.version).toBe('9.9.9');
  });
});

describe('jaw_rpc chain resolution', () => {
  it('uses the chainId param when provided', async () => {
    const client = await connectClient();
    await client.callTool({ name: 'jaw_rpc', arguments: { method: 'wallet_getAssets', chainId: 10 } });
    expect(getBridgeMock).toHaveBeenCalledWith(expect.objectContaining({ chainId: 10 }));
  });

  it('uses JAW_CHAIN_ID env var when no param is given', async () => {
    process.env['JAW_CHAIN_ID'] = '8453';
    const client = await connectClient();
    await client.callTool({ name: 'jaw_rpc', arguments: { method: 'wallet_getAssets' } });
    expect(getBridgeMock).toHaveBeenCalledWith(expect.objectContaining({ chainId: 8453 }));
  });

  it('prefers the chainId param over JAW_CHAIN_ID', async () => {
    process.env['JAW_CHAIN_ID'] = '8453';
    const client = await connectClient();
    await client.callTool({ name: 'jaw_rpc', arguments: { method: 'wallet_getAssets', chainId: 10 } });
    expect(getBridgeMock).toHaveBeenCalledWith(expect.objectContaining({ chainId: 10 }));
  });

  it('falls back to config.defaultChain, then 1', async () => {
    saveConfig({ defaultChain: 84532 });
    const client = await connectClient();
    await client.callTool({ name: 'jaw_rpc', arguments: { method: 'wallet_getAssets' } });
    expect(getBridgeMock).toHaveBeenCalledWith(expect.objectContaining({ chainId: 84532 }));
  });
});

describe('jaw_rpc session mode', () => {
  it('routes through SessionBridge when session is true', async () => {
    const client = await connectClient();
    const result = await client.callTool({
      name: 'jaw_rpc',
      arguments: { method: 'wallet_sendCalls', params: { calls: [] }, session: true, chainId: 84532 },
    });
    expect(sessionBridgeCtorMock).toHaveBeenCalledWith(expect.objectContaining({ chainId: 84532 }));
    expect(sessionRequestMock).toHaveBeenCalledWith('wallet_sendCalls', { calls: [] });
    expect(getBridgeMock).not.toHaveBeenCalled();
    expect(toolText(result)).toContain('0xsession-result');
  });

  it('rejects methods unsupported in session mode', async () => {
    const client = await connectClient();
    const result = await client.callTool({
      name: 'jaw_rpc',
      arguments: { method: 'wallet_grantPermissions', session: true },
    });
    expect(result.isError).toBe(true);
    expect(toolText(result)).toContain('not supported in session mode');
    expect(sessionRequestMock).not.toHaveBeenCalled();
    expect(getBridgeMock).not.toHaveBeenCalled();
  });

  it('honors the JAW_SESSION env var', async () => {
    process.env['JAW_SESSION'] = 'true';
    const client = await connectClient();
    await client.callTool({ name: 'jaw_rpc', arguments: { method: 'personal_sign', params: ['hello'] } });
    expect(sessionRequestMock).toHaveBeenCalledWith('personal_sign', ['hello']);
    expect(getBridgeMock).not.toHaveBeenCalled();
  });

  it('lets session: false override JAW_SESSION', async () => {
    process.env['JAW_SESSION'] = 'true';
    const client = await connectClient();
    await client.callTool({
      name: 'jaw_rpc',
      arguments: { method: 'personal_sign', params: ['hello'], session: false },
    });
    expect(getBridgeMock).toHaveBeenCalled();
    expect(sessionRequestMock).not.toHaveBeenCalled();
  });

  it('rate-limits a burst of autonomous signing calls (bounds silent allowance drain)', async () => {
    const client = await connectClient();
    const sign = () =>
      client.callTool({
        name: 'jaw_rpc',
        arguments: { method: 'wallet_sendCalls', params: { calls: [] }, session: true, chainId: 84532 },
      });

    // The window allows 5 signs; each fresh server starts with an empty window.
    for (let i = 0; i < 5; i++) {
      expect(toolText(await sign())).toContain('0xsession-result');
    }

    const sixth = await sign();
    expect(sixth.isError).toBe(true);
    expect(toolText(sixth)).toContain('rate limit');
    // The rate-limited call never reaches the bridge.
    expect(sessionRequestMock).toHaveBeenCalledTimes(5);
  });

  it('does not rate-limit reads or browser-bridge calls', async () => {
    const client = await connectClient();
    for (let i = 0; i < 8; i++) {
      // wallet_getAssets is a read routed through the browser bridge, not a session sign.
      expect(toolText(await client.callTool({ name: 'jaw_rpc', arguments: { method: 'wallet_getAssets' } }))).toContain(
        '0xbridge-result'
      );
    }
  });
});

describe('jaw_session_status', () => {
  it('reports no session when keystore is missing', async () => {
    const client = await connectClient();
    const result = await client.callTool({ name: 'jaw_session_status', arguments: {} });
    const parsed = JSON.parse(toolText(result));
    expect(parsed.exists).toBe(false);
  });

  it('reports session details and expiry state', async () => {
    const { saveKeystore } = await import('../lib/keystore.js');
    const { saveSessionConfig } = await import('../lib/session-config.js');
    saveKeystore('0xabc', '0xSessionAddr');
    saveSessionConfig({
      ownerAddress: '0xOwner',
      sessionAddress: '0xSessionAddr',
      permissionId: '0xPerm',
      chainId: 84532,
      expiry: Math.floor(Date.now() / 1000) + 86400,
    });
    const client = await connectClient();
    const result = await client.callTool({ name: 'jaw_session_status', arguments: {} });
    const parsed = JSON.parse(toolText(result));
    expect(parsed.exists).toBe(true);
    expect(parsed.sessionAddress).toBe('0xSessionAddr');
    expect(parsed.chainId).toBe(84532);
    expect(parsed.expired).toBe(false);
  });
});

describe('jaw_pay_and_fetch', () => {
  it('errors clearly when no session exists', async () => {
    const client = await connectClient();
    const result = await client.callTool({
      name: 'jaw_pay_and_fetch',
      arguments: { url: 'https://api.example.com/paid' },
    });
    expect(result.isError).toBe(true);
    expect(toolText(result)).toContain('jaw session setup');
  });

  it('passes a free (non-402) resource through without paying', async () => {
    const { saveKeystore } = await import('../lib/keystore.js');
    // A valid session key so the payer can be built; the free path never signs.
    saveKeystore('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', '0xSessionAddr');

    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify({ free: true }),
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const client = await connectClient();
      const parsed = JSON.parse(
        toolText(
          await client.callTool({ name: 'jaw_pay_and_fetch', arguments: { url: 'https://api.example.com/free' } })
        )
      );
      expect(parsed.paid).toBe(false);
      expect(parsed.status).toBe(200);
      expect(parsed.body).toEqual({ free: true });
      expect(fetchMock).toHaveBeenCalledTimes(1); // no retry / no payment
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // Hardhat test key #1 → EOA 0x70997970C51812dc3A010C7d01b50e0d17dc79C8.
  const PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
  const CHALLENGE = Buffer.from(
    JSON.stringify({
      x402Version: 2,
      resource: { url: 'https://api.example.com/paid' },
      accepts: [
        {
          scheme: 'exact',
          network: 'eip155:84532',
          amount: '1000',
          asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          payTo: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
          maxTimeoutSeconds: 60,
        },
      ],
    })
  ).toString('base64');
  const RECEIPT = Buffer.from(JSON.stringify({ success: true, transaction: '0xtx' })).toString('base64');
  const mkRes = (status: number, hdrs: Record<string, string>, body: string) =>
    ({ status, headers: { get: (k: string) => hdrs[k] ?? null }, text: async () => body }) as unknown as Response;

  it('pays a 402 with the real session-key payer and returns a receipt', async () => {
    const { saveKeystore } = await import('../lib/keystore.js');
    saveKeystore(PK, '0xSmartAccount');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mkRes(402, { 'PAYMENT-REQUIRED': CHALLENGE }, '{}'))
      .mockResolvedValueOnce(mkRes(200, { 'PAYMENT-RESPONSE': RECEIPT }, JSON.stringify({ data: 'ok' })));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const client = await connectClient();
      const parsed = JSON.parse(
        toolText(
          await client.callTool({ name: 'jaw_pay_and_fetch', arguments: { url: 'https://api.example.com/paid' } })
        )
      );
      expect(parsed.paid).toBe(true);
      expect(parsed.payment.txHash).toBe('0xtx');
      expect(parsed.payment.nonce).toMatch(/^0x[0-9a-f]{64}$/);
      expect(parsed.payer.toLowerCase()).toBe('0x70997970c51812dc3a010c7d01b50e0d17dc79c8');
      // The retry carried a real signed proof from the session key.
      const retryInit = fetchMock.mock.calls[1][1] as { headers: Record<string, string> };
      expect(retryInit.headers['PAYMENT-SIGNATURE']).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('enforces maxTotalPerSession across calls (refuses the second)', async () => {
    const { saveKeystore } = await import('../lib/keystore.js');
    saveKeystore(PK, '0xSmartAccount');
    saveConfig({ x402: { maxTotalPerSession: '1500' } });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mkRes(402, { 'PAYMENT-REQUIRED': CHALLENGE }, '{}')) // call 1: challenge
      .mockResolvedValueOnce(mkRes(200, { 'PAYMENT-RESPONSE': RECEIPT }, JSON.stringify({ ok: true }))) // call 1: paid (1000)
      .mockResolvedValueOnce(mkRes(402, { 'PAYMENT-REQUIRED': CHALLENGE }, '{}')); // call 2: challenge (refused before paying)
    vi.stubGlobal('fetch', fetchMock);
    try {
      const client = await connectClient();
      const first = JSON.parse(
        toolText(await client.callTool({ name: 'jaw_pay_and_fetch', arguments: { url: 'https://api.example.com/a' } }))
      );
      expect(first.paid).toBe(true);

      const second = JSON.parse(
        toolText(await client.callTool({ name: 'jaw_pay_and_fetch', arguments: { url: 'https://api.example.com/b' } }))
      );
      expect(second.paid).toBe(false);
      expect(second.refusedReason).toMatch(/maxTotalPerSession/);
      // 2 fetches for the first call (challenge + pay), 1 for the second (refused pre-payment).
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reports the payer address (the EOA to fund) in jaw_session_status', async () => {
    const { saveKeystore } = await import('../lib/keystore.js');
    const { saveSessionConfig } = await import('../lib/session-config.js');
    saveKeystore(PK, '0xSmartAccount');
    saveSessionConfig({
      ownerAddress: '0xOwner',
      sessionAddress: '0xSmartAccount',
      permissionId: '0xPerm',
      chainId: 84532,
      expiry: Math.floor(Date.now() / 1000) + 86400,
    });
    const client = await connectClient();
    const parsed = JSON.parse(toolText(await client.callTool({ name: 'jaw_session_status', arguments: {} })));
    // Distinct from sessionAddress (the smart account) — this is where USDC goes.
    expect(parsed.payerAddress.toLowerCase()).toBe('0x70997970c51812dc3a010c7d01b50e0d17dc79c8');
    expect(parsed.sessionAddress).toBe('0xSmartAccount');
  });
});

describe('jaw_status', () => {
  it('reports no relay session when relay.json is missing', async () => {
    const client = await connectClient();
    const parsed = JSON.parse(toolText(await client.callTool({ name: 'jaw_status', arguments: {} })));
    expect(parsed.relay.session).toBe(false);
    expect(parsed).not.toHaveProperty('bridgeConnection');
  });

  it('does not count a session that never completed key exchange', async () => {
    fs.mkdirSync(TEST_ROOT, { recursive: true });
    fs.writeFileSync(
      PATHS.relay,
      JSON.stringify({
        session: 'abc',
        relayUrl: 'wss://relay.jaw.id',
        privateKey: '0x1',
        publicKey: '0x2',
        peerPublicKey: null,
        startedAt: '2026-01-01T00:00:00.000Z',
      })
    );
    const client = await connectClient();
    const parsed = JSON.parse(toolText(await client.callTool({ name: 'jaw_status', arguments: {} })));
    expect(parsed.relay.session).toBe(false);
  });

  it('reports an established relay session', async () => {
    fs.mkdirSync(TEST_ROOT, { recursive: true });
    fs.writeFileSync(
      PATHS.relay,
      JSON.stringify({
        session: 'abc',
        relayUrl: 'wss://relay.jaw.id',
        privateKey: '0x1',
        publicKey: '0x2',
        peerPublicKey: '0x3',
        startedAt: '2026-01-01T00:00:00.000Z',
      })
    );
    const client = await connectClient();
    const parsed = JSON.parse(toolText(await client.callTool({ name: 'jaw_status', arguments: {} })));
    expect(parsed.relay.session).toBe(true);
    expect(parsed.relay.startedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('jaw_config_show', () => {
  it('redacts secrets embedded in paymaster URLs', async () => {
    saveConfig({
      apiKey: 'super-secret-api-key',
      paymasters: { 84532: { url: 'https://api.pimlico.io/v2/84532/rpc?apikey=pim_secret123' } },
    });
    const client = await connectClient();
    const text = toolText(await client.callTool({ name: 'jaw_config_show', arguments: {} }));
    expect(text).not.toContain('pim_secret123');
    expect(text).toContain('api.pimlico.io');
    expect(text).not.toContain('super-secret-api-key');
  });
});

describe('jaw_config_set', () => {
  it('accepts sessionExpiry and stores it as a number', async () => {
    const client = await connectClient();
    const result = await client.callTool({ name: 'jaw_config_set', arguments: { key: 'sessionExpiry', value: '14' } });
    expect(result.isError).toBeFalsy();
    const { loadConfig } = await import('../lib/config.js');
    expect(loadConfig().sessionExpiry).toBe(14);
  });

  it('rejects a non-numeric defaultChain', async () => {
    const client = await connectClient();
    const result = await client.callTool({ name: 'jaw_config_set', arguments: { key: 'defaultChain', value: 'nope' } });
    expect(result.isError).toBe(true);
  });
});
