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
// The rect is tracked with an animation-frame loop rather than resize/scroll
// listeners: the phone also moves when the page reflows with no such event
// (accordion fold animations, font loading, sticky repositioning), which left
// the dialog pinned to a stale position.
export function useDialogEmbed(target: HTMLElement | null, radius: number) {
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
    const tick = () => {
      const r = target.getBoundingClientRect();
      const key = `${r.top},${r.left},${r.width},${r.height}`;
      if (key !== last) {
        last = key;
        root.style.setProperty('--jaw-embed-top', `${r.top - PAD}px`);
        root.style.setProperty('--jaw-embed-left', `${r.left - PAD}px`);
        root.style.setProperty('--jaw-embed-w', `${r.width + PAD * 2}px`);
        root.style.setProperty('--jaw-embed-h', `${r.height + PAD * 2}px`);
        root.style.setProperty('--jaw-embed-radius', `${radius + PAD}px`);
      }
      raf = requestAnimationFrame(tick);
    };
    root.classList.add('jaw-embed-active');
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      root.classList.remove('jaw-embed-active');
    };
  }, [target, radius]);
}
