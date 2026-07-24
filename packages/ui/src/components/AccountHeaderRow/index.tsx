import { AccountPill } from '../AccountPill';
import { cn } from '../../lib/utils';

export interface AccountHeaderRowProps {
  /** Leading label, e.g. "Signing as", "Sign In as", "Connecting to". */
  label: string;
  /** Account address — identicon seed + the value the pill's copy button copies. */
  seedAddress: string;
  /** Pill text: the ENS name when resolved, otherwise the truncated address. */
  displayName: string;
  /** ENS avatar, if resolved. */
  avatarUrl?: string | null;
  className?: string;
}

/**
 * "<label> [account pill]" header row shared by the signing / connect dialogs, so
 * the account is presented identically (pill + copy) across every screen.
 */
export function AccountHeaderRow({ label, seedAddress, displayName, avatarUrl, className }: AccountHeaderRowProps) {
  return (
    <div className={cn('mt-4 flex flex-wrap items-center gap-2', className)}>
      <h2 className="text-foreground text-base font-semibold tracking-[-0.02em]">{label}</h2>
      {seedAddress && (
        <AccountPill seedAddress={seedAddress} label={displayName} avatarUrl={avatarUrl} copyValue={seedAddress} />
      )}
    </div>
  );
}
