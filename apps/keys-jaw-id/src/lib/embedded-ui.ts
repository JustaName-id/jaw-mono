/**
 * Pure helpers for the embedded (iframe) presentation layer.
 * Kept logic-only so they can be unit-tested without a DOM.
 */

export const EMBEDDED_BREAKPOINT_PX = 460;

export type EmbeddedPresentation = 'drawer' | 'floating';

/** Bottom drawer on narrow viewports, centered floating dialog otherwise. */
export function pickPresentation(viewportWidth: number): EmbeddedPresentation {
  return viewportWidth <= EMBEDDED_BREAKPOINT_PX ? 'drawer' : 'floating';
}

/**
 * IntersectionObserver v2 support (`isVisible` on entries) — the only API
 * that detects occlusion (clickjacking guard). Chromium-only; on other
 * engines the SDK routes untrusted hosts to a popup instead.
 */
export function supportsIOv2(): boolean {
  return typeof IntersectionObserverEntry !== 'undefined' && 'isVisible' in IntersectionObserverEntry.prototype;
}

export type VisibilityEntry = {
  isIntersecting: boolean;
  /** IOv2 field — false when the element is covered, transformed or faded. */
  isVisible?: boolean;
};

/** Treat anything but a fully-visible, intersecting entry as occluded (fail closed). */
export function isOccluded(entry: VisibilityEntry): boolean {
  return !(entry.isIntersecting && entry.isVisible === true);
}

/**
 * Window event dispatched when passkey creation fails because the browser
 * (or a password-manager extension) cannot create credentials inside a
 * cross-origin iframe. EmbeddedShell listens and escapes to a popup.
 */
export const WEBAUTHN_IFRAME_UNSUPPORTED_EVENT = 'jaw:webauthn-iframe-unsupported';

/**
 * Matches the known "WebAuthn create() not available in this iframe" errors:
 * - Firefox + Bitwarden: "Invalid 'sameOriginWithAncestors' value"
 *   (https://github.com/bitwarden/clients/issues/12590)
 * - Safari: "The origin of the document is not the same as its ancestors"
 *   (WebKit standards-positions #304 — create() unsupported in iframes)
 */
export function isWebAuthnIframeUnsupportedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return (
    message.includes('sameOriginWithAncestors') ||
    message.includes('origin of the document is not the same as its ancestors')
  );
}
