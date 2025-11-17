import { encodeFunctionData, type Address, type Hex, type WalletClient } from 'viem';
import { readContract } from 'viem/actions';
import {SPEND_PERMISSIONS_MANAGER_ADDRESS, JAW_RPC_URL, JAW_PROXY_URL} from '../constants.js';
import { sendTransaction, getBundlerClient } from '../account/smartAccount.js';
import {SmartAccount} from 'viem/account-abstraction';
import {Chain} from '../store/index.js';
import { standardErrors } from '../errors/errors.js';
import { restCall } from '../api/index.js';
import { buildHandleJawRpcUrl, fetchRPCRequest } from '../utils/index.js';
import type { RequestArguments } from '../provider/index.js';

/**
 * ERC-7528 native token address convention
 * @see https://eips.ethereum.org/EIPS/eip-7528
 */
export const NATIVE_TOKEN: Address = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

/**
 * Period type for spend limits
 */
export type SpendPeriod = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

/**
 * Convert period string to seconds
 */
function periodToSeconds(period: SpendPeriod): number {
    const periods: Record<SpendPeriod, number> = {
        minute: 60,
        hour: 3600,
        day: 86400,
        week: 604800,
        month: 2592000, // 30 days
        year: 31536000, // 365 days
    };
    return periods[period];
}

/**
 * SpendPermission struct matching the Solidity contract
 */
export type SpendPermission = {
    /** Smart account this spend permission is valid for */
    account: Address;
    /** Entity that can spend account's tokens */
    spender: Address;
    /** Token address (ERC-7528 native token or ERC-20 contract) */
    token: Address;
    /** Maximum allowed value to spend within each period */
    allowance: bigint;
    /** Time duration for resetting used allowance on a recurring basis (seconds) */
    period: number;
    /** Timestamp this spend permission is valid starting at (inclusive, unix seconds) */
    start: number;
    /** Timestamp this spend permission is valid until (exclusive, unix seconds) */
    end: number;
    /** Arbitrary data to differentiate unique spend permissions with otherwise identical fields */
    salt: bigint;
    /** Arbitrary data to attach to a spend permission which may be consumed by the spender */
    extraData: Hex;
};

/**
 * Spend permission detail for API request/response
 */
export type SpendPermissionDetail = {
    /** Spending limit in wei (hex format) */
    limit: string;
    /** Period of the spend limit */
    period: SpendPeriod;
    /** Token address */
    token: Address;
};

/**
 * Permissions detail structure
 */
export type PermissionsDetail = {
    spend: SpendPermissionDetail;
};

/**
 * Request parameters for wallet_grantPermissions
 */
export type WalletGrantPermissionsRequest = {
    method: 'wallet_grantPermissions';
    params: [
        {
            /** Account address to grant permissions from */
            address: Address;
            /** Chain ID in hex format */
            chainId: string;
            /** Timestamp this permission is valid until (exclusive, unix seconds) */
            expiry: number;
            /** Spender address */
            spender: Address;
            /** Permissions details */
            permissions: PermissionsDetail;
        }
    ];
};

/**
 * Request to store a permission in the relay
 */
export type StorePermissionApiRequest = {
    /** Hash from the contract (unique identifier) */
    hash: string;
    /** Account address */
    account: string;
    /** Spender address */
    spender: string;
    /** Token address */
    token: string;
    /** Allowance in wei (as hex string) */
    allowance: string;
    /** Period in seconds (as string) */
    period: string;
    /** Start timestamp (unix seconds, as string) */
    start: string;
    /** End timestamp (unix seconds, as string) */
    end: string;
    /** Salt for uniqueness (as string) */
    salt: string;
    /** Extra data (hex-encoded bytes) */
    extraData: string;
    /** Chain ID (as hex string) */
    chainId: string;
};

/**
 * Response from the JAW RPC relay when storing a permission
 */
export type StorePermissionApiResponse = {
    /** Hash from the contract (unique identifier) */
    hash: string;
    /** Account address */
    account: string;
    /** Spender address */
    spender: string;
    /** Token address */
    token: string;
    /** Allowance in wei (as hex string) */
    allowance: string;
    /** Period in seconds (as string) */
    period: string;
    /** Start timestamp (unix seconds, as string) */
    start: string;
    /** End timestamp (unix seconds, as string) */
    end: string;
    /** Salt for uniqueness (as string) */
    salt: string;
    /** Extra data (hex-encoded bytes) */
    extraData: string;
    /** Chain ID (as hex string) */
    chainId: string;
};

/**
 * Response from wallet_grantPermissions (returned to dApp)
 */
