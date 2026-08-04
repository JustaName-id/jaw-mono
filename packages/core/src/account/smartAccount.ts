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
    encodeFunctionData,
    decodeFunctionResult,
} from 'viem';
import { call, getCode, getGasPrice, readContract } from 'viem/actions';
import {
    abi,
    factoryAbi,
    JustanAccountImplementation,
    toJustanAccount,
    type ToJustanAccountReturnType,
} from './toJustanAccount.js';
import { isDelegatedToImplementation } from './delegation.js';
import { createPaymasterFunctions } from './paymaster.js';
import {
    BundlerClient,
    SmartAccount,
    createBundlerClient,
    createPaymasterClient,
    WebAuthnAccount,
} from 'viem/account-abstraction';
import { Chain } from '../store/index.js';
import {
    arbitrum,
    arbitrumSepolia,
    avalancheFuji,
    base,
    baseSepolia,
    celo,
    celoSepolia,
    linea,
    mainnet,
    optimism,
    flare,
    polygon,
    optimismSepolia,
    sepolia,
    avalanche,
    bsc,
    ink,
    dosChain,
    gnosis,
    arcTestnet,
    robinhood,
    soneium,
} from 'viem/chains';
import { PERMISSIONS_MANAGER_ADDRESS, FACTORY_ADDRESS } from '../constants.js';
import { standardErrors } from '../errors/errors.js';
import {
    getPermissionFromRelay,
    relayPermissionToPermission,
    encodeExecuteBatchWithPermission,
} from '../rpc/permissions.js';
import { notifyReceiptReceived } from '../analytics/index.js';

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
};

export const MAINNET_CHAINS = [
    mainnet,
    base,
    optimism,
    arbitrum,
    linea,
    avalanche,
    bsc,
    celo,
    flare,
    polygon,
    ink,
    dosChain,
    gnosis,
    robinhood,
    soneium,
];

export const TESTNET_CHAINS = [
    sepolia,
    baseSepolia,
    optimismSepolia,
    arbitrumSepolia,
    celoSepolia,
    avalancheFuji,
    arcTestnet,
];

export const SUPPORTED_CHAINS = [...MAINNET_CHAINS, ...TESTNET_CHAINS];

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
 * Bundler clients keyed by everything that shapes them (see bundlerCacheKey).
 *
 * A single transaction flow calls getBundlerClient many times over — gas
 * estimation, the ERC-20 quote, the allowance read, the send — and each call
 * used to build a brand-new pair of viem clients. viem's per-client caches
 * (notably eth_chainId, keyed by client uid) start cold on every one of those,
 * so identical configurations kept re-paying for the same round trips. Handing
 * back the same instance keeps those caches warm across the flow.
 *
 * Entries are pure configuration — no session or account state — so reuse is
 * safe across connects and disconnects.
 */
const bundlerClientCache = new Map<string, BundlerClient<Transport, ViemChain>>();

/**
 * Cache key for a bundler client, or null when the configuration can't be
 * described by one (a non-serializable paymaster context) — those callers get
 * a fresh client rather than a wrong cache hit.
 */
