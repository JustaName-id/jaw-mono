import {
    Address,
    Client,
    getAddress,
    Hash,
    Hex,
    isAddress,
    pad,
    Transport,
    Chain as ViemChain,
    formatUnits,
    http,
    createPublicClient,
    LocalAccount,
    encodeFunctionData
} from "viem";
import {getCode, getGasPrice, readContract} from "viem/actions";
import {abi, factoryAbi, JustanAccountImplementation, toJustanAccount, type ToJustanAccountReturnType} from "./toJustanAccount.js";
import {isDelegatedToImplementation} from "./delegation.js";
import {createPaymasterFunctions} from "./paymaster.js";
import {
    BundlerClient,
    SmartAccount,
    createBundlerClient,
    createPaymasterClient,
    WebAuthnAccount
} from "viem/account-abstraction";
import {Chain} from "../store/index.js";
import {arbitrum, arbitrumSepolia, avalancheFuji, base, baseSepolia, celo, celoSepolia, linea, mainnet, optimism, optimismSepolia, sepolia , avalanche, bsc} from "viem/chains";
import {PERMISSIONS_MANAGER_ADDRESS, FACTORY_ADDRESS} from "../constants.js";
import {
    getPermissionFromRelay,
    relayPermissionToPermission,
    encodeExecuteBatchWithPermission,
} from "../rpc/permissions.js";
import { notifyReceiptReceived } from "../analytics/index.js";

export type FindOwnerIndexParams = {
    /**
     * The address of the account to get the owner index for
     */
    address: `0x${string}`;
    /**
     * The client to use to get the code and read the contract
     */
    client: Client;
    /**
     * The public key of the owner
     */
    publicKey: Hex;
};

export type BundledTransactionResult = {
    /**
     * The user operation hash
     */
    id: Hash;
    /**
     * The chain id
     */
    chainId: number;
}

export const MAINNET_CHAINS = [
    mainnet,
    base,
    optimism,
    arbitrum,
    linea,
    avalanche,
    bsc,
    celo
]

export const TESTNET_CHAINS = [
    sepolia,
    baseSepolia,
    optimismSepolia,
    arbitrumSepolia,
    celoSepolia,
    avalancheFuji
]

export const SUPPORTED_CHAINS = [
    ...MAINNET_CHAINS,
    ...TESTNET_CHAINS,
]

/**
 * Get supported chains based on testnet preference.
 *
 * @param showTestnets - Whether to include testnet chains (default: false)
 * @returns Array of supported chains
 */
export function getSupportedChains(showTestnets = false) {
    return showTestnets ? SUPPORTED_CHAINS : MAINNET_CHAINS;
}

/**
 * Gets or creates a bundler client for a chain using lazy loading.
 * Clients are cached in the store and created only when first accessed.
 *
 * @param chain - The chain to get the bundler client for
 * @param paymasterUrlOverride - Optional paymaster URL that takes priority over chain.paymasterUrl.
 *                               Used when wallet_sendCalls includes a paymasterService capability.
 * @param paymasterContextOverride - Optional paymaster context that takes priority over chain.paymasterContext.
 *                                   Used when wallet_sendCalls includes paymaster context in capabilities.
 * @returns The bundler client for the specified chain
 * @throws Error if the chain is not supported or client creation fails
 */
export const getBundlerClient = (
    chain: Chain,
    paymasterUrlOverride?: string,
    paymasterContextOverride?: Record<string, unknown>
): BundlerClient<Transport, ViemChain> => {
    const viemChain = SUPPORTED_CHAINS.find(c => c.id === chain.id);

    const publicClient = createPublicClient({
        chain: viemChain,
        transport: http(chain.rpcUrl),
    });

    // Priority: overrides (from capabilities) > chain config (from SDK config)
    const effectivePaymasterUrl = paymasterUrlOverride || chain.paymaster?.url;
    const effectivePaymasterContext = paymasterContextOverride || chain.paymaster?.context;

    // If no paymaster URL, return bundler client without paymaster
    if (!effectivePaymasterUrl) {
        return createBundlerClient({
            client: publicClient,
            transport: http(chain.rpcUrl)
        });
    }

    const paymasterClient = createPaymasterClient({
        transport: http(effectivePaymasterUrl)
    });

    // Use shared paymaster functions that handle gas price fetching and v0.8 gas limits
    return createBundlerClient({
        client: publicClient,
        paymaster: createPaymasterFunctions(publicClient, paymasterClient, chain.id, effectivePaymasterContext),
        transport: http(chain.rpcUrl)
    });
}

