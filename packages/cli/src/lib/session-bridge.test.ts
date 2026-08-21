import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock keystore
vi.mock('./keystore.js', () => ({
  loadSessionKey: vi.fn(() => '0x' + 'ab'.repeat(32)),
}));

// Mock session-config
const FUTURE_EXPIRY = Math.floor(Date.now() / 1000) + 86400;
const PAST_EXPIRY = Math.floor(Date.now() / 1000) - 86400;

let mockExpiry = FUTURE_EXPIRY;
let mockMode: 'counterfactual' | 'eip7702' | undefined;

// Only the file read is faked. `isLegacySession` stays the real one, so a test
// that says a session is refused is exercising the predicate the bridge uses.
vi.mock('./session-config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./session-config.js')>()),
  loadSessionConfig: vi.fn(() => ({
    ownerAddress: '0xOwner',
    sessionAddress: '0xSession',
    permissionId: '0xPermId',
    chainId: 84532,
    expiry: mockExpiry,
    createdAt: new Date().toISOString(),
    ...(mockMode ? { mode: mockMode } : {}),
  })),
}));

// Mock config
vi.mock('./config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({}),
}));

// Mock viem
vi.mock('viem/accounts', () => ({
  privateKeyToAccount: vi.fn().mockReturnValue({ address: '0xRawEOA' }),
}));

// Mock @jaw.id/core Account
const mockSendCalls = vi.fn().mockResolvedValue({ id: '0xBatchId', chainId: 84532 });
const mockSignMessage = vi.fn().mockResolvedValue('0xSig');
const mockSignTypedData = vi.fn().mockResolvedValue('0xTypedSig');
const mockGetCallStatus = vi.fn().mockReturnValue({ status: 200 });
let mockAccountAddress = '0xSession';

vi.mock('@jaw.id/core', () => ({
  Account: {
    fromLocalAccount: vi.fn().mockImplementation(async () => ({
      address: mockAccountAddress,
      sendCalls: mockSendCalls,
      signMessage: mockSignMessage,
      signTypedData: mockSignTypedData,
      getCallStatus: mockGetCallStatus,
    })),
  },
}));

const { SessionBridge } = await import('./session-bridge.js');
const { Account } = await import('@jaw.id/core');

