'use client';

import { useEffect, useState, type ReactNode } from 'react';

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
 * Presentation shell for embedded (iframe) mode — AC-10.
 *
 * The host SDK keeps the dialog backdrop transparent; this shell draws the
 * visual overlay and lays the app out as a bottom drawer (≤460px) or a
 * centered floating dialog, with its own enter animation so the host never
 * shows an unstyled frame. It also owns the iframe escape hatches:
 * EnsureVisibility (clickjacking guard) and the WebAuthn-unsupported event
 * (Bitwarden/Firefox, Safari create()) — both switch the flow to a popup.
 *
 * In popup/standalone contexts it renders children unchanged.
 */
export function EmbeddedShell({ communicator, children }: EmbeddedShellProps) {
  const embedded = communicator.getContext() === 'embedded';
  const [presentation, setPresentation] = useState<EmbeddedPresentation>('floating');
  const [entered, setEntered] = useState(false);
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

  useEffect(() => {
    if (!embedded) return;
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [embedded]);

  // TASK-017: passkey creation failed because this browser/extension cannot
  // create credentials inside a cross-origin iframe — continue in a popup.
  useEffect(() => {
    if (!embedded) return;
    const onUnsupported = () => communicator.requestSwitchToPopup('webauthn-unsupported');
    window.addEventListener(WEBAUTHN_IFRAME_UNSUPPORTED_EVENT, onUnsupported);
    return () => window.removeEventListener(WEBAUTHN_IFRAME_UNSUPPORTED_EVENT, onUnsupported);
  }, [embedded, communicator]);

  if (!embedded || !mounted) {
    return <>{children}</>;
  }

  const card =
    presentation === 'drawer'
      ? `fixed inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl ${entered ? 'translate-y-0' : 'translate-y-full'}`
      : `fixed left-1/2 top-1/2 w-[400px] max-w-[calc(100vw-2rem)] max-h-[85vh] -translate-x-1/2 ${
          entered ? '-translate-y-1/2 scale-100 opacity-100' : '-translate-y-1/2 scale-95 opacity-0'
        } rounded-2xl`;

  return (
    <div
      className={`fixed inset-0 z-50 bg-black/40 transition-opacity duration-200 ${
        entered ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* [&_.min-h-screen]:min-h-0 — existing screens center with min-h-screen,
          which must not stretch the card to the full viewport */}
      <div
        role="document"
        className={`bg-background overflow-y-auto shadow-xl transition-all duration-200 [&_.min-h-screen]:min-h-0 ${card}`}
      >
        <EnsureVisibility communicator={communicator}>{children}</EnsureVisibility>
      </div>
    </div>
  );
}
