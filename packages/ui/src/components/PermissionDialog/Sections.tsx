'use client';

import { ANY_FN_SEL, ANY_TARGET } from '@jaw.id/core';
import { TriangleAlert } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import { AccountAvatar } from '../AccountAvatar';
import { TokenIcon } from '../TokenIcon';
import { Skeleton } from '../ui/skeleton';
import { CopyButton } from '../CopyButton';
import { Eyebrow } from '../primitives';
import { isNativeToken } from '../../utils/tokenBalance';
import { getDisplayAddress } from '../../utils';
import type { CallPermission, SpendPermission } from './types';

/**
 * The permission-manager sentinels standing for "unrestricted". One list so a target wildcard
 * and a selector wildcard can never be treated differently — an unbounded grant is the most
 * dangerous thing on this screen and must always read the same way.
 */
const WILDCARDS = [ANY_TARGET, ANY_FN_SEL].map((v) => v.toLowerCase());

export function isWildcard(value?: string): boolean {
  return !!value && WILDCARDS.includes(value.toLowerCase());
}

/**
 * The allowance period as a rate suffix, so it reads on one line with the amount:
 * "1 Day" → "/day", "4 Days" → "/4 days". "Forever" has no period to qualify.
 */
export function spendRate(duration?: string): string {
  const value = duration?.trim();
  if (!value || /^forever$/i.test(value)) return '';
  const match = /^(\d+)\s+(.+)$/.exec(value);
  if (!match) return `/${value.toLowerCase()}`;
  const [, count, unit] = match;
  return count === '1' ? `/${unit.toLowerCase()}` : `/${count} ${unit.toLowerCase()}`;
}

/** Amber badge pinned to an avatar, marking an unrestricted scope. */
function WarnBadge() {
  return (
    <span className="ring-popover absolute -bottom-0.5 -right-0.5 flex size-[11px] items-center justify-center rounded-full bg-amber-500 ring-2">
      <TriangleAlert className="size-2 text-black" strokeWidth={3} />
    </span>
  );
}

/** A section label with its count, sitting above the card it describes. */
function SectionHeading({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-baseline gap-1.5 pl-3">
      <Eyebrow>{label}</Eyebrow>
      <span className="text-muted-foreground font-mono text-[9px] font-medium">{count}</span>
    </div>
  );
}

/** One spend limit: token identity on the left, allowance and its rate on one line at the right. */
function SpendRow({
  spend,
  chainId,
  nativeSymbol,
  isLoading,
}: {
  spend: SpendPermission;
  chainId?: number;
  nativeSymbol: string;
  isLoading?: boolean;
}) {
  const isNative = isNativeToken(spend.tokenAddress);
  const symbol = isNative ? nativeSymbol : spend.token;
  const rate = spendRate(spend.duration);

  return (
    <div className="border-border flex items-center gap-2 border-t px-3 py-2 first:border-t-0">
      <span className="relative inline-flex size-[19.5px] flex-none items-center justify-center">
        <TokenIcon
          chainId={chainId}
          address={spend.tokenAddress}
          symbol={symbol}
          className="size-[19.5px] flex-none rounded-full"
        />
      </span>
      {isLoading ? (
        <Skeleton className="bg-muted h-3.5 w-16 flex-1 rounded" />
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="text-foreground truncate text-[12px] font-semibold">
            {symbol || getDisplayAddress(undefined, spend.tokenAddress)}
          </span>
          {!isNative && <CopyButton value={spend.tokenAddress} size={11} label="Copy token address" />}
        </span>
      )}
      {isLoading ? (
        <Skeleton className="bg-muted h-4 w-20 flex-none rounded" />
      ) : (
        <span className="flex flex-none items-baseline gap-[3px]">
          <span className="text-foreground text-[13px] font-semibold tracking-[-0.02em]">{spend.amount}</span>
          {rate && <span className="text-muted-foreground font-mono text-[9px]">{rate}</span>}
          {spend.amountUsd && (
            <span className="text-muted-foreground ml-1 font-mono text-[9px]">${spend.amountUsd}</span>
          )}
        </span>
      )}
    </div>
  );
}

export function SpendLimits({
  spends,
  chainId,
  nativeSymbol,
  isLoading,
}: {
  spends: SpendPermission[];
  chainId?: number;
  nativeSymbol: string;
  isLoading?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <SectionHeading label="Spend limit" count={spends.length} />
      <div className="border-border overflow-hidden rounded-[10px] border">
        {spends.map((spend, i) => (
          <SpendRow key={i} spend={spend} chainId={chainId} nativeSymbol={nativeSymbol} isLoading={isLoading} />
        ))}
      </div>
    </div>
  );
}

export interface CallGroup {
  target: string;
  calls: CallPermission[];
}

/** Group the flat call list by contract, preserving first-seen order. */
export function groupCallsByTarget(calls: CallPermission[]): CallGroup[] {
  const groups = new Map<string, CallGroup>();
  for (const call of calls) {
    const key = call.target?.toLowerCase() ?? '';
    const existing = groups.get(key);
    if (existing) existing.calls.push(call);
    else groups.set(key, { target: call.target, calls: [call] });
  }
  return [...groups.values()];
}

/**
 * One contract the spender may call, with its functions behind a nested disclosure. The contract
 * identity — ENS name and avatar where resolved — sits on the collapsed row, because that is what
 * decides whether the grant is safe.
 */