function bundlerCacheKey(
    chain: Chain,
    effectivePaymasterUrl?: string,
    effectivePaymasterContext?: Record<string, unknown>
): string | null {
    // The context only reaches the client through createPaymasterFunctions, so
    // it is part of the identity only when a paymaster is actually configured.
    if (!effectivePaymasterUrl) {
        return `${chain.id}|${chain.rpcUrl ?? ''}|`;
    }
    let contextKey = '';
    if (effectivePaymasterContext) {
        try {
            contextKey = JSON.stringify(effectivePaymasterContext);
        } catch {
            return null;
        }
    }
    return `${chain.id}|${chain.rpcUrl ?? ''}|${effectivePaymasterUrl}|${contextKey}`;
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
    // Priority: overrides (from capabilities) > chain config (from SDK config)
    const effectivePaymasterUrl = paymasterUrlOverride || chain.paymaster?.url;
    const effectivePaymasterContext = paymasterContextOverride || chain.paymaster?.context;

    const cacheKey = bundlerCacheKey(chain, effectivePaymasterUrl, effectivePaymasterContext);
    if (cacheKey !== null) {
        const cached = bundlerClientCache.get(cacheKey);
        if (cached) return cached;
    }

    const viemChain = SUPPORTED_CHAINS.find((c) => c.id === chain.id);

    const publicClient = createPublicClient({
        chain: viemChain,
        transport: http(chain.rpcUrl),
    });

    // If no paymaster URL, return bundler client without paymaster
    const bundlerClient = !effectivePaymasterUrl
        ? createBundlerClient({
              client: publicClient,
              transport: http(chain.rpcUrl),
          })
        : createBundlerClient({
              client: publicClient,
              // Use shared paymaster functions that handle gas price fetching and v0.8 gas limits
              paymaster: createPaymasterFunctions(
                  publicClient,
                  createPaymasterClient({ transport: http(effectivePaymasterUrl) }),
                  chain.id,
                  effectivePaymasterContext
              ),
              transport: http(chain.rpcUrl),
          });

    if (cacheKey !== null) {
        bundlerClientCache.set(cacheKey, bundlerClient);
    }

    return bundlerClient;
};

/**
 * Drops every cached bundler client. Exported for tests, which assert on how
 * many clients a flow builds and must not inherit state from earlier cases.
 * @internal
 */
export function clearBundlerClientCache(): void {
    bundlerClientCache.clear();
}

type PreparedCalls = {
    calls: Array<{ to: Address; value: bigint; data: Hex }>;
    authorization?: Awaited<ReturnType<ToJustanAccountReturnType['signAuthorization']>>;
};

/**
 * Prepares calls for EIP-7702 execution by checking delegation status
 * and prepending owner setup if needed.
 */
async function prepareEip7702Calls(
    smartAccount: SmartAccount,
    localAccount: LocalAccount,
    calls: Array<{ to: Address; value: bigint; data: Hex }>,
    chain: Chain
): Promise<PreparedCalls> {
    const publicClient = createPublicClient({
        chain: SUPPORTED_CHAINS.find((c) => c.id === chain.id),
        transport: http(chain.rpcUrl),
    });

    const implementationAddress = await readContract(publicClient, {
        address: FACTORY_ADDRESS as Address,
        abi: factoryAbi,
        functionName: 'getImplementation',
    });

    const delegated = await isDelegatedToImplementation(publicClient, localAccount.address, implementationAddress);

    // Sign authorization if not yet delegated to our implementation
    const authorization = !delegated
        ? await (smartAccount as ToJustanAccountReturnType).signAuthorization()
        : undefined;

    let finalCalls = [...calls];

    // Check if permissions manager is already an owner.
    // When not delegated, use stateOverride to simulate the delegation code
    // so we can read storage even if the EOA has no code yet (handles re-delegation
    // where storage persists after clearing delegation).
    let isPmOwner = false;
    try {
        const callData = encodeFunctionData({
            abi,
            functionName: 'isOwnerAddress',
            args: [PERMISSIONS_MANAGER_ADDRESS],
        });
        const { data: resultData } = await call(publicClient, {
            to: localAccount.address,
            data: callData,
            ...(!delegated
                ? {
                      stateOverride: [
                          {
                              address: localAccount.address,
                              code: `0xef0100${implementationAddress.slice(2)}` as Hex,
                          },
                      ],
                  }
                : {}),
        });
        if (resultData) {
            isPmOwner = decodeFunctionResult({
                abi,
                functionName: 'isOwnerAddress',
                data: resultData,
            });
        }
    } catch {
        isPmOwner = false;
    }

    if (!isPmOwner) {
        finalCalls = [
            {
                to: getAddress(localAccount.address),
                value: 0n,
                data: encodeFunctionData({
                    abi,
                    functionName: 'addOwnerAddress',
                    args: [PERMISSIONS_MANAGER_ADDRESS],
                }),
            },
            ...finalCalls,
        ];
    }

    return { calls: finalCalls, authorization };
}

