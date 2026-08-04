import type { Address } from '../provider/interface.js';
import { standardErrors } from '../errors/index.js';
import type { RequestCapabilities } from './permissions.js';
import {
    isRecord,
    optionalChainId,
    optionalHexAddress,
    optionalHexData,
    optionalHexQuantity,
    requireHexAddress,
    requireParamsObject,
} from './paramUtils.js';

const METHOD = 'eth_sendTransaction';

/** An eth_sendTransaction request after validation: every quantity in hex. */
export interface NormalizedSendTransactionParams {
    from?: Address;
    to: Address;
    value?: `0x${string}`;
    data?: `0x${string}`;
    gas?: `0x${string}`;
    gasPrice?: `0x${string}`;
    maxFeePerGas?: `0x${string}`;
    maxPriorityFeePerGas?: `0x${string}`;
    nonce?: `0x${string}`;
    /** Hex chainId, or undefined when the dapp left the chain to the wallet. */
    chainId?: `0x${string}`;
    capabilities?: RequestCapabilities;
}

/**
 * Validates and normalizes eth_sendTransaction params.
 *
 * These used to be checked only inside the signing UI, which surfaced a plain
 * error in the popup and left the dapp's promise pending until the user closed
 * it. Validating in the SDK means a malformed request is refused with `-32602`
 * before any window opens.
 */
export function normalizeSendTransactionParams(params: unknown): NormalizedSendTransactionParams {
    const tx = requireParamsObject(params, METHOD);

    // A smart account executes through `execute`, which always needs a target:
    // contract creation via eth_sendTransaction isn't supported.
    const to = requireHexAddress(tx.to, METHOD, 'to');

    const capabilities = tx.capabilities;
    if (capabilities !== undefined && capabilities !== null && !isRecord(capabilities)) {
        throw standardErrors.rpc.invalidParams(`${METHOD}: capabilities must be an object`);
    }

    const from = optionalHexAddress(tx.from, METHOD, 'from');
    const chainId = optionalChainId(tx.chainId, METHOD);
    const data = optionalHexData(tx.data, METHOD, 'data');

    const quantities = {
        value: optionalHexQuantity(tx.value, METHOD, 'value'),
        gas: optionalHexQuantity(tx.gas, METHOD, 'gas'),
        gasPrice: optionalHexQuantity(tx.gasPrice, METHOD, 'gasPrice'),
        maxFeePerGas: optionalHexQuantity(tx.maxFeePerGas, METHOD, 'maxFeePerGas'),
        maxPriorityFeePerGas: optionalHexQuantity(tx.maxPriorityFeePerGas, METHOD, 'maxPriorityFeePerGas'),
        nonce: optionalHexQuantity(tx.nonce, METHOD, 'nonce'),
    };

    return {
        to,
        ...(from !== undefined && { from }),
        ...(chainId !== undefined && { chainId }),
        ...(data !== undefined && { data }),
        ...Object.fromEntries(Object.entries(quantities).filter(([, v]) => v !== undefined)),
        ...(capabilities ? { capabilities: capabilities as RequestCapabilities } : {}),
    };
}
