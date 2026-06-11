'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { PopupCommunicator } from '../../lib/popup-communicator';
import { isOccluded, supportsIOv2, type VisibilityEntry } from '../../lib/embedded-ui';

export interface EnsureVisibilityProps {
  communicator: PopupCommunicator;
  children: ReactNode;
}

/**
 * Clickjacking guard for the embedded dialog (AC-4, AC-11).
 *
 * Runs IntersectionObserver v2 *inside* the iframe: when the dialog is
 * occluded, transformed or faded by the embedding page, interactions are
 * disabled and the user is offered an escape to a popup. The escape hatch
 * ("Continue in new window") is always available, occluded or not.
 *
 * Renders children untouched outside the embedded context.
 */
export function EnsureVisibility({ communicator, children }: EnsureVisibilityProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [occluded, setOccluded] = useState(false);
  const embedded = communicator.getContext() === 'embedded';

  useEffect(() => {
    const container = containerRef.current;
    if (!embedded || !supportsIOv2() || !container) return;

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
  }, [embedded]);

  if (!embedded) {
    return <>{children}</>;
  }

  return (
    <div ref={containerRef}>
      <div
        className={occluded ? 'pointer-events-none opacity-40 transition-opacity' : 'transition-opacity'}
        aria-hidden={occluded}
      >
        {children}
      </div>
      <div className="border-border flex items-center justify-between gap-3 border-t px-4 py-2">
        {occluded ? (
          <p className="text-destructive text-xs">
            This window appears to be covered. Interactions are disabled for your safety.
          </p>
        ) : (
          <span aria-hidden="true" />
        )}
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground shrink-0 text-xs underline underline-offset-2"
          onClick={() => communicator.requestSwitchToPopup(occluded ? 'visibility' : 'user')}
        >
          Continue in new window
        </button>
      </div>
    </div>
  );
}
