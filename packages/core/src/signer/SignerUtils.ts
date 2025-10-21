import {standardErrors} from "../errors/index.js";
import {store} from '../store/index.js';
import {RequestArguments} from "../provider/index.js";

import {isAddress} from "viem";

import { WalletConnectResponse } from '../rpc/index.js';

import { get } from '../utils/index.js';

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

export async function getCachedWalletConnectResponse(): Promise<WalletConnectResponse | null> {
    const accounts = store.account.get().accounts;

    if (!accounts) {
        return null;
    }

    const walletConnectAccounts = accounts?.map<WalletConnectResponse['accounts'][number]>(
        (account) => ({
            address: account,
            capabilities: {},
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