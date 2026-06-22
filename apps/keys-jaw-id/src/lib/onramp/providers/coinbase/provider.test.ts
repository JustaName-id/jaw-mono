import { describe, it, expect } from 'vitest';
import { normalizeOrder, withSandboxParam } from './index';
import { PAYMENT_METHODS } from './config';
import type { CdpOnrampOrder } from './types';

const baseOrder: CdpOnrampOrder = {
  orderId: 'ord_1',
  paymentTotal: '10.50',
  paymentSubtotal: '10.00',
  paymentCurrency: 'USD',
  paymentMethod: PAYMENT_METHODS.APPLE_PAY,
  purchaseAmount: '10.00',
  purchaseCurrency: 'USDC',
  destinationAddress: '0xabc',
  destinationNetwork: 'base',
  status: 'ONRAMP_ORDER_STATUS_PROCESSING',
  createdAt: '2026-06-22T00:00:00Z',
  updatedAt: '2026-06-22T00:00:01Z',
};

describe('normalizeOrder', () => {
  it('normalizes CDP status to the provider-agnostic status and keeps the raw one', () => {
    const n = normalizeOrder(baseOrder);
    expect(n.provider).toBe('coinbase');
    expect(n.status).toBe('processing');
    expect(n.rawStatus).toBe('ONRAMP_ORDER_STATUS_PROCESSING');
    expect(n.asset).toBe('USDC');
    expect(n.network).toBe('base');
    expect(n.fiatTotal).toBe('10.50');
  });

  it('maps both pending statuses to "pending" and completed/failed through', () => {
    expect(normalizeOrder({ ...baseOrder, status: 'ONRAMP_ORDER_STATUS_PENDING_AUTH' }).status).toBe('pending');
    expect(normalizeOrder({ ...baseOrder, status: 'ONRAMP_ORDER_STATUS_PENDING_PAYMENT' }).status).toBe('pending');
    expect(normalizeOrder({ ...baseOrder, status: 'ONRAMP_ORDER_STATUS_COMPLETED' }).status).toBe('completed');
    expect(normalizeOrder({ ...baseOrder, status: 'ONRAMP_ORDER_STATUS_FAILED' }).status).toBe('failed');
  });
});

describe('withSandboxParam', () => {
  it('appends the Apple Pay sandbox flag, respecting existing query strings', () => {
    expect(withSandboxParam('https://pay.coinbase.com/x', PAYMENT_METHODS.APPLE_PAY)).toBe(
      'https://pay.coinbase.com/x?useApplePaySandbox=true'
    );
    expect(withSandboxParam('https://pay.coinbase.com/x?a=1', PAYMENT_METHODS.APPLE_PAY)).toBe(
      'https://pay.coinbase.com/x?a=1&useApplePaySandbox=true'
    );
  });

  it('appends the Google Pay sandbox flag for Google Pay', () => {
    expect(withSandboxParam('https://pay.coinbase.com/x', PAYMENT_METHODS.GOOGLE_PAY)).toBe(
      'https://pay.coinbase.com/x?useGooglePaySandbox=true'
    );
  });
});