/**
 * Prepares calls for EIP-7702 execution by checking delegation status
 * and prepending owner setup if needed.
 */
async function prepareEip7702Calls(
    smartAccount: SmartAccount,
    localAccount: LocalAccount,
    calls: Array<{ to: Address; value: bigint; data: Hex }>,
    chain: Chain
): Promise<{
    calls: Array<{ to: Address; value: bigint; data: Hex }>;
    authorization?: Awaited<ReturnType<ToJustanAccountReturnType['signAuthorization']>>;
}> {
    const publicClient = createPublicClient({
        chain: SUPPORTED_CHAINS.find(c => c.id === chain.id),
        transport: http(chain.rpcUrl),
    });

    const implementationAddress = await readContract(publicClient, {
        address: FACTORY_ADDRESS as Address,
        abi: factoryAbi,
        functionName: "getImplementation",
    });

    const delegated = await isDelegatedToImplementation(publicClient, localAccount.address, implementationAddress);

    // Sign authorization if not yet delegated to our implementation
    const authorization = !delegated
        ? await (smartAccount as ToJustanAccountReturnType).signAuthorization()
        : undefined;

    let finalCalls = [...calls];

    // Check if permissions manager is registered as owner
    let isPmOwner = false;
    try {
        isPmOwner = await readContract(publicClient, {
            address: localAccount.address,
            abi,
            functionName: 'isOwnerAddress',
            args: [PERMISSIONS_MANAGER_ADDRESS],
        });
    } catch {
        isPmOwner = false;
    }

    if (!isPmOwner) {
        finalCalls = [{
            to: getAddress(localAccount.address),
            value: 0n,
            data: encodeFunctionData({
                abi,
                functionName: 'addOwnerAddress',
                args: [PERMISSIONS_MANAGER_ADDRESS],
            }),
        }, ...finalCalls];
    }

    return { calls: finalCalls, authorization };
}

export async function sendTransaction(
    smartAccount: SmartAccount,
    calls: Array<{
        to: Address;
        value?: bigint;
        data?: Hex;
    }>,
    chain: Chain,
    paymasterUrlOverride?: string,
    paymasterContextOverride?: Record<string, unknown>,
    apiKey?: string,
    localAccount?: LocalAccount
): Promise<Hash> {
    const bundlerClient = getBundlerClient(chain, paymasterUrlOverride, paymasterContextOverride)

    let finalCalls = calls.map(call => ({
        to: getAddress(call.to),
        value: call.value ?? 0n,
        data: (call.data ?? '0x') as Hex,
    }));

    let authorization: Awaited<ReturnType<ToJustanAccountReturnType['signAuthorization']>> | undefined;
    if (localAccount) {
        const prepared = await prepareEip7702Calls(smartAccount, localAccount, finalCalls, chain);
        finalCalls = prepared.calls;
        authorization = prepared.authorization;
    }

    const userOpHash = await bundlerClient.sendUserOperation({
        account: smartAccount,
        calls: finalCalls,
        ...(authorization ? { authorization } : {}),
    })

    // Wait for the transaction receipt and get the actual transaction hash
    const receipt = await bundlerClient.waitForUserOperationReceipt({
        hash: userOpHash
    })

    // Fire-and-forget notification to proxy
    if (apiKey) {
        // Extract the actual receipt - same logic as wallet_sendCalls.ts
        const actualReceipt = (receipt as any).receipt || receipt;
        const receiptStatus = actualReceipt.status;

        // Determine if transaction succeeded:
        // - status === '0x1' or 1 means success
        // - If status is undefined but transactionHash exists, assume success (included on-chain)
        const isSuccess = receiptStatus === '0x1' ||
            receiptStatus === 1 ||
            (receiptStatus === undefined && actualReceipt.transactionHash !== undefined);

        notifyReceiptReceived({
            userOpHash,
            transactionHash: actualReceipt.transactionHash,
            success: isSuccess,
            apiKey,
        });
    }

    return receipt.receipt.transactionHash
}

