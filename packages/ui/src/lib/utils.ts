import { clsx, type ClassValue } from 'clsx';
import { createContext } from 'react';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * The design-spec type roles from `tailwind.config.js`. tailwind-merge only knows Tailwind's own
 * `text-xs…text-9xl`, so without this a component's base `text-sm` and an override's `text-heading`
 * both survive the merge — and since Tailwind emits `.text-sm` *after* our custom keys, the base
 * silently wins and the token does nothing. Every key added to `fontSize` belongs here too.
 */
const FONT_SIZE_ROLES = [
  'title-xl',
  'status',
  'app',
  'heading',
  'button',
  'value',
  'body',
  'body-sm',
  'body-xs',
  'label',
  'code',
  'url',
  'amount',
  'amount-lg',
  'symbol',
];

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: FONT_SIZE_ROLES }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Context for passing the portal container element to Radix UI Dialog.
 * This ensures Radix portals render inside the SDK's container div,
 * preventing consumer app CSS from leaking into SDK modals.
 */
export const PortalContainerContext = createContext<HTMLElement | null>(null);

/**
 * Vertical anchor for Radix dialog content. Dialogs portal to document.body,
 * so a host that lays out its inline screens in an anchored card (keys'
 * EmbeddedShell) can't reposition them by wrapping — it provides an anchor
 * here instead so the portaled dialogs match that card, with a transparent
 * (undimmed) overlay like the shell's scrim-free backdrop:
 *   - 'top'          — floating card presentation: top-offset, card-width dialog.
 *   - 'bottom-sheet' — drawer presentation (narrow viewports): full-width sheet
 *     pinned to the bottom edge, height sized to content, sliding up from the
 *     bottom on open. Overrides the dialogs' own mobile full-screen sizing,
 *     which is meant for popup/standalone.
 */
export type DialogAnchor = 'center' | 'top' | 'bottom-sheet';
export const DialogAnchorContext = createContext<DialogAnchor>('center');
