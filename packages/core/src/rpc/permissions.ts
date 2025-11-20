import { encodeFunctionData, type Address, type Hex, type WalletClient, decodeEventLog, toFunctionSelector } from 'viem';
import { getTransactionReceipt } from 'viem/actions';
import {PERMISSIONS_MANAGER_ADDRESS, JAW_RPC_URL, JAW_PROXY_URL} from '../constants.js';
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
 * Compute function selector from function signature
 * @param signature - Function signature (e.g., "transfer(address,uint256)")
 * @returns 4-byte function selector (e.g., "0xa9059cbb")
 *
 * @example
 * ```typescript
 * const selector = computeFunctionSelector("transfer(address,uint256)");
 * // Returns: "0xa9059cbb"
 * ```
 */
export function computeFunctionSelector(signature: string): Hex {
    return toFunctionSelector(signature);
}

/**
 * Call permission for executing specific functions
 */
export type CallPermission = {
    /** Target contract address */
    target: Address;
    /** Function selector (4 bytes) */
    selector: Hex;
};

/**
 * Spend limit with recurring periods
 */
export type SpendLimit = {
    /** Token address (ERC-7528 native token or ERC-20 contract) */
    token: Address;
    /** Maximum allowed value to spend within each period */
    allowance: bigint;
    /** Time duration for resetting used allowance on a recurring basis (seconds) */
    period: number;
};

/**
 * Permission struct matching the Solidity contract
 */
export type Permission = {
    /** Smart account this permission is valid for */
    account: Address;
    /** Entity that can use this permission */
    spender: Address;
    /** Timestamp this permission is valid starting at (inclusive, unix seconds) */
    start: number;
    /** Timestamp this permission is valid until (exclusive, unix seconds) */
    end: number;
    /** Arbitrary data to differentiate unique permissions with otherwise identical fields */
    salt: bigint;
    /** Array of call permissions */
    calls: CallPermission[];
    /** Array of spend limits */
    spends: SpendLimit[];
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
 * Call permission detail for API request/response
 */
export type CallPermissionDetail = {
    /** Target contract address */
    target: Address;
    /** Function selector (4 bytes, hex format) - computed from functionSignature if not provided */
    selector?: Hex;
    /** Human-readable function signature (e.g., "transfer(address,uint256)") */
    functionSignature?: string;
};

/**
 * Permissions detail structure
 */
export type PermissionsDetail = {
    /** Optional array of call permissions */
    calls?: CallPermissionDetail[];
    /** Optional array of spend permissions */
    spends?: SpendPermissionDetail[];
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
    /** Start timestamp (unix seconds, as string) */
    start: string;
    /** End timestamp (unix seconds, as string) */
    end: string;
    /** Salt for uniqueness (as string) */
    salt: string;
    /** Array of call permissions */
    calls: Array<{
        target: string;
        selector: string;
    }>;
    /** Array of spend limits */
    spends: Array<{
        token: string;
        allowance: string;
        period: string;
    }>;
    /** Chain ID (as hex string) */
    chainId: string;
};

/**
 * Response from the JAW RPC relay when storing a permission
 */
export type StorePermissionApiResponse = StorePermissionApiRequest;

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
    /** Array of call permissions granted */
    calls: CallPermissionDetail[];
    /** Array of spend permissions granted */
    spends: SpendPermissionDetail[];
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
 * Grant permissions by approving on-chain, then storing in relay
 *
 * This function:
 * 1. Converts API permissions to Permission struct
 * 2. Approves the permission on-chain (which returns the hash)
 * 3. Extracts the permission hash from the PermissionApproved event
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
    const permission = apiPermissionsToPermission(account, spender, expiry, permissions);

    const approveCallData = encodeApprovePermission(permission);

    const txHash = await sendTransaction(
        smartAccount,
        [
            {
                to: PERMISSIONS_MANAGER_ADDRESS as Address,
                data: approveCallData,
            },
        ],
        chain
    );

    // Extract the permission hash from the PermissionApproved event
    const permissionHash = await extractPermissionHashFromTransaction(txHash, chain);

    await storePermissionInRelay(permissionHash, permission, chainId, apiKey);

    return {
        address: account,
        chainId: chainId as Hex,
        expiry,
        id: permissionHash,
        spender,
        calls: permissions.calls || [],
        spends: permissions.spends || [],
    };
}

