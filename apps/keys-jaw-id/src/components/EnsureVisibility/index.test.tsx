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

  it('renders the clickjacking-guard footer + escape hatch when embedded and active', () => {
    const html = renderToStaticMarkup(
      <EnsureVisibility communicator={mockCommunicator('embedded')} active={true}>
        {child}
      </EnsureVisibility>
    );
    expect(html).toContain('app content');
    expect(html).toContain('Continue in new window');
    // Not occluded on first render → interactions enabled (no pointer-events-none)
    expect(html).not.toContain('pointer-events-none');
  });
});
