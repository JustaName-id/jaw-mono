// Coinbase implementation of the provider-agnostic OnrampProvider interface.
// Constructed by the registry (registry.ts) — no self-registration.

import type {
  CreateOrderInput,
  CreateOrderResult,
  OnrampLimit,
  OnrampOrder,
  OnrampOrderStatus,
  OnrampProvider,
} from '../../types';
import { cdpGet, cdpPost } from './client';
import {
  COINBASE_SUPPORTED_NETWORKS,
  ONRAMP_DEFAULT_ASSET,
  ONRAMP_DEFAULT_FIAT_CURRENCY,
  ONRAMP_DEFAULT_NETWORK,
  PAYMENT_METHODS,
  isCoinbaseSandbox,
  type CoinbasePaymentMethod,
} from './config';
import type {
  CdpCreateOrderRequest,
  CdpCreateOrderResponse,
  CdpGetOrderResponse,
  CdpOnrampOrder,
  CdpOnrampOrderStatus,
  CdpUserLimit,
} from './types';
import { sandboxVerifier, type ContactVerifier } from './verifier';

const STATUS_MAP: Record<CdpOnrampOrderStatus, OnrampOrderStatus> = {
  ONRAMP_ORDER_STATUS_PENDING_AUTH: 'pending',
  ONRAMP_ORDER_STATUS_PENDING_PAYMENT: 'pending',
  ONRAMP_ORDER_STATUS_PROCESSING: 'processing',
  ONRAMP_ORDER_STATUS_COMPLETED: 'completed',
  ONRAMP_ORDER_STATUS_FAILED: 'failed',
};

// Exported for unit testing; pure.
export function normalizeOrder(o: CdpOnrampOrder): OnrampOrder {
  return {
    provider: 'coinbase',
    orderId: o.orderId,
    status: STATUS_MAP[o.status] ?? 'pending',
    rawStatus: o.status,
    fiatTotal: o.paymentTotal,
    fiatCurrency: o.paymentCurrency,
    purchaseAmount: o.purchaseAmount,
    asset: o.purchaseCurrency,
    network: o.destinationNetwork,
    destinationAddress: o.destinationAddress,
    txHash: o.txHash,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

// Append the sandbox query param that makes the payment link embeddable on
// localhost and swaps the real pay sheet for a fake popup.
export function withSandboxParam(url: string, method: CoinbasePaymentMethod): string {
  const param = method === PAYMENT_METHODS.GOOGLE_PAY ? 'useGooglePaySandbox=true' : 'useApplePaySandbox=true';
  return url.includes('?') ? `${url}&${param}` : `${url}?${param}`;
}

export class CoinbaseOnrampProvider implements OnrampProvider {
  readonly id = 'coinbase';
  readonly label = 'Coinbase';
  readonly supportedNetworks = COINBASE_SUPPORTED_NETWORKS;

  constructor(private readonly verifier: ContactVerifier = sandboxVerifier) {}

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    if (!input.email || !input.phoneNumber) {
      throw new Error('Coinbase guest checkout requires an email and phone number');
    }

    const sandbox = isCoinbaseSandbox();
    const paymentMethod = (input.paymentMethod as CoinbasePaymentMethod) ?? PAYMENT_METHODS.APPLE_PAY;

    const { agreementAcceptedAt, phoneNumberVerifiedAt } = await this.verifier.verify({
      email: input.email,
      phoneNumber: input.phoneNumber,
      agreementAccepted: true,
    });

    // Stable per-user reference so transactions group later; sandbox orders MUST
    // be prefixed with "sandbox-".
    const ref = input.destinationAddress.toLowerCase();
    const partnerUserRef = sandbox ? `sandbox-${ref}` : ref;

    const body: CdpCreateOrderRequest = {
      paymentCurrency: input.fiatCurrency || ONRAMP_DEFAULT_FIAT_CURRENCY,
      paymentAmount: input.fiatAmount,
      purchaseCurrency: input.asset || ONRAMP_DEFAULT_ASSET,
      paymentMethod,
      destinationAddress: input.destinationAddress,
      destinationNetwork: input.network || ONRAMP_DEFAULT_NETWORK,
      email: input.email,
      phoneNumber: input.phoneNumber,
      agreementAcceptedAt,
      phoneNumberVerifiedAt,
      partnerUserRef,
      ...(process.env.COINBASE_APP_DOMAIN ? { domain: process.env.COINBASE_APP_DOMAIN } : {}),
    };

    const res = await cdpPost<CdpCreateOrderResponse>('/v2/onramp/orders', body);
    const rawUrl = res.paymentLink?.url;
    if (!rawUrl) {
      throw new Error('CDP did not return a payment link for this order (is headless onramp enabled for this app?)');
    }

    return {
      order: normalizeOrder(res.order),
      paymentLink: {
        url: sandbox ? withSandboxParam(rawUrl, paymentMethod) : rawUrl,
        kind: res.paymentLink?.paymentLinkType,
      },
      sandbox,
    };
  }

  async getOrder(orderId: string): Promise<OnrampOrder> {
    const res = await cdpGet<CdpGetOrderResponse>(`/v2/onramp/orders/${orderId}`);
    return normalizeOrder(res.order);
  }

  async getLimits(input: { phoneNumber?: string }): Promise<OnrampLimit[]> {
    if (!input.phoneNumber) return [];
    const res = await cdpPost<{ limits: CdpUserLimit[] }>('/v2/onramp/limits', {
      paymentMethodType: PAYMENT_METHODS.APPLE_PAY,
      userId: input.phoneNumber,
      userIdType: 'phone_number',
    });
    return (res.limits ?? []).map((l) => ({
      type: l.limitType,
      currency: l.currency,
      limit: l.limit,
      remaining: l.remaining,
    }));
  }
}