/**
 * Formats raw calls and applies EIP-7702 preparation when a localAccount is present.
 * For non-7702 accounts (no localAccount), just formats the calls.
 */
async function prepareCallsForExecution(
    smartAccount: SmartAccount,
    calls: Array<{ to: Address; value?: bigint; data?: Hex }>,
    chain: Chain,
    localAccount?: LocalAccount
): Promise<PreparedCalls> {
    const formatted = calls.map((call) => ({
        to: getAddress(call.to),
        value: call.value ?? 0n,
        data: (call.data ?? '0x') as Hex,
    }));

    if (!localAccount) {
        return { calls: formatted };
    }

    return prepareEip7702Calls(smartAccount, localAccount, formatted, chain);
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
    const bundlerClient = getBundlerClient(chain, paymasterUrlOverride, paymasterContextOverride);

    const { calls: finalCalls, authorization } = await prepareCallsForExecution(
        smartAccount,
        calls,
        chain,
        localAccount
    );

    const userOpHash = await bundlerClient.sendUserOperation({
        account: smartAccount,
        calls: finalCalls,
        ...(authorization ? { authorization } : {}),
    });

    // Wait for the transaction receipt and get the actual transaction hash
    const receipt = await bundlerClient.waitForUserOperationReceipt({
        hash: userOpHash,
    });

    // Fire-and-forget notification to proxy
    if (apiKey) {
        // Extract the actual receipt - same logic as wallet_sendCalls.ts
        const actualReceipt = (receipt as any).receipt || receipt;
        const receiptStatus = actualReceipt.status;

        // Determine if transaction succeeded:
        // - status === '0x1' or 1 means success
        // - If status is undefined but transactionHash exists, assume success (included on-chain)
        const isSuccess =
            receiptStatus === '0x1' ||
            receiptStatus === 1 ||
            (receiptStatus === undefined && actualReceipt.transactionHash !== undefined);

        notifyReceiptReceived({
            userOpHash,
            transactionHash: actualReceipt.transactionHash,
            success: isSuccess,
            apiKey,
        });
    }

    return receipt.receipt.transactionHash;
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
    const bundlerClient = getBundlerClient(chain, paymasterUrlOverride, paymasterContextOverride);

    const { calls: finalCalls, authorization } = await prepareCallsForExecution(
        smartAccount,
        calls,
        chain,
        localAccount
    );

    const userOpHash = await bundlerClient.sendUserOperation({
        account: smartAccount,
        calls: finalCalls,
        ...(authorization ? { authorization } : {}),
    });

    return {
        id: userOpHash,
        chainId: chain.id,
    };
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
    localAccount?: LocalAccount,
    approvalCall?: { to: Address; value?: bigint; data: Hex }
): Promise<BundledTransactionResult> {
    // Fetch the permission from the relay
    const relayPermission = await getPermissionFromRelay(permissionId, apiKey);
    const permission = relayPermissionToPermission(relayPermission);

    // Format calls for the contract
    const formattedCalls = calls.map((call) => ({
        target: getAddress(call.to),
        value: call.value ?? 0n,
        data: call.data ?? ('0x' as Hex),
    }));

    // Encode the executeBatch call with permission
    const encodedData = encodeExecuteBatchWithPermission(permission, formattedCalls);

    // Build the spender-level calls: optional paymaster approval + permission manager call.
    // The approval must be at this level (not inside the permission batch) because the
    // permission manager validates each call's selector against the permission.
    const spenderCalls: Array<{ to: Address; value: bigint; data: Hex }> = [];

    if (approvalCall) {
        spenderCalls.push({
            to: approvalCall.to,
            value: approvalCall.value ?? 0n,
            data: approvalCall.data,
        });
    }

    spenderCalls.push({
        to: getAddress(PERMISSIONS_MANAGER_ADDRESS),
        value: 0n,
        data: encodedData,
    });

    // EIP-7702: prepend delegation authorization + owner setup if needed
    const { calls: finalCalls, authorization } = localAccount
        ? await prepareEip7702Calls(smartAccount, localAccount, spenderCalls, chain)
        : { calls: spenderCalls, authorization: undefined };

    const bundlerClient = getBundlerClient(chain, paymasterUrlOverride, paymasterContextOverride);

    const userOpHash = await bundlerClient.sendUserOperation({
        account: smartAccount,
        calls: finalCalls,
        ...(authorization ? { authorization } : {}),
    });

    return {
        id: userOpHash,
        chainId: chain.id,
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
        calls: calls.map((call) => ({
            to: call.to,
            value: call.value ?? 0n,
            data: call.data ?? '0x',
        })),
    });

    return gasEstimate.callGasLimit + gasEstimate.preVerificationGas + gasEstimate.verificationGasLimit;
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
    const formattedCalls = calls.map((call) => ({
        target: getAddress(call.to),
        value: call.value ?? 0n,
        data: call.data ?? ('0x' as Hex),
    }));

    // Encode the executeBatch call with permission
    const encodedData = encodeExecuteBatchWithPermission(permission, formattedCalls);

    const bundlerClient = getBundlerClient(chain);

    const gasEstimate = await bundlerClient.estimateUserOperationGas({
        account: smartAccount,
        calls: [
            {
                to: getAddress(PERMISSIONS_MANAGER_ADDRESS),
                value: 0n,
                data: encodedData,
            },
        ],
    });

    return gasEstimate.callGasLimit + gasEstimate.preVerificationGas + gasEstimate.verificationGasLimit;
}

