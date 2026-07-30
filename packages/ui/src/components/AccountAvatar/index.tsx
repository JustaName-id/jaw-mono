import { IdentityAvatar } from '../IdentityAvatar';
import { AccountIdenticon } from '../AccountIdenticon';

export interface AccountAvatarProps {
  /** Identity the identicon is seeded from — address (or username). Lower-cased internally for a stable blob. */
  seed: string;
  /** ENS avatar URL. Shown when it resolves/loads; otherwise the identicon blob. */
  avatarUrl?: string | null;
  /** Identicon tile size in px (drives the blob's dimensions + rounding). */
  size: number;
  /** Shape/size classes for the ENS-avatar image (should visually match `size`). */
  className?: string;
}

/**
 * An account's visual identity: the ENS avatar when it resolves, otherwise a
 * deterministic identicon blob seeded by the address. Single source of the
 * "avatar-or-blob" rule so every dialog (pill, signing, connect, success) renders
 * identically.
 */
export function AccountAvatar({ seed, avatarUrl, size, className }: AccountAvatarProps) {
  return (
    <IdentityAvatar
      src={avatarUrl ?? undefined}
      className={className}
      fallback={<AccountIdenticon seed={(seed || '').toLowerCase()} size={size} />}
    />
  );
}
