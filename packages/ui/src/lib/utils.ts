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
 * EmbeddedShell) can't reposition them by wrapping — it provides 'top' here
 * instead so the portaled dialogs match that card: anchored to the top and
 * with a transparent (undimmed) overlay, like the shell's scrim-free backdrop.
 */
export type DialogAnchor = 'center' | 'top';
export const DialogAnchorContext = createContext<DialogAnchor>('center');
