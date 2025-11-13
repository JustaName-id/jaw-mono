'use client'

import { Button } from "../ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { DefaultDialog } from "../DefaultDialog";
import { CopiedIcon, CopyIcon, WalletIcon } from "../../icons";
import { useState, useEffect } from "react";
import { formatEther } from "viem";
import { TransactionDialogProps } from "./types";
import { useIsMobile, useChainIcon } from "../../hooks";
import { getJustaNameInstance } from "../../utils/justaNameInstance";

export const TransactionDialog = ({
  // open,
  // onOpenChange,
  transactions,
  walletAddress,
  gasFee,
  gasFeeLoading,
  gasEstimationError,
  sponsored,
  ethPrice,
  onConfirm,
  onCancel,
  isProcessing,
  transactionStatus,
  networkName,
  chainIconKey,
}: TransactionDialogProps) => {
  const isMobile = useIsMobile();
  const [isDataCopied, setIsDataCopied] = useState<{ [key: number]: boolean }>({});
  const [resolvedAddresses, setResolvedAddresses] = useState<Record<string, string>>({});

  const totalTransactions = transactions.length;
  const isSingleTransaction = totalTransactions === 1;
  const currentTransaction = transactions[0];

  // Get chain icon using the hook
  const chainIcon = useChainIcon(chainIconKey || networkName?.toLowerCase() || 'ethereum', 16);

  // Initialize JustaName and resolve addresses
  useEffect(() => {
    const justaName = getJustaNameInstance();

    // Resolve wallet address
    if (walletAddress && currentTransaction?.chainId) {
      justaName.subnames.reverseResolve({
        address: walletAddress as `0x${string}`,
        chainId: currentTransaction.chainId,
      }).then((result) => {
        console.log('result', result);
        if (result) {
          setResolvedAddresses(prev => ({ ...prev, [walletAddress]: result }));
        }
      }).catch(() => {
        // Silently fail if resolution fails
      });
    }

    // Resolve transaction 'to' addresses
    transactions.forEach((transaction) => {
      if (transaction.to && transaction.chainId) {
        justaName.subnames.reverseResolve({
          address: transaction.to as `0x${string}`,
          chainId: transaction.chainId,
        }).then((result) => {
          if (result) {
            setResolvedAddresses(prev => ({ ...prev, [transaction.to]: result }));
          }
        }).catch(() => {
          // Silently fail if resolution fails
        });
      }
    });
  }, [walletAddress, transactions, currentTransaction?.chainId]);

  // Get resolved addresses or fallback to original
  const resolvedWalletAddress = resolvedAddresses[walletAddress] || walletAddress;
  const resolvedToAddress = currentTransaction?.to ? (resolvedAddresses[currentTransaction.to] || currentTransaction.to) : '';

  // Helper function to format value for display
  const formatTransactionValue = (value?: string) => {
    if (!value || value === '0' || value === '0x0') return null;

    try {
      // Handle hex strings (0x...)
      if (value.startsWith('0x')) {
        const bigIntValue = BigInt(value);
        return formatEther(bigIntValue);
      }

      // If value looks like wei (long number, no decimals), format it from wei to ETH
      if (/^\d+$/.test(value) && value.length > 10) {
        return formatEther(BigInt(value));
      }

      // If it's already a decimal string (like "0.001"), return as is
      if (/^\d+\.?\d*$/.test(value) && value.length <= 20) {
        return value;
      }

      // Try to parse as BigInt and format
      const bigIntValue = BigInt(value);
      return formatEther(bigIntValue);
    } catch (error) {
      // If parsing fails, return null to hide the value
      console.warn('Failed to format transaction value:', value, error);
      return null;
    }
  };

  const canConfirm = !isProcessing && !gasFeeLoading && !(gasEstimationError && !sponsored);

  return (
    <DefaultDialog
      // open={open}
      // onOpenChange={!isProcessing ? onOpenChange : undefined}
      open={true}
      onOpenChange={isProcessing ? undefined : () => {
        // Empty handler to prevent dialog close
      }}
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
            {'Review Transaction'}
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
        maxHeight: 'none',
        overflowY: 'auto',
      } : {
        width: '500px',
        minWidth: '500px',
      }}
    >
      <div className="flex flex-col gap-6 justify-between max-md:h-full">
        {isSingleTransaction ? (
          // Single Transaction Layout
          <>
            <div className="flex flex-col gap-3">
              {/* From - To */}
              <div className="flex flex-row justify-between items-center gap-2.5 p-3.5 border border-border rounded-[6px]">
                <div className="flex flex-col text-foreground gap-0.5 min-w-0 flex-1">
                  <p className="text-xs font-bold leading-[133%]">From</p>
                  <div className="flex flex-row items-center gap-1 min-w-0">
                    <WalletIcon className="w-3 h-3 flex-shrink-0" stroke="black" />
                    <p className="text-base font-normal text-ellipsis leading-[150%] truncate overflow-hidden">{resolvedWalletAddress}</p>
                  </div>
                </div>
                <div className="w-[1px] rounded-full bg-border h-full flex-shrink-0 min-h-[70px]" />
                <div className="flex flex-col text-foreground gap-0.5 min-w-0 flex-1">
                  <p className="text-xs font-bold leading-[133%]">To</p>
                  <div className="flex flex-row items-center gap-1 min-w-0">
                    <WalletIcon className="w-3 h-3 flex-shrink-0" stroke="black" />
                    <p className="text-base font-normal text-ellipsis leading-[150%] truncate overflow-hidden">
                      {resolvedToAddress}
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
                    {chainIcon}
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
                              {/* TODO: Add gas fee in USD */}
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
                          {sponsored && gasFee && gasFee !== 'sponsored' ? (() => {
                            const gasValue = Number(gasFee);
                            if (gasValue > 0 && gasValue < 0.0001) {
                              return '> 0.0001 ETH';
                            }
                            return gasValue.toFixed(4) + ' ETH';
                          })() : 'Gas fees covered'}
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
                          {(() => {
                            const gasValue = Number(gasFee);
                            if (gasValue > 0 && gasValue < 0.0001) {
                              return '> 0.0001 ETH';
                            }
                            return gasValue.toFixed(4) + ' ETH';
                          })()}
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
                        if (typeof window !== 'undefined' && navigator?.clipboard) {
                          navigator.clipboard.writeText(currentTransaction?.data ?? '');
                          setIsDataCopied({ ...isDataCopied, 0: true });
                          setTimeout(() => setIsDataCopied(prev => ({ ...prev, 0: false })), 3000);
                        }
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
                onClick={onCancel}
                disabled={isProcessing}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={onConfirm}
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
                  <p className="text-base font-normal text-ellipsis leading-[150%] truncate overflow-hidden">{resolvedWalletAddress}</p>
                </div>
              </div>

              {/* Accordion for Transactions */}
              <div className="flex-1 overflow-y-auto">
                <Accordion type="multiple" className="w-full space-y-3" defaultValue={transactions.map((_, index) => `transaction-${index}`)}>
                  {transactions.map((transaction, index) => (
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
                                {resolvedAddresses[transaction.to] || transaction.to}
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
                                      if (typeof window !== 'undefined' && navigator?.clipboard) {
                                        navigator.clipboard.writeText(transaction.data ?? '');
                                        setIsDataCopied({ ...isDataCopied, [index]: true });
                                        setTimeout(() => setIsDataCopied(prev => ({ ...prev, [index]: false })), 3000);
                                      }
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
                    {chainIcon}
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
                          {sponsored && gasFee && gasFee !== 'sponsored' ? (() => {
                            const gasValue = Number(gasFee);
                            if (gasValue > 0 && gasValue < 0.0001) {
                              return '> 0.0001 ETH';
                            }
                            return gasValue.toFixed(4) + ' ETH';
                          })() : 'Gas fees covered'}
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
                          {(() => {
                            const gasValue = Number(gasFee);
                            if (gasValue > 0 && gasValue < 0.0001) {
                              return '> 0.0001 ETH';
                            }
                            return gasValue.toFixed(4) + ' ETH';
                          })()}
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
                  onClick={onCancel}
                  disabled={isProcessing}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={onConfirm}
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

export * from './types';
