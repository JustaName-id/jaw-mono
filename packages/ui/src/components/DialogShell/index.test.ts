// @vitest-environment jsdom
// Regression cover for the shell frame's width on narrow viewports: the card
// is 400px wide, so on phones narrower than that (375–390px iPhones) it must
// shrink to the container instead of overflowing — an overflowing card defeats
// mx-auto centering and pins to the left edge, spilling off the right side of
// the embedded bottom sheet.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { DialogShell } from './index';

function render(): { frame: HTMLElement; card: HTMLElement } {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(createElement(DialogShell, null, 'content'));
  const frame = host.querySelector('[data-jaw-shell]') as HTMLElement;
  const card = frame.querySelector('.jaw-scroll') as HTMLElement;
  return { frame, card };
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
});