function ContractGroup({
  group,
  resolvedName,
  avatarUrl,
  truncatedAddress,
  tokenSymbol,
  chainId,
}: {
  group: CallGroup;
  resolvedName?: string;
  avatarUrl?: string;
  truncatedAddress: string;
  /** Set when the target is a known token — it then reads like the spend rows. */
  tokenSymbol?: string;
  chainId?: number;
}) {
  const anyTarget = isWildcard(group.target);
  const anyFunction = group.calls.some((c) => isWildcard(c.selector));
  const fnMeta = anyFunction
    ? 'Any function'
    : `${group.calls.length} ${group.calls.length === 1 ? 'function' : 'functions'}`;

  return (
    <AccordionItem value={group.target} className="border-border border-t first:border-t-0">
      <AccordionTrigger className="items-center px-3 py-2 hover:no-underline">
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="relative inline-flex size-[19.5px] flex-none items-center justify-center">
            {tokenSymbol ? (
              <TokenIcon
                chainId={chainId}
                address={group.target}
                symbol={tokenSymbol}
                className="size-[19.5px] flex-none rounded-full"
                fallback={
                  <AccountAvatar
                    seed={group.target}
                    avatarUrl={avatarUrl}
                    size={20}
                    className="size-[19.5px] flex-none rounded-[6px]"
                  />
                }
              />
            ) : (
              <AccountAvatar
                seed={group.target}
                avatarUrl={avatarUrl}
                size={20}
                className="size-[19.5px] flex-none rounded-[6px]"
              />
            )}
            {(anyTarget || anyFunction) && <WarnBadge />}
          </span>
          <span className="flex min-w-0 flex-1 flex-col items-start">
            {anyTarget ? (
              <span className="truncate text-[11px] font-semibold text-amber-500">Any contract</span>
            ) : tokenSymbol || resolvedName ? (
              <>
                <span className="text-foreground truncate text-[11px] font-medium">{tokenSymbol ?? resolvedName}</span>
                <span className="text-muted-foreground mt-0.5 font-mono text-[9px]">{truncatedAddress}</span>
              </>
            ) : (
              <span className="text-foreground truncate font-mono text-[10px] font-medium">{truncatedAddress}</span>
            )}
          </span>
          <span
            className={`flex-none font-mono text-[9px] ${anyFunction ? 'text-amber-500' : 'text-muted-foreground'}`}
          >
            {fnMeta}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="px-3 pb-2.5">
        <div className="flex flex-col gap-1.5">
          {!anyTarget && (
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground min-w-0 break-all font-mono text-[9px]">{group.target}</span>
              <CopyButton value={group.target} size={11} label="Copy contract address" />
            </div>
          )}
          <ul className="bg-secondary flex flex-col gap-1 rounded-[6px] p-2">
            {group.calls.map((call, i) =>
              isWildcard(call.selector) ? (
                <li key={i} className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-500">
                  <TriangleAlert className="size-3 flex-none" strokeWidth={2.4} />
                  Any function
                </li>
              ) : (
                <li key={i} className="text-foreground flex gap-1.5 font-mono text-[11px] leading-[150%]">
                  <span aria-hidden className="text-muted-foreground flex-none">
                    •
                  </span>
                  <span className="min-w-0 break-all">{call.functionSignature || call.selector}</span>
                </li>
              )
            )}
          </ul>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

/**
 * "Allowed calls" as a card that is itself a disclosure, with one nested disclosure per contract —
 * so a grant touching several contracts collapses to a single line until the user asks for more.
 */
export function AllowedCalls({
  calls,
  resolvedAddresses,
  resolvedAvatars,
  truncateAddress,
  tokenMeta,
  chainId,
}: {
  calls: CallPermission[];
  resolvedAddresses: Record<string, string>;
  resolvedAvatars: Record<string, string>;
  truncateAddress: (address: string) => string;
  tokenMeta?: Record<string, { symbol: string }>;
  chainId?: number;
}) {
  const groups = groupCallsByTarget(calls);

  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="calls" className="border-border overflow-hidden rounded-[10px] border">
        <AccordionTrigger className="items-center px-3 py-2 hover:no-underline">
          <span className="flex flex-1 items-baseline gap-1.5">
            <Eyebrow>Allowed calls</Eyebrow>
            <span className="text-muted-foreground font-mono text-[9px] font-medium">{calls.length}</span>
          </span>
        </AccordionTrigger>
        <AccordionContent className="border-border border-t p-0">
          <Accordion type="multiple">
            {groups.map((group) => (
              <ContractGroup
                key={group.target}
                group={group}
                resolvedName={resolvedAddresses[group.target]}
                avatarUrl={resolvedAvatars[group.target]}
                truncatedAddress={truncateAddress(group.target)}
                tokenSymbol={tokenMeta?.[group.target]?.symbol}
                chainId={chainId}
              />
            ))}
          </Accordion>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

/** The From / Granted / Until / permissionId block — label left, value right, one row each. */
export function MetaCard({ rows }: { rows: { label: string; value: React.ReactNode }[] }) {
  return (
    <div className="border-border overflow-hidden rounded-[10px] border">
      {rows.map((row) => (
        <div
          key={row.label}
          className="border-border flex h-7 items-center justify-between gap-2 border-t px-3 first:border-t-0"
        >
          <Eyebrow>{row.label}</Eyebrow>
          <span className="text-foreground flex min-w-0 items-center gap-1.5 font-mono text-[10px]">{row.value}</span>
        </div>
      ))}
    </div>
  );
}
