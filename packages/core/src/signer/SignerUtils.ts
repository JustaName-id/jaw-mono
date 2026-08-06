import { standardErrors } from '../errors/index.js';
import { store } from '../store/index.js';
import { RequestArguments } from '../provider/index.js';

import { hashTypedData, isAddress, isHex, hexToString, type Address } from 'viem';

import { WalletConnectResponse } from '../rpc/index.js';

import { get } from '../utils/index.js';

/**
 * Decodes a hex-encoded message to a readable string.
 * Wagmi and other libraries hex-encode messages before sending to personal_sign.
 * This function decodes them back for display and signing.
 */
export function decodePersonalSignMessage(message: string): string {
    if (isHex(message)) {
        try {
            return hexToString(message);
        } catch {
            // If decoding fails, return original (might be binary data)
            return message;
        }
    }
    return message;
}

/**
 * Transforms personal_sign request params to decode hex-encoded messages.
 * Returns a new request with the decoded message, preserving the original structure.
 */
export function decodePersonalSignRequest(request: RequestArguments): RequestArguments {
    if (request.method !== 'personal_sign') {
        return request;
    }

    const params = request.params as [string, Address] | undefined;
    if (!params || params.length < 2) {
        return request;
    }

    const [message, address] = params;
    const decodedMessage = decodePersonalSignMessage(message);

    return {
        ...request,
        params: [decodedMessage, address],
    };
}

export function assertGetCapabilitiesParams(params: unknown): asserts params is [`0x${string}`, `0x${string}`[]?] {
    if (!params || !Array.isArray(params) || (params.length !== 1 && params.length !== 2)) {
        throw standardErrors.rpc.invalidParams();
    }

    if (typeof params[0] !== 'string' || !isAddress(params[0])) {
        throw standardErrors.rpc.invalidParams();
    }

    if (params.length === 2) {
        if (!Array.isArray(params[1])) {
            throw standardErrors.rpc.invalidParams();
        }

        for (const param of params[1]) {
            if (typeof param !== 'string' || !param.startsWith('0x')) {
                throw standardErrors.rpc.invalidParams();
            }
        }
    }
}

export function assertParamsChainId(params: unknown): asserts params is [
    {
        chainId: `0x${string}`;
    },
] {
    if (!params || !Array.isArray(params) || !params[0]?.chainId) {
        throw standardErrors.rpc.invalidParams();
    }
    if (typeof params[0].chainId !== 'string' && typeof params[0].chainId !== 'number') {
        throw standardErrors.rpc.invalidParams();
    }
}

/**
 * Rejects an EIP-712 payload that cannot produce a signature. The caller
 * extracts the payload from its method-specific envelope; this only judges
 * whether what was extracted is signable.
 *
 * The EIP-712 digest is `keccak(0x1901 ‖ hashStruct(domain) ‖ hashStruct(message))`, and
 * `hashStruct` needs `types[primaryType]` — so a payload missing it has nothing to sign.
 * Opening a signing dialog for one asks the user to approve a request that cannot
 * succeed, and a malformed payload crashed the EIP-712 dialog mid-render, leaving the
 * caller's promise unsettled.
 *
 * Gated on `hashTypedData` rather than viem's `validateTypedData`: "hashable" is exactly
 * "signable", whereas `validateTypedData` also type-checks message values and would
 * reject payloads that sign fine today.
 *
 * @param raw - The typed data as the dapp sent it: a JSON string per the spec,
 * or the already-parsed object common in the wild.
 */
export function assertSignableTypedData(raw: unknown): void {
    if (raw === undefined || raw === null) {
        throw standardErrors.rpc.invalidParams('typed data is required');
    }

    // The method's spec says JSON string, but object payloads are common enough in the
    // wild to be worth validating rather than rejecting on shape alone.
    let typedData: unknown = raw;
    if (typeof raw === 'string') {
        try {
            typedData = JSON.parse(raw);
        } catch {
            throw standardErrors.rpc.invalidParams('typed data is not valid JSON');
        }
    }

    if (typeof typedData !== 'object' || typedData === null || Array.isArray(typedData)) {
        throw standardErrors.rpc.invalidParams('typed data must be an object');
    }

    const { types, primaryType } = typedData as { types?: unknown; primaryType?: unknown };

    if (types === undefined) {
        throw standardErrors.rpc.invalidParams('typed data is missing "types"');
    }
    if (typeof types !== 'object' || types === null || Array.isArray(types)) {
        throw standardErrors.rpc.invalidParams('"types" must be an object of EIP-712 type definitions');
    }
    if (typeof primaryType !== 'string' || primaryType.length === 0) {
        throw standardErrors.rpc.invalidParams('"primaryType" must be a non-empty string');
    }

    // The common authoring mistake: naming a type that was never defined. `data` carries
    // what the payload did define, so the caller can see the gap without guessing.
    const defined = Object.keys(types as Record<string, unknown>);
    if (!Array.isArray((types as Record<string, unknown>)[primaryType])) {
        throw standardErrors.rpc.invalidParams({
            message: `"primaryType" "${primaryType}" is not defined in "types"`,
            data: { primaryType, definedTypes: defined },
        });
    }

    // Whatever the checks above can't name — an unresolvable field type, a value that
    // doesn't fit its declared type. Keep our own message and put the underlying reason in
    // `data`, so a dependency's wording never becomes our API surface.
    try {
        hashTypedData(typedData as Parameters<typeof hashTypedData>[0]);
    } catch (error) {
        throw standardErrors.rpc.invalidParams({
            message: 'typed data could not be hashed for signing',
            data: { reason: error instanceof Error ? error.message.split('\n')[0] : 'unknown error' },
        });
    }
}

