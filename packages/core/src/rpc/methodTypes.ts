import type { WalletRpcSchema } from 'viem';

/**
 * Utility type to extract a method entry from WalletRpcSchema
 */
type ExtractMethod<T extends readonly unknown[], M extends string> = {
  [K in keyof T]: T[K] extends { Method: M } ? T[K] : never;
}[number];

/**
 * Utility type to extract parameter types from WalletRpcSchema
 */
type ExtractParams<T extends readonly unknown[], M extends string> =
  ExtractMethod<T, M> extends { Parameters?: infer P } 
    ? P 
    : never;

/**
 * Utility type to extract return types from WalletRpcSchema
 */
type ExtractReturnType<T extends readonly unknown[], M extends string> =
  ExtractMethod<T, M> extends { ReturnType: infer R } 
    ? R 
    : never;

/**
 * Helper type to get parameter types for any method in WalletRpcSchema
 */
export type ViemRPCParams<M extends string> = ExtractParams<WalletRpcSchema, M>;

/**
 * Helper type to get return types for any method in WalletRpcSchema
 */
export type ViemRPCReturnType<M extends string> = ExtractReturnType<WalletRpcSchema, M>;

/**
 * Supported RPC method names from WalletRpcSchema
 */
export const SUPPORTED_METHODS = [
  'eth_accounts',
  'eth_chainId',
  'eth_coinbase',
  'eth_requestAccounts',
  'eth_sendTransaction',
  'eth_sendRawTransaction',
  'eth_signTypedData_v4',
  'net_version',
  'personal_sign',
  'wallet_connect',
  'wallet_disconnect',
  'wallet_getCallsStatus',
  'wallet_getCapabilities',
  'wallet_grantPermissions',
  'wallet_sendCalls',
  'wallet_sign',
  'wallet_showCallsStatus',
  'wallet_switchEthereumChain',
  'wallet_getAssets'
] as const;