export async function createSmartAccount(
    account: WebAuthnAccount | LocalAccount,
    bundlerClient: JustanAccountImplementation['client']
): Promise<SmartAccount> {
    // First create a temporary smart account to get the predicted address
    const tempSmartAccount = await toJustanAccount({
        client: bundlerClient,
        owners: [account, PERMISSIONS_MANAGER_ADDRESS],
    });

    // Get the predicted smart account address
    const smartAccountAddress = await tempSmartAccount.getAddress();

    // Determine the owner bytes to search for based on account type
    // WebAuthn accounts use publicKey, LocalAccounts use padded address
    const ownerBytes: Hex = account.type === 'webAuthn' ? account.publicKey : pad(account.address);

    // Find the actual owner index for this account
    const ownerIndex = await findOwnerIndex({
        address: smartAccountAddress,
        client: bundlerClient,
        publicKey: ownerBytes,
    });

    // Create the smart account with the correct owner index. Passing the address
    // we just derived matters: without it toJustanAccount re-reads
    // factory.getAddress with the exact same arguments, spending a second round
    // trip to recompute a value we are already holding.
    return await toJustanAccount({
        client: bundlerClient,
        owners: [account, PERMISSIONS_MANAGER_ADDRESS],
        ownerIndex,
        address: smartAccountAddress,
    });
}