describe('SessionBridge', () => {
  beforeEach(() => {
    mockExpiry = FUTURE_EXPIRY;
    mockMode = 'eip7702';
    mockAccountAddress = '0xSession';
    vi.clearAllMocks();
  });

  it('eth_requestAccounts returns sessionAddress', async () => {
    const bridge = new SessionBridge({ apiKey: 'test', chainId: 84532 });
    const result = await bridge.request('eth_requestAccounts');
    expect(result).toEqual(['0xSession']);
  });

  it('eth_accounts returns sessionAddress', async () => {
    const bridge = new SessionBridge({ apiKey: 'test', chainId: 84532 });
    const result = await bridge.request('eth_accounts');
    expect(result).toEqual(['0xSession']);
  });

  it('wallet_sendCalls extracts calls and injects permissionId (array format)', async () => {
    const bridge = new SessionBridge({ apiKey: 'test', chainId: 84532 });
    const calls = [{ to: '0xTarget', value: '0x0' }];
    await bridge.request('wallet_sendCalls', [{ calls }]);
    expect(mockSendCalls).toHaveBeenCalledWith(calls, { permissionId: '0xPermId' });
  });

  it('wallet_sendCalls handles direct object format from CLI', async () => {
    const bridge = new SessionBridge({ apiKey: 'test', chainId: 84532 });
    const calls = [{ to: '0xTarget', value: '0x0' }];
    await bridge.request('wallet_sendCalls', { calls });
    expect(mockSendCalls).toHaveBeenCalledWith(calls, { permissionId: '0xPermId' });
  });

  it('wallet_getCallsStatus forwards batchId', async () => {
    const bridge = new SessionBridge({ apiKey: 'test', chainId: 84532 });
    await bridge.request('wallet_getCallsStatus', ['0xBatchId']);
    expect(mockGetCallStatus).toHaveBeenCalledWith('0xBatchId');
  });

  it('personal_sign forwards message', async () => {
    const bridge = new SessionBridge({ apiKey: 'test', chainId: 84532 });
    await bridge.request('personal_sign', ['Hello', '0xAddr']);
    expect(mockSignMessage).toHaveBeenCalledWith('Hello');
  });

  it('eth_signTypedData_v4 forwards typed data', async () => {
    const bridge = new SessionBridge({ apiKey: 'test', chainId: 84532 });
    const typedData = { domain: {}, types: {}, message: {} };
    await bridge.request('eth_signTypedData_v4', ['0xAddr', JSON.stringify(typedData)]);
    expect(mockSignTypedData).toHaveBeenCalledWith(typedData);
  });

  it('wallet_grantPermissions throws with helpful message', async () => {
    const bridge = new SessionBridge({ apiKey: 'test', chainId: 84532 });
    await expect(bridge.request('wallet_grantPermissions')).rejects.toThrow(/Requires browser.*jaw session setup/);
  });

  it('wallet_revokePermissions throws with helpful message', async () => {
    const bridge = new SessionBridge({ apiKey: 'test', chainId: 84532 });
    await expect(bridge.request('wallet_revokePermissions')).rejects.toThrow(/Requires browser.*jaw session revoke/);
  });

  it('unsupported method throws', async () => {
    const bridge = new SessionBridge({ apiKey: 'test', chainId: 84532 });
    await expect(bridge.request('eth_feeHistory')).rejects.toThrow(/not supported in auto mode/);
  });

  it('throws if session is expired', async () => {
    mockExpiry = PAST_EXPIRY;
    const bridge = new SessionBridge({ apiKey: 'test', chainId: 84532 });
    await expect(bridge.request('eth_accounts')).rejects.toThrow(/Session expired/);
  });

  it('throws on chain mismatch between session and requested chain', async () => {
    const bridge = new SessionBridge({ apiKey: 'test', chainId: 8453 });
    await expect(bridge.request('eth_accounts')).rejects.toThrow(
      /Session was created for chain 84532, but --chain 8453 was requested/
    );
  });

  // Once nothing is sponsored this is the only way the send breaks, and core's
  // error names the token and the chain but not the account that cannot pay.
  it('names the account to fund when the paymaster approval cannot be sized', async () => {
    mockSendCalls.mockRejectedValueOnce(
      new Error('Could not size the ERC-20 paymaster approval for token 0xUSDC on chain 84532: reverted')
    );
    const bridge = new SessionBridge({ apiKey: 'test', chainId: 84532 });

    await expect(bridge.request('wallet_sendCalls', [{ calls: [] }])).rejects.toThrow(/0xSession holds no USDC/);
  });

  it('leaves every other send failure alone', async () => {
    mockSendCalls.mockRejectedValueOnce(new Error('bundler is down'));
    const bridge = new SessionBridge({ apiKey: 'test', chainId: 84532 });

    await expect(bridge.request('wallet_sendCalls', [{ calls: [] }])).rejects.toThrow(/^bundler is down$/);
  });

  it('close is a no-op', () => {
    const bridge = new SessionBridge({ apiKey: 'test', chainId: 84532 });
    expect(() => bridge.close()).not.toThrow();
  });

  it('always re-derives with eip7702, so the account is the permission spender', async () => {
    const bridge = new SessionBridge({ apiKey: 'test', chainId: 84532 });
    await bridge.request('eth_accounts');
    expect(Account.fromLocalAccount).toHaveBeenCalledWith(expect.anything(), expect.anything(), { eip7702: true });
  });

  // Their spender is a second address that holds nothing, so the ops it sends
  // cannot be charged for their own gas. Refuse with the fix rather than
  // deriving a different address and failing at the mismatch guard.
  it.each(['counterfactual' as const, undefined])(
    'refuses a session created by an older CLI (mode=%s)',
    async (mode) => {
      mockMode = mode;
      const bridge = new SessionBridge({ apiKey: 'test', chainId: 84532 });
      await expect(bridge.request('eth_accounts')).rejects.toThrow(/older CLI.*jaw session setup/s);
    }
  );

  it('throws when the derived account does not match the stored session address', async () => {
    // A hand-edited keystore or a config copied from another machine would
    // otherwise sign from an account the permission was never granted to.
    mockAccountAddress = '0xSomebodyElse';
    const bridge = new SessionBridge({ apiKey: 'test', chainId: 84532 });
    await expect(bridge.request('wallet_sendCalls', [{ calls: [] }])).rejects.toThrow(/out of sync/);
  });
});

