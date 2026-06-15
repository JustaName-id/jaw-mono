import { describe, expect, it } from 'vitest';
import { isSafeImageUrl } from './safeUrl';

describe('isSafeImageUrl', () => {
  it('accepts https URLs', () => {
    expect(isSafeImageUrl('https://example.com/logo.png')).toBe(true);
    expect(isSafeImageUrl('  https://example.com/logo.png  ')).toBe(true);
    expect(isSafeImageUrl('HTTPS://example.com/logo.png')).toBe(true);
  });

  it('accepts data:image URIs', () => {
    expect(isSafeImageUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isSafeImageUrl('data:image/svg+xml,<svg></svg>')).toBe(true);
  });

  it('rejects http and other beacon-capable schemes', () => {
    expect(isSafeImageUrl('http://attacker.example/beacon.gif')).toBe(false);
    expect(isSafeImageUrl('//attacker.example/beacon.gif')).toBe(false);
    expect(isSafeImageUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeImageUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('rejects empty and malformed values', () => {
    expect(isSafeImageUrl(undefined)).toBe(false);
    expect(isSafeImageUrl(null)).toBe(false);
    expect(isSafeImageUrl('')).toBe(false);
    expect(isSafeImageUrl('not a url')).toBe(false);
  });
});
