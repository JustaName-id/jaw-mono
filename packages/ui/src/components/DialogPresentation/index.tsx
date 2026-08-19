'use client';

import { type ReactNode, useEffect, useState } from 'react';

import { DialogAnchorContext, SHEET_BREAKPOINT_PX } from '../../lib/utils';

const SHEET_MEDIA_QUERY = `(max-width: ${SHEET_BREAKPOINT_PX}px)`;

/**
 * Read synchronously so the FIRST render already knows the presentation. A
 * post-mount read would open the dialog as a centered card and jump it to the
 * bottom edge a frame later — and Radix would have started the centered
 * zoom-in rather than the sheet's slide-up. Safe here because this provider
 * mounts in a client-created root (see ReactUIHandler), so there is no server
 * render to mismatch.
 *
 * It is NOT hydration-safe in general. The server pass gets the card default,
 * but hydration re-runs this initializer on the client and answers from the
 * real viewport — so a phone would hydrate 'bottom-sheet' against
 * server-rendered 'center' and React would report a mismatch. A host that
 * server-renders this component needs to defer the first read to a mount flag
 * itself.
 */
function matchesSheetViewport(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(SHEET_MEDIA_QUERY).matches
    : false;
}

/**
 * Picks the dialog presentation from the viewport: bottom sheet on phones,
 * centered card everywhere else.
 *
 * The iframe transport gets this from its host — keys' EmbeddedShell provides
 * the anchor its own card is laid out with. App-specific mode has no such
 * shell (the dialogs ARE the whole UI, mounted straight onto the dApp's page),
 * so without this it fell through to the 'center' default at every width and
 * opened as a mid-screen modal on phones.
 *
 * Only the anchor is provided here. The scrim is deliberately left at its
 * default — unlike the iframe, this sheet renders directly on the dApp and
 * must dim it (see DialogScrimContext).
 */
export function ResponsiveDialogAnchor({ children }: { children: ReactNode }) {
  const [sheet, setSheet] = useState(matchesSheetViewport);

  useEffect(() => {
    // Guarded like the initial read above, and for the same reason: where
    // matchMedia is missing there is no viewport to follow, and the card
    // default already stands. Unguarded this throws on commit, which under
    // ReactUIHandler's DialogErrorBoundary rejects the wallet request rather
    // than degrading to the card.
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(SHEET_MEDIA_QUERY);
    // Re-read on mount: the synchronous initial read can be stale by the time
    // the effect runs (a rotation during mount), and it is skipped entirely
    // when this was server-rendered.
    setSheet(query.matches);
    const onChange = (event: MediaQueryListEvent) => setSheet(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return (
    <DialogAnchorContext.Provider value={sheet ? 'bottom-sheet' : 'center'}>{children}</DialogAnchorContext.Provider>
  );
}