/** Default auth TTL: 24 hours in seconds */
export const DEFAULT_AUTH_TTL = 86400;

/**
 * Normalizes authTTL to handle edge cases:
 * - undefined/null → DEFAULT_AUTH_TTL
 * - NaN → 0 (immediate expiration)
 * - negative → 0 (immediate expiration)
 * - Infinity → DEFAULT_AUTH_TTL
 * - positive number → used as-is
 */
export function normalizeAuthTTL(authTTL: number | undefined): number {
    if (authTTL === undefined || authTTL === null) {
        return DEFAULT_AUTH_TTL;
    }
    if (Number.isNaN(authTTL)) {
        return 0;
    }
    if (!Number.isFinite(authTTL)) {
        // Infinity or -Infinity → use default TTL
        return DEFAULT_AUTH_TTL;
    }
    return Math.max(0, authTTL);
}

/**
 * Whether the persisted session is *provably* expired, based on its
 * `connectedAt` stamp and the configured auth TTL. Used by the silent
 * reconnect path (eth_accounts) to suppress stale authorization without
 * opening a dialog.
 *
 * Conservative on purpose: returns false when there is no `connectedAt` to
 * judge by (we cannot prove expiry, so we do not suppress) — this mirrors
 * {@link getCachedWalletConnectResponse}, which returns the accounts when
 * `connectedAt` is absent. Returns true when caching is disabled (TTL 0) and a
 * session stamp exists.
 */
export function isSessionExpired(): boolean {
    const { connectedAt } = store.account.get();
    // No stamp → cannot prove expiry (e.g. legacy/in-memory-only session).
    if (connectedAt === undefined) return false;
    const authTTL = normalizeAuthTTL(store.config.get().preference?.authTTL);
    if (authTTL === 0) return true;
    return Date.now() > connectedAt + authTTL * 1000;
}

export async function getCachedWalletConnectResponse(): Promise<WalletConnectResponse | null> {
    const accountState = store.account.get();
    const accounts = accountState.accounts;

    // No accounts or empty accounts array
    if (!accounts || accounts.length === 0) {
        return null;
    }

    // Check if the cache has expired
    const connectedAt = accountState.connectedAt;
    // Use !== undefined to handle connectedAt = 0 (epoch) as valid
    if (connectedAt !== undefined) {
        const config = store.config.get();
        const authTTL = normalizeAuthTTL(config.preference?.authTTL);

        // TTL of 0 means cache is disabled - always require re-auth
        if (authTTL === 0) {
            store.account.clear();
            return null;
        }

        const expiresAt = connectedAt + authTTL * 1000;
        if (Date.now() > expiresAt) {
            // Cache has expired, clear account state and return null
            store.account.clear();
            return null;
        }
    }

    return {
        accounts: accounts.map((account) => ({ address: account })),
    };
}

export function injectRequestCapabilities<T extends RequestArguments>(
    request: T,
    capabilities: Record<string, unknown>
) {
    // Modify request to include auto sub account capabilities
    const modifiedRequest = { ...request };

    if (capabilities && request.method.startsWith('wallet_')) {
        let requestCapabilities = get(modifiedRequest, 'params.0.capabilities');

        if (typeof requestCapabilities === 'undefined') {
            requestCapabilities = {};
        }

        if (typeof requestCapabilities !== 'object') {
            throw standardErrors.rpc.invalidParams();
        }

        requestCapabilities = {
            ...capabilities,
            ...requestCapabilities,
        };

        if (modifiedRequest.params && Array.isArray(modifiedRequest.params)) {
            modifiedRequest.params[0] = {
                ...modifiedRequest.params[0],
                capabilities: requestCapabilities,
            };
        }
    }

    return modifiedRequest as T;
}
