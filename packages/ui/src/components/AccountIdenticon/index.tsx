import { cn } from '../../lib/utils';

// Curated hues — no green, so green stays reserved for success states
// (rose, orange, amber, cyan, sky, indigo, violet, purple, magenta).
const HUES = [350, 25, 42, 195, 212, 245, 275, 300, 330];

// minidenticons hash (laurentpayot/minidenticons)
function hashSeed(seed: string): number {
  return seed.split('').reduce((hash, ch) => (hash ^ ch.charCodeAt(0)) * -5, 5) >>> 2;
}

export interface AccountIdenticonProps {
  /** Account identity the pattern is derived from (username / ENS name / address). */
  seed: string;
  /** Tile size in px. */
  size?: number;
  className?: string;
}

/**
 * Deterministic account avatar: a 5x5 minidenticon on a light tile, hue picked
 * from a curated no-green palette so every account is visually distinct.
 */
export function AccountIdenticon({ seed, size = 40, className }: AccountIdenticonProps) {
  const hash = hashSeed(seed);
  const hue = HUES[hash % HUES.length];

  const rects = [];
  for (let i = 0; i < 25; i++) {
    if (hash & (1 << i % 15)) {
      const x = i > 14 ? 7 - Math.floor(i / 5) : Math.floor(i / 5);
      rects.push(<rect key={i} x={x} y={i % 5} width={1} height={1} />);
    }
  }

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
      <svg
        viewBox="-1.5 -1.5 8 8"
        xmlns="http://www.w3.org/2000/svg"
        fill={`hsl(${hue} 88% 52%)`}
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        {rects}
      </svg>
    </span>
  );
}
