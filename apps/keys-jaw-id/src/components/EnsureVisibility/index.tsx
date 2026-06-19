'use client';

import { useEffect, useState, type ReactNode } from 'react';

import type { PopupCommunicator } from '../../lib/popup-communicator';
import { isOccluded, supportsIOv2, type VisibilityEntry } from '../../lib/embedded-ui';

export interface EnsureVisibilityProps {
  communicator: PopupCommunicator;
  /** Whether the embedded shell is active (embedded context + mounted). */
  active: boolean;
  children: ReactNode;
}

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
  const [occluded, setOccluded] = useState(false);
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

    const observer = new IntersectionObserver(
      (entries) => {
        const last = entries[entries.length - 1];
        if (last) setOccluded(isOccluded(last as unknown as VisibilityEntry));
      },
      // trackVisibility/delay are IOv2 fields, missing from the TS dom lib
      { threshold: [0.99], trackVisibility: true, delay: 100 } as IntersectionObserverInit
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [guardActive]);

  return (
    <div className={guardActive ? undefined : 'contents'}>
      <div
        className={
          !guardActive
            ? 'contents'
            : occluded
              ? 'pointer-events-none opacity-40 transition-opacity'
              : 'transition-opacity'
        }
        aria-hidden={guardActive && occluded ? true : undefined}
      >
        {children}
      </div>
      {guardActive && occluded && (
        <div className="border-border border-t px-4 py-2">
          <p className="text-destructive text-xs">
            This window appears to be covered. Interactions are disabled for your safety.
          </p>
        </div>
      )}
    </div>
  );
}