export async function findOwnerIndex({ address, client, publicKey }: FindOwnerIndexParams): Promise<number> {
    // The code check and the owner count are independent reads, so issue them
    // together instead of gating the second on the first. This sits on the
    // critical path: nothing about the transaction dialog — not the gas
    // estimate, not the Confirm button — can start until the smart account
    // object exists, and every round trip spent here is one the user waits out.
    // On an undeployed account the ownerCount read reverts; that result is
    // discarded below, where the empty code already settles the answer.
    const [codeResult, ownerCountResult] = await Promise.allSettled([
        getCode(client, { address }),
        readContract(client, { address, abi, functionName: 'ownerCount' }),
    ]);

    // A failed code read propagates, as it did when this was awaited directly:
    // it means the RPC is unusable, not that the owner is at index 0.
    if (codeResult.status === 'rejected') {
        throw codeResult.reason;
    }

    // If no code deployed, return 0
    if (!codeResult.value) {
        return 0;
    }

    try {
        if (ownerCountResult.status === 'rejected') {
            throw ownerCountResult.reason;
        }
        const ownerCount = Number(ownerCountResult.value);
        const formatted = formatPublicKey(publicKey).toLowerCase();

        // Read every slot in one batch rather than walking indices serially —
        // the walk cost a full round trip per owner before the account existed.
        const owners = await Promise.all(
            Array.from({ length: ownerCount }, (_, i) =>
                readContract(client, {
                    address,
                    abi,
                    functionName: 'ownerAtIndex',
                    args: [BigInt(i)],
                })
            )
        );

        // Lowest matching index wins, matching the original in-order walk.
        const index = owners.findIndex((owner) => owner.toLowerCase() === formatted);
        if (index !== -1) {
            return index;
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

/**
 * Create a temporary SmartAccount instance for signing on behalf of a different account.
 * Verifies the signer is a registered owner on the target account.
 */
export async function createSmartAccountForAddress(
    targetAddress: Address,
    account: WebAuthnAccount | LocalAccount,
    bundlerClient: JustanAccountImplementation['client']
): Promise<SmartAccount> {
    const ownerBytes: Hex = account.type === 'webAuthn' ? account.publicKey : account.address;

    const code = await getCode(bundlerClient, { address: targetAddress });
    if (!code) {
        throw standardErrors.rpc.invalidParams(`Account ${targetAddress} is not deployed`);
    }

    const ownerCount = await readContract(bundlerClient, {
        address: targetAddress,
        abi,
        functionName: 'ownerCount',
    });

    const formatted = formatPublicKey(ownerBytes).toLowerCase();

    // Batched for the same reason as findOwnerIndex: this runs while the user is
    // waiting on the transaction dialog, and a serial walk charged them a round
    // trip per owner.
    const owners = await Promise.all(
        Array.from({ length: Number(ownerCount) }, (_, i) =>
            readContract(bundlerClient, {
                address: targetAddress,
                abi,
                functionName: 'ownerAtIndex',
                args: [BigInt(i)],
            })
        )
    );

    // Lowest matching index wins, matching the original in-order walk.
    const ownerIndex = owners.findIndex((owner) => (owner as string).toLowerCase() === formatted);

    if (ownerIndex !== -1) {
        return await toJustanAccount({
            client: bundlerClient,
            owners: [account, PERMISSIONS_MANAGER_ADDRESS],
            ownerIndex,
            address: targetAddress,
        });
    }

    throw standardErrors.rpc.invalidParams(`Signer is not an owner on account ${targetAddress}`);
}

export async function createSmartAccountEip7702(
    localAccount: LocalAccount,
    bundlerClient: JustanAccountImplementation['client']
): Promise<SmartAccount> {
    return await toJustanAccount({
        client: bundlerClient,
        owners: [localAccount, PERMISSIONS_MANAGER_ADDRESS],
        eip7702Account: localAccount,
    });
}

/**
 * Current gas price for a chain.
 *
 * Split out of calculateGas so callers that also need a gas estimate can fetch
 * the two concurrently — the price does not depend on the estimate, and
 * chaining them put an avoidable round trip in front of the fee display.
 */
export async function getChainGasPrice(chain: Chain, paymasterUrlOverride?: string): Promise<bigint> {
    return await getGasPrice(getBundlerClient(chain, paymasterUrlOverride));
}

/**
 * Converts a gas amount to its cost in the chain's native currency.
 *
 * @param gasPrice - Pre-fetched price per gas. Omit to fetch it here; pass one
 *                   when it was already fetched alongside the gas estimate.
 */
export async function calculateGas(
    chain: Chain,
    gas: bigint,
    paymasterUrlOverride?: string,
    gasPrice?: bigint
): Promise<string> {
    const effectiveGasPrice = gasPrice ?? (await getChainGasPrice(chain, paymasterUrlOverride));
    const result = formatUnits(gas * effectiveGasPrice, 18);
    return result;
}
