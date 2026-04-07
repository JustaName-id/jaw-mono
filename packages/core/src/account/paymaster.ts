import { Client, Hex } from 'viem';
import { getGasPrice } from 'viem/actions';
import { PaymasterClient, entryPoint08Address } from 'viem/account-abstraction';

/**
 * Calls eth_estimateUserOperationGas to get gas estimates for a user operation.
 * This is used when the paymaster returns invalid gas limits.
 * Uses the paymaster client transport (Pimlico) which returns proper paymaster gas limits.
 */
async function estimateUserOperationGas(
    paymasterClient: PaymasterClient,
    userOperation: {
        sender: Hex;
        nonce: bigint;
        callData: Hex;
        callGasLimit?: bigint;
        verificationGasLimit?: bigint;
        preVerificationGas?: bigint;
        maxFeePerGas?: bigint;
        maxPriorityFeePerGas?: bigint;
        paymaster?: Hex;
        paymasterData?: Hex;
        paymasterVerificationGasLimit?: bigint;
        paymasterPostOpGasLimit?: bigint;
        signature?: Hex;
        factory?: Hex;
        factoryData?: Hex;
    },
    entryPointAddress: Hex = entryPoint08Address
): Promise<{
    preVerificationGas: bigint;
    verificationGasLimit: bigint;
    callGasLimit: bigint;
    paymasterVerificationGasLimit?: bigint;
    paymasterPostOpGasLimit?: bigint;
}> {
    // Dummy signature for gas estimation (required field but not validated during estimation)
    const DUMMY_SIGNATURE =
        '0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c' as Hex;

    // Build the user operation object for the RPC call
    // All fields must be present for valid JSON-RPC request
    const userOpForRpc: Record<string, string> = {
        sender: userOperation.sender,
        nonce: `0x${(userOperation.nonce || 0n).toString(16)}`,
        callData: userOperation.callData,
        // Required fields with defaults for estimation
        callGasLimit: userOperation.callGasLimit ? `0x${userOperation.callGasLimit.toString(16)}` : '0x0',
        verificationGasLimit: userOperation.verificationGasLimit
            ? `0x${userOperation.verificationGasLimit.toString(16)}`
            : '0x0',
        preVerificationGas: userOperation.preVerificationGas
            ? `0x${userOperation.preVerificationGas.toString(16)}`
            : '0x0',
        maxFeePerGas: userOperation.maxFeePerGas ? `0x${userOperation.maxFeePerGas.toString(16)}` : '0x0',
        maxPriorityFeePerGas: userOperation.maxPriorityFeePerGas
            ? `0x${userOperation.maxPriorityFeePerGas.toString(16)}`
            : '0x0',
        signature: userOperation.signature || DUMMY_SIGNATURE,
    };

    // Add paymaster fields if present
    if (userOperation.paymaster) {
        userOpForRpc.paymaster = userOperation.paymaster;
    }
    if (userOperation.paymasterData) {
        userOpForRpc.paymasterData = userOperation.paymasterData;
    }

    // Add factory fields if present (for account deployment)
    if (userOperation.factory) {
        userOpForRpc.factory = userOperation.factory;
    }
    if (userOperation.factoryData) {
        userOpForRpc.factoryData = userOperation.factoryData;
    }

    // Call eth_estimateUserOperationGas using the paymaster client transport (Pimlico)
    const result = (await paymasterClient.request({
        method: 'eth_estimateUserOperationGas' as any,
        params: [userOpForRpc, entryPointAddress] as any,
    })) as {
        preVerificationGas: Hex;
        verificationGasLimit: Hex;
        callGasLimit: Hex;
        paymasterVerificationGasLimit?: Hex;
        paymasterPostOpGasLimit?: Hex;
    };

    return {
        preVerificationGas: BigInt(result.preVerificationGas),
        verificationGasLimit: BigInt(result.verificationGasLimit),
        callGasLimit: BigInt(result.callGasLimit),
        paymasterVerificationGasLimit: result.paymasterVerificationGasLimit
            ? BigInt(result.paymasterVerificationGasLimit)
            : undefined,
        paymasterPostOpGasLimit: result.paymasterPostOpGasLimit ? BigInt(result.paymasterPostOpGasLimit) : undefined,
    };
}