export type WalletGrantPermissionsResponse = {
    /** Account address that granted the permissions */
    address: Address;
    /** Chain ID in hex format */
    chainId: Hex;
    /** Timestamp (in seconds) that specifies the time by which this permission expires */
    expiry: number;
    /** Permission identifier - the permission hash from the contract */
    id: Hex;
    /** Spender address that was granted permissions */
    spender: Address;
    /** Spend permission granted */
    spend: {
        /** Spending limit in wei (hex format) */
        limit: Hex;
        /** Period of the spend limit */
        period: SpendPeriod;
        /** Token address */
        token: Address;
    };
};

/**
 * Response when revoking a permission
 */
export type RevokePermissionApiResponse = {
    /** Indicates if the permission was revoked successfully */
    success: boolean;
};

/**
 * Request parameters for wallet_revokePermissions
 */
export type WalletRevokePermissionsRequest = {
    method: 'wallet_revokePermissions';
    params: [
        {
            /** Address of the account to revoke a permission on */
            address?: Address;
            /** ID of the permission to revoke (permission hash from contract) */
            id: Hex;
        }
    ];
};

/**
 * Grant permissions by approving a spend permission on-chain, then storing in relay
 *
 * This function:
 * 1. Converts API permission to SpendPermission struct
 * 2. Approves the permission on-chain
 * 3. Retrieves permission hash from the contract
 * 4. Stores the permission in the relay
 * 5. Returns the response to the dApp with the hash as permission ID
 */
export async function grantPermissions(
    smartAccount: SmartAccount,
    account: Address,
    chainId: string,
    expiry: number,
    spender: Address,
    permissions: PermissionsDetail,
    chain: Chain,
    apiKey: string
): Promise<WalletGrantPermissionsResponse> {
    const spendPermission = apiPermissionToSpendPermission(account, spender, expiry, permissions.spend);

    const approveCallData = encodeApproveSpendPermission(spendPermission);

    await sendTransaction(
        smartAccount,
        [
            {
                to: SPEND_PERMISSIONS_MANAGER_ADDRESS as Address,
                data: approveCallData,
            },
        ],
        chain
    );

    const permissionHash = await getSpendPermissionHash(spendPermission, chain);

    await storePermissionInRelay(permissionHash, spendPermission, chainId, apiKey);

    return {
        address: account,
        chainId: chainId as Hex,
        expiry,
        id: permissionHash,
        spender,
        spend: {
            limit: permissions.spend.limit as Hex,
            period: permissions.spend.period,
            token: spendPermission.token,
        },
    };
}

/**
 * Revoke a permission by its ID (permission hash)
 *
 * This function:
 * 1. Fetches the permission data from the relay
 * 2. Reconstructs the SpendPermission struct
 * 3. Executes the revoke transaction on-chain
 * 4. Deletes the permission from the relay
 *
 * @param smartAccount - Smart account to execute the revoke transaction
 * @param permissionId - The permission hash/ID to revoke
 * @param chain - Chain configuration
 * @param apiKey - API key for relay authentication
 * @returns Response from the relay indicating success
 */
export async function revokePermission(
    smartAccount: SmartAccount,
    permissionId: Hex,
    chain: Chain,
    apiKey: string
): Promise<RevokePermissionApiResponse> {
    const relayPermission = await getPermissionFromRelay(permissionId, apiKey);

    const spendPermission = relayPermissionToSpendPermission(relayPermission);

    const revokeCallData = encodeRevokeSpendPermission(spendPermission);

    await sendTransaction(
        smartAccount,
        [
            {
                to: SPEND_PERMISSIONS_MANAGER_ADDRESS as Address,
                data: revokeCallData,
            },
        ],
        chain
    );

    return await deletePermissionFromRelay(permissionId, apiKey);
}

/**
 * Execute a spend using a granted SpendPermission
 *
 * This function allows a spender to spend tokens on behalf of an account
 * that has granted them permission via wallet_grantPermissions.
 *
 * @param walletClient - The viem wallet client to use for the transaction (should be the spender's wallet)
 * @param spendPermission - The SpendPermission struct received from wallet_grantPermissions
 * @param value - The amount to spend (must be <= allowance and within period limits)
 * @returns Transaction hash
 *
 * @example
 * ```typescript
 * import { spend, type SpendPermission } from '@jaw.id/core';
 * import { createWalletClient, http } from 'viem';
 * import { baseSepolia } from 'viem/chains';
 *
 * const walletClient = createWalletClient({
 *   account,
 *   chain: baseSepolia,
 *   transport: http(),
 * });
 *
 * const hash = await spend(
 *   walletClient,
 *   spendPermission,
 *   BigInt(100000000000000)
 * );
 * console.log('Transaction:', hash);
 * ```
 */
