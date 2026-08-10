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

  /**
   * Every text row must reserve its *line box*, not its ink.
   *
   * A bar is only as tall as itself, but the row it stands in for is as tall
   * as the line box of the text that lands there. Tailwind v3 emits font-size
   * only for arbitrary `text-[Npx]` sizes, so those rows inherit
   * `line-height: 1.5` (packages/ui/src/styles.css:210 for the embedded
   * dialog, apps/keys-jaw-id/src/app/global.css:87 standalone). Sizing the
   * rows by their bars instead left the card 22px short, so it grew on reveal.
   *
   * These assertions are class-string based: the suite renders through
   * renderToStaticMarkup with no layout engine, so the heights themselves
   * can't be measured here — what is pinned is that each row carries an
   * explicit box.
   */
  it("reserves the subtitle's line box (13px x 1.5), not the bar's 12px", () => {
    // <p class="text-muted-foreground mt-2 text-[13px]"> in the real card.
    expect(markup()).toContain('h-[19.5px]');
  });

  it("reserves the divider label's line box (9px x 1.5), not the hairline's 1px", () => {
    // MonoDivider's row is as tall as its text-[9px] "or" label; the skeleton
    // draws only the rule, so without an explicit box it swallows 12.5px.
    expect(markup()).toContain('h-[13.5px]');
  });

  it("reserves the create-account link at text-xs's own 16px leading, not 12 x 1.5", () => {
    // The gotcha: named Tailwind sizes ship a paired line-height (text-xs is
    // 12px/16px), so only the arbitrary sizes above inherit the 1.5. Sizing
    // this row 18px overshoots the card by 2px.
    const linkRow = markup().match(/<div class="([^"]*justify-center[^"]*)"/)?.[1] ?? '';
    expect(linkRow).toMatch(/(^|\s)h-4(\s|$)/);
    expect(markup()).not.toContain('h-[18px]');
  });
});
