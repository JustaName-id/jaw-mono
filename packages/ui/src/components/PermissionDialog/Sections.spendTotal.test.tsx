import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { SpendLimits } from './Sections';
import type { SpendPermission } from './types';

/**
 * The row leads with a rate, and the rate is not what the user is approving.
 * "10 USDC /day" on a thirty-day grant is 300 USDC, and that figure appeared
 * nowhere, which is how a permission asking for a million rendered as tidily as
 * one asking for ten.
 */
describe('a spend row states what the whole permission can move', () => {
  const spend = (overrides: Partial<SpendPermission> = {}): SpendPermission => ({
    amount: '10.00',
    token: 'USDC',
    tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    duration: '1 Day',
    limit: '10.00 USDC',
    ...overrides,
  });

  const markup = (s: SpendPermission, expiryDate?: string) =>
    renderToStaticMarkup(<SpendLimits spends={[s]} nativeSymbol="ETH" expiryDate={expiryDate} />);

  it('renders the total alongside the rate', () => {
    const html = markup(spend({ total: '300.00' }), 'Mar 3, 2027');
    expect(html).toContain('10.00');
    expect(html).toContain('up to 300.00 USDC');
  });

  it('names the horizon the total runs to', () => {
    expect(markup(spend({ total: '300.00' }), 'Mar 3, 2027')).toContain('by Mar 3, 2027');
  });

  // Revoke passes no expiry: that permission already exists and what is left of
  // it is a different question from what granting it would cost.
  it('states the total without a horizon rather than inventing one', () => {
    const html = markup(spend({ total: '300.00' }));
    expect(html).toContain('up to 300.00 USDC');
    expect(html).not.toContain(' by ');
  });

  // A `forever` limit and a grant lasting one window both have a total equal to
  // the rate. Repeating it would read as a second, larger number.
  it('says nothing extra when there is no total to add', () => {
    expect(markup(spend())).not.toContain('up to');
  });

  it('leaves the total out while the token metadata is still loading', () => {
    const html = renderToStaticMarkup(
      <SpendLimits spends={[spend({ total: '300.00' })]} nativeSymbol="ETH" expiryDate="Mar 3, 2027" isLoading />
    );
    expect(html).not.toContain('up to');
  });
});
