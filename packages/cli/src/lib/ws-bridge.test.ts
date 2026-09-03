import { describe, it, expect } from 'vitest';

import { buildInitPayload } from './ws-bridge.js';

// The init envelope is the only thing the CLI tells the browser about the
// paymaster, and it used to carry the url alone. A configured
// `paymasters[chainId].context` — a Pimlico `sponsorshipPolicyId`, say — was
// dropped here, so a userOp signed through the browser went out unsponsored
// while the same config sponsored fine in session mode.
describe('buildInitPayload', () => {
  const BASE = { apiKey: 'key-123', chainId: 8453 };

  it('carries a configured context alongside the url it belongs to', () => {
    const payload = buildInitPayload({
      ...BASE,
      paymasterUrl: 'https://api.pimlico.io/v2/8453/rpc?apikey=x',
      paymasterContext: { sponsorshipPolicyId: 'sp_my_policy' },
    });

    expect(payload).toMatchObject({
      type: 'init',
      apiKey: 'key-123',
      chainId: 8453,
      paymasterUrl: 'https://api.pimlico.io/v2/8453/rpc?apikey=x',
      paymasterContext: { sponsorshipPolicyId: 'sp_my_policy' },
    });
  });

  it('omits the context when there is no url to pair it with', () => {
    // The browser resolves a paymaster of its own when none arrives. A context
    // sent alone would be applied to whichever one that turns out to be.
    const payload = buildInitPayload({ ...BASE, paymasterContext: { sponsorshipPolicyId: 'sp_my_policy' } });

    expect(payload).not.toHaveProperty('paymasterContext');
    expect(payload.paymasterUrl).toBeUndefined();
  });

  it('sends a url with no context unchanged', () => {
    const payload = buildInitPayload({ ...BASE, paymasterUrl: 'https://configured.example/rpc' });

    expect(payload.paymasterUrl).toBe('https://configured.example/rpc');
    expect(payload).not.toHaveProperty('paymasterContext');
  });
});
