import type { Address, Hex } from 'viem';
import type { ViemRPCReturnType, ViemRPCParams } from '@jaw.id/core';
import type { TransactionRequestData } from '../components/TransactionModal';

// ==========================================
// Transaction Type Definitions
// ==========================================

// Type-safe parameter extraction from Viem
export type WalletSendCallsParams = ViemRPCParams<'wallet_sendCalls'>;
export type EthSendTransactionParams = ViemRPCParams<'eth_sendTransaction'>;

// Type-safe return types from Viem
export type WalletSendCallsReturn = ViemRPCReturnType<'wallet_sendCalls'>;
export type EthSendTransactionReturn = ViemRPCReturnType<'eth_sendTransaction'>;

// Normalized transaction format (internal to extraction utility)
export interface NormalizedTransaction {
  to?: Address;
  data?: Hex;
  value: string;
  chainId: number;
}


// ==========================================
// Transaction Extraction Utility
// ==========================================

/**
 * Extracts and normalizes transaction data from both wallet_sendCalls and eth_sendTransaction
 * with full type safety using Viem's RPC types
 *
 * Returns TransactionRequestData with all metadata preserved:
 * - method: 'wallet_sendCalls' or 'eth_sendTransaction'
 * - transactions: Array of normalized transactions
 * - chainId: Target chain ID
 * - paymasterUrl: Optional paymaster for sponsored transactions
 * - atomicRequired: (wallet_sendCalls only) Whether batch must be atomic
 * - version: (wallet_sendCalls only) Protocol version
 * - callsId: (wallet_sendCalls only) ID for tracking the call batch
 */
export function extractTransactionData(
    method: string,
    params: unknown[],
    chain?: { id: number; rpcUrl: string; paymasterUrl?: string }
  ): TransactionRequestData {
    const chainId = chain?.id || parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '1');
  
    if (method === 'wallet_sendCalls') {
      const sendCallsParams = params[0] as WalletSendCallsParams[0];
  
      if (!sendCallsParams?.calls || !Array.isArray(sendCallsParams.calls)) {
        throw new Error('Invalid wallet_sendCalls parameters: calls array required');
      }
  
      // Extract chain ID from params (can be hex or number)
      let paramsChainId = chainId;
      if (sendCallsParams.chainId !== undefined) {
        paramsChainId = typeof sendCallsParams.chainId === 'number'
          ? sendCallsParams.chainId
          : parseInt(sendCallsParams.chainId, 16);
      }
  
      // Map to internal format for type conversion, then to modal format
      const internalTxs: NormalizedTransaction[] = sendCallsParams.calls.map(call => ({
        to: call.to,
        data: call.data || '0x',
        value: call.value?.toString() || '0',
        chainId: paramsChainId,
      }));
  
      return {
        method: 'wallet_sendCalls',
        transactions: internalTxs.map(tx => ({
          to: tx.to,
          data: tx.data,
          value: tx.value,
          chainId: tx.chainId,
        })),
        chainId: paramsChainId,
        paymasterUrl: chain?.paymasterUrl,
        atomicRequired: sendCallsParams.atomicRequired,
        version: sendCallsParams.version,
        callsId: sendCallsParams.id,
      };
    }
  
    if (method === 'eth_sendTransaction') {
      const txParams = params[0] as EthSendTransactionParams[0];
  
      if (!txParams?.to) {
        throw new Error('Invalid eth_sendTransaction parameters: to address required');
      }
  
      return {
        method: 'eth_sendTransaction',
        transactions: [{
          to: txParams.to,
          data: txParams.data || '0x',
          value: txParams.value?.toString() || '0',
          chainId,
        }],
        chainId,
        paymasterUrl: chain?.paymasterUrl,
      };
    }
  
    throw new Error(`Unsupported transaction method: ${method}`);
  }