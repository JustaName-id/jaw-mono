import { standardErrors } from '../errors/index.js';
import { RequestArguments } from '../provider/index.js';
import { store } from '../store/index.js';

/**
 * Constructs the JAW RPC URL, appending the API key as a query parameter when
 * there is one. The parameter is dropped rather than sent empty, since
 * `api-key=` with nothing after it reaches the proxy as a malformed key.
 * @param baseUrl The base RPC URL
 * @param apiKey The API key to append to the URL, if the caller has one
 * @returns The constructed URL
 */
export function buildHandleJawRpcUrl(baseUrl: string, apiKey?: string): string {
    return apiKey ? `${baseUrl}/handle?api-key=${apiKey}` : `${baseUrl}/handle`;
}

export async function fetchRPCRequest(request: RequestArguments, rpcUrl: string) {
    const requestBody = {
        ...request,
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
    };
    // Calls made from the keys origin all carry the same `Origin`, so the caller
    // they act on behalf of travels alongside instead of in it.
    const dappOrigin = store.config.get().dappOrigin;

    const res = await fetch(rpcUrl, {
        method: 'POST',
        body: JSON.stringify(requestBody),
        mode: 'cors',
        headers: {
            'Content-Type': 'application/json',
            ...(dappOrigin ? { 'x-dapp-origin': dappOrigin } : {}),
        },
    });

    // A refusal from the proxy is not a JSON-RPC envelope, so destructuring it
    // hands back two undefineds and the call resolves to `undefined` instead of
    // failing. Callers that memoize their result then cache that silence, which
    // is how a rejected wallet_getCapabilities reads as "no capabilities".
    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        const message = `JAW RPC request failed with ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`;
        throw res.status === 401 || res.status === 403
            ? standardErrors.provider.unauthorized(message)
            : standardErrors.rpc.internal(message);
    }

    const { result, error } = await res.json();
    if (error) throw error;
    return result;
}
/**
 * Validates the arguments for an invalid request and returns an error if any validation fails.
 * Valid request args are defined here: https://eips.ethereum.org/EIPS/eip-1193#request
 * @param args The request arguments to validate.
 * @returns An error object if the arguments are invalid, otherwise undefined.
 */
export function checkErrorForInvalidRequestArgs(args: unknown): asserts args is RequestArguments {
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
        throw standardErrors.rpc.invalidParams({
            message: 'Expected a single, non-array, object argument.',
            data: args,
        });
    }

    const { method, params } = args as RequestArguments;

    if (typeof method !== 'string' || method.length === 0) {
        throw standardErrors.rpc.invalidParams({
            message: "'args.method' must be a non-empty string.",
            data: args,
        });
    }

    if (params !== undefined && !Array.isArray(params) && (typeof params !== 'object' || params === null)) {
        throw standardErrors.rpc.invalidParams({
            message: "'args.params' must be an object or array if provided.",
            data: args,
        });
    }

    switch (method) {
        case 'eth_sign':
        case 'eth_signTypedData_v2':
        case 'eth_subscribe':
        case 'eth_unsubscribe':
            throw standardErrors.provider.unsupportedMethod();
    }
}
