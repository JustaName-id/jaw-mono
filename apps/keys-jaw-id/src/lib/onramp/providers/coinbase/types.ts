// CDP Onramp v2 request/response shapes — only the fields we use are modelled.

import type { CoinbasePaymentMethod } from './config';

export type CdpOnrampOrderStatus =
  | 'ONRAMP_ORDER_STATUS_PENDING_AUTH'
  | 'ONRAMP_ORDER_STATUS_PENDING_PAYMENT'
  | 'ONRAMP_ORDER_STATUS_PROCESSING'
  | 'ONRAMP_ORDER_STATUS_COMPLETED'
  | 'ONRAMP_ORDER_STATUS_FAILED';

export interface CdpOnrampOrderFee {
  type: string;
  amount: string;
  currency: string;
}

export interface CdpOnrampOrder {
  orderId: string;
  paymentTotal: string;
  paymentSubtotal: string;
  paymentCurrency: string;
  paymentMethod: CoinbasePaymentMethod;
  purchaseAmount: string;
  purchaseCurrency: string;
  fees?: CdpOnrampOrderFee[];
  exchangeRate?: string;
  destinationAddress: string;
  destinationNetwork: string;
  status: CdpOnrampOrderStatus;
  txHash?: string;
  createdAt: string;
  updatedAt: string;
  partnerUserRef?: string;
}

export interface CdpPaymentLink {
  url: string;
  paymentLinkType?: string;
}

export interface CdpCreateOrderResponse {
  order: CdpOnrampOrder;
  paymentLink?: CdpPaymentLink;
}

export interface CdpGetOrderResponse {
  order: CdpOnrampOrder;
}

export interface CdpUserLimit {
  limitType: string;
  currency?: string;
  limit: string;
  remaining: string;
}

/** Body sent to POST /v2/onramp/orders. */
export interface CdpCreateOrderRequest {
  paymentCurrency: string;
  paymentAmount: string;
  purchaseCurrency: string;
  paymentMethod: CoinbasePaymentMethod;
  destinationAddress: string;
  destinationNetwork: string;
  email: string;
  phoneNumber: string;
  agreementAcceptedAt: string;
  phoneNumberVerifiedAt: string;
  partnerUserRef: string;
  domain?: string;
}