/**
 * Creates custom paymaster functions that ensure gas prices are fetched
 * before calling the paymaster service.
 *
 * This is required because ERC-7677 compliant paymasters (like Pimlico)
 * require maxFeePerGas and maxPriorityFeePerGas in pm_getPaymasterStubData.
 *
 * Additionally, this ensures paymaster gas limits are set for EntryPoint v0.8,
 * which requires paymasterVerificationGasLimit and paymasterPostOpGasLimit.
 * When the paymaster returns invalid gas limits (like "0x1"), we call
 * eth_estimateUserOperationGas to get actual estimates.
 *
 * @param client - The client to fetch gas prices from and estimate gas
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

            // Check if paymaster returned invalid gas limits (e.g., "0x1")
            const hasInvalidVerificationGasLimit =
                !stubData.paymasterVerificationGasLimit || BigInt(stubData.paymasterVerificationGasLimit) <= 1n;
            const hasInvalidPostOpGasLimit =
                !stubData.paymasterPostOpGasLimit || BigInt(stubData.paymasterPostOpGasLimit) <= 1n;

            // If gas limits are invalid, estimate them
            if (hasInvalidVerificationGasLimit || hasInvalidPostOpGasLimit) {
                try {
                    const gasEstimate = await estimateUserOperationGas(
                        paymasterClient,
                        {
                            sender: userOperation.sender,
                            nonce: userOperation.nonce,
                            callData: userOperation.callData,
                            maxFeePerGas,
                            maxPriorityFeePerGas,
                            paymaster: stubData.paymaster,
                            paymasterData: stubData.paymasterData,
                            factory: userOperation.factory,
                            factoryData: userOperation.factoryData,
                        },
                        userOperation.entryPointAddress
                    );
                    return {
                        ...stubData,
                        paymasterVerificationGasLimit: hasInvalidVerificationGasLimit
                            ? gasEstimate.paymasterVerificationGasLimit
                            : stubData.paymasterVerificationGasLimit,
                        paymasterPostOpGasLimit: hasInvalidPostOpGasLimit
                            ? gasEstimate.paymasterPostOpGasLimit
                            : stubData.paymasterPostOpGasLimit,
                    } as typeof stubData;
                } catch (error) {
                    // If estimation fails, return stub data as-is (will likely fail later)
                    console.warn('[createPaymasterFunctions] Gas estimation failed:', error);
                    return stubData;
                }
            }

            return stubData;
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

            // If paymaster returned invalid gas limits, use values from userOperation (from stub data)
            // No need to re-estimate since stub data already has valid values
            const hasInvalidVerificationGasLimit =
                !paymasterData.paymasterVerificationGasLimit ||
                BigInt(paymasterData.paymasterVerificationGasLimit) <= 1n;
            const hasInvalidPostOpGasLimit =
                !paymasterData.paymasterPostOpGasLimit || BigInt(paymasterData.paymasterPostOpGasLimit) <= 1n;

            if (hasInvalidVerificationGasLimit || hasInvalidPostOpGasLimit) {
                return {
                    ...paymasterData,
                    paymasterVerificationGasLimit: hasInvalidVerificationGasLimit
                        ? userOperation.paymasterVerificationGasLimit
                        : paymasterData.paymasterVerificationGasLimit,
                    paymasterPostOpGasLimit: hasInvalidPostOpGasLimit
                        ? userOperation.paymasterPostOpGasLimit
                        : paymasterData.paymasterPostOpGasLimit,
                } as typeof paymasterData;
            }

            return paymasterData;
        },
    };
}
