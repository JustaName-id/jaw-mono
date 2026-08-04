import type { Address } from '../provider/interface.js';
import { standardErrors } from '../errors/index.js';
import type { RequestArguments } from '../provider/interface.js';
import { isRecord, requireHexAddress } from './paramUtils.js';

const METHOD = 'eth_signTypedData_v4';

/** An eth_signTypedData_v4 request after validation: typed data always serialized. */
export interface NormalizedSignTypedDataParams {
    address: Address;
    /** EIP-712 payload as a JSON string. */
    typedData: string;
}

/**
 * Validates eth_signTypedData_v4 params and serializes the payload.
 *
 * viem sends the typed data pre-serialized, but MetaMask accepts a plain object
 * and dapps written against it send one. An object used to reach the signing UI
 * where a JSON string was expected and fail there, leaving the dapp waiting on
 * a dialog it couldn't satisfy — so accept both and serialize here.
 */
export function normalizeSignTypedDataParams(params: unknown): NormalizedSignTypedDataParams {
    if (!Array.isArray(params) || params.length < 2) {
        throw standardErrors.rpc.invalidParams(`${METHOD}: expected [address, typedData] params`);
    }

    const address = requireHexAddress(params[0], METHOD, 'params[0] (address)');
    const payload = params[1];

    let parsed: unknown;
    let typedData: string;

    if (typeof payload === 'string') {
        try {
            parsed = JSON.parse(payload);
        } catch {
            throw standardErrors.rpc.invalidParams(`${METHOD}: typedData is not valid JSON`);
        }
        typedData = payload;
    } else if (isRecord(payload)) {
        parsed = payload;
        typedData = JSON.stringify(payload);
    } else {
        throw standardErrors.rpc.invalidParams(
            `${METHOD}: typedData must be an EIP-712 object or its JSON string, got ${JSON.stringify(payload)}`
        );
    }

    if (!isRecord(parsed)) {
        throw standardErrors.rpc.invalidParams(`${METHOD}: typedData must describe an EIP-712 payload`);
    }

    // Without these the payload can't be encoded at all, and the failure would
    // otherwise surface inside the signing UI rather than to the caller.
    for (const field of ['types', 'primaryType', 'message'] as const) {
        if (parsed[field] === undefined) {
            throw standardErrors.rpc.invalidParams(`${METHOD}: typedData is missing ${field}`);
        }
    }

    return { address, typedData };
}

/**
 * Returns a request whose typed data is serialized, preserving the original
 * shape. Mirrors `decodePersonalSignRequest`: the popup receives one form
 * regardless of what the dapp sent.
 */
export function normalizeSignTypedDataRequest(request: RequestArguments): RequestArguments {
    if (request.method !== METHOD) {
        return request;
    }

    const { address, typedData } = normalizeSignTypedDataParams(request.params);

    return { ...request, params: [address, typedData] };
}
