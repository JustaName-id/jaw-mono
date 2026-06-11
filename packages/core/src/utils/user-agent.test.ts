import { describe, it, expect, afterEach, vi } from 'vitest';

import { isSafari, isMobile, supportsIOv2 } from './user-agent.js';
import { isTrustedHost } from '../trusted-hosts.js';

const UA = {
    safariMac:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    safariIphone:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    chromeMac:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    edgeWindows:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
    firefoxMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:125.0) Gecko/20100101 Firefox/125.0',
    chromeAndroid:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
};

describe('isSafari', () => {
    it('detects desktop Safari', () => {
        expect(isSafari(UA.safariMac)).toBe(true);
    });

    it('detects iOS Safari', () => {
        expect(isSafari(UA.safariIphone)).toBe(true);
    });

    it('does not flag Chrome (UA contains "Safari")', () => {
        expect(isSafari(UA.chromeMac)).toBe(false);
    });

    it('does not flag Edge', () => {
        expect(isSafari(UA.edgeWindows)).toBe(false);
    });

    it('does not flag Firefox', () => {
        expect(isSafari(UA.firefoxMac)).toBe(false);
    });

    it('returns false for empty UA', () => {
        expect(isSafari('')).toBe(false);
    });
});

describe('isMobile', () => {
    it('detects Android Chrome via UA string', () => {
        expect(isMobile(UA.chromeAndroid)).toBe(true);
    });

    it('detects iPhone Safari via UA string', () => {
        expect(isMobile(UA.safariIphone)).toBe(true);
    });

    it('does not flag desktop UAs', () => {
        expect(isMobile(UA.chromeMac)).toBe(false);
        expect(isMobile(UA.safariMac)).toBe(false);
        expect(isMobile(UA.firefoxMac)).toBe(false);
    });
});

describe('supportsIOv2', () => {
    const originalEntry = globalThis.IntersectionObserverEntry;

    afterEach(() => {
        if (originalEntry === undefined) {
            delete (globalThis as Record<string, unknown>).IntersectionObserverEntry;
        } else {
            globalThis.IntersectionObserverEntry = originalEntry;
        }
        vi.restoreAllMocks();
    });

    it('returns false when IntersectionObserverEntry is undefined', () => {
        delete (globalThis as Record<string, unknown>).IntersectionObserverEntry;
        expect(supportsIOv2()).toBe(false);
    });

    it('returns false when isVisible is absent from the prototype (v1 only)', () => {
        class FakeEntryV1 {}
        globalThis.IntersectionObserverEntry = FakeEntryV1 as unknown as typeof IntersectionObserverEntry;
        expect(supportsIOv2()).toBe(false);
    });

    it('returns true when isVisible exists on the prototype (v2)', () => {
        class FakeEntryV2 {}
        Object.defineProperty(FakeEntryV2.prototype, 'isVisible', { get: () => true });
        globalThis.IntersectionObserverEntry = FakeEntryV2 as unknown as typeof IntersectionObserverEntry;
        expect(supportsIOv2()).toBe(true);
    });
});

describe('isTrustedHost', () => {
    it('returns false for any host with the default (empty) list', () => {
        expect(isTrustedHost('app.example.com')).toBe(false);
        expect(isTrustedHost('')).toBe(false);
    });

    it('matches exact hostnames against a provided list', () => {
        const hosts = ['app.example.com'] as const;
        expect(isTrustedHost('app.example.com', hosts)).toBe(true);
        expect(isTrustedHost('evil-app.example.com.attacker.io', hosts)).toBe(false);
        expect(isTrustedHost('sub.app.example.com', hosts)).toBe(false);
    });
});
