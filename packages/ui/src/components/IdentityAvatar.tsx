import { useState } from 'react';
import type { ReactNode } from 'react';
import { WalletIcon } from '../icons';
import { cn } from '../lib/utils';

interface IdentityAvatarProps {
  src?: string;
  /** Defaults to the wallet icon; pass `null` to render nothing when there's no avatar. */
  fallback?: ReactNode;
  /** Size/shape classes; defaults to the 20px circle used by transaction rows. */
  className?: string;
}

const defaultFallback = <WalletIcon className="h-3 w-3 flex-shrink-0" stroke="currentColor" />;

/** ENS avatar for a resolved identity; falls back to `fallback` when there's no avatar or the image fails to load. */
export const IdentityAvatar = ({
  src,
  fallback = defaultFallback,
  className = 'size-5 rounded-full',
}: IdentityAvatarProps) => {
  const [erroredSrc, setErroredSrc] = useState<string>();
  if (!src || erroredSrc === src) return <>{fallback}</>;
  return (
    <img
      src={src}
      alt=""
      // Avatar URLs are attacker-controlled (ENS records) — no-referrer avoids leaking the wallet page URL (incl. api-key) to third-party hosts.
      referrerPolicy="no-referrer"
      onError={() => setErroredSrc(src)}
      className={cn('flex-shrink-0 object-cover', className)}
    />
  );
};