export async function spend(
    walletClient: WalletClient,
    spendPermission: SpendPermission,
    value: bigint
): Promise<Hex> {
    // @ts-expect-error - viem's WalletClient types are too strict about chain parameter
    return walletClient.writeContract({
        address: SPEND_PERMISSIONS_MANAGER_ADDRESS as Address,
        abi: SPEND_PERMISSIONS_MANAGER_ABI,
        functionName: 'spend',
        args: [spendPermission, value],
    });
}

/**
 * Get permission from the relay using typed REST API call with path params
 */
async function getPermissionFromRelay(
    permissionHash: Hex,
    apiKey: string
): Promise<StorePermissionApiResponse> {
    const permissionsBaseUrl = JAW_PROXY_URL;

    return await restCall(
        'GET_PERMISSION',
        'GET',
        {},
        { 'x-api-key': apiKey },
        { hash: permissionHash },
        undefined,
        permissionsBaseUrl
    );
}

/**
 * Convert relay permission data to SpendPermission struct
 */
function relayPermissionToSpendPermission(
    relayPermission: StorePermissionApiResponse
): SpendPermission {
    return {
        account: relayPermission.account as Address,
        spender: relayPermission.spender as Address,
        token: relayPermission.token as Address,
        allowance: BigInt(relayPermission.allowance),
        period: parseInt(relayPermission.period, 10),
        start: parseInt(relayPermission.start, 10),
        end: parseInt(relayPermission.end, 10),
        salt: BigInt(relayPermission.salt),
        extraData: relayPermission.extraData as Hex,
    };
}

/**
 * Handle wallet_getPermissions request
 *
 * This function:
 * 1. Validates that an address is provided in params (or injects one if connectedAddress is provided)
 * 2. Calls the relay API to fetch permissions for that address
 *
 * @param request - The wallet_getPermissions request
 * @param apiKey - API key for relay authentication
 * @param connectedAddress - Optional connected account address to inject if no address in params
 * @returns Permissions for the specified address
 */
export async function handleGetPermissionsRequest(
    request: RequestArguments,
    apiKey: string,
    connectedAddress?: Address
): Promise<unknown> {
    const params = request.params as Array<{ address?: Address }> | undefined;

    // Determine which address to use
    let modifiedRequest = request;
    if (!params || params.length === 0 || !params[0]?.address) {
        if (connectedAddress) {
            // Inject the connected account's address
            modifiedRequest = {
                ...request,
                params: [{
                    address: connectedAddress
                }]
            };
        } else {
            // No address provided and no connected address - throw error
            throw standardErrors.rpc.invalidParams({
                message: 'wallet_getPermissions requires an address parameter',
            });
        }
    }

    const rpcUrl = buildHandleJawRpcUrl(JAW_RPC_URL, apiKey);
    return await fetchRPCRequest(modifiedRequest, rpcUrl);
}

/**
 * Convert API spend permission detail to SpendPermission struct
 */
function apiPermissionToSpendPermission(
    account: Address,
    spender: Address,
    expiry: number,
    detail: SpendPermissionDetail
): SpendPermission {
    const start = Math.floor(Date.now() / 1000);

    // Generate a random salt for uniqueness
    const salt = BigInt(
        '0x' +
            Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(
                ''
            )
    );

    // Use native token address if token is empty or undefined
    const token = detail.token && detail.token.trim() !== ''
        ? (detail.token as Address)
        : NATIVE_TOKEN;

    return {
        account,
        spender,
        token,
        allowance: BigInt(detail.limit),
        period: periodToSeconds(detail.period),
        start,
        end: expiry,
        salt,
        extraData: '0x' as Hex,
    };
}

/**
 * Store permission in the relay using typed REST API call
 */
async function storePermissionInRelay(
    permissionHash: Hex,
    spendPermission: SpendPermission,
    chainId: string,
    apiKey: string
): Promise<StorePermissionApiResponse> {
    const requestData: StorePermissionApiRequest = {
        hash: permissionHash,
        account: spendPermission.account,
        spender: spendPermission.spender,
        token: spendPermission.token,
        allowance: `0x${spendPermission.allowance.toString(16)}`,
        period: spendPermission.period.toString(),
        start: spendPermission.start.toString(),
        end: spendPermission.end.toString(),
        salt: spendPermission.salt.toString(),
        extraData: spendPermission.extraData,
        chainId,
    };

    const permissionsBaseUrl = JAW_PROXY_URL;

    return await restCall(
        'STORE_PERMISSION',
        'POST',
        requestData,
        { 'x-api-key': apiKey },
        undefined,
        undefined,
        permissionsBaseUrl
    );
}

