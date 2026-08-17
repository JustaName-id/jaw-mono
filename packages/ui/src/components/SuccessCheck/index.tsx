import { cn } from '../../lib/utils';

export interface SuccessCheckProps {
  /** Diameter in px. */
  size?: number;
  className?: string;
}

/**
 * Animated success checkmark — the circle pops in, then the tick strokes on.
 * Uses the theme's success color; respects prefers-reduced-motion (see styles.css).
 */
export function SuccessCheck({ size = 44, className }: SuccessCheckProps) {
  return (
    <span
      className={cn('jaw-check-pop text-success flex flex-none items-center justify-center rounded-full', className)}
      style={{ width: size, height: size, background: 'color-mix(in srgb, currentColor 14%, transparent)' }}
    >
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          className="jaw-check-draw"
          d="M5 13l4 4L19 7"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
