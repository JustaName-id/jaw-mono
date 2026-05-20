import { Address, Hex, createPublicClient, encodeFunctionData, erc20Abi, formatUnits, getAddress, http } from 'viem';
import { SmartAccount, entryPoint08Address } from 'viem/account-abstraction';
import { getBundlerClient } from './smartAccount.js';
import { Chain } from '../store/index.js';
import { ERC20_PAYMASTER_ADDRESS, PERMISSIONS_MANAGER_ADDRESS } from '../constants.js';
import {
    getPermissionFromRelay,
    relayPermissionToPermission,
    encodeExecuteBatchWithPermission,
} from '../rpc/permissions.js';

/**
 * Token quote from Pimlico's ERC-20 paymaster
 */
export interface TokenQuote {
    tokenAddress: Address;
    postOpGas: bigint;
    exchangeRate: bigint;
    paymasterAddress: Address;
}

/**
 * Estimated cost for a token
 */
export interface TokenEstimate {
    tokenAddress: Address;
    symbol: string;
    decimals: number;
    tokenCost: bigint;
    tokenCostFormatted: string;
    paymasterAddress: Address;
    exchangeRate: bigint;
    /** Whether the user has sufficient balance to pay with this token */
    hasSufficientBalance: boolean;
}

/**
 * Token info for estimation
 */
export interface TokenInfo {
    address: Address;
    symbol: string;
    decimals: number;
    /** User's balance in the smallest unit (wei for 18 decimals, etc.) */
    balance: bigint;
}

/**
 * Gas fields from a prepared UserOperation (EntryPoint v0.7/0.8)
 */
export interface UserOpGasFields {
    preVerificationGas: bigint;
    verificationGasLimit: bigint;
    callGasLimit: bigint;
    paymasterVerificationGasLimit?: bigint;
    paymasterPostOpGasLimit?: bigint;
    maxFeePerGas: bigint;
    maxPriorityFeePerGas?: bigint;
}

// Empirically tuned against bundler/paymaster receipts: bundler-returned
// maxFeePerGas is ~2x the actual effective price (viem default baseFee*2 + tip),
// and callGasLimit/verificationGasLimit are ~2.2-2.7x actualGasUsed.
// These factors shrink the on-wire reservation so the approval amount and
// displayed cost track actual paid cost, while leaving ~30-50% safety margin.
const ERC20_PAYMASTER_MAX_FEE_BASE_BPS = 15_000n; // 1.50x baseFee
const ERC20_PAYMASTER_GAS_LIMIT_BPS = 8_500n; // 0.85x bundler estimate
const BPS_DENOMINATOR = 10_000n;

/**
 * Tightened gas fields for an ERC-20 paymaster userOp.
 * Only includes the fields we shrink; callers should spread these over the
 * bundler-prepared userOp.
 */
export interface TightenedErc20Gas {
    maxFeePerGas: bigint;
    callGasLimit: bigint;
    verificationGasLimit: bigint;
}

/**
 * Tightens an ERC-20-paymaster userOp's reservation fields so the on-wire
 * `maxFeePerGas` is `baseFee * 1.30 + maxPriorityFeePerGas` (or the bundler's
 * value if already tighter), and `callGasLimit` / `verificationGasLimit`
 * are scaled to 0.75x the bundler estimate.
 *
 * Returns values that are always <= the original userOp values — we never
 * raise a reservation, only shrink it.
 *
 * Paymaster-side limits (paymasterVerificationGasLimit, paymasterPostOpGasLimit)
 * and preVerificationGas are intentionally untouched: shrinking them risks an
 * AA50 postOp revert from the paymaster.
 */
