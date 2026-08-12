'use client';

import { ReactNode, useContext } from 'react';

import { cn, DialogAnchorContext } from '../../lib/utils';

export interface DialogShellProps {
  children: ReactNode;
  /**
   * Animated conic-ring halo behind the card edge. It's a light-on-dark
   * flourish, so it only renders in dark mode (`dark:` — keyed on the host
   * theme). Disabled for prefers-reduced-motion (see styles.css) and in the
   * sheet presentation (see below).
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
 *
 * In the embedded drawer presentation ('bottom-sheet' anchor — narrow
 * viewports) the card IS the sheet rather than a card sitting inside one: it
 * goes full-bleed, rounds only its top corners, drops the side/bottom edge, the
 * shadow and the halo, and grows a grabber. Without that variant the desktop
 * card just renders bottom-pinned, which reads as a misplaced dialog instead of
 * a sheet. The slide-up itself is not ours — EmbeddedShell drives it from the
 * SDK's DialogVisibility for inline screens, Radix animates it for portaled ones.
 */
export function DialogShell({ children, halo = true, className, contentClassName }: DialogShellProps) {
  const sheet = useContext(DialogAnchorContext) === 'bottom-sheet';

  return (
    <div
      data-jaw-shell
      // `bg-border` paints the 1.5px ring in the theme border color; on dark the
      // halo overlays it.
      className={cn(
        'bg-border relative overflow-hidden',
        sheet
          ? // Only the top edge of the ring is on screen — the other three sit at
            // or past the viewport edge, so padding them would just inset the
            // surface for no visible hairline.
            'w-full rounded-t-[18px] pt-[1.5px]'
          : // max-w-full: without it the fit-content frame keeps the card's 400px
            // preferred width on narrower viewports (375–390px phones),
            // overflowing the container — which defeats mx-auto centering and
            // pins the card to the left edge, spilling off the right side.
            'mx-auto w-fit max-w-full rounded-[18px] p-[1.5px]',
        className
      )}
    >
      {/* An all-around edge glow with three edges offscreen reads as a bright
          top-left bloom, so the sheet skips it. */}
      {halo && !sheet && <div aria-hidden className="jaw-halo-ring absolute inset-[-60%] z-0 hidden dark:block" />}
      <div
        className={cn(
          'jaw-scroll bg-popover text-popover-foreground border-border relative z-[1] flex min-h-[234px] flex-col overflow-y-auto overflow-x-hidden',
          sheet
            ? // Content-sized up to 85dvh so a strip of the host dApp always
              // peeks above the sheet (dvh, not vh: a collapsing mobile URL bar
              // must not leave it short). No shadow — there is nothing to lift
              // off, and against the bottom bezel it renders as a smudge. The
              // safe-area inset is padding INSIDE the surface, so the sheet
              // background runs under the iOS home bar while content clears it.
              'max-h-[85dvh] w-full rounded-t-[16.5px] border-t pb-[env(safe-area-inset-bottom)]'
            : 'max-h-[min(550px,90dvh)] w-[400px] max-w-full rounded-[16.5px] border shadow-xl',
          contentClassName
        )}
      >
        {/* Grabber: the affordance that says "sheet". Decorative — this is not a
            draggable sheet, dismissal is tap-outside / Escape / in-flow close.
            Sticky rather than a sibling of the scroll container so it stays put
            while content scrolls under it, without restructuring the tree (the
            card is the single scroll owner). */}
        {sheet && (
          <div
            data-jaw-grabber
            aria-hidden
            className="bg-popover sticky top-0 z-[2] flex shrink-0 justify-center pb-2 pt-3"
          >
            <span className="bg-border h-1 w-9 rounded-full" />
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
