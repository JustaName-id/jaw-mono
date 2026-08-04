import { numberToHex } from 'viem';
import type { Address } from '../provider/interface.js';
import { standardErrors } from '../errors/index.js';
import type { RequestCapabilities } from './permissions.js';

/**
 * EIP-5792 request envelope versions accepted by wallet_sendCalls.
 *
 * `1.0` is the original envelope; `2.0.0` is what viem's `sendCalls()` — and
 * therefore wagmi — sends by default. Both map onto the same pipeline: the
 * version only ever changed the envelope, never the semantics of a batch.
 */
export const SUPPORTED_SEND_CALLS_VERSIONS = ['1.0', '2.0.0'] as const;

export type SendCallsVersion = (typeof SUPPORTED_SEND_CALLS_VERSIONS)[number];

/** A single call, with `undefined` fields dropped so the envelope serializes cleanly. */
export interface NormalizedCall {
    to: string;
    data?: string;
    value?: string;
}

/**
 * A wallet_sendCalls envelope after validation: version-tagged, chainId in hex,
 * atomicRequired always present.
 */
export interface NormalizedSendCallsParams {
    version: SendCallsVersion;
    from?: Address;
    /** Hex chainId, or undefined when the dapp left the chain to the wallet. */
    chainId?: `0x${string}`;
    calls: NormalizedCall[];
    atomicRequired: boolean;
    capabilities?: RequestCapabilities;
    /** Caller-supplied batch id (EIP-5792 v2.0.0). */
    id?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Hex quantity/bytes as sent over JSON-RPC. */
function isHexString(value: unknown): value is `0x${string}` {
    return typeof value === 'string' && /^0x[0-9a-fA-F]*$/.test(value);
}

function normalizeChainId(chainId: unknown): `0x${string}` | undefined {
    if (chainId === undefined || chainId === null) return undefined;
    if (typeof chainId === 'number') {
        if (!Number.isSafeInteger(chainId) || chainId <= 0) {
            throw standardErrors.rpc.invalidParams(`wallet_sendCalls: invalid chainId ${chainId}`);
        }
        return numberToHex(chainId);
    }
    if (isHexString(chainId)) return chainId;
    throw standardErrors.rpc.invalidParams(
        `wallet_sendCalls: chainId must be a hex string (e.g. '0x66eee') or a number, got ${JSON.stringify(chainId)}`
    );
}

function normalizeCall(call: unknown, index: number): NormalizedCall {
    if (!isRecord(call)) {
        throw standardErrors.rpc.invalidParams(`wallet_sendCalls: calls[${index}] must be an object`);
    }

    const { to, data, value } = call;

    // EIP-5792 leaves `to` optional (contract creation), but an ERC-4337
    // `execute` always needs a target — so reject it here with a reason instead
    // of failing deeper in the userOp build.
    if (!isHexString(to)) {
        throw standardErrors.rpc.invalidParams(`wallet_sendCalls: calls[${index}].to must be a hex address`);
    }
    if (data !== undefined && !isHexString(data)) {
        throw standardErrors.rpc.invalidParams(`wallet_sendCalls: calls[${index}].data must be hex-encoded`);
    }

    // viem sends value as a hex quantity; tolerate a number/bigint from
    // hand-rolled callers and hex-encode it so downstream sees one shape.
    let normalizedValue: string | undefined;
    if (value !== undefined && value !== null) {
        if (isHexString(value)) normalizedValue = value;
        else if (typeof value === 'number' || typeof value === 'bigint') normalizedValue = numberToHex(value);
        else {
            throw standardErrors.rpc.invalidParams(
                `wallet_sendCalls: calls[${index}].value must be a hex quantity, got ${JSON.stringify(value)}`
            );
        }
    }

    return {
        to,
        ...(data !== undefined && { data }),
        ...(normalizedValue !== undefined && { value: normalizedValue }),
    };
}

/**
 * Validates and normalizes wallet_sendCalls params for both EIP-5792 envelope
 * versions, so a stock viem/wagmi dapp (v2.0.0, hex chainId, capabilities) and a
 * hand-built v1.0 envelope produce the same internal request.
 *
 * Anything malformed — including an envelope version we don't implement — throws
 * `-32602` with a message naming the problem, so dapps can tell a capability gap
 * apart from a rejected batch.
 */
export function normalizeSendCallsParams(params: unknown): NormalizedSendCallsParams {
    if (!Array.isArray(params) || params.length === 0 || !isRecord(params[0])) {
        throw standardErrors.rpc.invalidParams('wallet_sendCalls: expected a single object parameter');
    }

    const envelope = params[0];

    // An absent version means a pre-2.0.0 dapp: EIP-5792 v1.0 shipped before
    // the field was mandatory, so default rather than reject.
    const version = envelope.version ?? '1.0';
    if (!SUPPORTED_SEND_CALLS_VERSIONS.includes(version as SendCallsVersion)) {
        throw standardErrors.rpc.invalidParams(
            `wallet_sendCalls: unsupported version ${JSON.stringify(version)}. Supported versions: ${SUPPORTED_SEND_CALLS_VERSIONS.join(', ')}`
        );
    }

    const { calls } = envelope;
    if (!Array.isArray(calls) || calls.length === 0) {
        throw standardErrors.rpc.invalidParams('wallet_sendCalls: calls must be a non-empty array');
    }

    const from = envelope.from;
    if (from !== undefined && !isHexString(from)) {
        throw standardErrors.rpc.invalidParams('wallet_sendCalls: from must be a hex address');
    }

    const atomicRequired = envelope.atomicRequired;
    if (atomicRequired !== undefined && typeof atomicRequired !== 'boolean') {
        throw standardErrors.rpc.invalidParams('wallet_sendCalls: atomicRequired must be a boolean');
    }

    const capabilities = envelope.capabilities;
    if (capabilities !== undefined && capabilities !== null && !isRecord(capabilities)) {
        throw standardErrors.rpc.invalidParams('wallet_sendCalls: capabilities must be an object');
    }

    const id = envelope.id;
    if (id !== undefined && typeof id !== 'string') {
        throw standardErrors.rpc.invalidParams('wallet_sendCalls: id must be a string');
    }

    const chainId = normalizeChainId(envelope.chainId);

    return {
        version: version as SendCallsVersion,
        ...(from !== undefined && { from: from as Address }),
        ...(chainId !== undefined && { chainId }),
        calls: calls.map(normalizeCall),
        // ERC-4337 executes a batch in a single UserOperation, so atomicity is
        // always satisfied — `atomicRequired: true` never needs to be refused.
        atomicRequired: atomicRequired ?? false,
        ...(capabilities ? { capabilities: capabilities as RequestCapabilities } : {}),
        ...(id !== undefined && { id }),
    };
}
