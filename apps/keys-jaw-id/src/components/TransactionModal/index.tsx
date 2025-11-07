'use client'

import { TransactionDialog, TransactionData, getChainIcon } from "@jaw/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Address, parseEther, Hash } from "viem";
import { SmartAccount } from "viem/account-abstraction";
import { getChainNameFromId, getChainIconKeyFromId } from "../../lib/chain-handlers";
import { usePasskeys, useAuth } from "../../hooks";
import { sendTransaction, estimateUserOpGas, type Chain, calculateGas } from "@jaw.id/core";

// Transaction execution result
export interface TransactionResult {
  hash?: Hash;
  sendCallsId?: string;
  userOpHash?: Hash;
}

// Transaction request data with method-specific metadata
export interface TransactionRequestData {
  method: 'wallet_sendCalls' | 'eth_sendTransaction';
  transactions: Array<{
    to?: string;
    data?: string;
    value: string;
    chainId: number;
  }>;
  chainId: number;
  paymasterUrl?: string;
  // wallet_sendCalls specific fields
  atomicRequired?: boolean;
  version?: string;
  callsId?: string;
}

export interface TransactionModalProps {
  transactionRequest?: TransactionRequestData;
  transactions?: TransactionData[];
  sponsored?: boolean;
  chain?: Chain;  // Chain info with RPC and paymaster URLs
  onSuccess?: (result: TransactionResult) => void;
  onError?: (error: Error) => void;
}

