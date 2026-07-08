// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

import { EnsureVisibility } from './index';
import type { PopupCommunicator, CommunicatorContext } from '../../lib/popup-communicator';

function mockCommunicator(context: CommunicatorContext): PopupCommunicator {
  return {
    getContext: () => context,
    requestSwitchToPopup: () => undefined,
  } as unknown as PopupCommunicator;
}

const child = <span data-testid="child">app content</span>;

describe('EnsureVisibility', () => {
  it('renders children untouched in standalone context (no guard chrome)', () => {
    const html = renderToStaticMarkup(
      <EnsureVisibility communicator={mockCommunicator('standalone')} active={true}>
        {child}
      </EnsureVisibility>
    );
    expect(html).toContain('app content');
    expect(html).not.toContain('Continue in new window');
  });

  it('renders children untouched when inactive, even if embedded', () => {
    const html = renderToStaticMarkup(
      <EnsureVisibility communicator={mockCommunicator('embedded')} active={false}>
        {child}
      </EnsureVisibility>
    );
    expect(html).toContain('app content');
    expect(html).not.toContain('Continue in new window');
  });

  it('renders no escape hatch and enabled interactions when embedded, active and not occluded', () => {
    const html = renderToStaticMarkup(
      <EnsureVisibility communicator={mockCommunicator('embedded')} active={true}>
        {child}
      </EnsureVisibility>
    );
    expect(html).toContain('app content');
    // No persistent escape-hatch footer/button — it was removed.
    expect(html).not.toContain('Continue in new window');
    // Not occluded on first render → no warning, interactions enabled.
    expect(html).not.toContain('appears to be covered');
    expect(html).not.toContain('pointer-events-none');
  });
});

// IOv2-driven behavior: the guard debounces the per-reveal transient
// (isIntersecting:true, isVisible:false for ~one observer cycle) so the
// "covered" warning never flashes as a screen appears, while still neutralizing
// interactions immediately and surfacing the warning for a sustained cover.
describe('EnsureVisibility — IOv2 debounce', () => {
  let ioCallback: IntersectionObserverCallback | null;
  let container: HTMLDivElement;
  let root: Root;

  /** Build a fake IOv2 entry list as the observer would deliver. */
  const emit = (isIntersecting: boolean, isVisible: boolean) => {
    act(() => {
      ioCallback?.([{ isIntersecting, isVisible } as unknown as IntersectionObserverEntry], null as never);
    });
  };

  const render = () => {
    act(() => {
      root.render(
        <EnsureVisibility communicator={mockCommunicator('embedded')} active={true}>
          {child}
        </EnsureVisibility>
      );
    });
  };

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    ioCallback = null;

    // Capture the observer callback so the test can drive readings.
    class MockIntersectionObserver {
      constructor(cb: IntersectionObserverCallback) {
        ioCallback = cb;
      }
      observe() {
        return undefined;
      }
      unobserve() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    }
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

    // supportsIOv2() gates on `isVisible` existing on the entry prototype.
    class MockIntersectionObserverEntry {}
    Object.defineProperty(MockIntersectionObserverEntry.prototype, 'isVisible', { value: false });
    vi.stubGlobal('IntersectionObserverEntry', MockIntersectionObserverEntry);

    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      root = createRoot(container);
    });
    render();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('disables interactions immediately on occlusion but does not flash the banner', () => {
    emit(true, false); // covered reading arrives
    // Fail-closed at once: interactions off, but the visible warning is held back.
    expect(container.innerHTML).toContain('pointer-events-none');
    expect(container.innerHTML).not.toContain('appears to be covered');
  });

  it('suppresses the reveal transient (clears before the confirm window elapses)', () => {
    emit(true, false); // transient: on-screen but not yet certified visible
    act(() => vi.advanceTimersByTime(150)); // < COVER_CONFIRM_MS (300)
    emit(true, true); // IOv2 certifies visibility ~one cycle later
    act(() => vi.advanceTimersByTime(300)); // any pending timer would fire here
    expect(container.innerHTML).not.toContain('appears to be covered');
    expect(container.innerHTML).not.toContain('pointer-events-none');
  });

  it('shows the warning for a cover that persists past the confirm window', () => {
    emit(true, false);
    act(() => vi.advanceTimersByTime(300)); // sustained → confirmed
    // The banner lives in the body-level shield (above the portaled dialog),
    // not in the wrapper subtree — so query the whole document.
    expect(document.body.innerHTML).toContain('appears to be covered');
    expect(container.innerHTML).toContain('pointer-events-none');
  });

  it('treats the hidden state (not intersecting) as off-screen, never a cover', () => {
    emit(false, false); // dialog closed between flows → display:none → not intersecting
    act(() => vi.advanceTimersByTime(300));
    // Raw reading is occluded (fail-closed), but it is not a "cover" → no banner.
    expect(container.innerHTML).toContain('pointer-events-none');
    expect(container.innerHTML).not.toContain('appears to be covered');
  });

  it('does not flash across a full hide → reveal → visible warm-path cycle', () => {
    emit(false, false); // hidden between flows
    emit(true, false); // reveal transient
    act(() => vi.advanceTimersByTime(100)); // < confirm window
    emit(true, true); // certified visible
    act(() => vi.advanceTimersByTime(300));
    expect(container.innerHTML).not.toContain('appears to be covered');
    expect(container.innerHTML).not.toContain('pointer-events-none');
  });
});

