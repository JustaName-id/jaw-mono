import { useMemo } from 'react';
import { minidenticon } from 'minidenticons';

import { cn } from '../../lib/utils';

// Canvas Blob parameters, passed through minidenticons' own API.
const SATURATION = 88;
const LIGHTNESS = 52;

export interface AccountIdenticonProps {
  /** Account identity the pattern is derived from (username / ENS name / address). */
  seed: string;
  /** Tile size in px. */
  size?: number;
  className?: string;
}

/**
 * Deterministic account avatar: a minidenticon (laurentpayot/minidenticons)
 * on a light tile. Pattern and color both come from the library.
 */
export function AccountIdenticon({ seed, size = 40, className }: AccountIdenticonProps) {
  const svgUri = useMemo(
    () => 'data:image/svg+xml;utf8,' + encodeURIComponent(minidenticon(seed, SATURATION, LIGHTNESS)),
    [seed]
  );

  return (
    <span
      aria-hidden
      className={cn('flex-none overflow-hidden', className)}
      style={{
        display: 'block',
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.29),
        background: '#F4F4F2',
        boxShadow: 'inset 0 0 0 1px rgba(15,23,42,.08)',
      }}
    >
      <img src={svgUri} alt="" style={{ width: '100%', height: '100%', display: 'block' }} />
    </span>
  );
}
