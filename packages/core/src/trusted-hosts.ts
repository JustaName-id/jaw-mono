/**
 * Embedder hostnames allowed to show the keys iframe on browsers without
 * IntersectionObserver v2 (where occlusion cannot be verified).
 *
 * Empty at launch — hosts are added as partners are vetted. Adding an entry
 * requires security review.
 *
 * Two layers:
 *  1. {@link TRUSTED_HOSTS} — the compiled-in baseline (this list). Always
 *     trusted, ships with the SDK, no network needed.
 *  2. {@link TrustedHostsRegistry} — augments the baseline at runtime with a
 *     list fetched from the keys app, so ops can vet a partner without a
 *     publish + dApp redeploy. Fail-closed: until the fetch resolves (or if it
 *     fails), only the baseline matches, which routes untrusted embedders to
 *     the popup.
 */
export const TRUSTED_HOSTS: readonly string[] = [];

export function isTrustedHost(hostname: string, hosts: readonly string[] = TRUSTED_HOSTS): boolean {
    return hosts.includes(hostname);
}

/** Path (relative to the keys origin) that serves the dynamic trusted-host list. */
export const TRUSTED_HOSTS_PATH = '/api/trusted-hosts';

/** Shape returned by the keys trusted-hosts endpoint. */
export interface TrustedHostsResponse {
    readonly hosts: readonly string[];
}

/** Narrow an unknown JSON payload to a clean list of hostname strings. */
function parseHosts(payload: unknown): string[] {
    if (!payload || typeof payload !== 'object') return [];
    const hosts = (payload as { hosts?: unknown }).hosts;
    if (!Array.isArray(hosts)) return [];
    return hosts
        .filter((h): h is string => typeof h === 'string')
        .map((h) => h.trim().toLowerCase())
        .filter((h) => h.length > 0);
}

/**
 * Fetch the operator-managed trusted-host list from the keys app. Resolves to
 * an empty list on any failure (network, non-2xx, malformed body) so a missing
 * or broken endpoint can never *expand* trust — it only ever narrows to the
 * compiled-in baseline.
 */
export async function fetchTrustedHosts(
    keysUrl: string | URL,
    fetchImpl: typeof fetch = globalThis.fetch
): Promise<string[]> {
    if (typeof fetchImpl !== 'function') return [];
    try {
        const url = new URL(TRUSTED_HOSTS_PATH, keysUrl);
        const response = await fetchImpl(url.toString(), {
            method: 'GET',
            headers: { accept: 'application/json' },
            credentials: 'omit',
            cache: 'no-store',
        });
        if (!response.ok) return [];
        return parseHosts(await response.json());
    } catch {
        return [];
    }
}

/**
 * A synchronously-queryable trusted-host set, seeded from the compiled-in
 * baseline and augmentable at runtime. The transport router reads {@link has}
 * on every routing decision, so the lookup must stay synchronous; the network
 * refresh happens out of band via {@link refreshFrom}.
 */
export class TrustedHostsRegistry {
    private readonly hosts: Set<string>;

    constructor(baseline: readonly string[] = TRUSTED_HOSTS) {
        this.hosts = new Set(baseline.map((h) => h.toLowerCase()));
    }

    /** Exact-match membership test (no subdomain widening — matches {@link isTrustedHost}). */
    has(hostname: string): boolean {
        return this.hosts.has(hostname.toLowerCase());
    }

    /** Merge additional vetted hosts into the set (additive — never removes the baseline). */
    add(hosts: Iterable<string>): void {
        for (const host of hosts) {
            if (host) this.hosts.add(host.toLowerCase());
        }
    }

    /**
     * Fetch the operator list from the keys app and merge it in. Fail-soft:
     * a failed fetch leaves the current set untouched. Returns the hosts that
     * were added (empty when nothing changed or the fetch failed).
     */
    async refreshFrom(keysUrl: string | URL, fetchImpl: typeof fetch = globalThis.fetch): Promise<string[]> {
        const fetched = await fetchTrustedHosts(keysUrl, fetchImpl);
        this.add(fetched);
        return fetched;
    }
}
