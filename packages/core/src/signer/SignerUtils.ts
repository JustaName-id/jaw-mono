import {standardErrors} from "../errors/index.js";
import {store} from '../store/index.js';
import {RequestArguments} from "../provider/index.js";

import {isAddress, isHex, hexToString, type Address} from "viem";

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

export function assertGetCapabilitiesParams(
    params: unknown
): asserts params is [`0x${string}`, `0x${string}`[]?] {
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

        const expiresAt = connectedAt + (authTTL * 1000);
        if (Date.now() > expiresAt) {
            // Cache has expired, clear account state and return null
            store.account.clear();
            return null;
        }
    }

    // Get stored capabilities (e.g., signInWithEthereum response)
    const storedCapabilities = accountState.capabilities;

    const walletConnectAccounts = accounts?.map<WalletConnectResponse['accounts'][number]>(
        (account, index) => ({
            address: account,
            // Only include capabilities for the first account (where they're typically stored)
            capabilities: index === 0 && storedCapabilities ? storedCapabilities : {},
        })
    );

    return {
        accounts: walletConnectAccounts,
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