import { clsx, type ClassValue } from 'clsx';
import { createContext } from 'react';
import { twMerge } from 'tailwind-merge';

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
 * so a host that lays out its inline screens in a top-anchored card (keys'
 * EmbeddedShell) can't reposition them by wrapping — it provides an anchor
 * here instead so the portaled dialogs match that card, with a transparent
 * (undimmed) overlay like the shell's scrim-free backdrop:
 *   - 'top'       — floating card presentation: top-offset, card-width dialog.
 *   - 'top-sheet' — drawer presentation (narrow viewports): full-width sheet
 *     pinned to the top edge, height sized to content. Overrides the dialogs'
 *     own mobile full-screen sizing, which is meant for popup/standalone.
 */
export type DialogAnchor = 'center' | 'top' | 'top-sheet';
export const DialogAnchorContext = createContext<DialogAnchor>('center');
