import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { OnboardingSkeleton } from './index';

/**
 * Placeholder for the pre-first-screen window in the embedded (iframe) dialog.
 *
 * The SDK reveals the iframe as soon as the transport handshake acks
 * (PopupReady), which keys sends immediately — before it knows whether the
 * flow resolves to "Continue as" or to account creation. Deciding that needs
 * the handshake account hint resolved against the backend registry (up to
 * 3s on a wiped storage partition), so a wait is unavoidable; what the user
 * must NOT see is a distinct interstitial with its own copy and an SDK
 * version, which reads as a separate screen and leaks diagnostics. This
 * renders the shape of the "Welcome back" card it is about to become, so the
 * reveal is one continuous screen: skeleton bars filling in with content.
 */
describe('OnboardingSkeleton', () => {
  const markup = () => renderToStaticMarkup(<OnboardingSkeleton />);

  /** Visible text with tags and HTML entities stripped. */
  const textOf = (html: string) =>
    html
      .replace(/<[^>]*>/g, '')
      .replace(/&[a-z]+;|&#\d+;/gi, ' ')
      .trim();

  it('renders no copy at all — the interstitial text and SDK version are what regressed', () => {
    // The bug this component replaces: a spinner captioned "Connecting to
    // dApp..." over "SDK v1.1". Any copy here re-creates a distinct screen,
    // so the skeleton must be purely geometric.
    expect(textOf(markup())).toBe('');
  });

  it('renders inside the same DialogShell frame as the card it precedes', () => {
    // Shares the real card's surface, 400px width, radius and theme tokens, so
    // the reveal does not resize or restyle when content lands.
    expect(markup()).toContain('data-jaw-shell');
  });

  /** class attribute of every skeleton block in the rendered markup. */
  const skeletonClasses = (html: string) =>
    [...html.matchAll(/<div data-slot="skeleton" class="([^"]*)"/g)].map((match) => match[1]);

  it('mimics the "Continue as" tile: a 40px avatar block beside two text lines', () => {
    // Matches AccountAvatar's size={40} / h-10 w-10 in the welcome-back tile,
    // so the identicon lands exactly where its placeholder sat.
    const avatarBlock = skeletonClasses(markup()).filter(
      (classes) => /(^|\s)h-10(\s|$)/.test(classes) && /(^|\s)w-10(\s|$)/.test(classes)
    );
    expect(avatarBlock).toHaveLength(1);
  });

  it('lays out the full welcome-back column: heading, tile, and two actions', () => {
    // Heading + subtitle + tile block + tile label + tile name + switch-account
    // button + create-account link. Fewer bars than the real card has rows
    // would make the reveal jump.
    expect(skeletonClasses(markup()).length).toBeGreaterThanOrEqual(6);
  });
});
