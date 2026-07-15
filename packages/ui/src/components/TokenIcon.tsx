import { useState } from 'react';
import type { ReactNode } from 'react';
import { GenericTokenIcon } from '../icons';
import { cn } from '../lib/utils';
import { hasIconFailed, markIconFailed, tokenIconUrl } from '../utils/tokenIcon';

interface TokenIconProps {
  chainId?: number;
  /** Token contract address; native rows may pass the zero or 0xeeee… sentinel. */
  address?: string;
  /** Alt text. */
  symbol?: string;
  /** Sizing per surface, e.g. "size-4" | "size-5" | "size-6". */
  className?: string;
  /** Overrides the endpoint URL (e.g. a token-list logoURI). */
  src?: string;
  /** Rendered on 404/load error. Defaults to GenericTokenIcon. */
  fallback?: ReactNode;
}

/** Token logo from the public icon endpoint; renders `fallback` when no URL is available or the image fails. */
export const TokenIcon = ({ chainId, address, symbol, className, src, fallback }: TokenIconProps) => {
  const [erroredSrc, setErroredSrc] = useState<string>();
  const url = src ?? (chainId !== undefined && address ? tokenIconUrl(chainId, address) : undefined);
  if (!url || erroredSrc === url || hasIconFailed(url)) {
    return <>{fallback ?? <GenericTokenIcon className={cn('shrink-0', className)} />}</>;
  }
  return (
    <img
      src={url}
      alt={symbol ?? ''}
      // logoURI overrides can point at third-party CDNs — no-referrer avoids leaking the wallet page URL.
      referrerPolicy="no-referrer"
      onError={() => {
        markIconFailed(url);
        setErroredSrc(url);
      }}
      className={cn('shrink-0 rounded-full object-cover', className)}
    />
  );
};