export async function sendCalls(
    smartAccount: SmartAccount,
    calls: Array<{
        to: Address;
        value?: bigint;
        data?: Hex;
    }>,
    chain: Chain,
    paymasterUrlOverride?: string,
    paymasterContextOverride?: Record<string, unknown>,
    localAccount?: LocalAccount
): Promise<BundledTransactionResult> {
    const bundlerClient = getBundlerClient(chain, paymasterUrlOverride, paymasterContextOverride)

    let finalCalls = calls.map(call => ({
        to: getAddress(call.to),
        value: call.value ?? 0n,
        data: (call.data ?? '0x') as Hex,
    }));

    let authorization: Awaited<ReturnType<ToJustanAccountReturnType['signAuthorization']>> | undefined;
    if (localAccount) {
        const prepared = await prepareEip7702Calls(smartAccount, localAccount, finalCalls, chain);
        finalCalls = prepared.calls;
        authorization = prepared.authorization;
    }

    const userOpHash = await bundlerClient.sendUserOperation({
        account: smartAccount,
        calls: finalCalls,
        ...(authorization ? { authorization } : {}),
    })

    return {
        id: userOpHash,
        chainId: chain.id
    }
}

/**
 * Send multiple calls using a permission.
 * This encodes the calls and sends them through the JustaPermissionManager contract's executeBatch function.
 *
 * @param smartAccount - The smart account to send from
 * @param calls - Array of calls to execute
 * @param chain - The chain to send on
 * @param permissionId - The ID (hash) of the permission to use
 * @param apiKey - API key for fetching permission from relay
 * @returns The bundled transaction result with userOpHash and chainId
 */
export async function sendCallsWithPermission(
    smartAccount: SmartAccount,
    calls: Array<{
        to: Address;
        value?: bigint;
        data?: Hex;
    }>,
    chain: Chain,
    permissionId: Hex,
    apiKey: string,
    paymasterUrlOverride?: string,
    paymasterContextOverride?: Record<string, unknown>,
    localAccount?: LocalAccount
): Promise<BundledTransactionResult> {
    // Fetch the permission from the relay
    const relayPermission = await getPermissionFromRelay(permissionId, apiKey);
    const permission = relayPermissionToPermission(relayPermission);

    // Format calls for the contract
    const formattedCalls = calls.map(call => ({
        target: getAddress(call.to),
        value: call.value ?? 0n,
        data: call.data ?? '0x' as Hex,
    }));

    // Encode the executeBatch call with permission
    const encodedData = encodeExecuteBatchWithPermission(permission, formattedCalls);

    // The permission call routed through the permissions manager
    let finalCalls: Array<{ to: Address; value: bigint; data: Hex }> = [{
        to: getAddress(PERMISSIONS_MANAGER_ADDRESS),
        value: 0n,
        data: encodedData,
    }];

    // EIP-7702: prepend delegation authorization + owner setup if needed
    let authorization: Awaited<ReturnType<ToJustanAccountReturnType['signAuthorization']>> | undefined;
    if (localAccount) {
        const prepared = await prepareEip7702Calls(smartAccount, localAccount, finalCalls, chain);
        finalCalls = prepared.calls;
        authorization = prepared.authorization;
    }

    const bundlerClient = getBundlerClient(chain, paymasterUrlOverride, paymasterContextOverride);

    const userOpHash = await bundlerClient.sendUserOperation({
        account: smartAccount,
        calls: finalCalls,
        ...(authorization ? { authorization } : {}),
    });

    return {
        id: userOpHash,
        chainId: chain.id
    };
}

export async function estimateUserOpGas(
    smartAccount: SmartAccount,
    calls: Array<{
        to: Address;
        value?: bigint;
        data?: Hex;
    }>,
    chain: Chain,
    paymasterUrlOverride?: string
): Promise<bigint> {
    const bundlerClient = getBundlerClient(chain, paymasterUrlOverride);

    const gasEstimate = await bundlerClient.estimateUserOperationGas({
        account: smartAccount,
        calls: calls.map(call => ({
            to: call.to,
            value: call.value ?? 0n,
            data: call.data ?? '0x'
        })),
    })

    return gasEstimate.callGasLimit + gasEstimate.preVerificationGas + gasEstimate.verificationGasLimit
}

/**
 * Estimate gas for a user operation using a permission.
 * This estimates gas for calls routed through the JustaPermissionManager contract's executeBatch function.
 *
 * @param smartAccount - The smart account to estimate for
 * @param calls - Array of calls to execute
 * @param chain - The chain to estimate on
 * @param permissionId - The ID (hash) of the permission to use
 * @param apiKey - API key for fetching permission from relay
 * @returns The estimated gas amount
 */
