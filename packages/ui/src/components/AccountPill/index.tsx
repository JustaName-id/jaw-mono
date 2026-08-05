'use client';

import { AccountAvatar } from '../AccountAvatar';
import { CopyButton } from '../CopyButton';
import { cn } from '../../lib/utils';

export interface AccountPillProps {
  /** Address used as the identicon seed — stable across ENS resolution. */
  seedAddress: string;
  /** Display text: the ENS name when resolved, otherwise the truncated address. */
  label: string;
  /** ENS avatar URL, if resolved (else the identicon blob shows). */
  avatarUrl?: string | null;
  /** When set, a copy button is shown that copies this full value (e.g. the address). */
  copyValue?: string;
  className?: string;
}

/**
 * Rounded account chip (identicon/avatar + name) shared by the wallet dialogs.
 * Long ENS names step down a size so they render in full rather than ellipsizing.
 * Theme-adaptive via semantic tokens.
 */
export function AccountPill({ seedAddress, label, avatarUrl, copyValue, className }: AccountPillProps) {
  return (
    <span
      className={cn(
        'bg-secondary border-border flex min-w-0 items-center gap-1.5 rounded-full border py-1 pl-1.5 pr-2.5',
        className
      )}
    >
      <AccountAvatar seed={seedAddress} avatarUrl={avatarUrl} size={15} className="h-[15px] w-[15px] rounded-full" />
      <span
        className={cn(
          'text-secondary-foreground truncate font-mono',
          label.length > 40 ? 'text-[9px]' : 'text-[10.5px]'
        )}
      >
        {label}
      </span>
      {copyValue && (
        <CopyButton
          value={copyValue}
          size={12}
          resetAfterMs={1500}
          label="Copy address"
          className="text-muted-foreground"
        />
      )}
    </span>
  );
}
