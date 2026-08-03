import type { OnrampOrder, OnrampEmbeddable, OnrampPaymentMethod } from '@jaw.id/core';

/** Body for POST /proxy/v2/onramp/start. */
export interface StartOnrampRequest {
  phoneNumber: string;
  email: string;
  fiatAmount: string;
  destinationAddress: string;
  fiatCurrency?: string;
  cryptoCurrency?: string;
  network?: string;
  paymentMethodHint?: OnrampPaymentMethod;
}

export interface StartOnrampResponse {
  sessionId: string;
  expiresAt: string;
  otpRequired: boolean;
  otpChannel?: string;
}

/** Body for POST /proxy/v2/onramp/validate-otp. */
export interface ValidateOtpRequest {
  sessionId: string;
  code?: string;
  clientIp?: string;
}

export interface ValidateOtpResponse {
  order: OnrampOrder;
  embeddable: OnrampEmbeddable;
}