/**
 * Delete permission from the relay using typed REST API call with path params
 */
async function deletePermissionFromRelay(
    permissionHash: Hex,
    apiKey: string
): Promise<RevokePermissionApiResponse> {
    const permissionsBaseUrl = JAW_PROXY_URL;

    return await restCall(
        'DELETE_PERMISSION',
        'DELETE',
        {},
        { 'x-api-key': apiKey },
        { hash: permissionHash },
        undefined,
        permissionsBaseUrl
    );
}

/**
 * Get the hash of a spend permission from the contract
 * Uses the cached public client from the store
 */
async function getSpendPermissionHash(
    spendPermission: SpendPermission,
    chain: Chain
): Promise<Hex> {
     const bundlerClient = getBundlerClient(chain)

    const hash = await readContract(bundlerClient, {
        address: SPEND_PERMISSIONS_MANAGER_ADDRESS as Address,
        abi: SPEND_PERMISSIONS_MANAGER_ABI,
        functionName: 'getHash',
        args: [spendPermission],
    });

    return hash as Hex;
}

/**
 * Encode the approve function call for SpendPermissionsManager
 */
function encodeApproveSpendPermission(spendPermission: SpendPermission): Hex {
    return encodeFunctionData({
        abi: SPEND_PERMISSIONS_MANAGER_ABI,
        functionName: 'approve',
        args: [spendPermission],
    });
}

/**
 * Encode the revoke function call for SpendPermissionsManager
 */
function encodeRevokeSpendPermission(spendPermission: SpendPermission): Hex {
    return encodeFunctionData({
        abi: SPEND_PERMISSIONS_MANAGER_ABI,
        functionName: 'revoke',
        args: [spendPermission],
    });
}

/**
 * ABI for the SpendPermissionsManager contract
 */
const SPEND_PERMISSIONS_MANAGER_ABI = [
    {
        name: 'approve',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            {
                name: 'spendPermission',
                type: 'tuple',
                components: [
                    { name: 'account', type: 'address' },
                    { name: 'spender', type: 'address' },
                    { name: 'token', type: 'address' },
                    { name: 'allowance', type: 'uint160' },
                    { name: 'period', type: 'uint48' },
                    { name: 'start', type: 'uint48' },
                    { name: 'end', type: 'uint48' },
                    { name: 'salt', type: 'uint256' },
                    { name: 'extraData', type: 'bytes' },
                ],
            },
        ],
        outputs: [{ name: 'approved', type: 'bool' }],
    },
    {
        name: 'revoke',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            {
                name: 'spendPermission',
                type: 'tuple',
                components: [
                    { name: 'account', type: 'address' },
                    { name: 'spender', type: 'address' },
                    { name: 'token', type: 'address' },
                    { name: 'allowance', type: 'uint160' },
                    { name: 'period', type: 'uint48' },
                    { name: 'start', type: 'uint48' },
                    { name: 'end', type: 'uint48' },
                    { name: 'salt', type: 'uint256' },
                    { name: 'extraData', type: 'bytes' },
                ],
            },
        ],
        outputs: [],
    },
    {
        name: 'getHash',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            {
                name: 'spendPermission',
                type: 'tuple',
                components: [
                    { name: 'account', type: 'address' },
                    { name: 'spender', type: 'address' },
                    { name: 'token', type: 'address' },
                    { name: 'allowance', type: 'uint160' },
                    { name: 'period', type: 'uint48' },
                    { name: 'start', type: 'uint48' },
                    { name: 'end', type: 'uint48' },
                    { name: 'salt', type: 'uint256' },
                    { name: 'extraData', type: 'bytes' },
                ],
            },
        ],
        outputs: [{ name: 'hash', type: 'bytes32' }],
    },
    {
        name: 'spend',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            {
                name: 'spendPermission',
                type: 'tuple',
                components: [
                    { name: 'account', type: 'address' },
                    { name: 'spender', type: 'address' },
                    { name: 'token', type: 'address' },
                    { name: 'allowance', type: 'uint160' },
                    { name: 'period', type: 'uint48' },
                    { name: 'start', type: 'uint48' },
                    { name: 'end', type: 'uint48' },
                    { name: 'salt', type: 'uint256' },
                    { name: 'extraData', type: 'bytes' },
                ],
            },
            { name: 'value', type: 'uint160' },
        ],
        outputs: [],
    },
] as const;