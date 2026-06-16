import { describe, expect, it, vi } from 'vitest';
import { TRUSTED_HOSTS_PATH, TrustedHostsRegistry, fetchTrustedHosts } from './trusted-hosts.js';

const KEYS_URL = 'https://keys.jaw.id';

/** Build a fetch stub that returns the given body with status 200 by default. */
function mockFetch(body: unknown, init: { ok?: boolean; throws?: boolean } = {}): typeof fetch {
    return vi.fn(async () => {
        if (init.throws) throw new Error('network down');
        return {
            ok: init.ok ?? true,
            json: async () => body,
        } as Response;
    }) as unknown as typeof fetch;
}

describe('fetchTrustedHosts', () => {
    it('requests the trusted-hosts path on the keys origin', async () => {
        const fetchImpl = mockFetch({ hosts: ['app.example.com'] });
        await fetchTrustedHosts(KEYS_URL, fetchImpl);
        expect(fetchImpl).toHaveBeenCalledWith(
            `${KEYS_URL}${TRUSTED_HOSTS_PATH}`,
            expect.objectContaining({ method: 'GET', cache: 'no-store', credentials: 'omit' })
        );
    });

    it('returns the normalized (trimmed, lowercased) host list', async () => {
        const fetchImpl = mockFetch({ hosts: ['  App.Example.com ', 'partner.io'] });
        expect(await fetchTrustedHosts(KEYS_URL, fetchImpl)).toEqual(['app.example.com', 'partner.io']);
    });

    it('drops non-string and empty entries', async () => {
        const fetchImpl = mockFetch({ hosts: ['ok.com', 42, null, '', '  '] });
        expect(await fetchTrustedHosts(KEYS_URL, fetchImpl)).toEqual(['ok.com']);
    });

    it('fails closed (empty) on a non-2xx response', async () => {
        const fetchImpl = mockFetch({ hosts: ['leak.com'] }, { ok: false });
        expect(await fetchTrustedHosts(KEYS_URL, fetchImpl)).toEqual([]);
    });

    it('fails closed (empty) when the fetch throws', async () => {
        const fetchImpl = mockFetch(null, { throws: true });
        expect(await fetchTrustedHosts(KEYS_URL, fetchImpl)).toEqual([]);
    });

    it('fails closed (empty) on a malformed body', async () => {
        expect(await fetchTrustedHosts(KEYS_URL, mockFetch({ nope: true }))).toEqual([]);
        expect(await fetchTrustedHosts(KEYS_URL, mockFetch('not-json'))).toEqual([]);
    });

    it('returns empty when no fetch implementation is available', async () => {
        expect(await fetchTrustedHosts(KEYS_URL, undefined as unknown as typeof fetch)).toEqual([]);
    });
});

describe('TrustedHostsRegistry', () => {
    it('is empty by default (fail-closed baseline)', () => {
        const registry = new TrustedHostsRegistry();
        expect(registry.has('app.example.com')).toBe(false);
    });

    it('seeds from a baseline and matches case-insensitively', () => {
        const registry = new TrustedHostsRegistry(['Trusted.io']);
        expect(registry.has('trusted.io')).toBe(true);
        expect(registry.has('TRUSTED.IO')).toBe(true);
        expect(registry.has('other.io')).toBe(false);
    });

    it('matches exact hostnames only (no subdomain widening)', () => {
        const registry = new TrustedHostsRegistry(['app.example.com']);
        expect(registry.has('sub.app.example.com')).toBe(false);
        expect(registry.has('app.example.com.attacker.io')).toBe(false);
    });

    it('add() merges hosts additively without dropping the baseline', () => {
        const registry = new TrustedHostsRegistry(['base.io']);
        registry.add(['partner.com']);
        expect(registry.has('base.io')).toBe(true);
        expect(registry.has('partner.com')).toBe(true);
    });

    it('refreshFrom() merges fetched hosts and returns what was added', async () => {
        const registry = new TrustedHostsRegistry();
        const added = await registry.refreshFrom(KEYS_URL, mockFetch({ hosts: ['fetched.com'] }));
        expect(added).toEqual(['fetched.com']);
        expect(registry.has('fetched.com')).toBe(true);
    });

    it('refreshFrom() leaves the set untouched when the fetch fails', async () => {
        const registry = new TrustedHostsRegistry(['base.io']);
        const added = await registry.refreshFrom(KEYS_URL, mockFetch(null, { throws: true }));
        expect(added).toEqual([]);
        expect(registry.has('base.io')).toBe(true);
    });
});
