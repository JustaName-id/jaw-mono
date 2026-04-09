import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock keystore
vi.mock('./keystore.js', () => ({
  loadSessionKey: vi.fn().mockReturnValue('0x' + 'ab'.repeat(32)),
}));

// Mock session-config
const FUTURE_EXPIRY = Math.floor(Date.now() / 1000) + 86400;
const PAST_EXPIRY = Math.floor(Date.now() / 1000) - 86400;

let mockExpiry = FUTURE_EXPIRY;

vi.mock('./session-config.js', () => ({
  loadSessionConfig: vi.fn(() => ({
    ownerAddress: '0xOwner',
    sessionAddress: '0xSession',
    permissionId: '0xPermId',
    chainId: 84532,
    expiry: mockExpiry,
    createdAt: new Date().toISOString(),
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

vi.mock('@jaw.id/core', () => ({
  Account: {
    fromLocalAccount: vi.fn().mockResolvedValue({
      address: '0xSession',
      sendCalls: mockSendCalls,
      signMessage: mockSignMessage,
      signTypedData: mockSignTypedData,
      getCallStatus: mockGetCallStatus,
    }),
  },
}));

const { SessionBridge } = await import('./session-bridge.js');

describe('SessionBridge', () => {
  beforeEach(() => {
    mockExpiry = FUTURE_EXPIRY;
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

  it('wallet_sendCalls extracts calls and injects permissionId', async () => {
    const bridge = new SessionBridge({ apiKey: 'test', chainId: 84532 });
    const calls = [{ to: '0xTarget', value: '0x0' }];
    await bridge.request('wallet_sendCalls', [{ calls }]);
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

  it('close is a no-op', () => {
    const bridge = new SessionBridge({ apiKey: 'test', chainId: 84532 });
    expect(() => bridge.close()).not.toThrow();
  });
});