export function tightenErc20UserOpGas(
    userOp: {
        maxFeePerGas: bigint;
        maxPriorityFeePerGas: bigint;
        callGasLimit: bigint;
        verificationGasLimit: bigint;
    },
    baseFeePerGas: bigint
): TightenedErc20Gas {
    const candidateMaxFee =
        (baseFeePerGas * ERC20_PAYMASTER_MAX_FEE_BASE_BPS) / BPS_DENOMINATOR + userOp.maxPriorityFeePerGas;
    const maxFeePerGas = candidateMaxFee < userOp.maxFeePerGas ? candidateMaxFee : userOp.maxFeePerGas;

    return {
        maxFeePerGas,
        callGasLimit: (userOp.callGasLimit * ERC20_PAYMASTER_GAS_LIMIT_BPS) / BPS_DENOMINATOR,
        verificationGasLimit: (userOp.verificationGasLimit * ERC20_PAYMASTER_GAS_LIMIT_BPS) / BPS_DENOMINATOR,
    };
}

/**
 * Fetches token quotes from Pimlico's ERC-20 paymaster.
 * This gets the exchange rate and postOpGas for each token.
 *
 * @param paymasterUrl - The paymaster URL (e.g., JAW_PAYMASTER_URL with chainId)
 * @param chainId - The chain ID
 * @param tokens - Array of token addresses to get quotes for
 * @returns Array of token quotes with exchange rates
 */
