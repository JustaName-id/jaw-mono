'use client'

import { Button } from "@jaw/ui";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@jaw/ui";
import { DefaultDialog } from "@jaw/ui";
// import { useEthPrice, useIsMobile, useSubnameCheck } from "@/sdk/hooks";
import { useIsMobile } from "../../hooks/useIsMobile";
import { CopiedIcon, CopyIcon, WalletIcon } from "@jaw/ui";
// import { createSmartAccount, estimateUserOpGas, sendTransaction } from "@/sdk/lib/justanaccount";
// import { calculateGas } from "@/sdk/lib/utils";
// import { fetchPasskeyCredential } from "@jaw.id/passkeys";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Address, parseEther, formatEther } from "viem";
import { getChainIcon } from "@/utils/getChainIcon";
import { SmartAccount } from "viem/account-abstraction";
import { SUPPORTED_CHAINS_NAMES } from "@/utils/constants";

export interface TransactionData {
  to: string;
  data?: string;
  value?: string;
  chainId: number;
  stepId?: string;
  description?: string;
  action?: string;
}

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
  const { walletAddress } = useSubnameCheck();
  const { ethPrice } = useEthPrice();
  const [gasFee, setGasFee] = useState<string>('');
  const [gasFeeLoading, setGasFeeLoading] = useState<boolean>(false);
  const [gasEstimationError, setGasEstimationError] = useState<string>('');
  const [transactionStatus, setTransactionStatus] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isDataCopied, setIsDataCopied] = useState<{ [key: number]: boolean }>({});
  const [cachedSmartAccount, setCachedSmartAccount] = useState<SmartAccount>();
  const isMobile = useIsMobile();

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

  const totalTransactions = normalizedTransactions.length;
  const isSingleTransaction = totalTransactions === 1;
  const currentTransaction = normalizedTransactions[0];

  const networkName = useMemo(() => {
    // For multiple transactions, use the first transaction's chain
    const chainId = normalizedTransactions[0]?.chainId;
    return SUPPORTED_CHAINS_NAMES[chainId as keyof typeof SUPPORTED_CHAINS_NAMES];
  }, [normalizedTransactions]);

  // Helper function to format value for display
  const formatTransactionValue = (value?: string) => {
    if (!value || value === '0') return null;
    // If value looks like wei (long number, no decimals), format it from wei to ETH
    if (/^\d+$/.test(value) && value.length > 10) {
      return formatEther(BigInt(value));
    }
    // Otherwise, assume it's already in ETH format
    return value;
  };


  const resetModalState = useCallback(() => {
    setGasFee('');
    setGasFeeLoading(false);
    setGasEstimationError('');
    setTransactionStatus('');
    setIsProcessing(false);
    setIsDataCopied({});
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
    const passkeyCredential = fetchPasskeyCredential();
    if (!passkeyCredential) {
      throw new Error('No passkey credential found. Please log in again.');
    }
    // Use the first transaction's chainId if multiple chains are involved
    const txChainId = normalizedTransactions[0]?.chainId || chainId || 1;
    return await createSmartAccount(passkeyCredential, txChainId);
  }, [normalizedTransactions, chainId]);

  const estimateGas = useCallback(async () => {
    if (!open || normalizedTransactions.length === 0) return;

    try {
      setGasFeeLoading(true);
      const smartAccount = await getSmartAccount();
      setCachedSmartAccount(smartAccount);

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
      const gasEstimate = await estimateUserOpGas(smartAccount, transactionCalls);

      // Use the first transaction's chainId for gas calculation
      const firstChainId = normalizedTransactions[0]?.chainId || chainId || 1;
      const gas = await calculateGas(firstChainId, gasEstimate);
      setGasFee(gas);
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
      await sendTransaction(
        smartAccount,
        transactionCalls,
        sponsored
      );

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

  const canConfirm = !isProcessing && !gasFeeLoading && !(gasEstimationError && !sponsored);

  return (
    <DefaultDialog
      open={open}
      onOpenChange={!isProcessing ? onOpenChange : undefined}
      header={
        <div className="flex flex-col gap-2.5 p-3.5">
          <p className="text-xs font-bold text-muted-foreground leading-[100%]">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              day: 'numeric',
              month: 'long'
            })} at {new Date().toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              timeZoneName: 'short'
            })}
          </p>
          <p className="text-[30px] font-normal leading-[100%] text-foreground">
            {'Review Transaction'
            }
          </p>
          {totalTransactions > 1 && currentTransaction?.description && (
            <p className="text-sm text-muted-foreground">
              {currentTransaction.action}: {currentTransaction.description}
            </p>
          )}
        </div>
      }
      contentStyle={isMobile ? {
        width: '100%',
        height: '100%',
        maxWidth: 'none',
        maxHeight: '95vh',
        overflowY: 'auto',
      } : {
        width: 'fit-content',
        maxWidth: '500px',
      }}
    >
      <div className="flex flex-col gap-6 justify-between max-md:h-full">
        {isSingleTransaction ? (
          // Single Transaction Layout (unchanged)
          <>
            <div className="flex flex-col gap-3">
              {/* From - To */}
              <div className="flex flex-row justify-between items-center gap-2.5 p-3.5 border border-border rounded-[6px]">
                <div className="flex flex-col text-foreground gap-0.5 min-w-0 flex-1">
                  <p className="text-xs font-bold leading-[133%]">From</p>
                  <div className="flex flex-row items-center gap-1 min-w-0">
                    <WalletIcon className="w-3 h-3 flex-shrink-0" stroke="black" />
                    <p className="text-base font-normal text-ellipsis leading-[150%] truncate overflow-hidden">{walletAddress}</p>
                  </div>
                </div>
                <div className="w-[1px] rounded-full bg-border h-full flex-shrink-0 min-h-[70px]" />
                <div className="flex flex-col text-foreground gap-0.5 min-w-0 flex-1">
                  <p className="text-xs font-bold leading-[133%]">To</p>
                  <div className="flex flex-row items-center gap-1 min-w-0">
                    <WalletIcon className="w-3 h-3 flex-shrink-0" stroke="black" />
                    <p className="text-base font-normal text-ellipsis leading-[150%] truncate overflow-hidden">
                      {currentTransaction?.to}
                    </p>
                  </div>
                </div>
              </div>

              {/* Value */}
              {formatTransactionValue(currentTransaction?.value) && (
                <div className="flex flex-row justify-between items-center gap-2.5 p-3.5 border border-border rounded-[6px]">
                  <div className="flex flex-col text-foreground gap-0.5">
                    <p className="text-xs font-bold leading-[133%]">Value</p>
                    <p className="text-base font-normal leading-[150%]">{formatTransactionValue(currentTransaction?.value)} ETH</p>
                  </div>
                </div>
              )}

              {/* Network - Fees */}
              <div className="flex flex-row justify-between items-center gap-2.5 p-3.5 border border-border rounded-[6px]">
                <div className="flex flex-col text-foreground flex-1 gap-0.5">
                  <p className="text-xs font-bold leading-[133%]">Network</p>
                  <div className="flex flex-row items-center gap-1">
                    {getChainIcon(networkName?.toLowerCase() || 'ethereum', 16)}
                    <p className="text-base font-normal text-ellipsis leading-[150%] truncate">{networkName || 'Ethereum'}</p>
                  </div>
                </div>
                <div className="w-[1px] rounded-full bg-border h-full min-h-[50px]" />
                <div className="flex flex-col text-foreground flex-1 gap-0.5">
                  <p className="text-xs font-bold leading-[133%]">Network Fees</p>
                  <div className="flex flex-row items-center w-full justify-between gap-1">
                    {gasFeeLoading ? (
                      <p className="text-base font-normal text-muted-foreground">Estimating...</p>
                    ) : gasEstimationError && !sponsored ? (
                      <div className="flex flex-col">
                        <p className="text-sm text-red-600 font-medium">Gas Estimation Failed</p>
                        <p className="text-xs text-red-500">{gasEstimationError}</p>
                      </div>
                    ) : sponsored || gasFee === 'sponsored' ? (
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          {sponsored && gasFee && gasFee !== 'sponsored' && (
                            <div className="flex flex-col line-through text-muted-foreground">
                              <p className="text-base font-normal">
                                ${(ethPrice * Number(gasFee)).toFixed(4)}
                              </p>
                            </div>
                          )}
                          <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-0.5 rounded">
                            Sponsored
                          </span>
                        </div>
                        <p className="text-xs font-normal text-muted-foreground">
                          {sponsored && gasFee && gasFee !== 'sponsored' ? `${Number(gasFee).toFixed(4)} ETH` : 'Gas fees covered'}
                        </p>
                      </div>
                    ) : gasFee && gasFee !== 'sponsored' ? (
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <p className="text-base font-normal text-foreground">
                            ${(ethPrice * Number(gasFee)).toFixed(4)}
                          </p>
                        </div>
                        <p className="text-xs font-normal text-muted-foreground">
                          {Number(gasFee).toFixed(4)} ETH
                        </p>
                      </div>
                    ) : (
                      <p className="text-base font-normal text-muted-foreground">Unable to estimate</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Show Data section if data is provided */}
              {currentTransaction?.data && (
                <div className="flex flex-col p-3.5 gap-2.5 border border-border rounded-[6px]">
                  <div className="flex flex-row items-center justify-between w-full">
                    <p className="text-xs font-bold leading-[133%] text-foreground">Data</p>
                    {isDataCopied[0] ? (
                      <CopiedIcon width={16} height={16} />
                    ) : (
                      <CopyIcon width={16} height={16} onClick={() => {
                        navigator.clipboard.writeText(currentTransaction?.data ?? '');
                        setIsDataCopied({ ...isDataCopied, 0: true });
                        setTimeout(() => setIsDataCopied(prev => ({ ...prev, 0: false })), 3000);
                      }} className="cursor-pointer" />
                    )}
                  </div>
                  <div className="p-2.5 bg-secondary rounded-[6px]">
                    <p className="text-xs font-semibold leading-[150%] break-all text-foreground">
                      {currentTransaction.data.length > 500 ? `${currentTransaction.data.slice(0, 150)}...${currentTransaction.data.slice(-150)}` :
                        currentTransaction.data.length > 100 ? `${currentTransaction.data.slice(0, 50)}...${currentTransaction.data.slice(-50)}` : currentTransaction.data}
                    </p>
                  </div>
                </div>
              )}

              {/* Transaction Status */}
              {transactionStatus && (
                <div className={`text-sm p-3 rounded-lg ${transactionStatus.includes('Error') ? 'bg-red-50 text-red-600' :
                  transactionStatus.includes('successfully') ? 'bg-green-50 text-green-600' :
                    'bg-blue-50 text-blue-600'
                  }`}>
                  {transactionStatus}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 p-3.5 max-md:mt-auto">
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={isProcessing}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={!canConfirm}
                className="flex-1"
              >
                {gasEstimationError && !sponsored ? 'Insufficient Funds' :
                  isProcessing ? 'Processing...' : 'Transact'}
              </Button>
            </div>
          </>
        ) : (
          // Multiple Transactions Layout with Accordion
          <>
            <div className="flex flex-col gap-3 flex-1 overflow-hidden">
              {/* From Address */}
              <div className="p-3.5 border border-border rounded-[6px]">
                <p className="text-xs font-bold leading-[133%] text-foreground mb-1">From</p>
                <div className="flex flex-row items-center gap-1">
                  <WalletIcon className="w-3 h-3 flex-shrink-0" stroke="black" />
                  <p className="text-base font-normal text-ellipsis leading-[150%] truncate overflow-hidden">{walletAddress}</p>
                </div>
              </div>

              {/* Accordion for Transactions */}
              <div className="flex-1 overflow-y-auto">
                <Accordion type="multiple" className="w-full space-y-3" defaultValue={normalizedTransactions.map((_, index) => `transaction-${index}`)}>
                  {normalizedTransactions.map((transaction, index) => (
                    <AccordionItem key={index} value={`transaction-${index}`} className="border border-border rounded-[6px] overflow-hidden">
                      <AccordionTrigger className="px-3.5 py-2.5 hover:no-underline">
                        <span className="text-base font-medium">Call {index + 1}</span>
                      </AccordionTrigger>
                      <AccordionContent className="px-3.5 pb-3.5">
                        <div className="flex flex-col gap-3">
                          {/* Interacting with (To) */}
                          <div className="flex flex-col gap-1 border border-border rounded-[6px] p-2">
                            <p className="text-xs font-bold leading-[133%] text-black">Interacting with (to)</p>
                            <div className="flex flex-row items-center gap-1">
                              <WalletIcon className="w-3 h-3 flex-shrink-0" stroke="black" />
                              <p className="text-sm font-normal text-ellipsis leading-[150%] truncate overflow-hidden">
                                {transaction.to}
                              </p>
                            </div>
                          </div>

                          {/* Value */}
                          {formatTransactionValue(transaction.value) && (
                            <div className="flex items-center gap-2 border border-border rounded-[6px] p-2">
                              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                  <path d="M10 2L3 10L10 14L17 10L10 2Z" fill="currentColor" className="text-primary" />
                                </svg>
                              </div>
                              <div className="flex-1">
                                <p className="text-xs font-bold leading-[133%] text-muted-foreground">Value</p>
                                <div className="flex items-baseline gap-2">
                                  <p className="text-base font-normal">{formatTransactionValue(transaction.value)} ETH</p>
                                  {ethPrice && (
                                    <p className="text-sm text-muted-foreground">
                                      ${(Number(formatTransactionValue(transaction.value)) * ethPrice).toFixed(2)}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Data */}
                          {transaction.data && (
                            <div className="flex flex-col gap-1 border border-border rounded-[6px] p-2">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-bold leading-[133%] text-muted-foreground">Data</p>
                                {isDataCopied[index] ? (
                                  <CopiedIcon width={16} height={16} />
                                ) : (
                                  <CopyIcon
                                    width={16}
                                    height={16}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(transaction.data ?? '');
                                      setIsDataCopied({ ...isDataCopied, [index]: true });
                                      setTimeout(() => setIsDataCopied(prev => ({ ...prev, [index]: false })), 3000);
                                    }}
                                    className="cursor-pointer"
                                  />
                                )}
                              </div>
                              <div className="p-2 bg-secondary rounded-[6px]">
                                <p className="text-xs font-mono leading-[150%] break-all text-foreground">
                                  {transaction.data.length > 100
                                    ? `${transaction.data.slice(0, 50)}...${transaction.data.slice(-50)}`
                                    : transaction.data}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>

              {/* Transaction Status */}
              {transactionStatus && (
                <div className={`text-sm p-3 rounded-lg ${transactionStatus.includes('Error') ? 'bg-red-50 text-red-600' :
                  transactionStatus.includes('successfully') ? 'bg-green-50 text-green-600' :
                    'bg-blue-50 text-blue-600'
                  }`}>
                  {transactionStatus}
                </div>
              )}
            </div>

            {/* Fixed Bottom Section */}
            <div className="border-t pt-3 space-y-3">
              {/* Network and Fees */}
              <div className="flex flex-row justify-between items-center gap-2.5 p-3.5 border border-border rounded-[6px]">
                <div className="flex flex-col text-foreground flex-1 gap-0.5">
                  <p className="text-xs font-bold leading-[133%]">Network</p>
                  <div className="flex flex-row items-center gap-1">
                    {getChainIcon(networkName?.toLowerCase() || 'ethereum', 16)}
                    <p className="text-base font-normal text-ellipsis leading-[150%] truncate">{networkName || 'Ethereum'}</p>
                  </div>
                </div>
                <div className="w-[1px] rounded-full bg-border h-full min-h-[50px]" />
                <div className="flex flex-col text-foreground flex-1 gap-0.5">
                  <p className="text-xs font-bold leading-[133%]">Network Fees</p>
                  <div className="flex flex-row items-center w-full justify-between gap-1">
                    {gasFeeLoading ? (
                      <p className="text-base font-normal text-muted-foreground">Estimating...</p>
                    ) : gasEstimationError && !sponsored ? (
                      <div className="flex flex-col">
                        <p className="text-sm text-red-600 font-medium">Gas Estimation Failed</p>
                        <p className="text-xs text-red-500">{gasEstimationError}</p>
                      </div>
                    ) : sponsored || gasFee === 'sponsored' ? (
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          {sponsored && gasFee && gasFee !== 'sponsored' && (
                            <div className="flex flex-col line-through text-muted-foreground">
                              <p className="text-base font-normal">
                                ${(ethPrice * Number(gasFee)).toFixed(4)}
                              </p>
                            </div>
                          )}
                          <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-0.5 rounded">
                            Sponsored
                          </span>
                        </div>
                        <p className="text-xs font-normal text-muted-foreground">
                          {sponsored && gasFee && gasFee !== 'sponsored' ? `${Number(gasFee).toFixed(4)} ETH` : 'Gas fees covered'}
                        </p>
                      </div>
                    ) : gasFee && gasFee !== 'sponsored' ? (
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <p className="text-base font-normal text-foreground">
                            ${(ethPrice * Number(gasFee)).toFixed(4)}
                          </p>
                        </div>
                        <p className="text-xs font-normal text-muted-foreground">
                          {Number(gasFee).toFixed(4)} ETH
                        </p>
                      </div>
                    ) : (
                      <p className="text-base font-normal text-muted-foreground">Unable to estimate</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 px-3.5">
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={isProcessing}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirm}
                  disabled={!canConfirm}
                  className="flex-1"
                >
                  {gasEstimationError && !sponsored ? 'Insufficient Funds' :
                    isProcessing ? 'Processing...' : 'Transact'}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </DefaultDialog>
  )
}