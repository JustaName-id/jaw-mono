'use client';

import { useState } from 'react';
import { CopiedIcon, CopyIcon } from '../../icons';
import { cn } from '../../lib/utils';

/** Copy-to-clipboard icon button that swaps to a tick for `resetAfterMs`. */
export function CopyButton({
  value,
  size = 14,
  className,
  resetAfterMs = 3000,
}: {
  value: string;
  size?: number;
  className?: string;
  resetAfterMs?: number;
}) {
  const [copied, setCopied] = useState(false);

  if (copied) return <CopiedIcon width={size} height={size} className={cn('flex-none', className)} />;

  return (
    <CopyIcon
      width={size}
      height={size}
      className={cn('flex-none cursor-pointer', className)}
      onClick={(e) => {
        e.stopPropagation();
        if (typeof navigator === 'undefined' || !navigator.clipboard) return;
        navigator.clipboard.writeText(value).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), resetAfterMs);
      }}
    />
  );
}
