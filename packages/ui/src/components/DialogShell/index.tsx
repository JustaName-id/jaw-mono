import { ReactNode } from 'react';

import { cn } from '../../lib/utils';

export interface DialogShellProps {
  children: ReactNode;
  /**
   * Animated conic-ring halo behind the card edge. It's a light-on-dark
   * flourish, so it only renders in dark mode (`dark:` — keyed on the host
   * theme). Disabled for prefers-reduced-motion (see styles.css).
   */
  halo?: boolean;
  className?: string;
  contentClassName?: string;
}

/**
 * The revamped dialog frame: 400px card, min 234 / max 550 height with internal
 * scroll. Surface, border and text use the semantic theme tokens so the card
 * MIRRORS the host dApp's theme — light card on a light dApp, dark on a dark
 * dApp — rather than forcing a single palette. The halo is dark-only.
 */
export function DialogShell({ children, halo = true, className, contentClassName }: DialogShellProps) {
  return (
    <div
      data-jaw-shell
      // `bg-border` paints the 1.5px ring in the theme border color; on dark the
      // halo overlays it.
      // max-w-full: without it the fit-content frame keeps the card's 400px
      // preferred width on narrower viewports (375–390px phones), overflowing
      // the container — which defeats mx-auto centering and pins the card to
      // the left edge, spilling off the right side of the bottom sheet.
      className={cn('bg-border rounded-card relative mx-auto w-fit max-w-full overflow-hidden p-[1.5px]', className)}
    >
      {halo && <div aria-hidden className="jaw-halo-ring absolute inset-[-60%] z-0 hidden dark:block" />}
      <div
        className={cn(
          'jaw-scroll bg-popover text-popover-foreground border-border rounded-card relative z-[1] flex max-h-[min(550px,90dvh)] min-h-[234px] w-[400px] max-w-full flex-col overflow-y-auto overflow-x-hidden border shadow-xl',
          contentClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}
