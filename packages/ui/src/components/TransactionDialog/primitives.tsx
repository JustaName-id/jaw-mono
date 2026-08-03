import type { ReactNode } from 'react';
import { AccountAvatar } from '../AccountAvatar';
import { CopyButton } from '../CopyButton';

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
  return (
    <p className={className}>
      {amount} {symbol}
      {price > 0 && (
        <span className="text-muted-foreground ml-1.5 text-[11px] font-normal">
          ≈ ${(Number(amount) * price).toFixed(2)}
        </span>
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
}: {
  label: string;
  value: string;
  address: string;
  avatarUrl?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <AccountAvatar seed={address} avatarUrl={avatarUrl} size={28} className="size-7 flex-none rounded-[8px]" />
      <div className="min-w-0 flex-1">
        <Eyebrow>{label}</Eyebrow>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
          <p className="text-foreground truncate font-mono text-[12px] font-medium">{value}</p>
          <CopyButton value={address} size={13} />
        </div>
      </div>
    </div>
  );
}
