import { restCall } from '../api/index.js';
import { JAW_PROXY_URL } from '../constants.js';
import { standardErrors } from '../errors/index.js';
import type { RequestArguments } from '../provider/index.js';
import type { Address } from 'viem';
import type { CallsHistoryItem } from '../api/routes/index.js';

/**
 * Parameters for wallet_getCallsHistory
 */
export type WalletGetCallsHistoryParams = [{
    /** Address to fetch call bundles for (required) */
    address: Address;
    /** Optional index cursor for pagination */
    index?: number;
    /** Maximum number of bundles to return (default: 20) */
    limit?: number;
    /** Sort direction based on index (default: 'desc' - newest first) */
    sort?: 'asc' | 'desc';
}];

/**
 * Response type for wallet_getCallsHistory
 */
export type WalletGetCallsHistoryResponse = CallsHistoryItem[];

/**
 * Handles the wallet_getCallsHistory RPC request.
 * Fetches the call history for a given address from the proxy.
 *
 * @param request - The RPC request arguments
 * @param apiKey - The API key for authentication
 * @param connectedAddress - Optional connected account address to use as fallback
 * @returns Array of call history items
 */
export async function handleGetCallsHistoryRequest(
    request: RequestArguments,
    apiKey: string,
    connectedAddress?: Address
): Promise<WalletGetCallsHistoryResponse> {
    // Validate params
    if (!Array.isArray(request.params) || request.params.length === 0) {
        throw standardErrors.rpc.invalidParams('params must be an array with at least one element');
    }

    const params = request.params[0] as WalletGetCallsHistoryParams[0];

    if (!params || typeof params !== 'object') {
        throw standardErrors.rpc.invalidParams('params[0] must be an object');
    }

    // Use params.address if provided, otherwise fall back to connected address
    const address = params.address ?? connectedAddress;

    if (!address) {
        throw standardErrors.rpc.invalidParams('address is required');
    }

    // Build request payload
    const requestPayload: {
        address: Address;
        index?: number;
        limit?: number;
        sort?: 'asc' | 'desc';
    } = {
        address,
    };

    if (params.index !== undefined) {
        requestPayload.index = params.index;
    }

    if (params.limit !== undefined) {
        requestPayload.limit = params.limit;
    }

    if (params.sort !== undefined) {
        requestPayload.sort = params.sort;
    }

    // Call the API
    const result = await restCall(
        'GET_CALLS_HISTORY',
        'GET',
        requestPayload,
        undefined,
        undefined,
        undefined,
        JAW_PROXY_URL,
        { 'api-key': apiKey }
    );

    return result;
}
