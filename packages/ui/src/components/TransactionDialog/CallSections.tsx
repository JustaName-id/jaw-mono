'use client';

import { useState, type ReactNode } from 'react';
import { Code } from 'lucide-react';
import { AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import { CopiedIcon, CopyIcon } from '../../icons';
import { AccountAvatar } from '../AccountAvatar';
import { useDecodedCalldata, type DecodeResult } from '../../hooks/useDecodedCalldata';
import { DecodedCalldataView, callLabel } from './DecodedCalldata';
import type { TransactionData } from './types';

/** Eyebrow label shared by every micro-card in the dialog. */
function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="text-muted-foreground block font-mono text-[8px] font-semibold uppercase tracking-[0.13em]">
      {children}
    </span>
  );
}

/** Copy-to-clipboard icon button with the dialog's 3s "copied" confirmation. */
function CopyButton({ value, size = 14 }: { value: string; size?: number }) {
  const [copied, setCopied] = useState(false);
  if (copied) return <CopiedIcon width={size} height={size} className="flex-none" />;
  return (
    <CopyIcon
      width={size}
      height={size}
      className="flex-none cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        if (typeof window === 'undefined' || !navigator?.clipboard) return;
        navigator.clipboard.writeText(value).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      }}
    />
  );
}

interface DecodeContext {
  chainId: number;
  apiKey?: string;
  resolvedAddresses?: Record<string, string>;
  resolvedAvatars?: Record<string, string>;
  mainnetRpcUrl?: string;
}

/**
 * The single-transaction calldata card: an accordion whose header names the call
 * ("Approve", "supply()") so the detail can stay folded when the asset-change summary
 * already tells the story. The decode comes from the parent, which also uses it for the
 * dialog headline.
 */
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

/**
 * One numbered step of a batch. The header carries the decoded action name rather than a
 * bare index, so a collapsed batch still reads as "Approve / Swap" at a glance.
 */
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
          {/* Interacting with (to) */}
          <div className="border-border flex flex-col gap-1 rounded-[10.5px] border p-2.5">
            <div className="flex items-center justify-between">
              <Eyebrow>Interacting with</Eyebrow>
              <CopyButton value={transaction.to} size={13} />
            </div>
            <div className="flex items-center gap-2">
              <AccountAvatar
                seed={transaction.to}
                avatarUrl={transaction.to ? ctx.resolvedAvatars?.[transaction.to] : undefined}
                size={28}
                className="size-7 flex-none rounded-[8px]"
              />
              <p className="text-foreground min-w-0 break-all font-mono text-[12px] font-medium">
                {displayContractAddress(transaction.to)}
              </p>
            </div>
          </div>

          {/* Value */}
          {value && (
            <div className="border-border rounded-[10.5px] border p-3">
              <Eyebrow>Value</Eyebrow>
              <p className="text-foreground mt-1 font-mono text-[12px] font-semibold">
                {value} {nativeSymbol}
                {nativeTokenPrice > 0 && (
                  <span className="text-muted-foreground ml-1.5 text-[11px] font-normal">
                    ≈ ${(Number(value) * nativeTokenPrice).toFixed(2)}
                  </span>
                )}
              </p>
            </div>
          )}

          {/* Data */}
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
                apiKey={ctx.apiKey}
                resolvedAddresses={ctx.resolvedAddresses}
                resolvedAvatars={ctx.resolvedAvatars}
                mainnetRpcUrl={ctx.mainnetRpcUrl}
              />
            </div>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
