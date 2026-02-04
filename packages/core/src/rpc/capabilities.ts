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
 * @param request - The wallet_getCapabilities request
 * @param apiKey - API key for authentication
 * @param showTestnets - Whether to include testnet chains (default: false)
 * @returns Capabilities for all or filtered chains
 */
export async function handleGetCapabilitiesRequest(
    request: RequestArguments,
    apiKey: string,
    showTestnets = false
): Promise<Record<`0x${string}`, Record<string, unknown>>> {
    const rpcUrl = buildHandleJawRpcUrl(JAW_RPC_URL, apiKey);

    // EIP-5792 format: params[0] is account address, params[1] is optional array of chain IDs to filter by
    const params = request.params as [Address?, `0x${string}`[]?] | undefined;
    const filterChainIds = params?.[1];

    let requestArgs = request;

    // If no chain filter is provided, inject based on showTestnets preference
    if (!filterChainIds || filterChainIds.length === 0) {
        if (!showTestnets) {
            // Only request mainnet chains
            const chainFilter = MAINNET_CHAINS.map(chain => hexStringFromNumber(chain.id));
            requestArgs = {
                ...request,
                params: [params?.[0], chainFilter]
            };
        }
        // If showTestnets is true, don't modify params - let proxy return all chains
    }

    const result = await fetchRPCRequest(requestArgs, rpcUrl);
    return result as Record<`0x${string}`, Record<string, unknown>>;
}
