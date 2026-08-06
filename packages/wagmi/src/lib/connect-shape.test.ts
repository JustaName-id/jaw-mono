import { describe, expect, it, vi, beforeEach } from 'vitest';

const request = vi.fn();

vi.mock('@jaw.id/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@jaw.id/core')>();
  return {
    ...actual,
    JAW: {
      create: () => ({
        provider: { request, on: () => undefined, removeListener: () => undefined },
      }),
    },
  };
});

const { jaw } = await import('./Connector.js');

const ADDRESS = '0x1234567890123456789012345678901234567890';
const SIWE_CAPABILITIES = { signInWithEthereum: { nonce: '123', chainId: '0x1' } };

function makeConnector() {
  const emitter = {
    uid: 'test',
    emit: () => undefined,
    on: () => undefined,
    off: () => undefined,
    once: () => undefined,
    listenerCount: () => 0,
  };
  return jaw({ apiKey: 'test-api-key' })({ emitter, chains: [], transports: {} } as never) as {
    connect: (params?: Record<string, unknown>) => Promise<{ accounts: readonly unknown[]; chainId: number }>;
  };
}

/**
 * wagmi v3 decides the shape of `connect`'s `accounts` from its own
 * `withCapabilities` flag, and only maps objects back to addresses when it asked
 * for capabilities. A connector that returns objects unrequested puts objects in
 * `state.connections[].accounts`, and `useAccount().address` stops being an
 * address.
 */
describe('connect() honors wagmi v3 withCapabilities', () => {
  beforeEach(() => {
    request.mockReset();
    request.mockImplementation(({ method }: { method: string }) => {
      switch (method) {
        case 'eth_requestAccounts':
          return Promise.resolve([ADDRESS]);
        case 'wallet_connect':
          return Promise.resolve({
            accounts: [{ address: ADDRESS, capabilities: { signInWithEthereum: { signature: '0xsig' } } }],
          });
        case 'eth_chainId':
          return Promise.resolve('0x1');
        case 'eth_accounts':
          return Promise.resolve([]);
        default:
          return Promise.resolve(null);
      }
    });
  });

  it('returns bare addresses by default', async () => {
    const { accounts } = await makeConnector().connect();
    expect(accounts).toEqual([ADDRESS]);
  });

  it('returns bare addresses even when wallet capabilities were requested', async () => {
    const { accounts } = await makeConnector().connect({ capabilities: SIWE_CAPABILITIES });
    expect(accounts).toEqual([ADDRESS]);
  });

  it('returns account objects when wagmi asks for capabilities', async () => {
    const { accounts } = await makeConnector().connect({
      capabilities: SIWE_CAPABILITIES,
      withCapabilities: true,
    });
    expect(accounts).toEqual([{ address: ADDRESS, capabilities: { signInWithEthereum: { signature: '0xsig' } } }]);
  });

  it('wraps addresses when wagmi asks for capabilities the wallet was never asked for', async () => {
    const { accounts } = await makeConnector().connect({ withCapabilities: true });
    expect(accounts).toEqual([{ address: ADDRESS, capabilities: {} }]);
  });
});
