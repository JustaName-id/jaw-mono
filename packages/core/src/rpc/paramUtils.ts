import { numberToHex } from 'viem';
import { standardErrors } from '../errors/index.js';

/**
 * Shared shape checks for dapp-supplied RPC params. Validation lives in the SDK
 * (not in the signing UI) so a malformed request is refused with a
 * standards-compliant error before any popup or dialog opens.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Hex quantity/bytes as sent over JSON-RPC. */
export function isHexString(value: unknown): value is `0x${string}` {
    return typeof value === 'string' && /^0x[0-9a-fA-F]*$/.test(value);
}

/** Asserts `params` is a `[{ ... }]` tuple and returns the envelope. */
export function requireParamsObject(params: unknown, method: string): Record<string, unknown> {
    if (!Array.isArray(params) || params.length === 0 || !isRecord(params[0])) {
        throw standardErrors.rpc.invalidParams(`${method}: expected a single object parameter`);
    }
    return params[0];
}

export function requireHexAddress(value: unknown, method: string, field: string): `0x${string}` {
    if (!isHexString(value)) {
        throw standardErrors.rpc.invalidParams(`${method}: ${field} must be a hex address`);
    }
    return value;
}

export function optionalHexAddress(value: unknown, method: string, field: string): `0x${string}` | undefined {
    if (value === undefined || value === null) return undefined;
    return requireHexAddress(value, method, field);
}

/**
 * Normalizes a hex quantity. viem sends these as hex; a number/bigint from a
 * hand-rolled caller is hex-encoded so downstream sees one shape.
 */
export function optionalHexQuantity(value: unknown, method: string, field: string): `0x${string}` | undefined {
    if (value === undefined || value === null) return undefined;
    if (isHexString(value)) return value;
    if (typeof value === 'number' || typeof value === 'bigint') {
        if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) {
            throw standardErrors.rpc.invalidParams(`${method}: ${field} must be a non-negative integer`);
        }
        return numberToHex(value);
    }
    throw standardErrors.rpc.invalidParams(`${method}: ${field} must be a hex quantity, got ${JSON.stringify(value)}`);
}

export function optionalHexData(value: unknown, method: string, field: string): `0x${string}` | undefined {
    if (value === undefined || value === null) return undefined;
    if (!isHexString(value)) {
        throw standardErrors.rpc.invalidParams(`${method}: ${field} must be hex-encoded`);
    }
    return value;
}

/** Accepts a hex chainId (what viem sends) or a number, and returns hex. */
export function optionalChainId(chainId: unknown, method: string): `0x${string}` | undefined {
    if (chainId === undefined || chainId === null) return undefined;
    if (typeof chainId === 'number') {
        if (!Number.isSafeInteger(chainId) || chainId <= 0) {
            throw standardErrors.rpc.invalidParams(`${method}: invalid chainId ${chainId}`);
        }
        return numberToHex(chainId);
    }
    if (isHexString(chainId)) return chainId;
    throw standardErrors.rpc.invalidParams(
        `${method}: chainId must be a hex string (e.g. '0x66eee') or a number, got ${JSON.stringify(chainId)}`
    );
}
