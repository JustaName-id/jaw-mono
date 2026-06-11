import { useState } from 'react';
import type { ReactNode } from 'react';
import { WalletIcon } from '../icons';

interface IdentityAvatarProps {
  /** Resolved ENS avatar image URL; when absent, the fallback is rendered. */
  src?: string;
  /** Rendered when there is no avatar (or the image fails to load). Defaults to the wallet icon. */
  fallback?: ReactNode;
}

const defaultFallback = <WalletIcon className="h-3 w-3 flex-shrink-0" stroke="currentColor" />;

/**
 * ENS avatar for a resolved identity. Shows the avatar image when one resolved,
 * otherwise the fallback (the wallet icon by default). Pass `fallback={null}`
 * to render nothing when no avatar is set. Falls back if the image fails to load.
 */
export const IdentityAvatar = ({ src, fallback = defaultFallback }: IdentityAvatarProps) => {
  const [erroredSrc, setErroredSrc] = useState<string>();
  if (!src || erroredSrc === src) return <>{fallback}</>;
  return (
    <img
      src={src}
      alt=""
      // Avatar URLs come from attacker-controlled ENS records; don't leak the
      // wallet page URL (incl. api-key query) to third-party image hosts.
      referrerPolicy="no-referrer"
      onError={() => setErroredSrc(src)}
      className="size-5 flex-shrink-0 rounded-full object-cover"
    />
  );
};
