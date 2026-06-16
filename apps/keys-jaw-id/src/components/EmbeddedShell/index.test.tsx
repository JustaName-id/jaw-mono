import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

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
