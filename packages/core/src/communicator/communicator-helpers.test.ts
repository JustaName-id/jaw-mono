import { describe, it, expect, vi } from 'vitest';

import { normalizeTransportMode, getRouteContext } from './communicator.js';

describe('normalizeTransportMode', () => {
    it('defaults to auto (iframe primary) when unset', () => {
        expect(normalizeTransportMode(undefined)).toBe('auto');
    });

    it('passes through valid modes', () => {
        expect(normalizeTransportMode('popup')).toBe('popup');
        expect(normalizeTransportMode('iframe')).toBe('iframe');
        expect(normalizeTransportMode('auto')).toBe('auto');
    });

    it('falls back to popup and warns once on invalid values', () => {
        const warn = vi.fn();

        expect(normalizeTransportMode('bogus', warn)).toBe('popup');

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain('bogus');
    });

    it('treats non-string junk as invalid', () => {
        const warn = vi.fn();
        expect(normalizeTransportMode(42, warn)).toBe('popup');
        expect(normalizeTransportMode(null, warn)).toBe('popup');
        expect(warn).toHaveBeenCalledTimes(2);
    });
});

describe('getRouteContext', () => {
    it('extracts the method from unencrypted handshake messages (AC-2 routing input)', () => {
        const message = {
            id: 'a-b-c-d-e',
            content: {
                handshake: { method: 'eth_requestAccounts', params: [] },
                chain: { id: 1 },
            },
        };

        expect(getRouteContext(message as never)).toEqual({ method: 'eth_requestAccounts' });
    });

    it('returns no method for encrypted business messages', () => {
        const message = {
            id: 'a-b-c-d-e',
            content: {
                encrypted: { iv: new Uint8Array(12), cipherText: new ArrayBuffer(8) },
            },
        };

        expect(getRouteContext(message as never)).toEqual({});
    });

    it('returns no method for config/plain messages', () => {
        expect(getRouteContext({ requestId: 'a-b-c-d-e', data: {} } as never)).toEqual({});
        expect(getRouteContext({} as never)).toEqual({});
    });

    it('ignores malformed handshake content', () => {
        expect(getRouteContext({ content: { handshake: { method: 42 } } } as never)).toEqual({});
        expect(getRouteContext({ content: { handshake: null } } as never)).toEqual({});
        expect(getRouteContext({ content: 'string' } as never)).toEqual({});
    });
});
