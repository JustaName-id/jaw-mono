'use client'

import { TransactionDialog, TransactionData, getChainIcon } from "@jaw/ui";
// import { useSubnameCheck } from "@/hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Address, parseEther } from "viem";
import { SmartAccount } from "viem/account-abstraction";
import { SUPPORTED_CHAINS_NAMES } from "../../utils/constants";
// import { createSmartAccount, estimateUserOpGas, sendTransaction, calculateGas, fetchPasskeyCredential } from "@/lib/justanaccount";

export interface TransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Support both single transaction (backwards compatibility) and transaction arrays
  to?: string;
  data?: string;
  value?: string;
  chainId?: number;
  transactions?: TransactionData[];
  sponsored?: boolean;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export const TransactionModal = ({
  open,
  onOpenChange,
  to,
  data,
  value = '0',
  chainId,
  transactions,
  sponsored = false,
  onSuccess,
  onError
}: TransactionModalProps) => {
  // const { walletAddress } = useSubnameCheck();
  // const { ethPrice } = useEthPrice();
  const [gasFee, setGasFee] = useState<string>('');
  const [gasFeeLoading, setGasFeeLoading] = useState<boolean>(false);
  const [gasEstimationError, setGasEstimationError] = useState<string>('');
  const [transactionStatus, setTransactionStatus] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [cachedSmartAccount, setCachedSmartAccount] = useState<SmartAccount>();

  // Normalize transaction data - support both single transaction and array formats
  const normalizedTransactions = useMemo((): TransactionData[] => {
    if (transactions && transactions.length > 0) {
      return transactions;
    }
    // Backwards compatibility - convert single transaction props to array
    if (to && chainId !== undefined) {
      return [{
        to,
        data,
        value: value || '0',
        chainId
      }];
    }
    return [];
  }, [transactions, to, data, value, chainId]);

  const networkName = useMemo(() => {
    // For multiple transactions, use the first transaction's chain
    const chainId = normalizedTransactions[0]?.chainId;
    return SUPPORTED_CHAINS_NAMES[chainId as keyof typeof SUPPORTED_CHAINS_NAMES];
  }, [normalizedTransactions]);

  const resetModalState = useCallback(() => {
    setGasFee('');
    setGasFeeLoading(false);
    setGasEstimationError('');
    setTransactionStatus('');
    setIsProcessing(false);
  }, []);

  useEffect(() => {
    if (!open) {
      resetModalState();
    }
  }, [open, resetModalState]);

  // Clear cached smart account when key parameters change
  useEffect(() => {
    setCachedSmartAccount(undefined);
  }, [normalizedTransactions]);

  const getSmartAccount = useCallback(async () => {
    // const passkeyCredential = fetchPasskeyCredential();
    // if (!passkeyCredential) {
    //   throw new Error('No passkey credential found. Please log in again.');
    // }
    // // Use the first transaction's chainId if multiple chains are involved
    // const txChainId = normalizedTransactions[0]?.chainId || chainId || 1;
    // return await createSmartAccount(passkeyCredential, txChainId);
  }, [normalizedTransactions, chainId]);

  const estimateGas = useCallback(async () => {
    if (!open || normalizedTransactions.length === 0) return;

    try {
      setGasFeeLoading(true);
      const smartAccount = await getSmartAccount();
      // setCachedSmartAccount(smartAccount);

      // Convert normalized transactions to the format expected by estimateUserOpGas
      const transactionCalls = normalizedTransactions.map(tx => ({
        to: tx.to as Address,
        value: tx.value && tx.value !== '0' ? (
          /^\d+$/.test(tx.value) && tx.value.length > 10
            ? BigInt(tx.value)
            : parseEther(tx.value)
        ) : 0n,
        data: tx.data as `0x${string}` || '0x'
      }));

      // Estimate gas for all transactions
      // const gasEstimate = await estimateUserOpGas(smartAccount, transactionCalls);

      // Use the first transaction's chainId for gas calculation
      const firstChainId = normalizedTransactions[0]?.chainId || chainId || 1;
      // const gas = await calculateGas(firstChainId, gasEstimate);
      // setGasFee(gas);
    } catch (error) {
      console.error("Error estimating gas:", error);

      if (error instanceof Error && (error.message.includes('AA21') || error.message.includes("didn't pay prefund"))) {
        if (sponsored) {
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
  }, [open, normalizedTransactions, getSmartAccount, sponsored, chainId]);

  useEffect(() => {
    if (open) {
      estimateGas();
    }
  }, [open, estimateGas]);

  const handleConfirm = async () => {
    try {
      setIsProcessing(true);
      setTransactionStatus('Preparing transaction...');

      const smartAccount = cachedSmartAccount || await getSmartAccount();

      setTransactionStatus('Sending transaction...');

      // Convert normalized transactions to the format expected by sendTransaction
      const transactionCalls = normalizedTransactions.map(tx => ({
        to: tx.to as Address,
        value: tx.value && tx.value !== '0' ? (
          /^\d+$/.test(tx.value) && tx.value.length > 10
            ? BigInt(tx.value)
            : parseEther(tx.value)
        ) : 0n,
        data: tx.data as `0x${string}` || '0x'
      }));

      // Send all transactions as a batch
      // await sendTransaction(
      //   smartAccount,
      //   transactionCalls,
      //   sponsored
      // );

      setTransactionStatus('Transaction sent successfully!');

      // Success callback
      setTimeout(() => {
        onSuccess?.();
        resetModalState();
        onOpenChange(false);
      }, 1500);

    } catch (error) {
      console.error("Error in transaction:", error);
      setTransactionStatus(`Error: ${error instanceof Error ? error.message : 'Transaction failed'}`);
      onError?.(error as Error);
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    if (!isProcessing) {
      onOpenChange(false);
    }
  };

  return (
    <TransactionDialog
      open={open}
      onOpenChange={onOpenChange}
      transactions={normalizedTransactions}
      walletAddress={''}
      // walletAddress={walletAddress ?? ''}
      gasFee={gasFee}
      gasFeeLoading={gasFeeLoading}
      gasEstimationError={gasEstimationError}
      sponsored={sponsored}
      ethPrice={0}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      isProcessing={isProcessing}
      transactionStatus={transactionStatus}
      networkName={networkName ?? 'Ethereum'}
      getChainIcon={getChainIcon}
    />
  );
}