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
    expect(container.innerHTML).toContain('appears to be covered');
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
