// Provider-agnostic onramp domain types.
//
// These describe a fiat→crypto onramp in terms every provider can satisfy.
// Provider-specific fields stay inside each provider's own module; callers
// (API routes, UI) depend only on the shapes here, so swapping or adding a
// provider never touches them.

export type Address = `0x${string}`;

/** Normalized order status across providers. */
export type OnrampOrderStatus = 'pending' | 'processing' | 'completed' | 'failed';

/** Input the UI/route supplies to create an order. */
export interface CreateOrderInput {
  /** Delivery target — the user's smart-account address. */
  destinationAddress: Address;
  /** Fiat amount as a decimal string in `fiatCurrency` (e.g. "10"). */
  fiatAmount: string;
  /** ISO-4217 fiat code, e.g. "USD". */
  fiatCurrency: string;
  /** Asset to purchase, e.g. "USDC". */
  asset: string;
  /** Normalized delivery network id, e.g. "base". */
  network: string;
  /** Contact fields some providers require (e.g. Coinbase guest checkout). */
  email?: string;
  /** E.164 phone, e.g. "+12025550123". */
  phoneNumber?: string;
  /** Provider-specific payment method hint, passed through untyped. */
  paymentMethod?: string;
}

/** A normalized order, plus the provider-native status for debugging. */
export interface OnrampOrder {
  provider: string;
  orderId: string;
  status: OnrampOrderStatus;
  /** The provider's own status string before normalization. */
  rawStatus: string;
  fiatTotal?: string;
  fiatCurrency?: string;
  purchaseAmount?: string;
  asset?: string;
  network?: string;
  destinationAddress?: string;
  txHash?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** An embeddable payment surface (rendered in an iframe / webview). */
export interface OnrampPaymentLink {
  /** URL to embed; renders the provider's pay button. */
  url: string;
  /** Optional provider hint about how to present it. */
  kind?: string;
}

export interface CreateOrderResult {
  order: OnrampOrder;
  paymentLink: OnrampPaymentLink;
  /** True when created against the provider's sandbox/test environment. */
  sandbox: boolean;
}

/** Remaining purchase capacity for a user (provider-defined buckets). */
export interface OnrampLimit {
  type: string;
  currency?: string;
  limit: string;
  remaining: string;
}

/** A normalized inbound webhook event. */
export interface OnrampWebhookEvent {
  provider: string;
  eventType: string;
  status?: OnrampOrderStatus;
  orderId?: string;
  txHash?: string;
  receivedAt: string;
  raw: unknown;
}

/**
 * A pluggable, server-side fiat→crypto onramp provider.
 *
 * Required: `createOrder` + `getOrder`. Capabilities a provider doesn't offer
 * are left undefined and callers feature-detect (e.g. `provider.getLimits?.(…)`).
 */
export interface OnrampProvider {
  /** Stable identifier used in routes/config, e.g. "coinbase". */
  readonly id: string;
  /** Human-readable label for UI. */
  readonly label: string;
  /** Normalized network ids this provider can deliver to. */
  readonly supportedNetworks: readonly string[];

  /** Create an order and return an embeddable payment link. */
  createOrder(input: CreateOrderInput): Promise<CreateOrderResult>;
  /** Fetch the latest normalized status of an order. */
  getOrder(orderId: string): Promise<OnrampOrder>;

  /** Optional: remaining purchase capacity for a user. */
  getLimits?(input: { phoneNumber?: string }): Promise<OnrampLimit[]>;
  /** Optional: parse + normalize an inbound webhook payload. */
  parseWebhook?(payload: unknown, headers: Record<string, string>): OnrampWebhookEvent;
}
