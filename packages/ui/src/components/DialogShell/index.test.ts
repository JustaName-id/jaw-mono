// @vitest-environment jsdom
// Regression cover for the shell frame's width on narrow viewports: the card
// is 400px wide, so on phones narrower than that (375–390px iPhones) it must
// shrink to the container instead of overflowing — an overflowing card defeats
// mx-auto centering and pins to the left edge, spilling off the right side of
// the embedded bottom sheet.
//
// Plus the sheet presentation ('bottom-sheet' anchor): the same card must stop
// being a card and become the sheet, or it renders as the desktop dialog merely
// pinned to the bottom edge.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { DialogAnchorContext, type DialogAnchor } from '../../lib/utils';
import { DialogShell } from './index';

function render(
  anchor: DialogAnchor = 'center',
  contentClassName?: string
): {
  frame: HTMLElement;
  card: HTMLElement;
  grabber: HTMLElement | null;
  halo: HTMLElement | null;
} {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    createElement(
      DialogAnchorContext.Provider,
      { value: anchor },
      createElement(DialogShell, { contentClassName }, 'content')
    )
  );
  const frame = host.querySelector('[data-jaw-shell]') as HTMLElement;
  const card = frame.querySelector('.jaw-scroll') as HTMLElement;
  return {
    frame,
    card,
    grabber: frame.querySelector('[data-jaw-grabber]'),
    halo: frame.querySelector('.jaw-halo-ring'),
  };
}

describe('DialogShell', () => {
  it('clamps the fit-content frame to its container so the 400px card can shrink on narrow viewports', () => {
    const { frame } = render();
    // w-fit alone sizes the frame to the card's 400px preferred width, which
    // breaks the inner card's max-w-full clamp (100% of an unclamped
    // fit-content frame is still 400px). The frame itself must carry the
    // container clamp.
    expect(frame.className).toContain('w-fit');
    expect(frame.className).toContain('max-w-full');
  });

  it('keeps the card at its 400px design width, shrinkable via max-w-full', () => {
    const { card } = render();
    expect(card.className).toContain('w-[400px]');
    expect(card.className).toContain('max-w-full');
  });

  it('renders the card presentation for the top anchor, same as center', () => {
    // The floating embedded card is the desktop card — only the drawer differs.
    expect(render('top').card.className).toBe(render('center').card.className);
    expect(render('top').frame.className).toBe(render('center').frame.className);
  });

  describe('sheet presentation (bottom-sheet anchor)', () => {
    it('goes full-bleed instead of a centered 400px card', () => {
      const { frame, card } = render('bottom-sheet');
      expect(frame.className).toContain('w-full');
      expect(frame.className).not.toContain('w-fit');
      expect(frame.className).not.toContain('mx-auto');
      expect(card.className).toContain('w-full');
      expect(card.className).not.toContain('w-[400px]');
    });

    it('rounds only its top corners and draws only a top edge', () => {
      const { frame, card } = render('bottom-sheet');
      expect(frame.className).toContain('rounded-t-card');
      expect(frame.className).not.toContain('rounded-card');
      // The ring pads the top only — the other three edges are offscreen.
      expect(frame.className).toContain('pt-[1.5px]');
      expect(frame.className).not.toContain('p-[1.5px]');
      expect(card.className).toContain('rounded-t-card');
      expect(card.className).not.toContain('rounded-card');
      expect(card.className).toContain('border-t');
    });

    it('drops the shadow and the halo, which need an all-around edge to read', () => {
      const { card, halo } = render('bottom-sheet');
      expect(card.className).not.toContain('shadow-xl');
      expect(halo).toBeNull();
      // Still present in the card presentation (dark-mode gated there).
      expect(render('center').halo).not.toBeNull();
    });

    it('caps height at 85dvh so a strip of the host dApp stays visible above', () => {
      expect(render('bottom-sheet').card.className).toContain('max-h-[85dvh]');
      expect(render('center').card.className).toContain('max-h-[min(550px,90dvh)]');
    });

    it('drops the caller min height, which would otherwise cancel that cap', () => {
      // All five dialogs pass a desktop min height through contentClassName, and
      // min-height beats max-height in CSS: without this the sheet is 510px tall
      // whatever the cap says, so on a short viewport it grows past the top of
      // the screen — unreachable, since nothing above it scrolls.
      const { card } = render('bottom-sheet', 'min-h-[510px]');
      expect(card.className).toContain('min-h-0');
      expect(card.className).not.toContain('min-h-[510px]');
      expect(card.className).not.toContain('min-h-[234px]');
      expect(card.className).toContain('max-h-[85dvh]');
      // The desktop card still honours it — that is where the fixed height is
      // the design.
      expect(render('center', 'min-h-[510px]').card.className).toContain('min-h-[510px]');
    });

    it('applies the home-bar inset inside its own surface, so the sheet background runs under it', () => {
      // Padding rather than an outer margin: the sheet must not float above the
      // iOS home bar leaving a band of dApp behind it. EmbeddedShell and
      // DefaultDialog both stand down (has-[[data-jaw-shell]]:pb-0 /
      // paddingBottom: 0) so this is the only inset applied.
      expect(render('bottom-sheet').card.className).toContain('pb-[env(safe-area-inset-bottom)]');
      expect(render('center').card.className).not.toContain('pb-[env(safe-area-inset-bottom)]');
    });

    it('grows a grabber, sticky and hidden from assistive tech', () => {
      const { grabber } = render('bottom-sheet');
      expect(grabber).not.toBeNull();
      // Decorative: not draggable in this design, so it must not be announced.
      expect(grabber?.getAttribute('aria-hidden')).toBe('true');
      // Pinned while the card (the single scroll owner) scrolls under it.
      expect(grabber?.className).toContain('sticky');
      expect(render('center').grabber).toBeNull();
    });
  });
});
