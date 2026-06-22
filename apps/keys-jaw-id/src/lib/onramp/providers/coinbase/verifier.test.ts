import { describe, it, expect } from 'vitest';
import { sandboxVerifier } from './verifier';

describe('sandboxVerifier', () => {
  it('stamps valid agreement + phone-verified timestamps when terms accepted', async () => {
    const r = await sandboxVerifier.verify({
      email: 'a@b.com',
      phoneNumber: '+12025550123',
      agreementAccepted: true,
    });
    expect(Number.isNaN(Date.parse(r.agreementAcceptedAt))).toBe(false);
    expect(Number.isNaN(Date.parse(r.phoneNumberVerifiedAt))).toBe(false);
  });

  it('throws when the user has not accepted the terms', async () => {
    await expect(
      sandboxVerifier.verify({ email: 'a@b.com', phoneNumber: '+12025550123', agreementAccepted: false })
    ).rejects.toThrow(/terms/i);
  });
});