export async function estimateUserOpGasWithPermission(
    smartAccount: SmartAccount,
    calls: Array<{
        to: Address;
        value?: bigint;
        data?: Hex;
    }>,
    chain: Chain,
    permissionId: Hex,
    apiKey: string
): Promise<bigint> {
    // Fetch the permission from the relay
    const relayPermission = await getPermissionFromRelay(permissionId, apiKey);
    const permission = relayPermissionToPermission(relayPermission);

    // Format calls for the contract
    const formattedCalls = calls.map(call => ({
        target: getAddress(call.to),
        value: call.value ?? 0n,
        data: call.data ?? '0x' as Hex,
    }));

    // Encode the executeBatch call with permission
    const encodedData = encodeExecuteBatchWithPermission(permission, formattedCalls);

    const bundlerClient = getBundlerClient(chain);

    const gasEstimate = await bundlerClient.estimateUserOperationGas({
        account: smartAccount,
        calls: [{
            to: getAddress(PERMISSIONS_MANAGER_ADDRESS),
            value: 0n,
            data: encodedData,
        }],
    });

    return gasEstimate.callGasLimit + gasEstimate.preVerificationGas + gasEstimate.verificationGasLimit;
}

export async function createSmartAccount(account: WebAuthnAccount | LocalAccount, bundlerClient: JustanAccountImplementation["client"]): Promise<SmartAccount> {
    // First create a temporary smart account to get the predicted address
    const tempSmartAccount = await toJustanAccount({
        client: bundlerClient,
        owners: [account, PERMISSIONS_MANAGER_ADDRESS]
    })

    // Get the predicted smart account address
    const smartAccountAddress = await tempSmartAccount.getAddress()

    // Determine the owner bytes to search for based on account type
    // WebAuthn accounts use publicKey, LocalAccounts use padded address
    const ownerBytes: Hex = account.type === 'webAuthn'
        ? account.publicKey
        : pad(account.address);

    // Find the actual owner index for this account
    const ownerIndex = await findOwnerIndex({
        address: smartAccountAddress,
        client: bundlerClient,
        publicKey: ownerBytes,
    })

    // Create the smart account with the correct owner index
    return await toJustanAccount({
        client: bundlerClient,
        owners: [account, PERMISSIONS_MANAGER_ADDRESS],
        ownerIndex
    })
}

export async function findOwnerIndex({
                                         address,
                                         client,
                                         publicKey,
                                     }: FindOwnerIndexParams): Promise<number> {
    const code = await getCode(client, {
        address,
    });

    // If no code deployed, return 0
    if (!code) {
        return 0;
    }

    try {
        const ownerCount = await readContract(client, {
            address,
            abi,
            functionName: 'ownerCount',
        });

        // Iterate from lowest index up and return early when found
        for (let i = 0; i < Number(ownerCount); i++) {
            const owner = await readContract(client, {
                address,
                abi,
                functionName: 'ownerAtIndex',
                args: [BigInt(i)],
            });

            const formatted = formatPublicKey(publicKey);
            if (owner.toLowerCase() === formatted.toLowerCase()) {
                return i;
            }
        }
    } catch (error) {
        // If reading contract fails, return 0
        console.warn('Failed to read owner information:', error);
        return 0;
    }

    // Owner not found, return 0
    return 0;
}

/**
 * Formats 20 byte addresses to 32 byte public keys. Contract uses 32 byte keys for owners.
 * @param publicKey - The public key to format
 * @returns The formatted public key
 */
export function formatPublicKey(publicKey: Hex): Hex {
    if (isAddress(publicKey)) {
        return pad(publicKey);
    }
    return publicKey;
}

export async function createSmartAccountEip7702(
    localAccount: LocalAccount,
    bundlerClient: JustanAccountImplementation["client"]
): Promise<SmartAccount> {
    return await toJustanAccount({
        client: bundlerClient,
        owners: [localAccount, PERMISSIONS_MANAGER_ADDRESS],
        eip7702Account: localAccount,
    });
}

export async function calculateGas(
    chain: Chain,
    gas: bigint,
    paymasterUrlOverride?: string
): Promise<string> {
    const bundlerClient = getBundlerClient(chain, paymasterUrlOverride)
    const gasPrice = await getGasPrice(bundlerClient)
    const result = formatUnits(gas * gasPrice, 18)
    return result
}

