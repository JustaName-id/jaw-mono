/**
 * Browser detection utilities for transport routing.
 *
 * UA sniffing is confined to this module (see specs constitution). Safari is
 * UA-detected because no feature detection exists for WebAuthn-in-iframe
 * support (credential creation in cross-origin iframes is unsupported in
 * Safari — https://github.com/WebKit/standards-positions/issues/304).
 */

function getUserAgent(): string {
    if (typeof navigator === 'undefined') return '';
    return navigator.userAgent ?? '';
}

/** Safari (desktop or iOS). Chromium-based browsers include "chrome" in their UA. */
export function isSafari(userAgent: string = getUserAgent()): boolean {
    const ua = userAgent.toLowerCase();
    return ua.includes('safari') && !ua.includes('chrome') && !ua.includes('chromium');
}

/** Coarse mobile detection used to pick popup-fallback presentation. */
export function isMobile(userAgent: string = getUserAgent()): boolean {
    if (typeof navigator !== 'undefined') {
        const uaData = (navigator as { userAgentData?: { mobile?: boolean } }).userAgentData;
        if (typeof uaData?.mobile === 'boolean') return uaData.mobile;
    }
    return /android|iphone|ipad|ipod|mobile/i.test(userAgent);
}

/**
 * IntersectionObserver v2 support (`isVisible` in entries) — required to
 * verify the iframe is not occluded (clickjacking guard). Chromium-only.
 */
export function supportsIOv2(): boolean {
    return (
        typeof IntersectionObserverEntry !== 'undefined' &&
        'isVisible' in IntersectionObserverEntry.prototype
    );
}
