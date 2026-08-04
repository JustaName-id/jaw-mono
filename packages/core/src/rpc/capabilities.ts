import { type Address } from 'viem';
import type { RequestArguments } from '../provider/index.js';
import { JAW_RPC_URL } from '../constants.js';
import { buildHandleJawRpcUrl, fetchRPCRequest, hexStringFromNumber } from '../utils/index.js';
import { MAINNET_CHAINS } from '../account/smartAccount.js';

/**
 * Chain metadata capability returned by wallet_getCapabilities
 * Contains chain-specific information including the icon as a data URI
 */
export interface ChainMetadataCapability {
    /** Chain icon as a data URI (e.g., data:image/svg+xml;base64,...) */
    icon?: string;
}

type CapabilitiesResult = Record<`0x${string}`, Record<string, unknown>>;

/**
 * How long a capabilities response stays fresh.
 *
 * Capabilities describe wallet/chain support (which chains, which fee tokens) —
 * operator configuration that changes on deploys, not per request. The
 * transaction dialog fetches them to build its fee-token list before the
 * Confirm button can unlock, so re-fetching on every transaction put a network
 * round trip in front of the user each time. A minute keeps a config change
 * visible well within a session while collapsing a burst of transactions onto
 * one request.
 */
const CAPABILITIES_TTL_MS = 60_000;

type CapabilitiesCacheEntry = { expiresAt: number; promise: Promise<CapabilitiesResult> };

/** Cached by everything that changes the response: api key, filter, testnet scope. */
const capabilitiesCache = new Map<string, CapabilitiesCacheEntry>();

/**
 * Drops every cached capabilities response.
 * Exported for tests and for callers that must bypass the TTL.
 */
export function clearCapabilitiesCache(): void {
    capabilitiesCache.clear();
}

/**
 * Handle wallet_getCapabilities request (EIP-5792)
 *
 * Returns the wallet's capabilities for all supported chains or filtered by chain IDs.
 * Fetches capabilities from the proxy service.
 *
 * If no chain filter is provided in params:
 * - If showTestnets is true: fetches capabilities for all chains
 * - If showTestnets is false: fetches capabilities only for mainnet chains
 *
 * Responses are memoized for {@link CAPABILITIES_TTL_MS}; concurrent callers
 * share one in-flight request.
 *
 * @param request - The wallet_getCapabilities request
 * @param apiKey - API key for authentication
 * @param showTestnets - Whether to include testnet chains (default: false)
 * @returns Capabilities for all or filtered chains
 */
export async function handleGetCapabilitiesRequest(
    request: RequestArguments,
    apiKey: string,
    showTestnets = false
): Promise<CapabilitiesResult> {
    const rpcUrl = buildHandleJawRpcUrl(JAW_RPC_URL, apiKey);

    // EIP-5792 format: params[0] is account address, params[1] is optional array of chain IDs to filter by
    const params = request.params as [Address?, `0x${string}`[]?] | undefined;
    const filterChainIds = params?.[1];

    let requestArgs = request;

    // If no chain filter is provided, inject based on showTestnets preference
    if (!filterChainIds || filterChainIds.length === 0) {
        if (!showTestnets) {
            // Only request mainnet chains
            const chainFilter = MAINNET_CHAINS.map((chain) => hexStringFromNumber(chain.id));
            requestArgs = {
                ...request,
                params: [params?.[0], chainFilter],
            };
        }
        // If showTestnets is true, don't modify params - let proxy return all chains
    }

    const cacheKey = `${apiKey}|${showTestnets}|${JSON.stringify(requestArgs.params ?? null)}`;
    const now = Date.now();
    const cached = capabilitiesCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
        return cached.promise;
    }

    const promise = fetchRPCRequest(requestArgs, rpcUrl).then((result) => result as CapabilitiesResult);
    // Evict on failure so the next caller retries rather than replaying the
    // error for the rest of the TTL.
    promise.catch(() => {
        if (capabilitiesCache.get(cacheKey)?.promise === promise) {
            capabilitiesCache.delete(cacheKey);
        }
    });
    capabilitiesCache.set(cacheKey, { expiresAt: now + CAPABILITIES_TTL_MS, promise });

    return promise;
}
