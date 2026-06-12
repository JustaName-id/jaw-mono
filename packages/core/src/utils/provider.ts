import { standardErrors } from '../errors/index.js';
import { RequestArguments } from '../provider/index.js';

/**
 * Constructs the JAW handle RPC URL. The API key is sent as the `x-api-key`
 * request header by fetchRPCRequest, not as a query parameter.
 * @param baseUrl The base RPC URL
 * @returns The constructed handle URL
 */
export function buildHandleJawRpcUrl(baseUrl: string): string {
    return `${baseUrl}/handle`;
}

export async function fetchRPCRequest(request: RequestArguments, rpcUrl: string, apiKey?: string) {
    const requestBody = {
        ...request,
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
    };
    const res = await fetch(rpcUrl, {
        method: 'POST',
        body: JSON.stringify(requestBody),
        mode: 'cors',
        headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { 'x-api-key': apiKey } : {}),
        },
    });
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
