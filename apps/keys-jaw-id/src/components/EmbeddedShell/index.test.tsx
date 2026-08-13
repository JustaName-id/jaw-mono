// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { act, useContext } from 'react';

import { DefaultDialog, DialogAnchorContext, ShellDialog, useDialogMobileFullScreen } from '@jaw.id/ui';

import { EmbeddedShell } from './index';
import type { PopupCommunicator, CommunicatorContext } from '../../lib/popup-communicator';

type EmittingCommunicator = PopupCommunicator & {
  /** Test hook: deliver an SDK message to onMessage subscribers. */
  emit: (message: { event?: string; data?: unknown }) => void;
};

function mockCommunicator(context: CommunicatorContext): EmittingCommunicator {
  const subscribers = new Set<(message: { event?: string; data?: unknown }) => void>();
  return {
    getContext: () => context,
    requestSwitchToPopup: () => undefined,
    onMessage: (callback: (message: { event?: string; data?: unknown }) => void) => {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
    emit: (message: { event?: string; data?: unknown }) => subscribers.forEach((callback) => callback(message)),
  } as unknown as EmittingCommunicator;
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
// viewports) renders them as a full-width, content-sized bottom sheet
// ('bottom-sheet') instead of the mobile full-screen style they use in
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

  const mount = (node: React.ReactNode, communicator: EmittingCommunicator = mockCommunicator('embedded')) => {
    act(() => {
      root.render(<EmbeddedShell communicator={communicator}>{node}</EmbeddedShell>);
    });
    return communicator;
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

  it('provides the bottom-sheet anchor in drawer presentation', () => {
    stubViewport(400);
    mount(<AnchorProbe />);
    expect(container.innerHTML).toContain('anchor:bottom-sheet');
  });

  it('drawer: a portaled dialog renders as a content-sized bottom sheet, overriding mobile full-screen sizing', () => {
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
    // Content-sized height capped at the card's 85dvh — not the viewport-filling
    // height:100%/maxHeight:none the dialog asked for.
    expect(content.style.height).toBe('auto');
    expect(content.style.maxHeight).toBe('85dvh');
    // Full-width sheet pinned to the bottom edge, like the shell's drawer card.
    expect(content.style.width).toBe('100%');
    expect(content.className).toContain('bottom-0');
    expect(content.className).toContain('rounded-t-2xl');
    expect(content.className).not.toContain('rounded-b-2xl');
    // Slides up when it opens (Radix mounts it while the iframe is already
    // visible), sliding back down on close.
    expect(content.className).toContain('slide-in-from-bottom');
    expect(content.className).toContain('slide-out-to-bottom');
    // The sheet also gets inline `paddingBottom: env(safe-area-inset-bottom)`
    // (home-bar clearance), but jsdom's CSS parser drops env() values so it
    // cannot be asserted here; the shell card's equivalent is covered via its
    // pb-[env(safe-area-inset-bottom)] class below.
  });

  it('drawer: a revamped modal reaches the sheet presentation through the portal and owns the home-bar inset', () => {
    stubViewport(400);
    mount(
      <ShellDialog open>
        <div>shell content</div>
      </ShellDialog>
    );
    const content = document.body.querySelector('[data-slot="dialog-content"]') as HTMLElement;
    // Radix portals to document.body, but React context still flows — so the
    // shell card inside sees 'bottom-sheet' and renders as the sheet itself
    // (full-bleed, grabber) rather than a 400px card floating in a full-width
    // invisible sheet, which is what a card presentation would look like here.
    const shell = content.querySelector('[data-jaw-shell]') as HTMLElement;
    expect(shell).not.toBeNull();
    expect(shell.className).toContain('w-full');
    expect(shell.querySelector('[data-jaw-grabber]')).not.toBeNull();
    // The shell applies the safe-area inset inside its own surface, so the Radix
    // sheet stands down (0 instead of its default env(safe-area-inset-bottom))
    // — stacking both would leave two home-bar gaps.
    expect(content.style.paddingBottom).toBe('0px');
    // ShellDialog's own `width: fit-content` must still lose to the sheet.
    expect(content.style.width).toBe('100%');
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

  // The SDK mirrors its host-side show/hide flips as DialogVisibility
  // messages. The drawer card starts offscreen (translate-y-full) once
  // concealed and slides up (transition-transform → translate-y-0) on reveal,
  // so opening the wallet on mobile animates like a bottom sheet.
  describe('drawer reveal animation (DialogVisibility)', () => {
    const card = () => container.querySelector('[role="document"]') as HTMLElement;

    it('anchors the drawer card to the bottom edge with safe-area padding', () => {
      stubViewport(400);
      mount(child);
      expect(card().className).toContain('bottom-0');
      expect(card().className).toContain('rounded-t-2xl');
      expect(card().className).not.toContain('top-0');
      // iOS home-bar clearance
      expect(card().className).toContain('pb-[env(safe-area-inset-bottom)]');
    });

    it('stands down from the inset and height cap for a revamped screen, which owns them', () => {
      // A DialogShell child renders as the sheet itself and applies its own
      // safe-area inset and 85dvh cap. Keeping the wrapper's copies would stack
      // two home-bar gaps, and the wrapper cap (it is also `overflow-y-auto`)
      // would make it a second scroll container around the card's own scroller.
      stubViewport(400);
      mount(<div data-jaw-shell>revamped screen</div>);
      expect(card().className).toContain('has-[[data-jaw-shell]]:pb-0');
      expect(card().className).toContain('has-[[data-jaw-shell]]:max-h-none');
    });

    it('neutralizes the popup centering chrome an inline screen arrives wrapped in', () => {
      // page.tsx wraps the inline screens in `min-h-screen items-center
      // justify-center p-4` around a `w-full max-w-md` — popup-window chrome.
      // In a sheet the p-4 stops the edges touching the viewport (16px on the
      // left, right AND bottom) and max-w-md caps the width at 448px, which
      // bites at the 460px breakpoint. Portaled dialogs are position:fixed and
      // never see this wrapper, so the inline screens are the only ones that
      // need the reset — and were the only ones showing the gap.
      //
      // The `:has()` must sit on the WRAPPER, not on the descendant: the stacked
      // `has-[[data-jaw-shell]]:[&_.min-h-screen]:p-0` form compiles to
      // `.wrapper .min-h-screen:has([data-jaw-shell])`, which only matches while
      // the shell happens to live inside that exact child.
      stubViewport(400);
      mount(<div data-jaw-shell>revamped screen</div>);
      expect(card().className).toContain('[&:has([data-jaw-shell])_.min-h-screen]:p-0');
      expect(card().className).toContain('[&:has([data-jaw-shell])_.max-w-md]:max-w-none');
    });

    it('defaults to revealed (old SDKs never send DialogVisibility)', () => {
      stubViewport(400);
      mount(child);
      expect(card().className).toContain('translate-y-0');
      expect(card().className).not.toContain('translate-y-full');
    });

    it('conceals on {visible:false} and slides back in on {visible:true}', () => {
      stubViewport(400);
      const communicator = mount(child);

      act(() => communicator.emit({ event: 'DialogVisibility', data: { visible: false } }));
      expect(card().className).toContain('translate-y-full');

      act(() => communicator.emit({ event: 'DialogVisibility', data: { visible: true } }));
      expect(card().className).toContain('translate-y-0');
      expect(card().className).not.toContain('translate-y-full');
      // The slide is a transform transition (disabled under reduced motion).
      expect(card().className).toContain('transition-transform');
      expect(card().className).toContain('motion-reduce:transition-none');
    });

    it('ignores unrelated SDK messages', () => {
      stubViewport(400);
      const communicator = mount(child);
      act(() => communicator.emit({ event: 'SetTheme', data: { theme: { mode: 'dark' } } }));
      expect(card().className).toContain('translate-y-0');
    });

    it('floating presentation keeps its snap reveal (no offscreen transform)', () => {
      stubViewport(1024);
      const communicator = mount(child);
      act(() => communicator.emit({ event: 'DialogVisibility', data: { visible: false } }));
      expect(card().className).not.toContain('translate-y-full');
    });
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
