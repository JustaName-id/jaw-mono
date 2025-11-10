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
    createPublicClient
} from "viem";
import {getCode, getGasPrice, readContract} from "viem/actions";
import {abi, JustanAccountImplementation, toJustanAccount} from "../account/index.js";
import {
    BundlerClient,
    SmartAccount,
    createBundlerClient,
    createPaymasterClient,
    WebAuthnAccount
} from "viem/account-abstraction";
import {Chain} from "../store/index.js";
import {arbitrum, arbitrumSepolia, base, baseSepolia, mainnet, optimism, optimismSepolia, sepolia} from "viem/chains";

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

export const SUPPORTED_CHAINS = [
    mainnet,
    sepolia,
    base,
    baseSepolia,
    optimism,
    optimismSepolia,
    arbitrum,
    arbitrumSepolia,
]

/**
 * Gets or creates a bundler client for a chain using lazy loading.
 * Clients are cached in the store and created only when first accessed.
 *
 * @param chain - The chain to get the bundler client for
 * @returns The bundler client for the specified chain
 * @throws Error if the chain is not supported or client creation fails
 */
export const getBundlerClient = (chain: Chain): BundlerClient<Transport, ViemChain> => {
    console.log('🔍 Getting bundler client for chain:', chain);
    // const bundlerClient = getBundlerClientFromStore(chain.id);
    const viemChain = SUPPORTED_CHAINS.find(c => c.id === chain.id);


    const publicClient = createPublicClient({
        chain: viemChain,
        transport: http(chain.rpcUrl),
    });

    const paymasterClient = chain.paymasterUrl
        ? createPaymasterClient({
            transport: http(chain.paymasterUrl)
        })
        : undefined;

        return createBundlerClient({
            client: publicClient,
            ...(paymasterClient && { paymaster: paymasterClient }),
            transport: http(chain.rpcUrl)
        });
}

export async function sendTransaction(
    smartAccount: SmartAccount,
    calls: Array<{
        to: Address;
        value?: bigint;
        data?: Hex;
    }>,
    chain: Chain
): Promise<Hash> {
    const bundlerClient = getBundlerClient(chain)

    const userOpHash = await bundlerClient.sendUserOperation({
        account: smartAccount,
        calls: calls.map(call => ({
            to: getAddress(call.to),
            value: call.value ?? 0n,
            data: call.data ?? '0x'
        }))
    })

    // Wait for the transaction receipt and get the actual transaction hash
    const receipt = await bundlerClient.waitForUserOperationReceipt({
        hash: userOpHash
    })

    return receipt.receipt.transactionHash
}

export async function sendBundledTransaction(
    smartAccount: SmartAccount,
    calls: Array<{
        to: Address;
        value?: bigint;
        data?: Hex;
    }>,
    chain: Chain
): Promise<BundledTransactionResult> {
    const bundlerClient = getBundlerClient(chain)

    const userOpHash = await bundlerClient.sendUserOperation({
        account: smartAccount,
        calls: calls.map(call => ({
            to: getAddress(call.to),
            value: call.value ?? 0n,
            data: call.data ?? '0x'
        }))
    })

    return {
        id: userOpHash,
        chainId: chain.id
    }
}

export async function estimateUserOpGas(
    smartAccount: SmartAccount,
    calls: Array<{
        to: Address;
        value?: bigint;
        data?: Hex;
    }>,
    chain: Chain
): Promise<bigint> {
    const bundlerClient = getBundlerClient(chain);

    const gasEstimate = await bundlerClient.estimateUserOperationGas({
        account: smartAccount,
        calls: calls.map(call => ({
            to: call.to,
            value: call.value ?? 0n,
            data: call.data ?? '0x'
        }))
    })

    return gasEstimate.callGasLimit + gasEstimate.preVerificationGas + gasEstimate.verificationGasLimit
}

export async function createSmartAccount(webauthnAccount: WebAuthnAccount, bundlerClient: JustanAccountImplementation["client"]): Promise<SmartAccount> {
    // First create a temporary smart account to get the predicted address
    const tempSmartAccount = await toJustanAccount({
        client: bundlerClient,
        owners: [webauthnAccount]
    })

    // Get the predicted smart account address
    const smartAccountAddress = await tempSmartAccount.getAddress()

    // Find the actual owner index for this passkey
    const ownerIndex = await findOwnerIndex({
        address: smartAccountAddress,
        client: bundlerClient,
        publicKey: webauthnAccount.publicKey,
    })

    // Create the smart account with the correct owner index
    return await toJustanAccount({
        client: bundlerClient,
        owners: [webauthnAccount],
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

export async function calculateGas(
    chain: Chain,
    gas: bigint,
): Promise<string> {
    const bundlerClient = getBundlerClient(chain)
    const gasPrice = await getGasPrice(bundlerClient)
    const result = formatUnits(gas * gasPrice, 18)
    return result
}

