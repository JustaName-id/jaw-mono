import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { NetworkFeeRow } from './index';
import type { FeeTokenOption } from '../FeeTokenSelector';

/**
 * The ERC-20 fee slot. useGasEstimation overloads `gasCostFormatted`: a numeric amount on
 * success, `undefined` while the estimate is in flight, and the sentinel strings
 * 'Insufficient' / 'Estimation failed' when the ERC-20 leg rejected. The selector refuses to
 * pick a sentinel-carrying token, but the re-estimate sync can copy a sentinel onto an
 * already-selected one — handleEthSuccess only fills an empty selection, and nothing swaps a
 * blocked token away outside the ETH-insufficient branch. On that path `blockReason` stays null
 * (another token is usually still selectable) and Confirm is disabled by the missing ceiling,
 * so the slot itself is the only place the user can learn why the flow is stuck.
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
    // The two regressions this branch guards against: the sentinel worn as a cost
    // ("Estimation failed USDC"), and an "Estimating..." that never resolves.
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
    // useGasEstimation:392 replaces 'Insufficient' with the required amount when the error
    // carries one — numeric, so a number gate would wear it as the fee while Confirm sits
    // disabled by the missing ceiling with nothing on screen saying why.
    const html = markup(usdc({ gasCostFormatted: '1.25', gasCostMaxFormatted: undefined }));
    expect(html).toContain('Insufficient funds');
    // The required amount lives in the tooltip detail (closed in static markup), never in the
    // fee slot — "1.25 USDC" in the body would be the old dead end wearing a plausible fee.
    expect(html).not.toContain('1.25 USDC');
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