describe('SessionBridge paymaster resolution', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paymasterOf = (b: SessionBridge) => (b as any).options as { paymasterUrl?: string; paymasterContext?: unknown };

  beforeEach(async () => {
    const { loadConfig } = await import('./config.js');
    vi.mocked(loadConfig).mockReturnValue({});
  });

  // The default path: an api key is all the user gave, and it is enough. Without
  // this the account has to prefund the EntryPoint itself, which fails on an
  // account holding only USDC.
  it("falls back to JAW's own paymaster, keyed by the api key already configured", () => {
    const bridge = new SessionBridge({ apiKey: 'key-123', chainId: 84532 });
    const url = new URL(paymasterOf(bridge).paymasterUrl!);
    expect(url.origin + url.pathname).toBe('https://api.justaname.id/proxy/v1/rpc/erc20-paymaster');
    expect(url.searchParams.get('chainId')).toBe('84532');
    expect(url.searchParams.get('api-key')).toBe('key-123');
  });

  it('carries the chain through, so each chain gets its own quote', () => {
    const bridge = new SessionBridge({ apiKey: 'key-123', chainId: 8453 });
    expect(new URL(paymasterOf(bridge).paymasterUrl!).searchParams.get('chainId')).toBe('8453');
  });

  // ERC-7677 is built around bringing your own paymaster service. That escape
  // hatch has to keep working, so config outranks the default.
  it('lets a configured paymaster win over the default', async () => {
    const { loadConfig } = await import('./config.js');
    vi.mocked(loadConfig).mockReturnValue({
      paymasters: { 84532: { url: 'https://api.pimlico.io/v2/84532/rpc?apikey=x', context: { mode: 'SPONSORED' } } },
    });
    const bridge = new SessionBridge({ apiKey: 'key-123', chainId: 84532 });
    expect(paymasterOf(bridge).paymasterUrl).toBe('https://api.pimlico.io/v2/84532/rpc?apikey=x');
    expect(paymasterOf(bridge).paymasterContext).toEqual({ mode: 'SPONSORED' });
  });

  it('lets an explicit url win over both', async () => {
    const { loadConfig } = await import('./config.js');
    vi.mocked(loadConfig).mockReturnValue({
      paymasters: { 84532: { url: 'https://configured.example/rpc' } },
    });
    const bridge = new SessionBridge({
      apiKey: 'key-123',
      chainId: 84532,
      paymasterUrl: 'https://explicit.example/rpc',
    });
    expect(paymasterOf(bridge).paymasterUrl).toBe('https://explicit.example/rpc');
  });

  it('only applies the configured paymaster to its own chain', async () => {
    const { loadConfig } = await import('./config.js');
    vi.mocked(loadConfig).mockReturnValue({ paymasters: { 8453: { url: 'https://mainnet-only.example/rpc' } } });
    const bridge = new SessionBridge({ apiKey: 'key-123', chainId: 84532 });
    expect(paymasterOf(bridge).paymasterUrl).toContain('api.justaname.id');
  });

  // Nothing to authenticate the proxy with, so there is no paymaster to engage.
  it('leaves the paymaster unset when there is no api key', () => {
    const bridge = new SessionBridge({ apiKey: '', chainId: 84532 });
    expect(paymasterOf(bridge).paymasterUrl).toBeUndefined();
  });

  // The core SDK matches this exact base url to add the USDC approval the
  // paymaster needs, so an encoded or reordered path would silently skip it.
  it('keeps the base url byte for byte, so core recognises it', () => {
    const bridge = new SessionBridge({ apiKey: 'k', chainId: 84532 });
    expect(paymasterOf(bridge).paymasterUrl!.split('?')[0]).toBe(
      'https://api.justaname.id/proxy/v1/rpc/erc20-paymaster'
    );
  });
});

// The url alone was never enough. An ERC-20 paymaster has to be told which token
// it is paid in: the SDK sizes and emits the `approve` from that address, and
// without it the userOp arrives with no allowance behind it and cannot settle.
// These follow the token into the SDK call rather than stopping at the resolved
// options, which is where the earlier cases stopped and why this went unnoticed.
describe('SessionBridge paymaster token', () => {
  const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

  type Resolved = { paymasterUrl?: string; paymasterContext?: Record<string, unknown> };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const optionsOf = (b: SessionBridge) => (b as any).options as Resolved;

  beforeEach(async () => {
    // The mock session state is module-level and mutable, so a describe that
    // reaches the SDK has to restore it: the address-mismatch case above
    // otherwise leaves the derived account pointing somewhere else.
    mockAccountAddress = '0xSession';
    mockExpiry = FUTURE_EXPIRY;
    mockMode = 'eip7702';
    vi.clearAllMocks();
    const { loadConfig } = await import('./config.js');
    vi.mocked(loadConfig).mockReturnValue({});
  });

  it('names USDC on the default paymaster so core can size the approval', () => {
    const bridge = new SessionBridge({ apiKey: 'key-123', chainId: 84532 });
    expect(optionsOf(bridge).paymasterContext?.token).toBe(USDC_BASE_SEPOLIA);
  });

  it('hands the token to the SDK, not just to its own options', async () => {
    const bridge = new SessionBridge({ apiKey: 'key-123', chainId: 84532 });
    await bridge.request('eth_requestAccounts');

    expect(Account.fromLocalAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        paymasterContext: { token: USDC_BASE_SEPOLIA },
      }),
      expect.anything(),
      expect.anything()
    );
  });

  // Engaging the ERC-20 paymaster without a token to name guarantees a failed
  // userOp, which is strictly worse than sending with no paymaster at all.
  it('leaves the paymaster unset on a chain the registry does not cover', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const bridge = new SessionBridge({ apiKey: 'key-123', chainId: 999999 });

    expect(optionsOf(bridge).paymasterUrl).toBeUndefined();
    expect(optionsOf(bridge).paymasterContext).toBeUndefined();
    // Falling back quietly leaves the user with a later failure about native
    // funds that names none of this.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('999999'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('native balance'));
    warn.mockRestore();
  });

  // A user bringing their own paymaster owns its context; we must not inject USDC.
  it('does not inject a token into a configured paymaster', async () => {
    const { loadConfig } = await import('./config.js');
    vi.mocked(loadConfig).mockReturnValue({
      paymasters: { 84532: { url: 'https://api.pimlico.io/v2/84532/rpc?apikey=x', context: { mode: 'SPONSORED' } } },
    });
    const bridge = new SessionBridge({ apiKey: 'key-123', chainId: 84532 });
    expect(optionsOf(bridge).paymasterContext).toEqual({ mode: 'SPONSORED' });
  });
});
