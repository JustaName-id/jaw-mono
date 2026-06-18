import { describe, expect, it } from 'vitest';
import { sanitizeDisplayName } from './sanitize';

describe('sanitizeDisplayName', () => {
  it('passes a normal app name through unchanged', () => {
    expect(sanitizeDisplayName('app.uniswap.org')).toBe('app.uniswap.org');
  });

  it('strips bidi-override characters', () => {
    expect(sanitizeDisplayName('safe\u202Eevil.com')).toBe('safeevil.com');
  });

  it('strips zero-width characters and BOM', () => {
    expect(sanitizeDisplayName('uni\u200Bswap\uFEFF.org')).toBe('uniswap.org');
  });

  it('strips control characters (including tabs)', () => {
    expect(sanitizeDisplayName('my\u0000app\tname')).toBe('myappname');
  });

  it('collapses runs of regular whitespace and trims', () => {
    expect(sanitizeDisplayName('  my   app   name  ')).toBe('my app name');
  });

  it('caps length and appends an ellipsis', () => {
    const result = sanitizeDisplayName('a'.repeat(100));
    expect(result).toBe('a'.repeat(64) + '\u2026');
    expect([...result].length).toBe(65);
  });

  it('respects a custom max length', () => {
    expect(sanitizeDisplayName('abcdefghij', 4)).toBe('abcd\u2026');
  });

  it('returns empty when nothing legible remains (caller falls back)', () => {
    expect(sanitizeDisplayName('\u200B\u202E\uFEFF')).toBe('');
  });
});
