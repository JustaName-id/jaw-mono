'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { PopupCommunicator } from '../../lib/popup-communicator';
import { isOccluded, supportsIOv2, type VisibilityEntry } from '../../lib/embedded-ui';

export interface EnsureVisibilityProps {
  communicator: PopupCommunicator;
  /** Whether the embedded shell is active (embedded context + mounted). */
  active: boolean;
  children: ReactNode;
}

/**
 * How long a "covered" reading must persist before the warning UI (fade +
 * banner) is shown.
 *
 * The iframe stays mounted across flows and IOv2 runs with `delay:100`, so
 * EVERY reveal — the cold connect screen and every warm request after it —
 * produces a brief transient: for ~one observer cycle the root reports
 * isIntersecting:true but isVisible:false, because IOv2 won't certify the
 * dialog as visible until it has been stably visible for `delay`. Surfacing the
 * banner on that transient flashes "This window appears to be covered" as each
 * screen appears. A confirm window longer than one cycle debounces the blip
 * away; a real host overlay outlasts it and still trips the guard. Interaction
 * neutralization (pointer-events) is NOT delayed — it tracks the raw reading so
 * the guard stays fail-closed throughout the window.
 */
const COVER_CONFIRM_MS = 300;

/**
 * Clickjacking guard for the embedded dialog.
 *
 * Runs IntersectionObserver v2 *inside* the iframe: when the dialog is
 * occluded, transformed or faded by the embedding page, interactions are
 * disabled (pointer-events removed, content faded and aria-hidden). There is
 * no persistent escape-hatch footer — the guard purely neutralizes the
 * occluded dialog rather than offering a manual switch to a popup.
 *
 * The wrapper structure is constant: when inactive the containers use
 * `display: contents` (no visual/layout effect) and the footer is absent, so
 * children never change tree position — toggling `active` must not remount
 * them (the children hold the keys session/crypto state).
 */
export function EnsureVisibility({ communicator, active, children }: EnsureVisibilityProps) {
  // Raw reading — drives interaction neutralization immediately (fail-closed).
  const [occluded, setOccluded] = useState(false);
  // Sustained-cover signal — drives the *visible* warning (fade + banner).
  // Gated so the per-reveal transient doesn't flash it; see COVER_CONFIRM_MS.
  const [covered, setCovered] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guardActive = active && communicator.getContext() === 'embedded';

  useEffect(() => {
    if (!guardActive || !supportsIOv2()) return;
    // Observe the iframe ROOT, not an inner wrapper. Dialog screens (Connect,
    // Signature, Permission, …) render through a Radix Portal to document.body
    // with position:fixed, so any inner wrapper around `children` collapses to
    // zero height and IOv2 reports a zero-area element as isVisible:false (a
    // permanent false "covered" warning). The root always contains the visible
    // UI as descendants — and descendants never self-occlude in IOv2 — so this
    // reflects only HOST occlusion, which is exactly what the guard detects.
    // global.css gives html.jaw-embedded min-height:100vh so the root is never
    // zero-area on a screen whose content is entirely fixed/portaled.
    const container = document.documentElement;

    const clearConfirm = () => {
      if (confirmTimer.current) {
        clearTimeout(confirmTimer.current);
        confirmTimer.current = null;
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const last = entries[entries.length - 1];
        if (!last) return;
        const entry = last as unknown as VisibilityEntry;

        setOccluded(isOccluded(entry));

        // The visible warning is reserved for a genuine *cover*: the dialog is
        // on-screen (isIntersecting) yet not visible (isVisible:false) — a host
        // overlay, transform or fade. Two readings look "occluded" but are NOT
        // a cover and must not flash the banner:
        //  - Hidden between flows: the host closes the <dialog> (display:none),
        //    so isIntersecting is false — the dialog isn't covered, it's simply
        //    off-screen.
        //  - The reveal transient: for ~one IOv2 cycle after the dialog
        //    re-appears, isIntersecting is true but isVisible is still false
        //    until `delay:100` certifies it.
        // Require the cover to persist past COVER_CONFIRM_MS so the transient
        // self-clears first; a real overlay outlasts it.
        const covering = entry.isIntersecting && entry.isVisible !== true;
        if (covering) {
          if (!confirmTimer.current) {
            confirmTimer.current = setTimeout(() => {
              confirmTimer.current = null;
              setCovered(true);
            }, COVER_CONFIRM_MS);
          }
        } else {
          clearConfirm();
          setCovered(false);
        }
      },
      // trackVisibility/delay are IOv2 fields, missing from the TS dom lib
      { threshold: [0.99], trackVisibility: true, delay: 100 } as IntersectionObserverInit
    );
    observer.observe(container);
    return () => {
      observer.disconnect();
      clearConfirm();
      // Drop any stale occlusion state when the guard deactivates so a later
      // reactivation starts clean (no restriction) until the first reading.
      setOccluded(false);
      setCovered(false);
    };
  }, [guardActive]);

  return (
    <div className={guardActive ? undefined : 'contents'}>
      <div
        className={
          !guardActive
            ? 'contents'
            : occluded
              ? // Neutralize interactions immediately on the raw reading
                // (fail-closed); only fade once the cover is confirmed.
                `pointer-events-none transition-opacity ${covered ? 'opacity-40' : ''}`
              : 'transition-opacity'
        }
        aria-hidden={guardActive && covered ? true : undefined}
      >
        {children}
      </div>
      {guardActive && covered && (
        <div className="border-border border-t px-4 py-2">
          <p className="text-destructive text-xs">
            This window appears to be covered. Interactions are disabled for your safety.
          </p>
        </div>
      )}
    </div>
  );
}
