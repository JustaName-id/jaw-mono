// @vitest-environment jsdom
// App-specific mode has no host shell to choose a presentation for it — the
// iframe transport has EmbeddedShell, which renders its dialogs as a bottom
// sheet on phones. Without an anchor of its own the handler fell through to the
// centered 400px card at every width, so the same wallet opened as a sheet
// inside the iframe and as a mid-screen modal when embedded in the app.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';

import { ReactUIHandler } from './ReactUIHandler';

/** matchMedia stub answering `(max-width: Npx)` for a given viewport width. */
function stubViewport(width: number) {
  vi.stubGlobal('matchMedia', (query: string) => {
    const max = /\(max-width:\s*(\d+(?:\.\d+)?)px\)/.exec(query);
    return {
      matches: max ? width <= Number(max[1]) : false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as MediaQueryList;
  });
}

function open(request: unknown) {
  const handler = new ReactUIHandler();
  act(() => {
    // The promise settles only when the user acts on the dialog; the dialog
    // itself is what we assert on, so it is left pending and torn down below.
    void handler.request(request as Parameters<ReactUIHandler['request']>[0]).catch(() => undefined);
  });
  return {
    handler,
    overlay: document.body.querySelector('[data-slot="dialog-overlay"]') as HTMLElement,
    content: document.body.querySelector('[data-slot="dialog-content"]') as HTMLElement,
  };
}

const UNSUPPORTED = { id: 'req-1', type: 'eth_unsupported', data: {} };
const CONNECT = { id: 'req-2', type: 'wallet_connect', data: { chainId: 1 } };

describe('ReactUIHandler — dialog presentation follows the viewport', () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(async () => {
    await act(async () => undefined);
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('opens as a bottom sheet on a phone viewport', () => {
    stubViewport(390);
    const { content } = open(UNSUPPORTED);
    expect(content).not.toBeNull();
    // Pinned to the bottom edge, full width, rounded on top only — and it
    // slides up rather than zooming in at the center.
    expect(content.className).toContain('bottom-0');
    expect(content.className).toContain('rounded-t-2xl');
    expect(content.className).toContain('slide-in-from-bottom');
    expect(content.style.width).toBe('100%');
    expect(content.style.maxHeight).toBe('85dvh');
  });

  it('keeps the centered card on a desktop viewport', () => {
    stubViewport(1280);
    const { content } = open(UNSUPPORTED);
    expect(content.className).toContain('top-[50%]');
    expect(content.className).not.toContain('bottom-0');
    expect(content.className).not.toContain('slide-in-from-bottom');
  });

  it('still dims the host page behind the sheet', () => {
    // Unlike the iframe — which is see-through by design, the dApp showing
    // through around the card — this sheet renders directly ON the dApp.
    stubViewport(390);
    const { overlay } = open(UNSUPPORTED);
    expect(overlay.className).toContain('bg-scrim/50');
    expect(overlay.className).not.toContain('bg-transparent');
  });

  it('lets the onboarding shell be the sheet, and own the home-bar inset alone', () => {
    stubViewport(390);
    const { content } = open(CONNECT);
    const shell = content.querySelector('[data-jaw-shell]') as HTMLElement;
    expect(shell).not.toBeNull();
    expect(shell.className).toContain('w-full');
    expect(shell.querySelector('[data-jaw-grabber]')).not.toBeNull();
    // The shell applies env(safe-area-inset-bottom) inside its own surface, so
    // the Radix sheet must stand down — two insets read as two home-bar gaps.
    expect(content.style.paddingBottom).toBe('0px');
    // The onboarding dialog's own `max-width: 450px` must lose to the sheet.
    expect(content.style.width).toBe('100%');
  });
});
