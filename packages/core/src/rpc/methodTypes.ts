import type { WalletRpcSchema, TransactionRequest } from 'viem';

/**
 * Transaction object for eth_sendTransaction and eth_signTransaction
 */
export type Transaction = TransactionRequest;

/**
 * Utility type to extract a method entry from WalletRpcSchema
 */
type ExtractMethod<T extends readonly any[], M extends string> = {
  [K in keyof T]: T[K] extends { Method: M } ? T[K] : never;
}[number];

/**
 * Utility type to extract parameter types from WalletRpcSchema
 */
type ExtractParams<T extends readonly any[], M extends string> = 
  ExtractMethod<T, M> extends { Parameters?: infer P } 
    ? P 
    : never;

/**
 * Utility type to extract return types from WalletRpcSchema
 */
type ExtractReturnType<T extends readonly any[], M extends string> = 
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