/**
 * Revoke a permission by its ID (permission hash)
 *
 * This function:
 * 1. Fetches the permission data from the relay
 * 2. Reconstructs the Permission struct
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

    const permission = relayPermissionToPermission(relayPermission);

    const revokeCallData = encodeRevokePermission(permission);

    await sendTransaction(
        smartAccount,
        [
            {
                to: PERMISSIONS_MANAGER_ADDRESS as Address,
                data: revokeCallData,
            },
        ],
        chain
    );

    return await deletePermissionFromRelay(permissionId, apiKey);
}

/**
 * Execute a spend using a granted Permission
 *
 * This function allows a spender to spend tokens on behalf of an account
 * that has granted them permission via wallet_grantPermissions.
 *
 * @param walletClient - The viem wallet client to use for the transaction (should be the spender's wallet)
 * @param permission - The Permission struct
 * @param spendLimit - The specific SpendLimit to use from the permission
 * @param value - The amount to spend (must be <= allowance and within period limits)
 * @returns Transaction hash
 *
 * @example
 * ```typescript
 * import { spend, type Permission, type SpendLimit } from '@jaw.id/core';
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
 *   permission,
 *   spendLimit,
 *   BigInt(100000000000000)
 * );
 * console.log('Transaction:', hash);
 * ```
 */
export async function spend(
    walletClient: WalletClient,
    permission: Permission,
    spendLimit: SpendLimit,
    value: bigint
): Promise<Hex> {
    // @ts-expect-error - viem's WalletClient types are too strict about chain parameter
    return walletClient.writeContract({
        address: PERMISSIONS_MANAGER_ADDRESS as Address,
        abi: SPEND_PERMISSIONS_MANAGER_ABI,
        functionName: 'spend',
        args: [permission, spendLimit, value],
    });
}

/**
 * Execute a call using a granted Permission
 *
 * This function allows a spender to execute arbitrary contract calls on behalf of an account
 * that has granted them permission via wallet_grantPermissions.
 *
 * @param walletClient - The viem wallet client to use for the transaction (should be the spender's wallet)
 * @param permission - The Permission struct
 * @param call - The specific CallPermission to use from the permission
 * @param data - The calldata to execute (must match the call selector)
 * @returns Transaction hash
 *
 * @example
 * ```typescript
 * import { executeCall, type Permission, type CallPermission } from '@jaw.id/core';
 * import { createWalletClient, http, encodeFunctionData } from 'viem';
 * import { baseSepolia } from 'viem/chains';
 *
 * const walletClient = createWalletClient({
 *   account,
 *   chain: baseSepolia,
 *   transport: http(),
 * });
 *
 * const data = encodeFunctionData({
 *   abi: targetAbi,
 *   functionName: 'targetFunction',
 *   args: [arg1, arg2],
 * });
 *
 * const hash = await executeCall(
 *   walletClient,
 *   permission,
 *   callPermission,
 *   data
 * );
 * console.log('Transaction:', hash);
 * ```
 */
export async function executeCall(
    walletClient: WalletClient,
    permission: Permission,
    call: CallPermission,
    data: Hex
): Promise<Hex> {
    // @ts-expect-error - viem's WalletClient types are too strict about chain parameter
    return walletClient.writeContract({
        address: PERMISSIONS_MANAGER_ADDRESS as Address,
        abi: SPEND_PERMISSIONS_MANAGER_ABI,
        functionName: 'executeCall',
        args: [permission, call, data],
    });
}

/**
 * Get permission from the relay using typed REST API call with path params
 */
