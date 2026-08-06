import { describe, it, expect } from 'vitest';
import { renderEntry, renderSummary, hostOf, decimalsOf } from './log-view.js';
import type { X402LogEntry } from './ledger.js';

const entry = (o: Partial<X402LogEntry> = {}): X402LogEntry => ({
  at: '2026-08-04T04:07:52.900Z',
  url: 'https://api.justaname.id/ens/v2/resolve?ens=vitalik.eth',
  payer: '0x9fD37D2cF1b32b3f7dBae480bbd44BE3De2A9e0F',
  status: 'paid',
  amount: '1000',
  network: 'eip155:8453',
  ...o,
});

describe('renderEntry', () => {
  it('leads with time, outcome, amount and host', () => {
    const line = renderEntry(entry());
    expect(line).toContain('2026-08-04 04:07:52');
    expect(line).toContain('paid');
    expect(line).toContain('0.001 USDC');
    expect(line).toContain('api.justaname.id');
    // The query string carries the caller's data and would drown the line.
    expect(line).not.toContain('vitalik.eth');
  });

  it('shows the transaction when there is one', () => {
    expect(renderEntry(entry({ txHash: '0xabc' }))).toContain('0xabc');
  });

  // A failed settlement may still have been broadcast; the nonce is the only way
  // to reconcile it on chain, so it must appear exactly where it is ambiguous.
  it('surfaces the nonce on a failed attempt', () => {
    expect(renderEntry(entry({ status: 'failed', nonce: '0xdeadbeef' }))).toContain('nonce 0xdeadbeef');
  });

  it('does not clutter a settled payment with the nonce', () => {
    expect(renderEntry(entry({ nonce: '0xdeadbeef' }))).not.toContain('nonce');
  });

  it('shows a top-up, since that moved user funds', () => {
    expect(renderEntry(entry({ topUpAmount: '500000' }))).toContain('topped up 0.5 USDC');
  });

  it('keeps the top-up visible on an attempt that then failed', () => {
    const line = renderEntry(entry({ status: 'failed', topUpAmount: '500000', reason: 'settlement failed' }));
    expect(line).toContain('topped up 0.5 USDC');
    expect(line).toContain('settlement failed');
  });

  it('renders a refusal with its reason and no amount', () => {
    const line = renderEntry(entry({ status: 'refused', amount: undefined, reason: 'over cap' }));
    expect(line).toContain('refused');
    expect(line).toContain('over cap');
    expect(line).not.toContain('USDC');
  });
});

describe('renderSummary', () => {
  // Same rule the spend caps use: a refusal never signed anything.
  it('counts paid and failed as money out, never refused', () => {
    const summary = renderSummary([
      entry({ amount: '1000' }),
      entry({ status: 'failed', amount: '1000' }),
      entry({ status: 'refused', amount: '9999999' }),
    ]);
    expect(summary).toContain('0.002 USDC out');
    expect(summary).toContain('1 paid');
    expect(summary).toContain('1 failed');
    expect(summary).toContain('1 refused');
  });

  it('mentions only the outcomes that occurred', () => {
    const summary = renderSummary([entry(), entry()]);
    expect(summary).toContain('2 paid');
    expect(summary).not.toContain('failed');
    expect(summary).not.toContain('refused');
  });

  it('survives a hand-edited amount instead of breaking the whole summary', () => {
    expect(renderSummary([entry({ amount: 'oops' }), entry({ amount: '1000' })])).toContain('0.001 USDC out');
  });

  it('reports zero out when everything was refused', () => {
    expect(renderSummary([entry({ status: 'refused', amount: undefined })])).toContain('0 USDC out');
  });
});

describe('decimalsOf', () => {
  it('reads the decimals of the entry own network', () => {
    expect(decimalsOf(entry({ network: 'eip155:8453' }))).toBe(6);
  });

  it('falls back for an unknown or absent network rather than throwing', () => {
    expect(decimalsOf(entry({ network: 'eip155:999999' }))).toBe(6);
    expect(decimalsOf(entry({ network: undefined }))).toBe(6);
  });
});

describe('hostOf', () => {
  it('reduces a url to its host', () => {
    expect(hostOf('https://api.example.com/a/b?c=d')).toBe('api.example.com');
    expect(hostOf('http://localhost:8402/paid')).toBe('localhost:8402');
  });

  it('returns a malformed url unchanged instead of throwing', () => {
    expect(hostOf('not a url')).toBe('not a url');
  });
});
