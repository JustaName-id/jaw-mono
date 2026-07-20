'use client';

import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';

import { DialogAnchorContext } from '@jaw.id/ui';

import type { PopupCommunicator } from '../../lib/popup-communicator';
import {
  EMBEDDED_BREAKPOINT_PX,
  WEBAUTHN_IFRAME_UNSUPPORTED_EVENT,
  type EmbeddedPresentation,
} from '../../lib/embedded-ui';
import { EnsureVisibility } from '../EnsureVisibility';

export interface EmbeddedShellProps {
  communicator: PopupCommunicator;
  children: ReactNode;
}

/**
 * Presentation shell for embedded (iframe) mode.
 *
 * The host SDK keeps the dialog backdrop transparent and the embedded chrome
 * is see-through too: this shell draws NO dimming scrim, so the host dApp
 * shows through around the card. The full-viewport iframe still captures
 * pointer events, so a click on the empty area (outside the card) dismisses
 * the flow via DialogClose — the host hides the dialog and the dApp is
 * interactive again. The app lays out as a bottom drawer (≤460px) or a
 * centered floating dialog. The host never shows an unstyled frame because the
 * SDK keeps the iframe hidden until reveal gating fires (ready && visible). It
 * also owns the iframe escape hatches:
 * EnsureVisibility (clickjacking guard) and the WebAuthn-unsupported event
 * (Bitwarden/Firefox, Safari create()) — both switch the flow to a popup.
 *
 * In popup/standalone contexts it renders children unchanged.
 */
export function EmbeddedShell({ communicator, children }: EmbeddedShellProps) {
  const embedded = communicator.getContext() === 'embedded';
  const [presentation, setPresentation] = useState<EmbeddedPresentation>('floating');
  // Context detection needs `window` (opener/parent), so the server always
  // renders the plain children. Gate the shell to post-mount so the first
  // client render matches the SSR output (avoids a hydration mismatch);
  // the shell appears in the effect pass that follows.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!embedded) return;
    const query = window.matchMedia(`(max-width: ${EMBEDDED_BREAKPOINT_PX}px)`);
    // Drive presentation off the media query result itself (`matches`), not a
    // separate window.innerWidth read — the two can disagree on mobile.
    const update = (matches: boolean) => setPresentation(matches ? 'drawer' : 'floating');
    update(query.matches);
    const onChange = (event: MediaQueryListEvent) => update(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [embedded]);

  // Passkey creation failed because this browser/extension cannot
  // create credentials inside a cross-origin iframe — continue in a popup.
  useEffect(() => {
    if (!embedded) return;
    const onUnsupported = () => communicator.requestSwitchToPopup('webauthn-unsupported');
    window.addEventListener(WEBAUTHN_IFRAME_UNSUPPORTED_EVENT, onUnsupported);
    return () => window.removeEventListener(WEBAUTHN_IFRAME_UNSUPPORTED_EVENT, onUnsupported);
  }, [embedded, communicator]);

  // Active only after mount in an embedded context. The wrapper structure is
  // CONSTANT across this transition: when inactive the wrappers use
  // `display: contents` so they have no visual/layout effect (popup,
  // standalone, SSR and the first client render all look like plain
  // children). Toggling `active` only changes classNames — children never
  // change tree position, so they are never remounted (they hold the keys
  // session/crypto state, which a remount would reset and break the connect).
  const active = embedded && mounted;

  // Anchored to the TOP of the viewport (like Porto's dialog) rather than
  // centered/bottom, so it appears near where the user's attention is.
  const card =
    presentation === 'drawer'
      ? // Mobile: full-width sheet at the top.
        `fixed inset-x-0 top-0 max-h-[85vh] rounded-b-2xl`
      : // Desktop: floating card near the top, centered horizontally.
        `fixed left-1/2 top-6 w-[450px] max-w-[calc(100vw-2rem)] max-h-[85vh] -translate-x-1/2 rounded-2xl`;

  // Click on the empty area (the overlay itself, not the card) dismisses the
  // flow. requestClose('cancelled') makes the SDK reject the pending request
  // and hide the dialog, handing control back to the dApp underneath.
  const onOverlayClick = active
    ? (event: MouseEvent) => {
        if (event.target === event.currentTarget) communicator.requestClose('cancelled');
      }
    : undefined;

  return (
    // The Radix-based modals (Connect, Transaction, …) portal to document.body,
    // escaping this card and Radix-centering at 50% by default. Anchor them via
    // context so they line up with the card's inline screens; the same context
    // makes their overlay transparent, matching this shell's scrim-free
    // backdrop. 'top' matches the floating card; 'top-sheet' matches the
    // drawer card (full-width, top-pinned, content-sized) and suppresses the
    // dialogs' own mobile full-screen sizing, which is meant for
    // popup/standalone contexts.
    <DialogAnchorContext.Provider value={active ? (presentation === 'floating' ? 'top' : 'top-sheet') : 'center'}>
      <div
        className={
          // Transparent (no scrim): the dApp shows through around the card.
          active ? 'fixed inset-0 z-50' : 'contents'
        }
        onClick={onOverlayClick}
      >
        {/* [&_.min-h-screen]:min-h-0 — existing screens center with min-h-screen,
            which must not stretch the card to the full viewport */}
        <div
          role={active ? 'document' : undefined}
          className={
            active
              ? // Screens that bring their own DialogShell card (the revamped design)
                // get no extra chrome — the shell IS the card. Legacy screens keep
                // the classic card look until they migrate.
                `bg-background overflow-y-auto shadow-xl has-[[data-jaw-shell]]:bg-transparent has-[[data-jaw-shell]]:shadow-none [&_.min-h-screen]:min-h-0 ${card}`
              : 'contents'
          }
        >
          <EnsureVisibility communicator={communicator} active={active}>
            {children}
          </EnsureVisibility>
        </div>
      </div>
    </DialogAnchorContext.Provider>
  );
}