export const TransactionModal = ({
  transactionRequest,
  transactions,
  sponsored = false,
  chain,
  onSuccess,
  onError
}: TransactionModalProps) => {
  const { getSmartAccount } = usePasskeys();
  const { walletAddress } = useAuth();
  const [gasFee, setGasFee] = useState<string>('');
  const [gasFeeLoading, setGasFeeLoading] = useState<boolean>(false);
  const [gasEstimationError, setGasEstimationError] = useState<string>('');
  const [transactionStatus, setTransactionStatus] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [smartAccount, setSmartAccount] = useState<SmartAccount | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Determine if sponsored based on transactionRequest or prop
  const isSponsored = useMemo(() => {
    if (transactionRequest) {
      return !!transactionRequest.paymasterUrl;
    }
    return sponsored;
  }, [transactionRequest, sponsored]);

  // Normalize transaction data - prioritize transactionRequest, then fallback to legacy transactions prop
  const normalizedTransactions = useMemo((): TransactionData[] => {
    // Use transactionRequest if available
    if (transactionRequest) {
      return transactionRequest.transactions.map(tx => ({
        to: tx.to || '',
        data: tx.data || '0x',
        value: tx.value,
        chainId: tx.chainId
      }));
    }

    // Legacy way: use transactions prop
    if (transactions && transactions.length > 0) {
      return transactions;
    }

    return [];
  }, [transactionRequest, transactions]);

  const networkName = useMemo(() => {
    // Use chain prop if available, otherwise fall back to transaction chainId
    const chainId = chain?.id ?? normalizedTransactions[0]?.chainId;

    if (!chainId) return 'Ethereum';

    // Use the getChainNameFromId utility which has comprehensive chain mapping
    return getChainNameFromId(chainId);
  }, [normalizedTransactions, chain]);

  const chainIconKey = useMemo(() => {
    // Use chain prop if available, otherwise fall back to transaction chainId
    const chainId = chain?.id ?? normalizedTransactions[0]?.chainId;

    if (!chainId) return 'ethereum';

    // Use getChainIconKeyFromId to get the correct icon key format
    return getChainIconKeyFromId(chainId);
  }, [normalizedTransactions, chain]);

  const resetModalState = useCallback(() => {
    setGasFee('');
    setGasFeeLoading(false);
    setGasEstimationError('');
    setTransactionStatus('');
    setIsProcessing(false);
  }, []);

  useEffect(() => {
    if (!chain) {
      resetModalState();
    }
  }, [chain, resetModalState]);

  // Initialize smart account when modal opens
  useEffect(() => {
    let isMounted = true;

    const initializeModal = async () => {
      if (chain) {
        try {
          setIsProcessing(false);
          console.log('🔐 Initializing transaction modal');
          const account = await getSmartAccount(chain);

          if (isMounted) {
            setSmartAccount(account);
          }
        } catch (error) {
          console.error("Error initializing smart account:", error);
          if (isMounted) {
            setTransactionStatus(`Error: ${error instanceof Error ? error.message : 'Initialization failed'}`);
            onError?.(error as Error);
          }
        }
      } else if (!open) {
        // Reset when modal closes
        setSmartAccount(null);
        setTransactionStatus('');
        setIsProcessing(false);
        setGasFee('');
        setGasEstimationError('');
      }
    };

    initializeModal();

    return () => {
      isMounted = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [open, chain, getSmartAccount, onError]);

  // Gas estimation using core package
  useEffect(() => {
    if (!open || !smartAccount || !chain || normalizedTransactions.length === 0) return;

    const estimateGas = async () => {
      try {
        setGasFeeLoading(true);

        // Convert normalized transactions to the format expected by estimateUserOpGas
        const transactionCalls = normalizedTransactions.map(tx => {
          let value = 0n;

          if (tx.value && tx.value !== '0') {
            // Check if it's a hex string
            if (tx.value.startsWith('0x')) {
              value = BigInt(tx.value);
            }
            // Check if it's a decimal string representing wei
            else if (/^\d+$/.test(tx.value)) {
              value = BigInt(tx.value);
            }
            // Otherwise assume it's ETH string like "0.001"
            else {
              value = parseEther(tx.value);
            }
          }

          return {
            to: tx.to as Address,
            value,
            data: tx.data as `0x${string}` || '0x'
          };
        });

        // Estimate gas using core package
        const gasEstimate = await estimateUserOpGas(smartAccount, transactionCalls, chain);
        const gasPrice = await calculateGas(chain, gasEstimate);
        setGasFee(gasPrice);
        setGasEstimationError('');

        // Override with sponsored if paymaster is available
        if (isSponsored) {
          setGasFee('sponsored');
        }
      } catch (error) {
        console.error("Error estimating gas:", error);

        if (error instanceof Error && (error.message.includes('AA21') || error.message.includes("didn't pay prefund"))) {
          if (isSponsored) {
            setGasFee('sponsored');
            setGasEstimationError('');
          } else {
            setGasFee('');
            setGasEstimationError('Insufficient funds');
          }
        } else {
          setGasFee('');
          setGasEstimationError('Failed to estimate gas');
        }
      } finally {
        setGasFeeLoading(false);
      }
    };

    estimateGas();
  }, [open, smartAccount, chain, normalizedTransactions, isSponsored]);

  const handleConfirm = useCallback(async () => {
    try {
      setIsProcessing(true);
      setTransactionStatus('Preparing transaction...');

      if (!smartAccount) {
        throw new Error('Smart account not initialized. Please try again.');
      }

      if (!chain) {
        throw new Error('Chain information is required.');
      }

      setTransactionStatus('Sending transaction...');

      // Convert normalized transactions to the format expected by sendTransaction
      const transactionCalls = normalizedTransactions.map(tx => {
        let value = 0n;

        if (tx.value && tx.value !== '0') {
          // Check if it's a hex string
          if (tx.value.startsWith('0x')) {
            value = BigInt(tx.value);
          }
          // Check if it's a decimal string representing wei
          else if (/^\d+$/.test(tx.value)) {
            value = BigInt(tx.value);
          }
          // Otherwise assume it's ETH string like "0.001"
          else {
            value = parseEther(tx.value);
          }
        }

        return {
          to: tx.to as Address,
          value,
          data: tx.data as `0x${string}` || '0x'
        };
      });

      // Send transaction using core package
      // This handles bundler communication and returns the final transaction hash
      const txHash = await sendTransaction(smartAccount, transactionCalls, chain);

      console.log('✅ Transaction confirmed:', txHash);
      setTransactionStatus('Transaction confirmed!');

      // Return the transaction result with proper format based on method
      const result: TransactionResult = {
        hash: txHash,
        sendCallsId: transactionRequest?.method === 'wallet_sendCalls' ? txHash : undefined,
      };

      // Log metadata for debugging
      if (transactionRequest) {
        console.log('📋 Transaction metadata:', {
          method: transactionRequest.method,
          atomicRequired: transactionRequest.atomicRequired,
          version: transactionRequest.version,
          callsId: transactionRequest.callsId,
          paymasterUrl: transactionRequest.paymasterUrl,
        });
      }

      // Call onSuccess immediately - parent will handle closing
      onSuccess?.(result);

    } catch (error) {
      console.error("Error in transaction:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setTransactionStatus(`Error: ${errorMessage}`);
      // Ensure we pass a proper Error object to onError
      const errorObj = error instanceof Error ? error : new Error(errorMessage);
      onError?.(errorObj);
      setIsProcessing(false);
    }
  }, [smartAccount, chain, normalizedTransactions, onSuccess, onError]);

  const handleCancel = useCallback(() => {
    if (!isProcessing) {
      setSmartAccount(null);
      // Create a standard user rejected error (EIP-1193 code 4001)
      const rejectionError = new Error('User rejected the request');
      (rejectionError as any).code = 4001;
      console.log('❌ User cancelled transaction request');
      onError?.(rejectionError);
      setTransactionStatus('');
    }
  }, [isProcessing, onError]);

  return (
    <TransactionDialog
      // open={open}
      // onOpenChange={handleCancel}
      open={true}
      onOpenChange={() => { console.log('onOpenChange') }}
      transactions={normalizedTransactions}
      walletAddress={walletAddress ?? ''}
      gasFee={gasFee}
      gasFeeLoading={gasFeeLoading}
      gasEstimationError={gasEstimationError}
      sponsored={isSponsored}
      ethPrice={0}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      isProcessing={isProcessing}
      transactionStatus={transactionStatus}
      networkName={networkName ?? 'Ethereum'}
      chainIconKey={chainIconKey}
      getChainIcon={getChainIcon}
    />
  );
}