// The signing dialogs (SignatureDialog, TransactionDialog, …) render through a
// Radix Portal to document.body, OUTSIDE this component's wrapper — so the
// wrapper's pointer-events-none never reaches the live approve button. The
// guard must therefore neutralize interaction with a body-level shield that
// sits above the portaled dialog. These tests pin that the shield exists at the
// document.body level (not merely inside the wrapper) and tracks the raw,
// immediate occlusion reading. (jsdom does not hit-test pointer-events/z-index,
// so we assert the shield's presence/placement rather than simulate a covered
// click landing on the dialog.)
describe('EnsureVisibility — body-level interaction shield', () => {
  let ioCallback: IntersectionObserverCallback | null;
  let container: HTMLDivElement;
  let root: Root;

  const SHIELD = '[data-testid="jaw-clickjacking-shield"]';

  const emit = (isIntersecting: boolean, isVisible: boolean) => {
    act(() => {
      ioCallback?.([{ isIntersecting, isVisible } as unknown as IntersectionObserverEntry], null as never);
    });
  };

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    ioCallback = null;

    class MockIntersectionObserver {
      constructor(cb: IntersectionObserverCallback) {
        ioCallback = cb;
      }
      observe() {
        return undefined;
      }
      unobserve() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    }
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

    class MockIntersectionObserverEntry {}
    Object.defineProperty(MockIntersectionObserverEntry.prototype, 'isVisible', { value: false });
    vi.stubGlobal('IntersectionObserverEntry', MockIntersectionObserverEntry);

    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      root = createRoot(container);
    });
    act(() => {
      root.render(
        <EnsureVisibility communicator={mockCommunicator('embedded')} active={true}>
          {child}
        </EnsureVisibility>
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('mounts a click-blocking shield at document.body level, not inside the wrapper', () => {
    emit(true, false); // covered, immediate
    const shield = document.body.querySelector(SHIELD);
    expect(shield).not.toBeNull();
    // Portaled to body, NOT a descendant of the guarded wrapper — this is the
    // whole point: it can cover the dialog that also portals to body.
    expect(container.querySelector(SHIELD)).toBeNull();
    // Above the dialog (z-[100]) and capturing pointer events.
    expect(shield?.className).toContain('z-[2147483647]');
    expect((shield as HTMLElement).style.pointerEvents).toBe('auto');
  });

  it('mounts the shield immediately on the raw occluded reading (no debounce window)', () => {
    emit(true, false);
    // No timer advance — interaction blocking must be fail-closed at once.
    expect(document.body.querySelector(SHIELD)).not.toBeNull();
  });

  it('removes the shield once the dialog is certified visible again', () => {
    emit(true, false);
    expect(document.body.querySelector(SHIELD)).not.toBeNull();
    emit(true, true); // certified visible → not occluded
    expect(document.body.querySelector(SHIELD)).toBeNull();
  });

  it('keeps the shield up but holds the banner until the cover is confirmed', () => {
    emit(true, false);
    // Blocker present immediately; banner text only after the confirm window.
    expect(document.body.querySelector(SHIELD)).not.toBeNull();
    expect(document.body.innerHTML).not.toContain('appears to be covered');
    act(() => vi.advanceTimersByTime(300));
    expect(document.body.innerHTML).toContain('appears to be covered');
  });

  it('does not mount the shield when not occluded', () => {
    emit(true, true);
    expect(document.body.querySelector(SHIELD)).toBeNull();
  });
});
