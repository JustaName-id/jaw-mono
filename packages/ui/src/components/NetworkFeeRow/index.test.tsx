import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { NetworkFeeRow } from './index';
import type { FeeTokenOption } from '../FeeTokenSelector';

/**
 * The ERC-20 fee slot. useGasEstimation overloads `gasCostFormatted`: a numeric amount on
 * success, `undefined` while in flight, and a sentinel string or required amount when the token
 * can't pay. A re-estimate can put an unpayable token in the selection, where blockReason stays
 * null and Confirm is disabled with no banner — so the slot itself must say why, never a fee
 * figure or an "Estimating..." that can't resolve.
 */
describe('NetworkFeeRow — ERC-20 fee slot', () => {
  const usdc = (overrides: Partial<FeeTokenOption> = {}): FeeTokenOption => ({
    uid: 'usdc',
    symbol: 'USDC',
    address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    decimals: 6,
    balance: 5_000_000n,
    balanceFormatted: '5.00',
    isNative: false,
    isSelectable: false,
    ...overrides,
  });

  const markup = (selectedFeeToken: FeeTokenOption) =>
    renderToStaticMarkup(
      <NetworkFeeRow
        blockReason={null}
        nativeSymbol="ETH"
        nativeTokenPrice={0}
        hasSelectablePaymentOption
        isPayingWithErc20
        selectedFeeToken={selectedFeeToken}
      />
    );

  it("renders the 'Estimation failed' sentinel as a warning, not a fee and not a spinner", () => {
    const html = markup(usdc({ gasCostFormatted: 'Estimation failed', gasCostMaxFormatted: undefined }));
    expect(html).not.toContain('Estimation failed USDC');
    expect(html).not.toContain('Estimating');
    expect(html).toContain('Estimation failed');
    expect(html).toContain('text-destructive');
  });

  it("renders the 'Insufficient' sentinel as an insufficient-funds warning", () => {
    const html = markup(usdc({ gasCostFormatted: 'Insufficient', gasCostMaxFormatted: undefined }));
    expect(html).not.toContain('Insufficient USDC');
    expect(html).not.toContain('Estimating');
    expect(html).toContain('Insufficient funds');
  });

  it("renders the amount parsed from an 'X required but sender has Y' error as a warning, not a fee", () => {
    const html = markup(usdc({ gasCostFormatted: '1.25', gasCostMaxFormatted: undefined }));
    expect(html).toContain('Insufficient funds');
    // The amount belongs in the tooltip detail (closed in static markup), never the fee slot.
    expect(html).not.toContain('1.25 USDC');
    expect(html).not.toContain('Up to');
    expect(html).not.toContain('Estimating');
  });

  it('renders a priced token whose balance cannot cover the ceiling as a warning, not a payable fee', () => {
    // A successful estimate can report hasSufficientBalance false: real cost and ceiling,
    // isSelectable false. A ceiling-only gate would render this as a normal, payable fee.
    const html = markup(usdc({ gasCostFormatted: '0.0421', gasCostMaxFormatted: '0.0512', isSelectable: false }));
    expect(html).toContain('Insufficient funds');
    expect(html).not.toContain('0.0421 USDC');
    expect(html).not.toContain('Up to');
    expect(html).not.toContain('Estimating');
  });

  it('still shows Estimating... while the estimate is genuinely in flight (undefined)', () => {
    const html = markup(usdc({ gasCostFormatted: undefined, gasCostMaxFormatted: undefined }));
    expect(html).toContain('Estimating');
    expect(html).not.toContain('text-destructive');
  });

  it('renders a numeric cost with its ceiling, unchanged', () => {
    const html = markup(usdc({ gasCostFormatted: '0.0421', gasCostMaxFormatted: '0.0512', isSelectable: true }));
    expect(html).toContain('0.0421 USDC');
    expect(html).toContain('Up to 0.0512 USDC');
    expect(html).not.toContain('Estimating');
    expect(html).not.toContain('text-destructive');
  });

  it('never shows an "Up to" line alongside a sentinel (the ceiling would be the sentinel itself)', () => {
    const html = markup(usdc({ gasCostFormatted: 'Estimation failed', gasCostMaxFormatted: undefined }));
    expect(html).not.toContain('Up to');
  });
});
