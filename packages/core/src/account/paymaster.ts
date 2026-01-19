import { Client } from 'viem';
import { getGasPrice } from 'viem/actions';
import { PaymasterClient } from 'viem/account-abstraction';

/**
 * Default gas limits for EntryPoint v0.8 paymaster operations.
 * These are used when the paymaster doesn't return gas limits or returns invalid values (like "0x1").
 */
export const DEFAULT_PAYMASTER_VERIFICATION_GAS_LIMIT = 100000n;
export const DEFAULT_PAYMASTER_POST_OP_GAS_LIMIT = 50000n;

/**
 * Creates custom paymaster functions that ensure gas prices are fetched
 * before calling the paymaster service.
 *
 * This is required because ERC-7677 compliant paymasters (like Pimlico)
 * require maxFeePerGas and maxPriorityFeePerGas in pm_getPaymasterStubData.
 *
 * Additionally, this ensures paymaster gas limits are set for EntryPoint v0.8,
 * which requires paymasterVerificationGasLimit and paymasterPostOpGasLimit.
 *
 * @param client - The client to fetch gas prices from
 * @param paymasterClient - The paymaster client to delegate calls to
 * @param chainId - The chain ID for the paymaster requests
 * @param context - Optional paymaster context (e.g., sponsorshipPolicyId for Pimlico)
 * @returns Custom paymaster functions compatible with viem's bundler client
 */
export function createPaymasterFunctions(
    client: Client,
    paymasterClient: PaymasterClient,
    chainId: number,
    context?: Record<string, unknown>
) {
    return {
        async getPaymasterStubData(userOperation: Parameters<PaymasterClient['getPaymasterStubData']>[0]) {
            // Fetch gas prices if not already present
            let maxFeePerGas = userOperation.maxFeePerGas;
            let maxPriorityFeePerGas = userOperation.maxPriorityFeePerGas;

            if (!maxFeePerGas || !maxPriorityFeePerGas) {
                const gasPrice = await getGasPrice(client);
                maxFeePerGas = maxFeePerGas || gasPrice;
                maxPriorityFeePerGas = maxPriorityFeePerGas || gasPrice;
            }

            const stubData = await paymasterClient.getPaymasterStubData({
                ...userOperation,
                maxFeePerGas,
                maxPriorityFeePerGas,
                chainId,
                entryPointAddress: userOperation.entryPointAddress,
                ...(context && { context }),
            });

            // Ensure paymaster gas limits are set (required for EntryPoint v0.8)
            // Default to reasonable values if not returned by paymaster or if invalid (e.g., "0x1")
            const paymasterVerificationGasLimit = stubData.paymasterVerificationGasLimit && BigInt(stubData.paymasterVerificationGasLimit) > 1n
                ? stubData.paymasterVerificationGasLimit
                : DEFAULT_PAYMASTER_VERIFICATION_GAS_LIMIT;
            const paymasterPostOpGasLimit = stubData.paymasterPostOpGasLimit && BigInt(stubData.paymasterPostOpGasLimit) > 1n
                ? stubData.paymasterPostOpGasLimit
                : DEFAULT_PAYMASTER_POST_OP_GAS_LIMIT;

            const result = Object.assign({}, stubData, {
                paymasterVerificationGasLimit,
                paymasterPostOpGasLimit,
            });
            return result as typeof stubData;
        },

        async getPaymasterData(userOperation: Parameters<PaymasterClient['getPaymasterData']>[0]) {
            // Fetch gas prices if not already present
            let maxFeePerGas = userOperation.maxFeePerGas;
            let maxPriorityFeePerGas = userOperation.maxPriorityFeePerGas;

            if (!maxFeePerGas || !maxPriorityFeePerGas) {
                const gasPrice = await getGasPrice(client);
                maxFeePerGas = maxFeePerGas || gasPrice;
                maxPriorityFeePerGas = maxPriorityFeePerGas || gasPrice;
            }

            const paymasterData = await paymasterClient.getPaymasterData({
                ...userOperation,
                maxFeePerGas,
                maxPriorityFeePerGas,
                chainId,
                entryPointAddress: userOperation.entryPointAddress,
                ...(context && { context }),
            });

            // Ensure paymaster gas limits are set (required for EntryPoint v0.8)
            // Use the gas limits from stub data estimation or fallback to defaults
            const paymasterVerificationGasLimit = paymasterData.paymasterVerificationGasLimit && BigInt(paymasterData.paymasterVerificationGasLimit) > 1n
                ? paymasterData.paymasterVerificationGasLimit
                : userOperation.paymasterVerificationGasLimit || DEFAULT_PAYMASTER_VERIFICATION_GAS_LIMIT;
            const paymasterPostOpGasLimit = paymasterData.paymasterPostOpGasLimit && BigInt(paymasterData.paymasterPostOpGasLimit) > 1n
                ? paymasterData.paymasterPostOpGasLimit
                : userOperation.paymasterPostOpGasLimit || DEFAULT_PAYMASTER_POST_OP_GAS_LIMIT;

            const result = Object.assign({}, paymasterData, {
                paymasterVerificationGasLimit,
                paymasterPostOpGasLimit,
            });
            return result as typeof paymasterData;
        }
    };
}
