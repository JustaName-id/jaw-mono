import { describe, expect, it } from 'vitest';
import { hasIconFailed, markIconFailed, tokenIconUrl } from './tokenIcon';

describe('tokenIconUrl', () => {
  it('builds the endpoint URL with a lowercased address', () => {
    expect(tokenIconUrl(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')).toBe(
      'https://api.justaname.id/proxy/v2/tokens/1/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48/icon'
    );
  });

  it('maps the zero-address native sentinel to the 0xeeee… pseudo-address', () => {
    expect(tokenIconUrl(8453, '0x0000000000000000000000000000000000000000')).toBe(
      'https://api.justaname.id/proxy/v2/tokens/8453/0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee/icon'
    );
  });

  it('passes the 0xeeee… pseudo-address through (lowercased)', () => {
    expect(tokenIconUrl(1, '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE')).toBe(
      'https://api.justaname.id/proxy/v2/tokens/1/0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee/icon'
    );
  });
});

describe('failed-icon registry', () => {
  it('remembers URLs marked as failed', () => {
    const url = tokenIconUrl(1, '0x1111111111111111111111111111111111111111');
    expect(hasIconFailed(url)).toBe(false);
    markIconFailed(url);
    expect(hasIconFailed(url)).toBe(true);
  });
});
