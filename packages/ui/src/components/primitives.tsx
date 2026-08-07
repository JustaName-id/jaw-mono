import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { AccountAvatar } from './AccountAvatar';
import { CopyButton } from './CopyButton';
import { SubText } from './SubText';
import { subscriptDecimal } from '../utils/displayFormat';

/** The dialog's small uppercase field label. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="text-muted-foreground block font-mono text-[8px] font-semibold uppercase tracking-[0.13em]">
      {children}
    </span>
  );
}

/** A bordered label/value micro-card, matching the signing dialogs. */
export function Row({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={`border-border rounded-[10.5px] border p-3 ${className ?? ''}`}>
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/** A native-currency amount with its USD equivalent, when a price is available. */
export function ValueAmount({
  amount,
  symbol,
  price,
  className,
}: {
  amount: string;
  symbol: string;
  price: number;
  className: string;
}) {
  const num = Number(amount);
  const shown = num > 0 && num < 0.0001 ? subscriptDecimal(num) : amount;
  return (
    <p className={className}>
      <SubText>{`${shown} ${symbol}`}</SubText>
      {price > 0 && (
        <span className="text-muted-foreground ml-1.5 text-[11px] font-normal">≈ ${(num * price).toFixed(2)}</span>
      )}
    </p>
  );
}

/**
 * One party in the transaction — From, To, or the contract being called. Avatar on the left,
 * label above the value beside it, with a copy button carrying the full address.
 */
export function PartyRow({
  label,
  value,
  address,
  avatarUrl,
  badge,
}: {
  label: string;
  value: string;
  address: string;
  avatarUrl?: string;
  /** Pinned to the avatar's corner — marks this party as acting under a delegation. */
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="relative inline-flex flex-none">
        <AccountAvatar seed={address} avatarUrl={avatarUrl} size={28} className="size-7 flex-none rounded-[8px]" />
        {badge}
      </span>
      <div className="min-w-0 flex-1">
        <Eyebrow>{label}</Eyebrow>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
          <p className="text-foreground truncate font-mono text-[12px] font-medium">{value}</p>
          {/* Nothing to copy while the address is still resolving, or never resolved. */}
          {address && <CopyButton value={address} size={13} label="Copy address" />}
        </div>
      </div>
    </div>
  );
}

/** A one-line red message with the detail behind an info tooltip. */
export function InlineWarning({ text, detail }: { text: string; detail: string }) {
  return (
    <div className="flex items-center gap-1">
      <p className="text-destructive font-mono text-[11px] font-medium">{text}</p>
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="text-destructive size-3 flex-none cursor-help" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[240px] text-xs">
            <p>{detail}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
