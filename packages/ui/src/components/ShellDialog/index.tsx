'use client';

import { ReactNode } from 'react';
import { DefaultDialog } from '../DefaultDialog';
import { DialogShell } from '../DialogShell';

export interface ShellDialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * When false, outside-click / ESC can't close the dialog (e.g. while a passkey
   * ceremony is running). Defaults to true.
   */
  dismissable?: boolean;
  /** Animated halo behind the card edge (dark mode only). Defaults to on. */
  halo?: boolean;
  /** Extra classes for the shell card (e.g. a taller min-height). */
  contentClassName?: string;
  children: ReactNode;
}

/**
 * The revamped modal: Radix modal mechanics (DefaultDialog) hosting the visual
 * DialogShell card. This encapsulates two things every revamped dialog otherwise
 * repeated by hand:
 *
 *  1. Making DefaultDialog chromeless (transparent, no border/shadow/padding) so
 *     the DialogShell card IS the visible surface — one place, not copy-pasted.
 *  2. Making the shell the SINGLE scroll owner: DefaultDialog's Radix content is
 *     forced `overflow: visible` + `maxHeight: none`, so it never adds its own
 *     scrollbar (its default `max-h-[calc(100vh-2rem)]` otherwise scrolls inside a
 *     short popup window). The shell's own `max-h-[min(…,90dvh)]` handles viewport
 *     fit and owns the only scrollbar.
 */
export function ShellDialog({
  open,
  onOpenChange,
  dismissable = true,
  halo,
  contentClassName,
  children,
}: ShellDialogProps) {
  return (
    <DefaultDialog
      open={open}
      onOpenChange={dismissable ? onOpenChange : undefined}
      contentStyle={{
        width: 'fit-content',
        background: 'transparent',
        border: 'none',
        boxShadow: 'none',
        overflow: 'visible',
        maxHeight: 'none',
      }}
      innerStyle={{ padding: 0, overflow: 'visible' }}
    >
      <DialogShell halo={halo} contentClassName={contentClassName}>
        {children}
      </DialogShell>
    </DefaultDialog>
  );
}
