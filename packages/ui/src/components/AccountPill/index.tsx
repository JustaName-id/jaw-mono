import { AccountIdenticon } from '../AccountIdenticon';
import { IdentityAvatar } from '../IdentityAvatar';
import { cn } from '../../lib/utils';

export interface AccountPillProps {
  /** Address used as the identicon seed — stable across ENS resolution. */
  seedAddress: string;
  /** Display text: the ENS name when resolved, otherwise the truncated address. */
  label: string;
  /** ENS avatar URL, if resolved (else the identicon blob shows). */
  avatarUrl?: string | null;
  className?: string;
}

/**
 * Rounded account chip (identicon/avatar + name) shared by the wallet dialogs.
 * Long ENS names step down a size so they render in full rather than ellipsizing.
 * Theme-adaptive via semantic tokens.
 */
export function AccountPill({ seedAddress, label, avatarUrl, className }: AccountPillProps) {
  return (
    <span
      className={cn(
        'bg-secondary border-border flex min-w-0 items-center gap-1.5 rounded-full border py-1 pl-1.5 pr-2.5',
        className
      )}
    >
      <IdentityAvatar
        src={avatarUrl ?? undefined}
        className="h-[15px] w-[15px] rounded-full"
        fallback={<AccountIdenticon seed={seedAddress.toLowerCase()} size={15} />}
      />
      <span
        className={cn(
          'text-secondary-foreground truncate font-mono',
          label.length > 40 ? 'text-[9px]' : 'text-[10.5px]'
        )}
      >
        {label}
      </span>
    </span>
  );
}
