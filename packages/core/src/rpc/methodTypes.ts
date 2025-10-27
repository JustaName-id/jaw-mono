import { Address } from '../provider/interface.js';
import { WalletConnectRequest } from './wallet_connect.js';

/**
 * Transaction object for eth_sendTransaction and eth_signTransaction
 */
export interface Transaction {
    from: Address;
    to?: Address;
    value?: string;
    gas?: string;
    gasPrice?: string;
    nonce?: string;
    data?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    chainId?: string;
    type?: string;
    accessList?: Array<{
        address: Address;
        storageKeys: string[];
    }>;
}

/**
 * EIP-712 Domain for typed data signing
 */
export interface EIP712Domain {
    name?: string;
    version?: string;
    chainId?: number | string;
    verifyingContract?: Address;
    salt?: string;
}

/**
 * EIP-712 Types for typed data signing
 */
export interface EIP712Types {
    EIP712Domain: Array<{ name: string; type: string }>;
    [key: string]: Array<{ name: string; type: string }>;
}

/**
 * Parameters for personal_sign
 */
export interface PersonalSignParams {
    message: string;
    account: Address;
}

/**
 * Parameters for wallet_sign
 * Note: wallet_sign uses the same parameter order as personal_sign
 */
export interface WalletSignParams {
    message: string;
    account: Address;
}

/**
 * Parameters for eth_signTypedData
 * TypedData can be either a JSON string or an object
 */
export interface SignTypedDataParams {
    account: Address;
    typedData: string | {
        types: EIP712Types;
        primaryType: string;
        domain: EIP712Domain;
        message: Record<string, unknown>;
    };
}

/**
 * Parameters for wallet_switchEthereumChain
 */
export interface SwitchEthereumChainParams {
    chainId: string; // Hex string
}

/**
 * Parameters for wallet_addEthereumChain
 */
export interface AddEthereumChainParams {
    chainId: string;
    blockExplorerUrls?: string[];
    chainName: string;
    iconUrls?: string[];
    nativeCurrency?: {
        name: string;
        symbol: string;
        decimals: number;
    };
    rpcUrls: string[];
}

/**
 * Parameters for wallet_watchAsset
 */
export interface WatchAssetParams {
    type: string;
    options: {
        address: Address;
        symbol?: string;
        decimals?: number;
        image?: string;
    };
}

/**
 * Parameters for wallet_getCapabilities (EIP-5792)
 */
export type GetCapabilitiesParams = Address[] | [Address];

/**
 * Parameters for wallet_sendCalls
 */
export interface SendCallsParams {
    calls: Array<{
        to: Address;
        data?: string;
        value?: string;
    }>;
}

/**
 * Parameters for wallet_showCallsStatus and wallet_getCallsStatus
 */
export interface CallsStatusParams {
    batchId: string;
}

/**
 * Parameters for wallet_grantPermissions
 */
export interface GrantPermissionsParams {
    permissions: {
        [key: string]: unknown;
    };
}

/**
 * RPC Method Parameter Types
 */
export type RPCParamsMap = {
    // Account methods
    eth_requestAccounts: never; // No params
    eth_accounts: never; // No params
    eth_coinbase: never; // No params
    
    // Chain methods
    net_version: never; // No params
    eth_chainId: never; // No params
    wallet_switchEthereumChain: [SwitchEthereumChainParams];
    wallet_addEthereumChain: [AddEthereumChainParams];
    
    // Transaction methods
    eth_sendTransaction: [Transaction];
    eth_signTransaction: [Transaction];
    wallet_sendCalls: [SendCallsParams];
    
    // Signing methods
    personal_sign: [string, Address]; // [message, account]
    wallet_sign: [string, Address]; // [message, account] (same order as personal_sign)
    eth_signTypedData: [Address, string | object]; // [account, typedData]
    eth_signTypedData_v1: [Address, string | object]; // [account, typedData]
    eth_signTypedData_v3: [Address, string | object]; // [account, typedData]
    eth_signTypedData_v4: [Address, string | object]; // [account, typedData]
    
    // Recovery methods
    eth_ecRecover: [string, string]; // [message, signature]
    personal_ecRecover: [string, string]; // [message, signature]
    
    // Wallet connect
    wallet_connect: WalletConnectRequest['params'];
    
    // Capability methods
    wallet_getCapabilities: GetCapabilitiesParams; // [account] or [account, account2, ...]
    wallet_grantPermissions: [GrantPermissionsParams];

    // Asset methods
    wallet_watchAsset: [WatchAssetParams];

    // Call status methods
    wallet_getCallsStatus: [CallsStatusParams];
    wallet_showCallsStatus: [CallsStatusParams];
    
    // Other methods (forwarded to RPC)
    [key: string]: unknown;
};

/**
 * Type helper to extract params type for a specific RPC method
 */
export type RPCParamsForMethod<M extends string> = M extends keyof RPCParamsMap 
    ? RPCParamsMap[M] 
    : readonly unknown[] | object;

/**
 * RPC Request with typed params based on method
 */
export interface TypedRequestArguments<M extends string = string> {
    readonly method: M;
    readonly params?: RPCParamsForMethod<M>;
}

/**
 * Type guard to check if params match the expected type for a method
 */
export type MethodParamsValidator = {
    [K in keyof RPCParamsMap]: (
        params: unknown
    ) => asserts params is RPCParamsMap[K];
};

