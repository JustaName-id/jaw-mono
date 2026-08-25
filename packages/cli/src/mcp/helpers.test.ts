import { describe, it, expect } from 'vitest';
import { mcpDiscoverResult, mcpPaymentResult } from './helpers.js';

const ESC = '\u001b';
const RTL_OVERRIDE = '\u202e';
const ZERO_WIDTH = '\u200b';
const REPLACEMENT = '\uFFFD';

/**
 * The fetched body and the refusal text are written by the paid server. The
 * CLI's own renderer runs them through `sanitizeBlock` before printing, and the
 * MCP twin has to do the same: the host draws these blocks somewhere, and a
 * text/plain body reaches them as the string it is. Where `JSON.stringify` runs
 * it escapes U+0000 to U+001F and nothing else, so it never covers the bidi
 * overrides or the zero-width family on its own.
 */
describe('mcpPaymentResult sanitization', () => {
  const blocksOf = (result: { content: { text: string }[] }) => result.content.map((b) => b.text);

  it('strips escape sequences from a string body', () => {
    const [meta, body] = blocksOf(mcpPaymentResult({ paid: true, body: `ok${ESC}[2K${ESC}[1GPaid. 5 USDC` }));
    expect(JSON.parse(meta).paid).toBe(true);
    expect(body).not.toContain(ESC);
    expect(body).toContain(REPLACEMENT);
    expect(body).toContain('Paid. 5 USDC');
  });

  it('strips the bidi overrides and zero-width characters JSON.stringify leaves alone', () => {
    const raw = { note: `send to 0xgood${RTL_OVERRIDE}${ZERO_WIDTH}` };
    // What the JSON path shipped before: stringify passes both through.
    expect(JSON.stringify(raw)).toContain(RTL_OVERRIDE);
    const [, body] = blocksOf(mcpPaymentResult({ paid: true, body: raw }));
    expect(body).not.toContain(RTL_OVERRIDE);
    expect(body).not.toContain(ZERO_WIDTH);
  });

  it('keeps the newlines a body is entitled to', () => {
    const [, body] = blocksOf(mcpPaymentResult({ paid: true, body: 'line one\nline two' }));
    expect(body).toContain('line one\nline two');
  });

  it('strips escape sequences from the refusal text', () => {
    const [, reason] = blocksOf(mcpPaymentResult({ paid: false, refusedReason: `over cap${ESC}[1Aall good` }));
    expect(reason.startsWith('[UNTRUSTED SERVER MESSAGE')).toBe(true);
    expect(reason).not.toContain(ESC);
    expect(reason).toContain(REPLACEMENT);
  });
});

/**
 * The catalog is seller-written copy that `discover.ts` only type-checks, and it
 * ships JSON-encoded, so the escape sequences are already covered. What is left
 * is the half `JSON.stringify` does not touch.
 */
describe('mcpDiscoverResult sanitization', () => {
  it('strips the bidi override a seller put in a service name, and stays parseable', () => {
    const services = [{ name: `Weather API${RTL_OVERRIDE}`, url: 'https://api.example.com/w' }];
    const [, catalog] = mcpDiscoverResult({ count: 1, services }).content.map((b) => b.text);

    expect(catalog).not.toContain(RTL_OVERRIDE);
    expect(catalog).toContain(REPLACEMENT);
    const json = catalog.slice(catalog.indexOf('\n') + 1);
    expect(JSON.parse(json)[0].url).toBe('https://api.example.com/w');
  });

  it('leaves the trusted counters in their own block', () => {
    const [meta] = mcpDiscoverResult({ count: 2, services: [] }).content.map((b) => b.text);
    expect(JSON.parse(meta)).toEqual({ count: 2 });
  });
});
