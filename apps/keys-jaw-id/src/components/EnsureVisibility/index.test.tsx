import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

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
