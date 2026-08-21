'use client';

import { useEffect } from 'react';

// Pins the CrossPlatform keys.jaw.id dialog (a top-layer <dialog data-jaw>
// appended to document.body by @jaw.id/core's iframe transport) onto the given
// element's on-screen rectangle. There is no container API in core, so the
// demo publishes the rect as CSS variables and globals.css restyles the dialog
// with !important overrides. The iframe itself must never sit under a CSS
// transform (keys' visibility guard treats transformed frames as occluded),
// which is why we move the dialog to the rect instead of putting it inside the
// scaled phone DOM.
//
// While the dialog is open the rect is tracked with an animation-frame loop
// rather than resize/scroll listeners: the phone also moves when the page
// reflows with no such event (accordion fold animations, font loading, sticky
// repositioning), which left the dialog pinned to a stale position. The loop
// forces a layout every frame, so it only runs while `active` — with the
// dialog closed a one-shot measure is enough, and the loop restarts (with a
// fresh measure) the moment it opens again.
export function useDialogEmbed(target: HTMLElement | null, radius: number, active: boolean) {
  useEffect(() => {
    if (!target) return;
    const root = document.documentElement;
    // Overshoot the screen rect slightly: subpixel disagreement between the
    // dialog's rounded clip and the screen's curve would otherwise leave a
    // bright sliver of app peeking out at the corners. The overpaint lands on
    // the near-black bezel, where it is invisible.
    const PAD = radius > 0 ? 3 : 0;
    let last = '';
    let raf = 0;
    // A hidden target (display:none, e.g. the desktop phone during the
    // pre-hydration frame on mobile) measures 0x0 — never pin the dialog to a
    // collapsed rect; report failure so the caller can retry next frame.
    const measure = () => {
      const r = target.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
      const key = `${r.top},${r.left},${r.width},${r.height}`;
      if (key !== last) {
        last = key;
        root.style.setProperty('--jaw-embed-top', `${r.top - PAD}px`);
        root.style.setProperty('--jaw-embed-left', `${r.left - PAD}px`);
        root.style.setProperty('--jaw-embed-w', `${r.width + PAD * 2}px`);
        root.style.setProperty('--jaw-embed-h', `${r.height + PAD * 2}px`);
        root.style.setProperty('--jaw-embed-radius', `${radius + PAD}px`);
      }
      return true;
    };
    const tick = () => {
      const measured = measure();
      // Closed dialog: stop as soon as one good measurement landed.
      if (active || !measured) raf = requestAnimationFrame(tick);
    };
    root.classList.add('jaw-embed-active');
    tick();
    return () => {
      cancelAnimationFrame(raf);
      root.classList.remove('jaw-embed-active');
      for (const v of ['top', 'left', 'w', 'h', 'radius']) {
        root.style.removeProperty(`--jaw-embed-${v}`);
      }
    };
  }, [target, radius, active]);
}
