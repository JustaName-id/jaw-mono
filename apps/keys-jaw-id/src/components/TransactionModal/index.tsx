'use client'

import { TransactionDialog, TransactionData } from "@jaw.id/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Address, Hash } from "viem";
import { getChainNameFromId, getChainIconKeyFromId } from "../../lib/chain-handlers";
import { usePasskeys, useAuth } from "../../hooks";
import { Account, type Chain, type TransactionCall, standardErrorCodes } from "@jaw.id/core";

// Transaction execution result
export interface TransactionResult {
  hash?: Hash;
  sendCallsId?: string;
  userOpHash?: Hash;
  id?:Hash;
  chainId?: number;
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
  paymasterContext?: Record<string, unknown>;
  // wallet_sendCalls specific fields
  atomicRequired?: boolean;
  version?: string;
  callsId?: string;
  // Permission ID for permission-based execution
  permissionId?: `0x${string}`;
}

export interface TransactionModalProps {
  transactionRequest?: TransactionRequestData;
  transactions?: TransactionData[];
  sponsored?: boolean;
  chain?: Chain;  // Chain info with RPC and paymaster URLs
  apiKey?: string;
  onSuccess?: (result: TransactionResult) => void;
  onError?: (error: Error, errorCode?: number) => void;
}

export const TransactionModal = ({
  transactionRequest,
  transactions,
  sponsored = false,
  chain,
  apiKey,
  onSuccess,
  onError
}: TransactionModalProps) => {
  const { getAccount } = usePasskeys();
  const { walletAddress } = useAuth();
  const [gasFee, setGasFee] = useState<string>('');
  const [gasFeeLoading, setGasFeeLoading] = useState<boolean>(false);
  const [gasEstimationError, setGasEstimationError] = useState<string>('');
  const [transactionStatus, setTransactionStatus] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [account, setAccount] = useState<Account | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Extract API key from rpcUrl if not provided as prop
  const effectiveApiKey = useMemo(() => {
    if (apiKey) return apiKey;
    if (chain?.rpcUrl) {
      try {
        const url = new URL(chain.rpcUrl);
        return url.searchParams.get('api-key') || '';
      } catch {
        return '';
      }
    }
    return '';
  }, [apiKey, chain?.rpcUrl]);

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

  // Extract paymasterUrl from capabilities (EIP-5792 paymasterService capability)
  // Priority: capabilities.paymasterService.url > chain.paymaster.url
  const effectivePaymasterUrl = useMemo(() => {
    if (transactionRequest?.paymasterUrl) {
      return transactionRequest.paymasterUrl;
    }
    return chain?.paymaster?.url;
  }, [transactionRequest?.paymasterUrl, chain?.paymaster?.url]);

  // Extract paymasterContext from capabilities (EIP-5792 paymasterService.context)
  // Priority: capabilities.paymasterService.context > chain.paymaster.context
  const effectivePaymasterContext = useMemo(() => {
    if (transactionRequest?.paymasterContext) {
      return transactionRequest.paymasterContext;
    }
    return chain?.paymaster?.context;
  }, [transactionRequest?.paymasterContext, chain?.paymaster?.context]);

  // Initialize account when modal opens
  useEffect(() => {
    let isMounted = true;

    const initializeModal = async () => {
      if (chain) {
        try {
          setIsProcessing(false);
          console.log('🔐 Initializing transaction modal');
          
          // Merge paymasterUrl from capabilities into chain before creating account
          const chainWithPaymaster = {
            ...chain,
            ...(effectivePaymasterUrl && { paymaster: { url: effectivePaymasterUrl } }),
          };
          
          const restoredAccount = await getAccount(chainWithPaymaster, effectiveApiKey);

          if (isMounted) {
            setAccount(restoredAccount);
          }
        } catch (error) {
          console.error("Error initializing account:", error);
          if (isMounted) {
            setTransactionStatus(`Error: ${error instanceof Error ? error.message : 'Initialization failed'}`);
            const errorObj = error instanceof Error ? error : new Error(String(error));
            // Check if user cancelled passkey prompt (NotAllowedError)
            const errorCode = error instanceof Error && error.name === 'NotAllowedError'
              ? standardErrorCodes.provider.userRejectedRequest
              : standardErrorCodes.rpc.internal;
            onError?.(errorObj, errorCode);
          }
        }
      } else {
        // Reset when chain is not provided
        setAccount(null);
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
  }, [chain, effectiveApiKey, effectivePaymasterUrl, getAccount, onError]);

  // Gas estimation using Account class
  useEffect(() => {
    if (!account || !chain || normalizedTransactions.length === 0) return;

    const estimateGas = async () => {
      try {
        setGasFeeLoading(true);

        // Skip gas estimation if sponsored - paymaster will handle fees
        // This is especially important for ERC-20 paymaster modes where estimation
        // requires context that may not be available during estimation
        if (isSponsored) {
          setGasFee('sponsored');
          setGasEstimationError('');
          return;
        }

        // Convert normalized transactions to TransactionCall format
        const transactionCalls: TransactionCall[] = normalizedTransactions.map(tx => ({
          to: tx.to as Address,
          value: tx.value ? BigInt(tx.value) : undefined, // Convert string wei to bigint
          data: (tx.data as `0x${string}`) || '0x'
        }));

        // Get permissionId from transactionRequest if available
        const permissionId = transactionRequest?.permissionId;

        // Estimate gas using Account class (with permission if provided)
        const gasPrice = await account.calculateGasCost(
          transactionCalls,
          permissionId ? { permissionId } : undefined
        );
        setGasFee(gasPrice);
        setGasEstimationError('');
      } catch (error) {
        console.error("Error estimating gas:", error);

        if (error instanceof Error && (error.message.includes('AA21') || error.message.includes("didn't pay prefund"))) {
          setGasFee('');
          setGasEstimationError('Insufficient funds');
        } else {
          setGasFee('');
          setGasEstimationError('Failed to estimate gas');
        }
      } finally {
        setGasFeeLoading(false);
      }
    };

    estimateGas();
  }, [account, chain, normalizedTransactions, isSponsored, transactionRequest?.permissionId]);

  const handleConfirm = useCallback(async () => {
    try {
      setIsProcessing(true);
      setTransactionStatus('Preparing transaction...');

      if (!account) {
        throw new Error('Account not initialized. Please try again.');
      }

      if (!chain) {
        throw new Error('Chain information is required.');
      }

      setTransactionStatus('Sending transaction...');

      // Convert normalized transactions to TransactionCall format
      const transactionCalls: TransactionCall[] = normalizedTransactions.map(tx => ({
        to: tx.to as Address,
        value: tx.value ? BigInt(tx.value) : undefined, // Convert string wei to bigint
        data: (tx.data as `0x${string}`) || '0x'
      }));

      // Send transaction using Account class
      // Pass paymaster URL and context overrides from capabilities
      let result: TransactionResult;
      // Use sendCalls for wallet_sendCalls, sendTransaction for eth_sendTransaction
      if (transactionRequest?.method === 'wallet_sendCalls') {
        // Build options with permissionId if available
        const options = transactionRequest?.permissionId
          ? { permissionId: transactionRequest.permissionId }
          : undefined;

        const bundledResult = await account.sendCalls(
          transactionCalls,
          options,
          effectivePaymasterUrl,
          effectivePaymasterContext
        );
        // Return the transaction result with proper format based on method
        result = {
          id: bundledResult.id,
          chainId: bundledResult.chainId,
        };
      } else {
        const txHash = await account.sendTransaction(
          transactionCalls,
          effectivePaymasterUrl,
          effectivePaymasterContext
        );
        result = {
          hash: txHash,
        };
      }

      setTransactionStatus('Transaction confirmed!');

      // Call onSuccess immediately - parent will handle closing
      onSuccess?.(result);

    } catch (error) {
      console.error("Error in transaction:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setTransactionStatus(`Error: ${errorMessage}`);
      const errorObj = error instanceof Error ? error : new Error(errorMessage);
      // Determine error code based on error type
      let errorCode: number;
      if (error instanceof Error && error.name === 'NotAllowedError') {
        // User cancelled passkey prompt
        errorCode = standardErrorCodes.provider.userRejectedRequest;
      } else if (error instanceof Error && (
        errorMessage.includes('AA21') ||
        errorMessage.includes("didn't pay prefund") ||
        errorMessage.includes('insufficient') ||
        errorMessage.includes('exceeds balance')
      )) {
        // Transaction rejected due to funds/gas issues
        errorCode = standardErrorCodes.rpc.transactionRejected;
      } else {
        // Internal error
        errorCode = standardErrorCodes.rpc.internal;
      }
      onError?.(errorObj, errorCode);
      setIsProcessing(false);
    }
  }, [account, chain, normalizedTransactions, transactionRequest, effectivePaymasterUrl, effectivePaymasterContext, onSuccess, onError]);

  const handleCancel = useCallback(() => {
    if (!isProcessing) {
      setAccount(null);
      console.log('❌ User cancelled transaction request');
      // User rejected request (EIP-1193 code 4001)
      onError?.(new Error('User rejected the request'), standardErrorCodes.provider.userRejectedRequest);
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
    />
  );
}