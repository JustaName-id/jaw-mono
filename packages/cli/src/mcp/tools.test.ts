import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { payAndFetchSchema, rpcMethodSchema } from './tools.js';

describe('payAndFetch url schema', () => {
  const url = z.object(payAndFetchSchema).shape.url;

  it('accepts http and https', () => {
    expect(url.safeParse('https://api.example.com/x').success).toBe(true);
    expect(url.safeParse('http://localhost:8080/x').success).toBe(true);
  });

  it('rejects non-fetch schemes that would otherwise reach fetch()', () => {
    for (const bad of [
      'file:///etc/passwd',
      'data:text/plain,hello',
      'javascript:alert(1)',
      'ftp://x.com',
      'not a url',
      '',
    ]) {
      expect(url.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe('rpc chainId schema', () => {
  const chainId = z.object(rpcMethodSchema).shape.chainId;

  it('accepts positive integers', () => {
    expect(chainId.safeParse(1).success).toBe(true);
    expect(chainId.safeParse(8453).success).toBe(true);
  });

  it('rejects NaN, Infinity, floats, zero, and negatives', () => {
    for (const bad of [NaN, Infinity, -Infinity, 8453.5, 0, -1]) {
      expect(chainId.safeParse(bad).success, String(bad)).toBe(false);
    }
  });
});
