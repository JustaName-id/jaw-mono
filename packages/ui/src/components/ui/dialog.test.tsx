// @vitest-environment jsdom
// The dimming scrim and the dialog's position are independent decisions. They
// used to be one: the overlay went transparent for any non-center anchor,
// because the only thing that had ever anchored a dialog was the iframe shell,
// which draws no scrim (the host dApp shows through around the card). The
// app-specific handler renders the same sheet ON the host page, where dropping
// the scrim would leave the sheet floating over live, undimmed content.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { DialogAnchorContext, DialogScrimContext, type DialogAnchor } from '../../lib/utils';
import { DefaultDialog } from '../DefaultDialog';

describe('dialog overlay scrim', () => {
  let container: HTMLDivElement;
  let root: Root;

  const mount = (anchor: DialogAnchor, scrim?: boolean) => {
    act(() => {
      root.render(
        <DialogAnchorContext.Provider value={anchor}>
          <DialogScrimContext.Provider value={scrim ?? true}>
            <DefaultDialog open>
              <div>content</div>
            </DefaultDialog>
          </DialogScrimContext.Provider>
        </DialogAnchorContext.Provider>
      );
    });
    return {
      overlay: document.body.querySelector('[data-slot="dialog-overlay"]') as HTMLElement,
      content: document.body.querySelector('[data-slot="dialog-content"]') as HTMLElement,
    };
  };

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
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

  it('dims the page by default', () => {
    expect(mount('center').overlay.className).toContain('bg-scrim/50');
  });

  it('keeps dimming the page for a bottom sheet — the sheet does not imply a see-through backdrop', () => {
    const { overlay, content } = mount('bottom-sheet');
    expect(overlay.className).toContain('bg-scrim/50');
    expect(overlay.className).not.toContain('bg-transparent');
    // ...and it really is the sheet presentation, not an accidental center.
    expect(content.className).toContain('bottom-0');
  });

  it('swaps cleanly between the two presentations on a live dialog (rotation)', () => {
    // A phone crossing the breakpoint flips the anchor while the dialog is
    // open. The sheet's bottom inset is an inline longhand, so it must not be
    // mixed with a `padding` shorthand: React cannot remove the longhand
    // reliably then, warns about it, and can leave the inset behind.
    const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mount('bottom-sheet');
    const { content } = mount('center');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    expect(content.style.paddingBottom).toBe('0px');
  });

  it('goes see-through only where the host opts out (the iframe shell)', () => {
    const { overlay } = mount('bottom-sheet', false);
    expect(overlay.className).toContain('bg-transparent');
    expect(overlay.className).not.toContain('bg-scrim/50');
    // The opt-out is about the backdrop, not the position — still a sheet.
    expect(mount('top', false).overlay.className).toContain('bg-transparent');
  });
});
