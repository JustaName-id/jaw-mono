// Provider-agnostic onramp domain types, mirroring the jan-back-mono proxy's
// normalized shapes (apps/proxy/src/core/applications/onramp/domain.ts).
// Kept in core so @jaw.id/ui and @jaw.id/wagmi share one source of truth.

export type OnrampStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'EXPIRED';
export type OnrampPaymentMethod = 'APPLE_PAY' | 'GOOGLE_PAY';
export type OnrampEmbedType = 'IFRAME_URL' | 'REDIRECT_URL' | 'WIDGET';

export interface OnrampFee {
    type: string;
    amount: string;
    currency: string;
}

export interface OnrampOrder {
    provider: string;
    providerOrderId: string;
    status: OnrampStatus;
    rawStatus: string;
    fiatAmount: string;
    fiatCurrency: string;
    cryptoAmount?: string;
    cryptoCurrency: string;
    network: string;
    destinationAddress: string;
    fees?: OnrampFee[];
    exchangeRate?: string;
    txHash?: string;
    createdAt: string;
    updatedAt: string;
}

export interface OnrampEmbeddable {
    type: OnrampEmbedType;
    url: string;
}

export interface OnrampTokenNetwork {
    network: string;
    displayName: string;
    chainId?: string;
    contractAddress?: string;
}

export interface OnrampToken {
    symbol: string;
    name: string;
    networks: OnrampTokenNetwork[];
}

export interface OnrampFiatLimit {
    paymentMethod: OnrampPaymentMethod;
    min: string;
    max: string;
}

export interface OnrampFiatCurrency {
    currency: string;
    limits: OnrampFiatLimit[];
}

/**
 * GET /options — what the onramp currently offers: the operator allowlist
 * intersected with the provider catalogue (tokens/networks), and fiat
 * currencies with per-payment-method limits already clamped into the bounds
 * the order path enforces.
 */
export interface OnrampOptions {
    tokens: OnrampToken[];
    fiatCurrencies: OnrampFiatCurrency[];
}

/**
 * dApp-supplied params for wallet_onramp (all optional; the destination is the
 * connected account, injected by the wallet — never passed by the dApp).
 */
export interface OnrampParams {
    fiatAmount?: string;
    fiatCurrency?: string;
    cryptoCurrency?: string;
    network?: string;
    paymentMethodHint?: OnrampPaymentMethod;
}
