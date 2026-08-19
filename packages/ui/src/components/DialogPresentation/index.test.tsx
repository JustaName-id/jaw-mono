// @vitest-environment jsdom
// The app-specific handler has no host shell to pick a presentation for it (the
// iframe has EmbeddedShell), so it provides the anchor itself off the viewport:
// bottom sheet on phones, centered card everywhere else.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, useContext } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

import { DialogAnchorContext, SHEET_BREAKPOINT_PX } from '../../lib/utils';
import { ResponsiveDialogAnchor } from './index';

/** matchMedia stub answering `(max-width: Npx)` for a given viewport width. */
function stubViewport(width: number, listeners?: Set<(event: MediaQueryListEvent) => void>) {
  vi.stubGlobal('matchMedia', (query: string) => {
    const max = /\(max-width:\s*(\d+(?:\.\d+)?)px\)/.exec(query);
    return {
      matches: max ? width <= Number(max[1]) : false,
      media: query,
      addEventListener: (_: string, callback: (event: MediaQueryListEvent) => void) => listeners?.add(callback),
      removeEventListener: (_: string, callback: (event: MediaQueryListEvent) => void) => listeners?.delete(callback),
    } as unknown as MediaQueryList;
  });
}

const AnchorProbe = () => <span>anchor:{useContext(DialogAnchorContext)}</span>;

describe('ResponsiveDialogAnchor', () => {
  let container: HTMLDivElement;
  let root: Root;

  const mount = () =>
    act(() => {
      root.render(
        <ResponsiveDialogAnchor>
          <AnchorProbe />
        </ResponsiveDialogAnchor>
      );
    });

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      root = createRoot(container);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('provides the bottom-sheet anchor on a phone viewport', () => {
    stubViewport(400);
    mount();
    expect(container.innerHTML).toContain('anchor:bottom-sheet');
  });

  it('provides the center anchor above the breakpoint, keeping the desktop card', () => {
    stubViewport(1024);
    mount();
    expect(container.innerHTML).toContain('anchor:center');
  });

  it('treats the breakpoint itself as a sheet viewport, and one pixel wider as a card', () => {
    // Rendered fresh on each side rather than re-rendered: the presentation is
    // read from the media query, not from a prop, so a re-render of a mounted
    // provider would keep the state it mounted with.
    stubViewport(SHEET_BREAKPOINT_PX);
    expect(renderToStaticMarkup(<ResponsiveDialogAnchor children={<AnchorProbe />} />)).toContain(
      'anchor:bottom-sheet'
    );

    stubViewport(SHEET_BREAKPOINT_PX + 1);
    expect(renderToStaticMarkup(<ResponsiveDialogAnchor children={<AnchorProbe />} />)).toContain('anchor:center');
  });

  it('follows the viewport across a rotation', () => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    stubViewport(400, listeners);
    mount();
    expect(container.innerHTML).toContain('anchor:bottom-sheet');

    act(() => listeners.forEach((notify) => notify({ matches: false } as MediaQueryListEvent)));
    expect(container.innerHTML).toContain('anchor:center');
  });

  it('reads the viewport on the FIRST render, before effects run', () => {
    // A post-mount read would open the dialog as a centered card and jump it to
    // the bottom edge a frame later — and Radix would have already started the
    // centered zoom-in animation rather than the sheet's slide-up.
    stubViewport(400);
    expect(renderToStaticMarkup(<ResponsiveDialogAnchor children={<AnchorProbe />} />)).toContain(
      'anchor:bottom-sheet'
    );
  });

  it('falls back to the centered card where matchMedia is unavailable', () => {
    // Server rendering and old environments: the card presentation is the safe
    // default — it is viewport-independent, the sheet is not.
    //
    // MOUNTED, not renderToStaticMarkup: that renders to a string and never
    // runs effects, so it passes whatever the subscribe effect does. The
    // fallback has to survive the effect too — an unguarded matchMedia call
    // there throws on commit, and under ReactUIHandler's DialogErrorBoundary
    // that rejects the wallet request instead of showing the card.
    vi.stubGlobal('matchMedia', undefined);
    mount();
    expect(container.innerHTML).toContain('anchor:center');
  });
});
