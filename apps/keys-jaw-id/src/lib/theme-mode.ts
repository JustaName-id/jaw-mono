/**
 * The `<html>` attribute recording the dApp's light/dark intent, and the predicate for reading it.
 *
 * Deliberately its own module with no imports: `SystemThemeListener` renders from the root layout
 * and needs only these two, while `apply-dapp-theme` needs @jaw.id/ui's colour converters. Keeping
 * them together dragged the entire UI package — every component plus its stylesheet — into the
 * layout bundle.
 */

/** Attribute on `<html>` recording the dApp's mode intent ('light' | 'dark' | 'auto'). */
export const THEME_MODE_ATTR = 'data-jaw-theme-mode';

/**
 * Whether the dApp pinned an explicit light/dark mode (so the OS listener must not override it).
 * `auto`, `null` (no dApp theme) and any other value are not pins — the OS stays in charge.
 */
export function isModePinned(attr: string | null): boolean {
  return attr === 'light' || attr === 'dark';
}