export async function getPermissionFromRelay(
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
 * Convert relay permission data to Permission struct
 */
function relayPermissionToPermission(
    relayPermission: StorePermissionApiResponse
): Permission {
    // Convert call permissions
    const calls: CallPermission[] = relayPermission.calls.map(call => ({
        target: call.target as Address,
        selector: call.selector as Hex,
    }));

    // Convert spend limits
    const spends: SpendLimit[] = relayPermission.spends.map(spend => ({
        token: spend.token as Address,
        allowance: BigInt(spend.allowance),
        period: parseInt(spend.period, 10),
    }));

    return {
        account: relayPermission.account as Address,
        spender: relayPermission.spender as Address,
        start: parseInt(relayPermission.start, 10),
        end: parseInt(relayPermission.end, 10),
        salt: BigInt(relayPermission.salt),
        calls,
        spends,
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
 * Convert API permissions detail to Permission struct
 */
function apiPermissionsToPermission(
    account: Address,
    spender: Address,
    expiry: number,
    permissions: PermissionsDetail
): Permission {
    const start = Math.floor(Date.now() / 1000);

    // Generate a random salt for uniqueness
    const salt = BigInt(
        '0x' +
            Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(
                ''
            )
    );

    // Convert call permissions - compute selector from signature if not provided
    const calls: CallPermission[] = (permissions.calls || []).map(call => {
        let selector: Hex;

        if (call.selector) {
            // Use provided selector
            selector = call.selector;
        } else if (call.functionSignature) {
            // Compute selector from function signature
            selector = computeFunctionSelector(call.functionSignature);
        } else {
            throw new Error('Either selector or functionSignature must be provided for call permission');
        }

        return {
            target: call.target,
            selector,
        };
    });

    // Convert spend permissions
    const spends: SpendLimit[] = (permissions.spends || []).map(spend => {
        // Use native token address if token is empty or undefined
        const token = spend.token && spend.token.trim() !== ''
            ? (spend.token as Address)
            : NATIVE_TOKEN;

        return {
            token,
            allowance: BigInt(spend.limit),
            period: periodToSeconds(spend.period),
        };
    });

    return {
        account,
        spender,
        start,
        end: expiry,
        salt,
        calls,
        spends,
    };
}

/**
 * Store permission in the relay using typed REST API call
 */
async function storePermissionInRelay(
    permissionHash: Hex,
    permission: Permission,
    chainId: string,
    apiKey: string
): Promise<StorePermissionApiResponse> {
    const requestData: StorePermissionApiRequest = {
        hash: permissionHash,
        account: permission.account,
        spender: permission.spender,
        start: permission.start.toString(),
        end: permission.end.toString(),
        salt: permission.salt.toString(),
        calls: permission.calls.map(call => ({
            target: call.target,
            selector: call.selector,
        })),
        spends: permission.spends.map(spend => ({
            token: spend.token,
            allowance: `0x${spend.allowance.toString(16)}`,
            period: spend.period.toString(),
        })),
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
 * Extract the permission hash from the PermissionApproved event in a transaction receipt
 */
async function extractPermissionHashFromTransaction(
    txHash: Hex,
    chain: Chain
): Promise<Hex> {
    const bundlerClient = getBundlerClient(chain);

    const receipt = await getTransactionReceipt(bundlerClient, {
        hash: txHash,
    });

    // Find the PermissionApproved event in the logs
    for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== PERMISSIONS_MANAGER_ADDRESS.toLowerCase()) {
            continue;
        }

        try {
            const decoded = decodeEventLog({
                abi: SPEND_PERMISSIONS_MANAGER_ABI,
                data: log.data,
                topics: log.topics,
            });

            if (decoded.eventName === 'PermissionApproved') {
                return decoded.args.hash as Hex;
            }
        } catch {
            // Skip logs that don't match our ABI
            continue;
        }
    }

    throw new Error('PermissionApproved event not found in transaction receipt');
}

/**
 * Encode the approve function call for JustaPermissionManager
 */
function encodeApprovePermission(permission: Permission): Hex {
    return encodeFunctionData({
        abi: SPEND_PERMISSIONS_MANAGER_ABI,
        functionName: 'approve',
        args: [permission],
    });
}

/**
 * Encode the revoke function call for JustaPermissionManager
 */
function encodeRevokePermission(permission: Permission): Hex {
    return encodeFunctionData({
        abi: SPEND_PERMISSIONS_MANAGER_ABI,
        functionName: 'revoke',
        args: [permission],
    });
}

/**
 * ABI for the JustaPermissionManager contract
 */
const SPEND_PERMISSIONS_MANAGER_ABI = [
    {
        name: 'PermissionApproved',
        type: 'event',
        anonymous: false,
        inputs: [
            { name: 'hash', type: 'bytes32', indexed: true },
            {
                name: 'permission',
                type: 'tuple',
                indexed: false,
                components: [
                    { name: 'account', type: 'address' },
                    { name: 'spender', type: 'address' },
                    { name: 'start', type: 'uint48' },
                    { name: 'end', type: 'uint48' },
                    { name: 'salt', type: 'uint256' },
                    {
                        name: 'calls',
                        type: 'tuple[]',
                        components: [
                            { name: 'target', type: 'address' },
                            { name: 'selector', type: 'bytes4' },
                        ],
                    },
                    {
                        name: 'spends',
                        type: 'tuple[]',
                        components: [
                            { name: 'token', type: 'address' },
                            { name: 'allowance', type: 'uint160' },
                            { name: 'period', type: 'uint48' },
                        ],
                    },
                ],
            },
        ],
    },
    {
        name: 'approve',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            {
                name: 'permission',
                type: 'tuple',
                components: [
                    { name: 'account', type: 'address' },
                    { name: 'spender', type: 'address' },
                    { name: 'start', type: 'uint48' },
                    { name: 'end', type: 'uint48' },
                    { name: 'salt', type: 'uint256' },
                    {
                        name: 'calls',
                        type: 'tuple[]',
                        components: [
                            { name: 'target', type: 'address' },
                            { name: 'selector', type: 'bytes4' },
                        ],
                    },
                    {
                        name: 'spends',
                        type: 'tuple[]',
                        components: [
                            { name: 'token', type: 'address' },
                            { name: 'allowance', type: 'uint160' },
                            { name: 'period', type: 'uint48' },
                        ],
                    },
                ],
            },
        ],
        outputs: [{ name: 'hash', type: 'bytes32' }],
    },
    {
        name: 'revoke',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            {
                name: 'permission',
                type: 'tuple',
                components: [
                    { name: 'account', type: 'address' },
                    { name: 'spender', type: 'address' },
                    { name: 'start', type: 'uint48' },
                    { name: 'end', type: 'uint48' },
                    { name: 'salt', type: 'uint256' },
                    {
                        name: 'calls',
                        type: 'tuple[]',
                        components: [
                            { name: 'target', type: 'address' },
                            { name: 'selector', type: 'bytes4' },
                        ],
                    },
                    {
                        name: 'spends',
                        type: 'tuple[]',
                        components: [
                            { name: 'token', type: 'address' },
                            { name: 'allowance', type: 'uint160' },
                            { name: 'period', type: 'uint48' },
                        ],
                    },
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
                name: 'permission',
                type: 'tuple',
                components: [
                    { name: 'account', type: 'address' },
                    { name: 'spender', type: 'address' },
                    { name: 'start', type: 'uint48' },
                    { name: 'end', type: 'uint48' },
                    { name: 'salt', type: 'uint256' },
                    {
                        name: 'calls',
                        type: 'tuple[]',
                        components: [
                            { name: 'target', type: 'address' },
                            { name: 'selector', type: 'bytes4' },
                        ],
                    },
                    {
                        name: 'spends',
                        type: 'tuple[]',
                        components: [
                            { name: 'token', type: 'address' },
                            { name: 'allowance', type: 'uint160' },
                            { name: 'period', type: 'uint48' },
                        ],
                    },
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
                name: 'permission',
                type: 'tuple',
                components: [
                    { name: 'account', type: 'address' },
                    { name: 'spender', type: 'address' },
                    { name: 'start', type: 'uint48' },
                    { name: 'end', type: 'uint48' },
                    { name: 'salt', type: 'uint256' },
                    {
                        name: 'calls',
                        type: 'tuple[]',
                        components: [
                            { name: 'target', type: 'address' },
                            { name: 'selector', type: 'bytes4' },
                        ],
                    },
                    {
                        name: 'spends',
                        type: 'tuple[]',
                        components: [
                            { name: 'token', type: 'address' },
                            { name: 'allowance', type: 'uint160' },
                            { name: 'period', type: 'uint48' },
                        ],
                    },
                ],
            },
            {
                name: 'spendLimit',
                type: 'tuple',
                components: [
                    { name: 'token', type: 'address' },
                    { name: 'allowance', type: 'uint160' },
                    { name: 'period', type: 'uint48' },
                ],
            },
            { name: 'value', type: 'uint160' },
        ],
        outputs: [],
    },
    {
        name: 'executeCall',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            {
                name: 'permission',
                type: 'tuple',
                components: [
                    { name: 'account', type: 'address' },
                    { name: 'spender', type: 'address' },
                    { name: 'start', type: 'uint48' },
                    { name: 'end', type: 'uint48' },
                    { name: 'salt', type: 'uint256' },
                    {
                        name: 'calls',
                        type: 'tuple[]',
                        components: [
                            { name: 'target', type: 'address' },
                            { name: 'selector', type: 'bytes4' },
                        ],
                    },
                    {
                        name: 'spends',
                        type: 'tuple[]',
                        components: [
                            { name: 'token', type: 'address' },
                            { name: 'allowance', type: 'uint160' },
                            { name: 'period', type: 'uint48' },
                        ],
                    },
                ],
            },
            {
                name: 'call',
                type: 'tuple',
                components: [
                    { name: 'target', type: 'address' },
                    { name: 'selector', type: 'bytes4' },
                ],
            },
            { name: 'data', type: 'bytes' },
        ],
        outputs: [],
    },
    {
        name: 'isValid',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            {
                name: 'permission',
                type: 'tuple',
                components: [
                    { name: 'account', type: 'address' },
                    { name: 'spender', type: 'address' },
                    { name: 'start', type: 'uint48' },
                    { name: 'end', type: 'uint48' },
                    { name: 'salt', type: 'uint256' },
                    {
                        name: 'calls',
                        type: 'tuple[]',
                        components: [
                            { name: 'target', type: 'address' },
                            { name: 'selector', type: 'bytes4' },
                        ],
                    },
                    {
                        name: 'spends',
                        type: 'tuple[]',
                        components: [
                            { name: 'token', type: 'address' },
                            { name: 'allowance', type: 'uint160' },
                            { name: 'period', type: 'uint48' },
                        ],
                    },
                ],
            },
        ],
        outputs: [{ name: '', type: 'bool' }],
    },
] as const;