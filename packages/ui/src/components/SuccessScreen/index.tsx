'use client';

import { AccountAvatar } from '../AccountAvatar';
import { SuccessCheck } from '../SuccessCheck';

export interface SuccessScreenProps {
  /** Account address — seeds the identicon so the success beat shows WHO acted. */
  seedAddress: string;
  /** ENS avatar, if resolved (else the identicon blob). */
  avatarUrl?: string | null;
  /** Label under the mark: "Signed", "Sent", "Confirmed", "Connected", … */
  label?: string;
}

/**
 * The post-action confirmation beat: the account's avatar/identicon with a
 * success-tick badge, then a label. Shared by every dialog (signature, EIP-712,
 * transaction, …) so success always reflects the account that acted.
 */
export function SuccessScreen({ seedAddress, avatarUrl, label = 'Signed' }: SuccessScreenProps) {
  return (
    <div className="flex min-h-[234px] flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="relative flex-none">
        <AccountAvatar seed={seedAddress} avatarUrl={avatarUrl} size={56} className="h-14 w-14 rounded-[16px]" />
        <span className="bg-popover absolute -bottom-1.5 -right-1.5 rounded-full p-[3px]">
          <SuccessCheck size={24} />
        </span>
      </div>
      <h2 className="text-foreground text-[15px] font-semibold tracking-[-0.02em]">{label}</h2>
    </div>
  );
}
