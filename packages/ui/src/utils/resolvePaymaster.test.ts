import { describe, it, expect } from 'vitest';

import { resolvePaymaster } from './resolvePaymaster';

const CONFIGURED = { url: 'https://erc20.example/rpc', context: { token: '0xUSDC' } };

describe('resolvePaymaster', () => {
  it('falls back to the configured pair when the request names no paymaster', () => {
    expect(resolvePaymaster(undefined, CONFIGURED)).toEqual(CONFIGURED);
  });

  it('takes both halves from the request when it names one', () => {
    expect(resolvePaymaster({ url: 'https://sponsor.example/rpc', context: { policy: 'sp_1' } }, CONFIGURED)).toEqual({
      url: 'https://sponsor.example/rpc',
      context: { policy: 'sp_1' },
    });
  });

  it('does not hand the configured context to a paymaster the request named', () => {
    // The token context belongs to the ERC-20 paymaster it was written for.
    expect(resolvePaymaster({ url: 'https://sponsor.example/rpc' }, CONFIGURED)).toEqual({
      url: 'https://sponsor.example/rpc',
      context: undefined,
    });
  });
});
