'use client';

import { Button } from '../../ui/button';
import { Spinner } from '../../ui/spinner';
import { Section, StepLayout } from '../primitives';
import type { OnrampFlow } from '../../../hooks/useOnrampFlow';

// Compact crop IS the button: the iframe is over-scanned 32px per side so the
// widget's margins fall outside the pill window. It grows for the QR on tap.
const PAY_FRAME_COMPACT = 'h-10 rounded-full';
const PAY_FRAME_EXPANDED = 'h-[440px] rounded-[6px]';
const PAY_IFRAME_COMPACT = 'left-[-32px] w-[calc(100%+64px)]';
const PAY_IFRAME_EXPANDED = 'left-0 w-full';

/** Show the buy summary and the embedded Coinbase pay widget. */
export function PayStep({
  flow,
  chainName,
  accountDisplay,
  destinationAddress,
  onCancel,
  onRestart,
}: {
  flow: OnrampFlow;
  chainName: string;
  accountDisplay: string;
  destinationAddress: string;
  onCancel: () => void;
  onRestart: () => void;
}) {
  const failed = flow.payStatus === 'failed' && flow.payError;
  return (
    <StepLayout
      footer={
        failed ? (
          <>
            <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
              Close
            </Button>
            {flow.payError?.retry === 'reload' && (
              <Button type="button" className="flex-1" onClick={flow.retryPay}>
                Try again
              </Button>
            )}
            {flow.payError?.retry === 'restart' && (
              <Button type="button" className="flex-1" onClick={onRestart}>
                Edit details
              </Button>
            )}
          </>
        ) : (
          // No "Done": success auto-resolves via polling_success.
          <Button type="button" variant="outline" className="w-full" onClick={onCancel}>
            Cancel
          </Button>
        )
      }
    >
      <div className="border-border flex flex-row items-center justify-between gap-2.5 rounded-[6px] border p-3.5">
        <div className="text-foreground flex flex-1 flex-col gap-0.5">
          <p className="text-xs font-bold leading-[133%]">Amount</p>
          <p className="text-base font-normal leading-[150%]">
            ${flow.order?.fiatAmount ?? flow.form.fiatAmount} {flow.order?.fiatCurrency ?? 'USD'}
          </p>
        </div>
        <div className="bg-border h-full min-h-[50px] w-[1px] rounded-full" />
        <div className="text-foreground flex flex-1 flex-col gap-0.5">
          <p className="text-xs font-bold leading-[133%]">Receiving</p>
          <p className="text-base font-normal leading-[150%]">
            {flow.order?.cryptoAmount ? `${flow.order.cryptoAmount} ` : ''}
            {flow.order?.cryptoCurrency ?? flow.asset}{' '}
            <span className="text-muted-foreground text-sm">on {chainName}</span>
          </p>
        </div>
      </div>

      <Section title="To your account" className="gap-0.5">
        <p className="text-foreground break-all text-base font-normal leading-[150%]" title={destinationAddress}>
          {accountDisplay}
        </p>
      </Section>

      {failed ? (
        <div className="border-destructive/30 bg-destructive/10 flex flex-col gap-1 rounded-[6px] border p-3.5">
          <p className="text-destructive text-xs font-bold leading-[133%]">Payment unavailable</p>
          <p className="text-foreground text-xs font-normal leading-[150%]">{flow.payError?.message}</p>
        </div>
      ) : (
        <Section className="gap-2.5">
          <div className="flex flex-row items-center justify-between gap-2">
            <p className="text-foreground text-xs font-bold leading-[133%]">Pay with Apple Pay or Google Pay</p>
            {flow.payStatus === 'loading' && (
              <div className="flex flex-row items-center gap-1.5">
                <Spinner />
                <p className="text-muted-foreground text-xs">Loading…</p>
              </div>
            )}
          </div>
          {/* Iframe stays full height; only the crop window grows on tap.
              Resizing before the click would reflow the widget and eat it.
              Pinned to a fixed max width + centered so the pill crop renders
              identically at the 500px dialog and the narrower keys popup. */}
          <div
            className={`relative mx-auto w-full max-w-[360px] overflow-hidden transition-[height,border-radius] duration-300 ${
              flow.expanded ? PAY_FRAME_EXPANDED : PAY_FRAME_COMPACT
            }`}
          >
            <iframe
              key={flow.iframeKey}
              ref={flow.iframeRef}
              title="Coinbase guest checkout"
              src={flow.payUrl ?? undefined}
              allow="payment"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              referrerPolicy="no-referrer"
              className={`absolute top-1/2 h-[440px] -translate-y-1/2 border-0 ${
                flow.expanded ? PAY_IFRAME_EXPANDED : PAY_IFRAME_COMPACT
              }`}
            />
          </div>
        </Section>
      )}
    </StepLayout>
  );
}
