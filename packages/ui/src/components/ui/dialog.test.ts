// @vitest-environment jsdom
// Regression cover for the pointer-events cleanup in the Dialog wrapper. The
// unmount path used to schedule a 250ms setTimeout that nothing could cancel:
// in vitest it fired after the jsdom environment was torn down ("document is
// not defined" as an unhandled error, failing green runs in CI), and in the
// app a close immediately followed by an unmount cancelled the close-path
// timer, leaving body pointer-events locked. Unmount cleanup must be
// synchronous and leave no timer behind.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

import { Dialog } from './dialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement;

function render(open: boolean) {
  act(() => {
    root!.render(createElement(Dialog, { open }));
  });
}

// Simulates the lock Radix leaves on the body while a modal dialog is open.
function lockBody() {
  document.body.style.pointerEvents = 'none';
}

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  document.body.innerHTML = '';
  document.body.style.removeProperty('pointer-events');
  vi.useRealTimers();
});

describe('Dialog pointer-events cleanup', () => {
  it('removes the body lock synchronously on unmount while open, leaving no timer behind', () => {
    render(true);
    lockBody();

    act(() => root!.unmount());
    root = null;

    expect(document.body.style.pointerEvents).toBe('');
    // The old code left an uncancellable setTimeout here — it outlived the
    // component and, in CI, the test environment itself.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('removes the body lock after the close-animation buffer when the dialog closes', () => {
    render(true);
    render(false);
    lockBody();

    // Not yet: the close animation (200ms) must be allowed to finish first.
    expect(document.body.style.pointerEvents).toBe('none');

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(document.body.style.pointerEvents).toBe('');
  });

  it('still removes the body lock when an unmount lands inside the close buffer', () => {
    render(true);
    render(false);
    lockBody();

    // Unmount before the 250ms close-path timer fires; unmounting cancels that
    // timer, so the unmount cleanup itself must remove the lock.
    act(() => root!.unmount());
    root = null;

    expect(document.body.style.pointerEvents).toBe('');
    expect(vi.getTimerCount()).toBe(0);
  });
});
