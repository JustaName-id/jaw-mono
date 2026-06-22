// ContactVerifier — the seam for email/phone verification.
//
// Production guest checkout requires the partner to verify the user's phone via
// OTP and pass the timestamps below (phone re-verified every 60 days). For now
// we run in CDP sandbox, where the `sandbox-` partnerUserRef bypasses real
// verification, so `sandboxVerifier` just stamps the timestamps.
//
// A real verifier (e.g. Twilio Verify + Lookup line-type screen) drops in here
// later WITHOUT touching the provider or routes — see spec §8.1.

export interface VerifiedContact {
  /** ISO-8601 — when the user accepted Coinbase's Guest Checkout terms. */
  agreementAcceptedAt: string;
  /** ISO-8601 — when the user's phone was verified via OTP. */
  phoneNumberVerifiedAt: string;
}

export interface VerifyInput {
  email: string;
  phoneNumber: string;
  /** The user must have accepted the Guest Checkout terms in the UI. */
  agreementAccepted: boolean;
}

export interface ContactVerifier {
  verify(input: VerifyInput): Promise<VerifiedContact>;
}

/**
 * Sandbox verifier: no real OTP. Stamps the timestamps CDP requires; the
 * `sandbox-` order prefix makes them sufficient. Still enforces that the user
 * accepted the terms, since that part is real in every environment.
 */
export const sandboxVerifier: ContactVerifier = {
  async verify({ agreementAccepted }: VerifyInput): Promise<VerifiedContact> {
    if (!agreementAccepted) {
      throw new Error('User must accept the Coinbase Guest Checkout terms before continuing');
    }
    const now = new Date().toISOString();
    return { agreementAcceptedAt: now, phoneNumberVerifiedAt: now };
  },
};
