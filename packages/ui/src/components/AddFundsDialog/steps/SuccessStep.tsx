'use client';

import type { OnrampOrder } from '@jaw.id/core';
import { Button } from '../../ui/button';
import { Section, StepLayout } from '../primitives';
import { formatAddress } from '../../../utils';

/** Terminal success: what was received and the settlement tx. */
export function SuccessStep({ order, onClose }: { order: OnrampOrder; onClose: () => void }) {
  return (
    <StepLayout
      footer={
        <Button type="button" className="flex-1" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="bg-success/10 text-success rounded-lg p-3 text-sm">Purchase complete</div>
      <Section>
        {order.cryptoAmount && (
          <div className="text-foreground flex flex-col gap-0.5">
            <p className="text-xs font-bold leading-[133%]">Received</p>
            <p className="text-base font-normal leading-[150%]">
              {order.cryptoAmount} {order.cryptoCurrency}
            </p>
          </div>
        )}
        {order.cryptoAmount && order.txHash && <div className="bg-border h-[1px] w-full flex-shrink-0 rounded-full" />}
        {order.txHash && (
          <div className="text-foreground flex flex-col gap-0.5">
            <p className="text-xs font-bold leading-[133%]">Transaction</p>
            <p className="break-all text-base font-normal leading-[150%]" title={order.txHash}>
              {formatAddress(order.txHash)}
            </p>
          </div>
        )}
      </Section>
    </StepLayout>
  );
}
