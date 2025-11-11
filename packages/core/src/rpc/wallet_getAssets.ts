import { RequestArguments } from '../provider/index.js';
import { JAW_RPC_URL } from '../constants.js';
import { buildHandleJawRpcUrl, fetchRPCRequest, hexStringFromNumber } from '../utils/index.js';
import { getSupportedChains } from '../account/smartAccount.js';

/**
 * Handles wallet_getAssets (EIP-7811) requests.
 * Automatically injects chainFilter based on showTestnets preference if not provided.
 *
 * @param request - The request arguments containing params
 * @param apiKey - API key for authentication
 * @param showTestnets - Whether to include testnet chains (default: false)
 * @returns The assets response from the RPC server
 */
export async function handleGetAssetsRequest(
    request: RequestArguments,
    apiKey: string,
    showTestnets = false
): Promise<unknown> {
    const rpcUrl = buildHandleJawRpcUrl(JAW_RPC_URL, apiKey);

    // If chainFilter is not provided in params, inject default chains based on showTestnets preference
    let requestArgs = request;

    // Extract the params object (first element in the array)
    const paramsObj = Array.isArray(request.params) && request.params[0]
        ? request.params[0] as Record<string, unknown>
        : undefined;

    // If chainFilter is not provided, inject it based on showTestnets preference
    if (paramsObj && !('chainFilter' in paramsObj)) {
        const supportedChains = getSupportedChains(showTestnets);
        // Convert chain IDs to hex format as required by EIP-7811
        const chainFilter = supportedChains.map(chain => hexStringFromNumber(chain.id));

        requestArgs = {
            ...request,
            params: [{
                ...paramsObj,
                chainFilter
            }]
        };
    }

    const result = await fetchRPCRequest(requestArgs, rpcUrl);
    return result;
}