export async function fetchTokenQuotes(
    paymasterUrl: string,
    chainId: number,
    tokens: Address[]
): Promise<TokenQuote[]> {
    // Pimlico expects:
    // - id as a number (not UUID string)
    // - params as [{tokens: [...]}, entryPointAddress, chainIdHex]
    const requestBody = {
        jsonrpc: '2.0',
        id: 1,
        method: 'pimlico_getTokenQuotes',
        params: [{ tokens }, entryPoint08Address, `0x${chainId.toString(16)}`],
    };

    const response = await fetch(paymasterUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (data.error) {
        throw new Error(`pimlico_getTokenQuotes error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    const result = data.result;
    if (!result?.quotes || !Array.isArray(result.quotes)) {
        throw new Error('Invalid response from pimlico_getTokenQuotes: no quotes array');
    }

    const quotes = result.quotes.map(
        (q: { token: string; postOpGas: string; exchangeRate: string; paymaster: string }) => ({
            tokenAddress: q.token as Address,
            postOpGas: BigInt(q.postOpGas),
            exchangeRate: BigInt(q.exchangeRate),
            paymasterAddress: q.paymaster as Address,
        })
    );

    return quotes;
}

/**
 * Estimates ERC-20 paymaster costs for multiple tokens.
 * This:
 * 1. Gets token quotes from the paymaster
 * 2. Prepares a UserOp WITH the paymaster (so estimation works without ETH)
 * 3. Calculates the token cost for each using Pimlico's formula
 *
 * When `permissionId` is provided, calls are routed through the permissions manager
 *
 * @param smartAccount - The smart account to estimate for
 * @param calls - Array of transaction calls (user's intended transactions)
 * @param chain - The chain configuration
 * @param paymasterUrl - The ERC-20 paymaster URL
 * @param tokens - Array of tokens to estimate costs for
 * @param options - Optional permission-based execution context
 * @returns Array of token estimates with costs
 */
export async function estimateErc20PaymasterCosts(
    smartAccount: SmartAccount,
    calls: Array<{ to: Address; value?: bigint; data?: Hex }>,
    chain: Chain,
    paymasterUrl: string,
    tokens: TokenInfo[],
    options?: { permissionId?: Hex; apiKey?: string }
): Promise<TokenEstimate[]> {
    if (tokens.length === 0) {
        return [];
    }

    // 1. Get quotes for all tokens in one call
    const tokenAddresses = tokens.map((t) => t.address);
    const quotes = await fetchTokenQuotes(paymasterUrl, chain.id, tokenAddresses);

    if (quotes.length === 0) {
        throw new Error('No token quotes returned from paymaster');
    }

    // 2. Build calls with dummy approval for estimation
    // Use MaxUint256 for approval - amount doesn't affect gas estimation
    const MaxUint256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

    // Use the first quote's paymaster address (should be same for all)
    const paymasterAddress = quotes[0]?.paymasterAddress || ERC20_PAYMASTER_ADDRESS;

    // Create a dummy approval call (we'll use the first token for estimation)
    // Gas cost is similar regardless of which token we approve
    const approvalCall = {
        to: tokens[0].address,
        value: 0n,
        data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: [paymasterAddress, MaxUint256],
        }),
    };

    // For permission-based execution, the user's calls cannot go to their targets
    // directly — they must be routed through the permissions manager.
    let preparedCalls: Array<{ to: Address; value: bigint; data: Hex }>;
    if (options?.permissionId) {
        if (!options.apiKey) {
            throw new Error('apiKey is required when estimating with permissionId');
        }

        const relayPermission = await getPermissionFromRelay(options.permissionId, options.apiKey);
        const permission = relayPermissionToPermission(relayPermission);

        const formattedCalls = calls.map((call) => ({
            target: getAddress(call.to),
            value: call.value ?? 0n,
            data: call.data ?? ('0x' as Hex),
        }));

        const encodedData = encodeExecuteBatchWithPermission(permission, formattedCalls);

        preparedCalls = [
            approvalCall,
            {
                to: getAddress(PERMISSIONS_MANAGER_ADDRESS),
                value: 0n,
                data: encodedData,
            },
        ];
    } else {
        preparedCalls = [
            approvalCall,
            ...calls.map((c) => ({ to: c.to, value: c.value ?? 0n, data: c.data ?? ('0x' as Hex) })),
        ];
    }

    // 3. Prepare UserOp WITH the paymaster configured
    // This is key - the paymaster being included means estimation won't fail with AA21
    const bundlerClient = getBundlerClient(chain, paymasterUrl, { token: tokens[0].address });

    const userOp = await bundlerClient.prepareUserOperation({
        account: smartAccount,
        calls: preparedCalls,
    });

    // Tighten reservation so the displayed cost matches what the user actually pays.
    // Must use the same tightening as createErc20ApprovalCall and the send path so
    // approval amount, displayed cost, and on-wire reservation all agree.
    const publicClient = createPublicClient({
        chain: { id: chain.id } as Parameters<typeof createPublicClient>[0]['chain'],
        transport: http(chain.rpcUrl),
    });
    const latestBlock = await publicClient.getBlock({ blockTag: 'latest' });
    const tightened = tightenErc20UserOpGas(
        {
            maxFeePerGas: userOp.maxFeePerGas,
            maxPriorityFeePerGas: userOp.maxPriorityFeePerGas,
            callGasLimit: userOp.callGasLimit,
            verificationGasLimit: userOp.verificationGasLimit,
        },
        latestBlock.baseFeePerGas ?? 0n
    );

    // 4. Extract gas fields from the tightened userOp
    const gas: UserOpGasFields = {
        preVerificationGas: userOp.preVerificationGas,
        verificationGasLimit: tightened.verificationGasLimit,
        callGasLimit: tightened.callGasLimit,
        paymasterVerificationGasLimit:
            'paymasterVerificationGasLimit' in userOp
                ? (userOp as { paymasterVerificationGasLimit?: bigint }).paymasterVerificationGasLimit
                : undefined,
        paymasterPostOpGasLimit:
            'paymasterPostOpGasLimit' in userOp
                ? (userOp as { paymasterPostOpGasLimit?: bigint }).paymasterPostOpGasLimit
                : undefined,
        maxFeePerGas: tightened.maxFeePerGas,
        maxPriorityFeePerGas: userOp.maxPriorityFeePerGas,
    };

    // 5. Calculate cost for each token using the utility function
    return calculateTokenEstimatesFromGas(gas, quotes, tokens);
}

/**
 * Calculates the required prefund (total gas cost in wei) from userOp gas fields.
 * This follows Pimlico's getRequiredPrefund formula for EntryPoint v0.7/0.8.
 */
export function getRequiredPrefund(gas: UserOpGasFields): bigint {
    const totalGas =
        gas.preVerificationGas +
        gas.verificationGasLimit +
        gas.callGasLimit +
        (gas.paymasterVerificationGasLimit || 0n) +
        (gas.paymasterPostOpGasLimit || 0n);

    return totalGas * gas.maxFeePerGas;
}

/**
 * Calculates the token cost for a userOp using existing gas data and quote.
 * Use this when you already have the userOp prepared and want to avoid redundant API calls.
 *
 * Formula (Pimlico's):
 * maxCostInWei = (totalGas + postOpGas) * maxFeePerGas
 * costInToken = (maxCostInWei * exchangeRate) / 1e18
 *
 * @param gas - Gas fields from a prepared userOp
 * @param quote - Token quote from fetchTokenQuotes
 * @returns Token cost in the token's smallest unit
 */
export function calculateTokenCostFromGas(gas: UserOpGasFields, quote: TokenQuote): bigint {
    const totalGas =
        gas.preVerificationGas +
        gas.verificationGasLimit +
        gas.callGasLimit +
        (gas.paymasterVerificationGasLimit || 0n) +
        (gas.paymasterPostOpGasLimit || 0n);

    // maxCostInWei = (totalGas + postOpGas) * maxFeePerGas
    const maxCostWei = (totalGas + quote.postOpGas) * gas.maxFeePerGas;

    // Convert to token using exchange rate
    return (maxCostWei * quote.exchangeRate) / BigInt(1e18);
}

/**
 * Calculates token estimates from existing gas data and quotes.
 * Use this when you already have a prepared userOp and quotes to avoid redundant API calls.
 *
 * @param gas - Gas fields from a prepared userOp
 * @param quotes - Token quotes from fetchTokenQuotes
 * @param tokens - Token info (for symbol, decimals, balance)
 * @returns Array of token estimates
 */
export function calculateTokenEstimatesFromGas(
    gas: UserOpGasFields,
    quotes: TokenQuote[],
    tokens: TokenInfo[]
): TokenEstimate[] {
    return quotes.map((quote) => {
        const token = tokens.find((t) => t.address.toLowerCase() === quote.tokenAddress.toLowerCase());
        const decimals = token?.decimals || 18;
        const symbol = token?.symbol || 'UNKNOWN';
        const balance = token?.balance || 0n;

        const tokenCost = calculateTokenCostFromGas(gas, quote);
        const hasSufficientBalance = balance >= tokenCost;
        const tokenCostFormatted = formatTokenAmount(tokenCost, decimals);

        return {
            tokenAddress: quote.tokenAddress,
            symbol,
            decimals,
            tokenCost,
            tokenCostFormatted,
            paymasterAddress: quote.paymasterAddress,
            exchangeRate: quote.exchangeRate,
            hasSufficientBalance,
        };
    });
}

/**
 * Encodes an ERC-20 approval call for the paymaster.
 *
 * @param tokenAddress - The ERC-20 token to approve
 * @param spender - The paymaster address to approve
 * @param amount - The amount to approve (in token's smallest unit)
 * @returns The encoded call data
 */
export function encodeApprovalCall(
    tokenAddress: Address,
    spender: Address,
    amount: bigint
): { to: Address; value: bigint; data: Hex } {
    return {
        to: tokenAddress,
        value: 0n,
        data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: [spender, amount],
        }),
    };
}

/**
 * Formats a token amount for display.
 * Shows up to 4 decimal places for amounts < 1, 2 decimal places otherwise.
 */
function formatTokenAmount(amount: bigint, decimals: number): string {
    const formatted = formatUnits(amount, decimals);
    const num = parseFloat(formatted);

    if (num === 0) return '0';
    if (num < 1) return num.toFixed(4);
    return num.toFixed(2);
}
