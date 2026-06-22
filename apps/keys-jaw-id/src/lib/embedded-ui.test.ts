import { describe, it, expect, afterEach } from 'vitest';

import {
  pickPresentation,
  isOccluded,
  isWebAuthnIframeUnsupportedError,
  supportsIOv2,
  EMBEDDED_BREAKPOINT_PX,
} from './embedded-ui';

describe('pickPresentation', () => {
  it('uses a drawer at or below the breakpoint', () => {
    expect(pickPresentation(320)).toBe('drawer');
    expect(pickPresentation(EMBEDDED_BREAKPOINT_PX)).toBe('drawer');
  });

  it('uses a floating dialog above the breakpoint', () => {
    expect(pickPresentation(EMBEDDED_BREAKPOINT_PX + 1)).toBe('floating');
    expect(pickPresentation(1440)).toBe('floating');
  });
});

describe('isOccluded (fail closed)', () => {
  it('is not occluded only when intersecting AND IOv2 reports visible', () => {
    expect(isOccluded({ isIntersecting: true, isVisible: true })).toBe(false);
  });

  it('is occluded when IOv2 reports not visible (covered/transformed/faded)', () => {
    expect(isOccluded({ isIntersecting: true, isVisible: false })).toBe(true);
  });

  it('is occluded when not intersecting', () => {
    expect(isOccluded({ isIntersecting: false, isVisible: true })).toBe(true);
  });

  it('fails closed when isVisible is missing (no IOv2 data)', () => {
    expect(isOccluded({ isIntersecting: true })).toBe(true);
  });
});

describe('supportsIOv2', () => {
  const original = globalThis.IntersectionObserverEntry;

  afterEach(() => {
    if (original === undefined) {
      delete (globalThis as Record<string, unknown>).IntersectionObserverEntry;
    } else {
      globalThis.IntersectionObserverEntry = original;
    }
  });

  it('is false without IntersectionObserverEntry (node / old engines)', () => {
    delete (globalThis as Record<string, unknown>).IntersectionObserverEntry;
    expect(supportsIOv2()).toBe(false);
  });

  it('is true only when isVisible exists on the prototype', () => {
    class V1 {}
    globalThis.IntersectionObserverEntry = V1 as unknown as typeof IntersectionObserverEntry;
    expect(supportsIOv2()).toBe(false);

    class V2 {}
    Object.defineProperty(V2.prototype, 'isVisible', { get: () => true });
    globalThis.IntersectionObserverEntry = V2 as unknown as typeof IntersectionObserverEntry;
    expect(supportsIOv2()).toBe(true);
  });
});

describe('isWebAuthnIframeUnsupportedError', () => {
  it('matches the Firefox + Bitwarden error', () => {
    expect(isWebAuthnIframeUnsupportedError(new Error("Invalid 'sameOriginWithAncestors' value"))).toBe(true);
  });

  it('matches the Safari cross-origin iframe error', () => {
    expect(
      isWebAuthnIframeUnsupportedError(new Error('The origin of the document is not the same as its ancestors.'))
    ).toBe(true);
  });

  it('matches plain string errors too', () => {
    expect(isWebAuthnIframeUnsupportedError("Invalid 'sameOriginWithAncestors' value")).toBe(true);
  });

  it('does not match unrelated errors', () => {
    expect(isWebAuthnIframeUnsupportedError(new Error('User cancelled the operation'))).toBe(false);
    expect(isWebAuthnIframeUnsupportedError(new Error('NotAllowedError'))).toBe(false);
    expect(isWebAuthnIframeUnsupportedError(undefined)).toBe(false);
    expect(isWebAuthnIframeUnsupportedError(42)).toBe(false);
  });
});
