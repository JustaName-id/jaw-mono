'use client';

import { Code } from 'lucide-react';
import { AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import { CopyButton } from '../CopyButton';
import { Eyebrow, PartyRow, Row, ValueAmount } from './primitives';
import { useDecodedCalldata, type DecodeResult } from '../../hooks/useDecodedCalldata';
import { DecodedCalldataView, callLabel } from './DecodedCalldata';
import type { TransactionData } from './types';

interface DecodeContext {
  chainId: number;
  apiKey?: string;
  resolvedAddresses?: Record<string, string>;
  resolvedAvatars?: Record<string, string>;
  mainnetRpcUrl?: string;
}

/** The single-transaction calldata card, folded behind the decoded call name. */
export function SingleCallData({
  to,
  data,
  decode,
  ...ctx
}: DecodeContext & { to: string; data: string; decode: DecodeResult }) {
  return (
    <AccordionItem value="calldata" className="border-border overflow-hidden rounded-[10.5px] border">
      <AccordionTrigger className="items-center px-3 py-2.5 hover:no-underline">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="border-border bg-secondary flex size-7 flex-none items-center justify-center rounded-[8px] border">
            <Code className="text-muted-foreground size-3.5" strokeWidth={1.5} />
          </span>
          <span className="flex min-w-0 flex-col items-start">
            <Eyebrow>Calldata</Eyebrow>
            <span className="text-foreground mt-0.5 truncate text-[13px] font-medium">
              {callLabel(decode, 'Contract call')}
            </span>
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="px-3 pb-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-end">
            <CopyButton value={data} />
          </div>
          <DecodedCalldataView to={to} data={data} decode={decode} {...ctx} />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

/** One numbered batch step, headed by its decoded action name. */
export function BatchStep({
  transaction,
  index,
  nativeSymbol,
  nativeTokenPrice,
  formatValue,
  displayContractAddress,
  ...ctx
}: Omit<DecodeContext, 'chainId'> & {
  transaction: TransactionData;
  index: number;
  nativeSymbol: string;
  nativeTokenPrice: number;
  formatValue: (value?: string) => string | null;
  displayContractAddress: (address: string | undefined) => string;
}) {
  const decode = useDecodedCalldata(transaction.to, transaction.data, transaction.chainId, ctx.apiKey);
  const value = formatValue(transaction.value);
  const hasData = !!transaction.data && transaction.data !== '0x';

  return (
    <AccordionItem value={`transaction-${index}`} className="border-border overflow-hidden rounded-[10.5px] border">
      <AccordionTrigger className="items-center px-3 py-2.5 hover:no-underline">
        <span className="flex min-w-0 items-center gap-2">
          <span className="bg-secondary text-foreground flex size-5 flex-none items-center justify-center rounded-full text-[10px] font-semibold">
            {index + 1}
          </span>
          <span className="text-foreground truncate text-[13px] font-medium">
            {callLabel(decode, transaction.action ?? `Call ${index + 1}`)}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="px-3 pb-3">
        <div className="flex flex-col gap-2.5">
          <div className="border-border rounded-[10.5px] border p-2.5">
            <PartyRow
              label="Interacting with"
              value={displayContractAddress(transaction.to)}
              address={transaction.to}
              avatarUrl={transaction.to ? ctx.resolvedAvatars?.[transaction.to] : undefined}
            />
          </div>

          {value && (
            <Row label="Value">
              <ValueAmount
                amount={value}
                symbol={nativeSymbol}
                price={nativeTokenPrice}
                className="text-foreground font-mono text-[12px] font-semibold"
              />
            </Row>
          )}

          {hasData && (
            <div className="border-border flex flex-col gap-2 rounded-[10.5px] border p-2.5">
              <div className="flex items-center justify-between">
                <Eyebrow>Data</Eyebrow>
                <CopyButton value={transaction.data ?? ''} />
              </div>
              <DecodedCalldataView
                to={transaction.to}
                data={transaction.data as string}
                chainId={transaction.chainId}
                decode={decode}
                {...ctx}
              />
            </div>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
