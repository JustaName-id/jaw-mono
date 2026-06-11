/**
 * Embedder hostnames allowed to show the keys iframe on browsers without
 * IntersectionObserver v2 (where occlusion cannot be verified).
 *
 * Empty at launch — hosts are added as partners are vetted. Adding an entry
 * requires security review (see specs constitution §Security).
 */
export const TRUSTED_HOSTS: readonly string[] = [];

export function isTrustedHost(hostname: string, hosts: readonly string[] = TRUSTED_HOSTS): boolean {
    return hosts.includes(hostname);
}
