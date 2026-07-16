// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { act, useContext } from 'react';

import { DefaultDialog, DialogAnchorContext, useDialogMobileFullScreen } from '@jaw.id/ui';

import { EmbeddedShell } from './index';
import type { PopupCommunicator, CommunicatorContext } from '../../lib/popup-communicator';

function mockCommunicator(context: CommunicatorContext): PopupCommunicator {
  return {
    getContext: () => context,
    requestSwitchToPopup: () => undefined,
  } as unknown as PopupCommunicator;
}

const child = <main data-testid="child">app content</main>;

describe('EmbeddedShell', () => {
  it('renders children passthrough in standalone context', () => {
    const html = renderToStaticMarkup(
      <EmbeddedShell communicator={mockCommunicator('standalone')}>{child}</EmbeddedShell>
    );
    expect(html).toContain('app content');
    // No modal chrome in standalone
    expect(html).not.toContain('bg-black/40');
  });

  it('hydration safety: the first (pre-mount) render in an embedded context shows no modal chrome', () => {
    // SSR / first client render has mounted=false (effects have not run), so
    // the shell must NOT yet render the active backdrop/card — server output
    // must match the client's first paint, or React reparents children and
    // remounts them (the bug this guards against). Children stay in place.
    const html = renderToStaticMarkup(
      <EmbeddedShell communicator={mockCommunicator('embedded')}>{child}</EmbeddedShell>
    );
    expect(html).toContain('app content');
    expect(html).not.toContain('bg-black/40');
    expect(html).not.toContain('fixed inset-0 z-50');
  });

  it('keeps a constant wrapper structure (display:contents) so children never reparent', () => {
    // Inactive render uses `contents` wrappers (no layout/visual effect) rather
    // than a different tree, so the active transition only swaps classNames.
    const html = renderToStaticMarkup(
      <EmbeddedShell communicator={mockCommunicator('embedded')}>{child}</EmbeddedShell>
    );
    expect(html).toContain('class="contents"');
  });
});

// The portaled Radix dialogs must match the shell's card in BOTH presentations:
// floating (desktop) anchors them at the top ('top'), and the drawer (narrow
// viewports) renders them as a full-width, content-sized top sheet
// ('top-sheet') instead of the mobile full-screen style they use in
// popup/standalone contexts. jsdom mounts here so the post-mount effect pass
// (context detection + presentation media query) actually runs.
describe('EmbeddedShell — dialog anchor and drawer sheet presentation', () => {
  let container: HTMLDivElement;
  let root: Root;

  /**
   * matchMedia stub answering `(max-width: Npx)` queries for a given viewport
   * width — both the shell's drawer query (460px) and the dialogs'
   * useIsMobile query (767px) resolve against the same width, so tests can
   * exercise the band where the two breakpoints disagree.
   */
  const stubViewport = (width: number) => {
    vi.stubGlobal('matchMedia', (query: string) => {
      const max = /\(max-width:\s*(\d+(?:\.\d+)?)px\)/.exec(query);
      return {
        matches: max ? width <= Number(max[1]) : false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      } as unknown as MediaQueryList;
    });
  };

  const AnchorProbe = () => {
    const anchor = useContext(DialogAnchorContext);
    return <span data-testid="anchor-probe">anchor:{anchor}</span>;
  };

  const mount = (node: React.ReactNode) => {
    act(() => {
      root.render(<EmbeddedShell communicator={mockCommunicator('embedded')}>{node}</EmbeddedShell>);
    });
  };

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

  it('provides the top anchor in floating presentation', () => {
    stubViewport(1024);
    mount(<AnchorProbe />);
    expect(container.innerHTML).toContain('anchor:top<');
  });

  it('provides the top-sheet anchor in drawer presentation', () => {
    stubViewport(400);
    mount(<AnchorProbe />);
    expect(container.innerHTML).toContain('anchor:top-sheet');
  });

  it('drawer: a portaled dialog renders as a content-sized top sheet, overriding mobile full-screen sizing', () => {
    stubViewport(400);
    // contentStyle mirrors what the signing dialogs pass on mobile — the exact
    // inline sizing the sheet presentation must neutralize.
    mount(
      <DefaultDialog open contentStyle={{ width: '100%', height: '100%', maxWidth: 'none', maxHeight: 'none' }}>
        <div>sheet content</div>
      </DefaultDialog>
    );
    const content = document.body.querySelector('[data-slot="dialog-content"]') as HTMLElement;
    expect(content).not.toBeNull();
    // Content-sized height capped at the card's 85vh — not the viewport-filling
    // height:100%/maxHeight:none the dialog asked for.
    expect(content.style.height).toBe('auto');
    expect(content.style.maxHeight).toBe('85vh');
    // Full-width sheet pinned to the top edge, like the shell's drawer card.
    expect(content.style.width).toBe('100%');
    expect(content.className).toContain('top-0');
    expect(content.className).toContain('rounded-b-2xl');
  });

  it('floating: a portaled dialog keeps its own sizing and anchors at the top offset', () => {
    stubViewport(1024);
    mount(
      <DefaultDialog open contentStyle={{ width: '450px', minWidth: '450px' }}>
        <div>card content</div>
      </DefaultDialog>
    );
    const content = document.body.querySelector('[data-slot="dialog-content"]') as HTMLElement;
    expect(content).not.toBeNull();
    expect(content.style.width).toBe('450px');
    expect(content.className).toContain('top-6');
  });

  // The shell's drawer breakpoint (460px) is narrower than the dialogs'
  // useIsMobile breakpoint (768px). In the band between them the shell shows
  // the floating card, so the dialogs must NOT apply their mobile full-screen
  // sizing (it is meant for popup/standalone) — otherwise they would span the
  // full width at a top offset and overflow the viewport.
  it('460–767px band: dialogs suppress mobile full-screen sizing inside the floating shell, keep it outside', () => {
    stubViewport(600);
    const FullScreenProbe = () => <span>fullscreen:{String(useDialogMobileFullScreen())}</span>;
    mount(<FullScreenProbe />);
    expect(container.innerHTML).toContain('fullscreen:false');
    // Same viewport in a popup/standalone context (no shell → default 'center'
    // anchor): the mobile full-screen sizing stays in effect.
    act(() => {
      root.render(<FullScreenProbe />);
    });
    expect(container.innerHTML).toContain('fullscreen:true');
  });
});
