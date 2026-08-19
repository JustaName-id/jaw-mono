// The origin line is the only place a user can see who is asking them to sign, so the
// `www.` strip must not be able to rewrite the middle of a host. Unanchored, it turned
// the attacker-registrable `bawww.nk.com` into `bank.com`.
import { describe, expect, it } from 'vitest';
import { formatOrigin } from './index';

describe('formatOrigin', () => {
  it('strips a leading www.', () => {
    expect(formatOrigin('https://www.bank.com')).toBe('bank.com');
    expect(formatOrigin('www.bank.com')).toBe('bank.com');
  });

  it('leaves a host without a www. prefix untouched', () => {
    expect(formatOrigin('https://bank.com')).toBe('bank.com');
    expect(formatOrigin('https://app.example.com')).toBe('app.example.com');
  });

  // Each of these previously rendered as a different, more trustworthy host.
  it.each([
    ['https://bawww.nk.com', 'bawww.nk.com'],
    ['https://evil-www.bank.com', 'evil-www.bank.com'],
    ['https://a.www.b.com', 'a.www.b.com'],
    ['https://myswww.site.com', 'myswww.site.com'],
    ['https://wwww.bank.com', 'wwww.bank.com'],
  ])('does not rewrite www. inside the host: %s', (origin, expected) => {
    expect(formatOrigin(origin)).toBe(expected);
  });

  it('keeps the port, which distinguishes local dev origins', () => {
    expect(formatOrigin('https://localhost:3000')).toBe('localhost');
    expect(formatOrigin('http://127.0.0.1:8080')).toBe('127.0.0.1');
  });

  it('returns the input unchanged when it cannot be parsed', () => {
    expect(formatOrigin('')).toBe('');
    expect(formatOrigin('not a url')).toBe('not a url');
  });
});
