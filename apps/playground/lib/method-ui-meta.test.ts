import { describe, it, expect } from 'vitest';
import {
  filterMethods,
  groupMethods,
  opensDialog,
  methodNeedsAttention,
  splitMethodName,
  type PlaygroundMethod,
} from './method-ui-meta';
import { RPC_METHODS } from './rpc-methods';
import { WAGMI_METHODS } from './wagmi-methods';

const m = (over: Partial<PlaygroundMethod>): PlaygroundMethod => ({
  id: 'x',
  name: 'x',
  method: 'x',
  category: 'account',
  description: '',
  requiresConnection: false,
  ...over,
});

describe('opensDialog', () => {
  it('classifies by RPC method name, so both registries agree', () => {
    // wagmi's connect entry has a different id but the same underlying method
    const coreConnect = RPC_METHODS.find((r) => r.method === 'wallet_connect');
    const wagmiConnect = WAGMI_METHODS.find((r) => r.method === 'wallet_connect');
    expect(coreConnect && opensDialog(coreConnect)).toBe(true);
    expect(wagmiConnect && opensDialog(wagmiConnect)).toBe(true);
    expect(opensDialog(m({ method: 'eth_chainId' }))).toBe(false);
  });
});

describe('filterMethods', () => {
  const methods = [
    m({ id: 'a', name: 'eth_requestAccounts', method: 'eth_requestAccounts', category: 'account' }),
    m({ id: 'b', name: 'eth_chainId', method: 'eth_chainId', category: 'chain' }),
    m({ id: 'c', name: 'personal_sign', method: 'personal_sign', category: 'signing' }),
  ];

  it('matches name and category, case-insensitively', () => {
    expect(filterMethods(methods, 'CHAIN', 'all').map((x) => x.id)).toEqual(['b']);
    expect(filterMethods(methods, 'sign', 'all').map((x) => x.id)).toEqual(['c']);
  });

  it('applies the dialog/silent trigger filter', () => {
    expect(filterMethods(methods, '', 'dialog').map((x) => x.id)).toEqual(['a', 'c']);
    expect(filterMethods(methods, '', 'silent').map((x) => x.id)).toEqual(['b']);
  });

  it('combines query and trigger', () => {
    expect(filterMethods(methods, 'eth', 'dialog').map((x) => x.id)).toEqual(['a']);
  });
});

describe('groupMethods', () => {
  it('groups in canonical category order and drops empty groups', () => {
    const groups = groupMethods(RPC_METHODS);
    expect(groups[0]?.category).toBe('account');
    expect(groups.every((g) => g.items.length > 0)).toBe(true);
    expect(groups.flatMap((g) => g.items)).toHaveLength(RPC_METHODS.length);
  });
});

describe('methodNeedsAttention', () => {
  it('flags connection-gated methods while disconnected', () => {
    const gated = m({ method: 'personal_sign', requiresConnection: true });
    expect(methodNeedsAttention(gated, false)).toBe(true);
    expect(methodNeedsAttention(gated, true)).toBe(false);
  });

  it('flags connect-style methods while already connected', () => {
    const connect = m({ method: 'wallet_connect' });
    expect(methodNeedsAttention(connect, true)).toBe(true);
    expect(methodNeedsAttention(connect, false)).toBe(false);
  });
});

describe('splitMethodName', () => {
  it('splits on the first underscore', () => {
    expect(splitMethodName('wallet_sendCalls')).toEqual({ prefix: 'wallet_', rest: 'sendCalls' });
    expect(splitMethodName('encodeFunctionData')).toEqual({ prefix: '', rest: 'encodeFunctionData' });
  });
});
