'use client';

import { IdentityAvatar } from '../IdentityAvatar';
import { AccountIdenticon } from '../AccountIdenticon';
import { SuccessCheck } from '../SuccessCheck';

export interface SignedSuccessProps {
  /** Account address — seeds the identicon so the success beat shows WHO signed. */
  seedAddress: string;
  /** ENS avatar, if resolved (else the identicon blob). */
  avatarUrl?: string | null;
  /** Label under the mark (default "Signed"). */
  label?: string;
}

/**
 * The post-sign confirmation beat: the signing account's avatar/identicon with a
 * success-tick badge, then a label. Shared by the signature + EIP-712 dialogs so
 * the "Signed" animation always reflects the account that was passed in.
 */
export function SignedSuccess({ seedAddress, avatarUrl, label = 'Signed' }: SignedSuccessProps) {
  return (
    <div className="flex min-h-[234px] flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="relative flex-none">
        <IdentityAvatar
          src={avatarUrl ?? undefined}
          className="h-14 w-14 rounded-[16px]"
          fallback={<AccountIdenticon seed={(seedAddress || '').toLowerCase()} size={56} />}
        />
        <span className="bg-popover absolute -bottom-1.5 -right-1.5 rounded-full p-[3px]">
          <SuccessCheck size={24} />
        </span>
      </div>
      <h2 className="text-foreground text-[15px] font-semibold tracking-[-0.02em]">{label}</h2>
    </div>
  );
}
