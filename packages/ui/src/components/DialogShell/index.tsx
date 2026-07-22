import { CSSProperties, ReactNode } from 'react';

import { cn } from '../../lib/utils';

/**
 * Design-language surface tokens for the revamped dialogs. The surface is dark
 * regardless of the host theme (the canvas frames are dark-only), so the shell
 * re-scopes the --jaw-color-* variables for the ui package's own primitives
 * (Button, Input, Separator) that reference them directly.
 *
 * These alone are NOT enough: host apps render text/surfaces through Tailwind
 * utilities (text-foreground, bg-secondary, border-border, …) that resolve via
 * the SHORT aliases (--foreground, --secondary, …), not --jaw-color-*. Those
 * short aliases follow the HOST theme — in a light host they are near-black, so
 * text goes dark-on-dark inside our forced-dark card. The `dark` class on the
 * shell (below) re-scopes the short aliases to the dark palette for this subtree.
 */
const SHELL_TOKENS = {
  '--jaw-color-background': '#0A1020',
  '--jaw-color-foreground': '#F5F5F4',
  '--jaw-color-card': '#0A1020',
  '--jaw-color-card-foreground': '#F5F5F4',
  '--jaw-color-popover': '#0E1526',
  '--jaw-color-popover-foreground': '#F5F5F4',
  '--jaw-color-primary': '#F5F5F4',
  '--jaw-color-primary-foreground': '#0B0F1A',
  '--jaw-color-secondary': 'rgba(255,255,255,.05)',
  '--jaw-color-secondary-foreground': '#C7CEDA',
  '--jaw-color-muted': 'rgba(255,255,255,.04)',
  '--jaw-color-muted-foreground': '#8A94A6',
  '--jaw-color-accent': 'rgba(255,255,255,.08)',
  '--jaw-color-accent-foreground': '#F5F5F4',
  '--jaw-color-destructive': '#EF4444',
  '--jaw-color-destructive-foreground': '#FCA5A5',
  '--jaw-color-border': 'rgba(255,255,255,.10)',
  '--jaw-color-input': 'rgba(255,255,255,.12)',
  '--jaw-color-ring': 'rgba(255,255,255,.35)',
} as CSSProperties;

export interface DialogShellProps {
  children: ReactNode;
  /**
   * Animated conic-ring halo behind the card edge — the "dark-host visibility"
   * treatment. Disabled automatically for prefers-reduced-motion (static ring).
   */
  halo?: boolean;
  className?: string;
  contentClassName?: string;
}

/**
 * The revamped dialog frame: 345px card, min 234 / max 477 height with internal
 * scroll, dark surface with a light ring wrapper and glow.
 */
export function DialogShell({ children, halo = true, className, contentClassName }: DialogShellProps) {
  return (
    <div
      data-jaw-shell
      className={cn(
        'dark relative mx-auto w-fit overflow-hidden rounded-[18px] p-[1.5px]',
        'lg:[zoom:1.15]',
        className
      )}
      style={
        {
          background: 'rgba(240,242,246,.16)',
          ...SHELL_TOKENS,
          '--primary': 'inherit',
          '--primary-foreground': 'inherit',
          '--ring': 'inherit',
        } as CSSProperties
      }
    >
      {halo && <div aria-hidden className="jaw-halo-ring absolute inset-[-60%] z-0" />}
      <div
        className={cn(
          'relative z-[1] flex max-h-[min(477px,90dvh)] min-h-[234px] w-[345px] max-w-full flex-col overflow-y-auto overflow-x-hidden rounded-[16.5px]',
          contentClassName
        )}
        style={{
          background: '#0A1020',
          border: '1px solid rgba(255,255,255,.16)',
          boxShadow:
            '0 0 0 1px rgba(255,255,255,.05), 0 0 40px rgba(255,255,255,.08), 0 30px 68px -38px rgba(2,6,23,.9)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
