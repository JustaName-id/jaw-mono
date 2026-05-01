'use client';

import { Button } from '../ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { DefaultDialog } from '../DefaultDialog';
import { FeeTokenSelector } from '../FeeTokenSelector';
import { CopiedIcon, CopyIcon, WalletIcon } from '../../icons';
import { useState, useEffect } from 'react';
import { formatEther } from 'viem';
import { Info } from 'lucide-react';
import { TransactionDialogProps } from './types';
import { useIsMobile, useChainIconURI, useFeeTokenPrice } from '../../hooks';
import { getJustaNameInstance, getDisplayAddress } from '../../utils';
import { DecodedCalldata } from './DecodedCalldata';

export const TransactionDialog = ({
  // open,
  // onOpenChange,
  transactions,
  walletAddress,
  gasFee,
  gasFeeLoading,
  gasEstimationError,
  sponsored,
  onConfirm,
  onCancel,
  isProcessing,
  transactionStatus,
  networkName,
  apiKey,
  // Fee token props
  feeTokens,
  feeTokensLoading,
  selectedFeeToken,
  onFeeTokenSelect,
  showFeeTokenSelector,
  isPayingWithErc20,
  // RPC configuration
  mainnetRpcUrl,
  nativeCurrencySymbol,
}: TransactionDialogProps) => {
  const isMobile = useIsMobile();
  const [isDataCopied, setIsDataCopied] = useState<{ [key: number]: boolean }>({});
  const [isAddressCopied, setIsAddressCopied] = useState<{ [key: string]: boolean }>({});
  const [resolvedAddresses, setResolvedAddresses] = useState<Record<string, string>>({});

  const totalTransactions = transactions.length;
  const isSingleTransaction = totalTransactions === 1;
  const currentTransaction = transactions[0];

  // Get chain icon using the hook - fetch from capabilities chainMetadata
  const chainIcon = useChainIconURI(currentTransaction?.chainId || 1, apiKey, 24);

  // Get native token symbol from feeTokens, falling back to chain's native currency
  const nativeToken = feeTokens?.find((t) => t.isNative);
  const nativeSymbol = nativeToken?.symbol || nativeCurrencySymbol || 'ETH';

  // Fetch native token price dynamically based on the chain's native token symbol
  const nativeTokenPrice = useFeeTokenPrice(nativeSymbol);

  // Check if there are any selectable payment options
  // If feeTokens is not loaded yet (null/undefined/empty), assume there are selectable options
  const hasSelectablePaymentOption =
    !feeTokens || feeTokens.length === 0 ? true : feeTokens.some((t) => t.isSelectable);

  // Initialize JustaName and resolve addresses
  useEffect(() => {
    const justaName = getJustaNameInstance(mainnetRpcUrl);

    // Resolve wallet address
    if (walletAddress && currentTransaction?.chainId) {
      justaName.subnames
        .reverseResolve({
          address: walletAddress as `0x${string}`,
          chainId: currentTransaction.chainId,
        })
        .then((result) => {
          if (result) {
            setResolvedAddresses((prev) => ({ ...prev, [walletAddress]: result }));
          }
        })
        .catch(() => {
          // Silently fail if resolution fails
        });
    }

    // Resolve transaction 'to' addresses
    transactions.forEach((transaction) => {
      if (transaction.to && transaction.chainId) {
        justaName.subnames
          .reverseResolve({
            address: transaction.to as `0x${string}`,
            chainId: transaction.chainId,
          })
          .then((result) => {
            if (result) {
              setResolvedAddresses((prev) => ({ ...prev, [transaction.to]: result }));
            }
          })
          .catch(() => {
            // Silently fail if resolution fails
          });
      }
    });
  }, [walletAddress, transactions, currentTransaction?.chainId]);

  // Get display addresses - use resolved name or formatted address
  const displayWalletAddress = getDisplayAddress(resolvedAddresses[walletAddress], walletAddress);
  const displayToAddress = currentTransaction?.to
    ? getDisplayAddress(resolvedAddresses[currentTransaction.to], currentTransaction.to)
    : '';

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

  // Determine if confirmation is allowed:
  // - Not processing
  // - Gas estimation not loading
  // - No gas estimation error (unless sponsored)
  // - Must have at least one selectable payment option
  const hasInsufficientFunds = !hasSelectablePaymentOption || (gasEstimationError && !sponsored && !isPayingWithErc20);
  const canConfirm = !isProcessing && !gasFeeLoading && !hasInsufficientFunds;

  return (
    <DefaultDialog
      // open={open}
      // onOpenChange={!isProcessing ? onOpenChange : undefined}
      open={true}
      onOpenChange={
        isProcessing
          ? undefined
          : () => {
              // Empty handler to prevent dialog close
            }
      }
      header={
        <div className="flex flex-col gap-2.5 p-3.5">
          <p className="text-muted-foreground text-xs font-bold leading-[100%]">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}{' '}
            at{' '}
            {new Date().toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              timeZoneName: 'short',
            })}
          </p>
          <p className="text-foreground text-[30px] font-normal leading-[100%]">{'Review Transaction'}</p>
          {totalTransactions > 1 && currentTransaction?.description && (
            <p className="text-muted-foreground text-sm">
              {currentTransaction.action}: {currentTransaction.description}
            </p>
          )}
        </div>
      }
      contentStyle={
        isMobile
          ? {
              width: '100%',
              height: '100%',
              maxWidth: 'none',
              maxHeight: 'none',
              overflowY: 'auto',
            }
          : {
              width: '500px',
              minWidth: '500px',
              maxHeight: !isSingleTransaction ? '85vh' : undefined,
            }
      }
    >
      <div
        className={`flex flex-col justify-between gap-6 max-md:h-full ${!isSingleTransaction ? 'h-full overflow-hidden' : ''}`}
      >
        {isSingleTransaction ? (
          // Single Transaction Layout
          <>
            <div className="flex max-h-[60vh] min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
              {/* From - To */}
              <div className="border-border flex flex-row items-center justify-between gap-2.5 rounded-[6px] border p-3.5">
                <div className="text-foreground flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="text-xs font-bold leading-[133%]">From</p>
                  <div className="flex min-w-0 flex-row items-center gap-1">
                    <WalletIcon className="h-3 w-3 flex-shrink-0" stroke="black" />
                    <p className="text-base font-normal leading-[150%]">{displayWalletAddress}</p>
                  </div>
                </div>
                <div className="bg-border h-full min-h-[70px] w-[1px] flex-shrink-0 rounded-full" />
                <div className="text-foreground flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="text-xs font-bold leading-[133%]">To</p>
                  <div className="flex min-w-0 flex-row items-center gap-1">
                    <WalletIcon className="h-3 w-3 flex-shrink-0" stroke="black" />
                    <p className="text-base font-normal leading-[150%]">{displayToAddress}</p>
                    {currentTransaction?.to &&
                      (isAddressCopied['single-to'] ? (
                        <CopiedIcon width={14} height={14} className="flex-shrink-0" />
                      ) : (
                        <CopyIcon
                          width={14}
                          height={14}
                          onClick={() => {
                            if (typeof window !== 'undefined' && navigator?.clipboard) {
                              navigator.clipboard.writeText(currentTransaction.to);
                              setIsAddressCopied((prev) => ({ ...prev, 'single-to': true }));
                              setTimeout(() => setIsAddressCopied((prev) => ({ ...prev, 'single-to': false })), 3000);
                            }
                          }}
                          className="flex-shrink-0 cursor-pointer"
                        />
                      ))}
                  </div>
                </div>
              </div>

              {/* Value */}
              {formatTransactionValue(currentTransaction?.value) && (
                <div className="border-border flex flex-row items-center justify-between gap-2.5 rounded-[6px] border p-3.5">
                  <div className="text-foreground flex flex-col gap-0.5">
                    <p className="text-xs font-bold leading-[133%]">Value</p>
                    <p className="text-base font-normal leading-[150%]">
                      {formatTransactionValue(currentTransaction?.value)} {nativeSymbol}
                    </p>
                  </div>
                </div>
              )}

              {/* Network - Fees */}
              <div className="border-border flex flex-row items-center justify-between gap-2.5 rounded-[6px] border p-3.5">
                <div className="text-foreground flex flex-1 flex-col gap-0.5">
                  <p className="text-xs font-bold leading-[133%]">Network</p>
                  <div className="flex flex-row items-center gap-1">
                    {chainIcon}
                    <p className="truncate text-ellipsis text-base font-normal leading-[150%]">
                      {networkName || 'Ethereum'}
                    </p>
                  </div>
                </div>
                <div className="bg-border h-full min-h-[50px] w-[1px] rounded-full" />
                <div className="text-foreground flex flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-1">
                    <p className="text-xs font-bold leading-[133%]">Network Fees</p>
                    <TooltipProvider delayDuration={0}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="text-muted-foreground size-3 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[200px] text-xs">
                          <p>
                            Gas fees paid to network validators to process your transaction. You can pay with{' '}
                            {nativeSymbol} or supported tokens.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="flex w-full flex-row items-center justify-between gap-1">
                    {gasFeeLoading && !isPayingWithErc20 ? (
                      <p className="text-muted-foreground text-base font-normal">Estimating...</p>
                    ) : gasEstimationError && !sponsored ? (
                      <div className="flex flex-col">
                        <p className="text-sm font-medium text-red-600">{gasEstimationError}</p>
                      </div>
                    ) : sponsored ? (
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          {gasFee && gasFee !== 'sponsored' && nativeTokenPrice > 0 && (
                            <div className="text-muted-foreground flex flex-col line-through">
                              <p className="text-base font-normal">${(nativeTokenPrice * Number(gasFee)).toFixed(4)}</p>
                            </div>
                          )}
                          <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-600">
                            Sponsored
                          </span>
                        </div>
                        <p className="text-muted-foreground text-xs font-normal">
                          {gasFee && gasFee !== 'sponsored'
                            ? (() => {
                                const gasValue = Number(gasFee);
                                if (gasValue > 0 && gasValue < 0.0001) {
                                  return `< 0.0001 ${nativeSymbol}`;
                                }
                                return `${gasValue.toFixed(4)} ${nativeSymbol}`;
                              })()
                            : 'Gas fees covered'}
                        </p>
                      </div>
                    ) : isPayingWithErc20 && selectedFeeToken ? (
                      <div className="flex w-full flex-col gap-0.5">
                        <div className="flex w-full items-center justify-between">
                          <p className="text-foreground text-base font-normal">
                            {/* Show estimated cost from paymaster quote - don't fallback to ETH calculation */}
                            {selectedFeeToken.gasCostFormatted ? (
                              // For stablecoins like USDC/USDT, the value is approximately USD
                              `$${selectedFeeToken.gasCostFormatted}`
                            ) : (
                              <span className="text-muted-foreground">Estimating...</span>
                            )}
                          </p>
                          {/* Inline Fee Token Selector */}
                          {showFeeTokenSelector && feeTokens && onFeeTokenSelect && (
                            <FeeTokenSelector
                              tokens={feeTokens}
                              selectedToken={selectedFeeToken}
                              onSelect={onFeeTokenSelect}
                              isLoading={feeTokensLoading ?? false}
                              disabled={isProcessing}
                              nativeTokenPrice={nativeTokenPrice}
                              estimatedGasEth={gasFee || '0'}
                            />
                          )}
                        </div>
                        {selectedFeeToken.gasCostFormatted && (
                          <p className="text-muted-foreground text-xs font-normal">
                            Up to {selectedFeeToken.gasCostFormatted} {selectedFeeToken.symbol}
                          </p>
                        )}
                      </div>
                    ) : gasFee && gasFee !== 'sponsored' ? (
                      <div className="flex w-full flex-col gap-0.5">
                        <div className="flex w-full items-center justify-between">
                          <p className="text-foreground text-base font-normal">
                            {nativeTokenPrice > 0 ? `$${(nativeTokenPrice * Number(gasFee)).toFixed(4)}` : ''}
                          </p>
                          {/* Inline Fee Token Selector */}
                          {showFeeTokenSelector && !sponsored && feeTokens && onFeeTokenSelect && (
                            <FeeTokenSelector
                              tokens={feeTokens}
                              selectedToken={selectedFeeToken ?? null}
                              onSelect={onFeeTokenSelect}
                              isLoading={feeTokensLoading ?? false}
                              disabled={isProcessing}
                              nativeTokenPrice={nativeTokenPrice}
                              estimatedGasEth={gasFee}
                            />
                          )}
                        </div>
                        <p className="text-muted-foreground text-xs font-normal">
                          {(() => {
                            const gasValue = Number(gasFee);
                            if (gasValue > 0 && gasValue < 0.0001) {
                              return `< 0.0001 ${nativeSymbol}`;
                            }
                            return `${gasValue.toFixed(4)} ${nativeSymbol}`;
                          })()}
                        </p>
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-base font-normal">Unable to estimate</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Show Data section if data is provided */}
              {currentTransaction?.data && (
                <div className="border-border flex flex-col gap-2.5 rounded-[6px] border p-3.5">
                  <div className="flex w-full flex-row items-center justify-between">
                    <p className="text-foreground text-xs font-bold leading-[133%]">Data</p>
                    {isDataCopied[0] ? (
                      <CopiedIcon width={16} height={16} />
                    ) : (
                      <CopyIcon
                        width={16}
                        height={16}
                        onClick={() => {
                          if (typeof window !== 'undefined' && navigator?.clipboard) {
                            navigator.clipboard.writeText(currentTransaction?.data ?? '');
                            setIsDataCopied({ ...isDataCopied, 0: true });
                            setTimeout(() => setIsDataCopied((prev) => ({ ...prev, 0: false })), 3000);
                          }
                        }}
                        className="cursor-pointer"
                      />
                    )}
                  </div>
                  <DecodedCalldata
                    to={currentTransaction.to}
                    data={currentTransaction.data!}
                    chainId={currentTransaction.chainId}
                    apiKey={apiKey}
                    resolvedAddresses={resolvedAddresses}
                    mainnetRpcUrl={mainnetRpcUrl}
                  />
                </div>
              )}

              {/* Transaction Status */}
              {transactionStatus && (
                <div
                  className={`rounded-lg p-3 text-sm ${
                    transactionStatus.includes('Error')
                      ? 'bg-red-50 text-red-600'
                      : transactionStatus.includes('successfully')
                        ? 'bg-green-50 text-green-600'
                        : 'bg-blue-50 text-blue-600'
                  }`}
                >
                  {transactionStatus}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-shrink-0 gap-3 p-3.5 max-md:mt-auto">
              <Button variant="outline" onClick={onCancel} disabled={isProcessing} className="flex-1">
                Cancel
              </Button>
              <Button onClick={onConfirm} disabled={!canConfirm} className="flex-1">
                {hasInsufficientFunds ? 'Insufficient Funds' : isProcessing ? 'Processing...' : 'Transact'}
              </Button>
            </div>
          </>
        ) : (
          // Multiple Transactions Layout with Accordion
          <>
            <div className="flex max-h-[60vh] min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
              {/* From Address */}
              <div className="border-border flex-shrink-0 rounded-[6px] border p-3.5">
                <p className="text-foreground mb-1 text-xs font-bold leading-[133%]">From</p>
                <div className="flex flex-row items-center gap-1">
                  <WalletIcon className="h-3 w-3 flex-shrink-0" stroke="black" />
                  <p className="text-base font-normal leading-[150%]">{displayWalletAddress}</p>
                </div>
              </div>

              {/* Accordion for Transactions */}
              <div className="min-h-0 flex-1 overflow-y-auto">
                <Accordion
                  type="multiple"
                  className="w-full space-y-3"
                  defaultValue={transactions.map((_, index) => `transaction-${index}`)}
                >
                  {transactions.map((transaction, index) => (
                    <AccordionItem
                      key={index}
                      value={`transaction-${index}`}
                      className="border-border overflow-hidden rounded-[6px] border"
                    >
                      <AccordionTrigger className="px-3.5 py-2.5 hover:no-underline">
                        <span className="text-base font-medium">Call {index + 1}</span>
                      </AccordionTrigger>
                      <AccordionContent className="px-3.5 pb-3.5">
                        <div className="flex flex-col gap-3">
                          {/* Interacting with (To) */}
                          <div className="border-border flex flex-col gap-1 rounded-[6px] border p-2">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold leading-[133%] text-black">Interacting with (to)</p>
                              {isAddressCopied[`to-${index}`] ? (
                                <CopiedIcon width={14} height={14} />
                              ) : (
                                <CopyIcon
                                  width={14}
                                  height={14}
                                  onClick={() => {
                                    if (typeof window !== 'undefined' && navigator?.clipboard) {
                                      navigator.clipboard.writeText(transaction.to);
                                      setIsAddressCopied((prev) => ({ ...prev, [`to-${index}`]: true }));
                                      setTimeout(
                                        () => setIsAddressCopied((prev) => ({ ...prev, [`to-${index}`]: false })),
                                        3000
                                      );
                                    }
                                  }}
                                  className="cursor-pointer"
                                />
                              )}
                            </div>
                            <div className="flex flex-row items-center gap-1">
                              <WalletIcon className="h-3 w-3 flex-shrink-0" stroke="black" />
                              <p className="text-sm font-normal leading-[150%]">
                                {getDisplayAddress(resolvedAddresses[transaction.to], transaction.to)}
                              </p>
                            </div>
                          </div>

                          {/* Value */}
                          {formatTransactionValue(transaction.value) && (
                            <div className="border-border flex items-center gap-2 rounded-[6px] border p-2">
                              <div className="bg-primary/10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full">
                                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                  <path d="M10 2L3 10L10 14L17 10L10 2Z" fill="currentColor" className="text-primary" />
                                </svg>
                              </div>
                              <div className="flex-1">
                                <p className="text-muted-foreground text-xs font-bold leading-[133%]">Value</p>
                                <div className="flex items-baseline gap-2">
                                  <p className="text-base font-normal">
                                    {formatTransactionValue(transaction.value)} {nativeSymbol}
                                  </p>
                                  {nativeTokenPrice > 0 && (
                                    <p className="text-muted-foreground text-sm">
                                      $
                                      {(Number(formatTransactionValue(transaction.value)) * nativeTokenPrice).toFixed(
                                        2
                                      )}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Data */}
                          {transaction.data && (
                            <div className="border-border flex flex-col gap-1 rounded-[6px] border p-2">
                              <div className="mb-2 flex items-center justify-between">
                                <p className="text-muted-foreground text-xs font-bold leading-[133%]">Data</p>
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
                                        setTimeout(
                                          () => setIsDataCopied((prev) => ({ ...prev, [index]: false })),
                                          3000
                                        );
                                      }
                                    }}
                                    className="cursor-pointer"
                                  />
                                )}
                              </div>
                              <DecodedCalldata
                                to={transaction.to}
                                data={transaction.data!}
                                chainId={transaction.chainId}
                                apiKey={apiKey}
                                resolvedAddresses={resolvedAddresses}
                                mainnetRpcUrl={mainnetRpcUrl}
                              />
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
                <div
                  className={`rounded-lg p-3 text-sm ${
                    transactionStatus.includes('Error')
                      ? 'bg-red-50 text-red-600'
                      : transactionStatus.includes('successfully')
                        ? 'bg-green-50 text-green-600'
                        : 'bg-blue-50 text-blue-600'
                  }`}
                >
                  {transactionStatus}
                </div>
              )}
            </div>

            {/* Fixed Bottom Section */}
            <div className="flex-shrink-0 space-y-3 border-t pt-3">
              {/* Network and Fees */}
              <div className="border-border flex flex-row items-center justify-between gap-2.5 rounded-[6px] border p-3.5">
                <div className="text-foreground flex flex-1 flex-col gap-0.5">
                  <p className="text-xs font-bold leading-[133%]">Network</p>
                  <div className="flex flex-row items-center gap-1">
                    {chainIcon}
                    <p className="truncate text-ellipsis text-base font-normal leading-[150%]">
                      {networkName || 'Ethereum'}
                    </p>
                  </div>
                </div>
                <div className="bg-border h-full min-h-[50px] w-[1px] rounded-full" />
                <div className="text-foreground flex flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-1">
                    <p className="text-xs font-bold leading-[133%]">Network Fees</p>
                    <TooltipProvider delayDuration={0}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="text-muted-foreground size-3 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[200px] text-xs">
                          <p>
                            Gas fees paid to network validators to process your transaction. You can pay with{' '}
                            {nativeSymbol} or supported tokens.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="flex w-full flex-row items-center justify-between gap-1">
                    {gasFeeLoading && !isPayingWithErc20 ? (
                      <p className="text-muted-foreground text-base font-normal">Estimating...</p>
                    ) : gasEstimationError && !sponsored ? (
                      <div className="flex flex-col">
                        <p className="text-sm font-medium text-red-600">{gasEstimationError}</p>
                      </div>
                    ) : sponsored ? (
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          {gasFee && gasFee !== 'sponsored' && nativeTokenPrice > 0 && (
                            <div className="text-muted-foreground flex flex-col line-through">
                              <p className="text-base font-normal">${(nativeTokenPrice * Number(gasFee)).toFixed(4)}</p>
                            </div>
                          )}
                          <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-600">
                            Sponsored
                          </span>
                        </div>
                        <p className="text-muted-foreground text-xs font-normal">
                          {gasFee && gasFee !== 'sponsored'
                            ? (() => {
                                const gasValue = Number(gasFee);
                                if (gasValue > 0 && gasValue < 0.0001) {
                                  return `< 0.0001 ${nativeSymbol}`;
                                }
                                return `${gasValue.toFixed(4)} ${nativeSymbol}`;
                              })()
                            : 'Gas fees covered'}
                        </p>
                      </div>
                    ) : isPayingWithErc20 && selectedFeeToken ? (
                      <div className="flex w-full flex-col gap-0.5">
                        <div className="flex w-full items-center justify-between">
                          <p className="text-foreground text-base font-normal">
                            {/* Show estimated cost from paymaster quote - don't fallback to ETH calculation */}
                            {selectedFeeToken.gasCostFormatted ? (
                              // For stablecoins like USDC/USDT, the value is approximately USD
                              `$${selectedFeeToken.gasCostFormatted}`
                            ) : (
                              <span className="text-muted-foreground">Estimating...</span>
                            )}
                          </p>
                          {/* Inline Fee Token Selector */}
                          {showFeeTokenSelector && feeTokens && onFeeTokenSelect && (
                            <FeeTokenSelector
                              tokens={feeTokens}
                              selectedToken={selectedFeeToken}
                              onSelect={onFeeTokenSelect}
                              isLoading={feeTokensLoading ?? false}
                              disabled={isProcessing}
                              nativeTokenPrice={nativeTokenPrice}
                              estimatedGasEth={gasFee || '0'}
                            />
                          )}
                        </div>
                        {selectedFeeToken.gasCostFormatted && (
                          <p className="text-muted-foreground text-xs font-normal">
                            Up to {selectedFeeToken.gasCostFormatted} {selectedFeeToken.symbol}
                          </p>
                        )}
                      </div>
                    ) : gasFee && gasFee !== 'sponsored' ? (
                      <div className="flex w-full flex-col gap-0.5">
                        <div className="flex w-full items-center justify-between">
                          <p className="text-foreground text-base font-normal">
                            {nativeTokenPrice > 0 ? `$${(nativeTokenPrice * Number(gasFee)).toFixed(4)}` : ''}
                          </p>
                          {/* Inline Fee Token Selector */}
                          {showFeeTokenSelector && !sponsored && feeTokens && onFeeTokenSelect && (
                            <FeeTokenSelector
                              tokens={feeTokens}
                              selectedToken={selectedFeeToken ?? null}
                              onSelect={onFeeTokenSelect}
                              isLoading={feeTokensLoading ?? false}
                              disabled={isProcessing}
                              nativeTokenPrice={nativeTokenPrice}
                              estimatedGasEth={gasFee}
                            />
                          )}
                        </div>
                        <p className="text-muted-foreground text-xs font-normal">
                          {(() => {
                            const gasValue = Number(gasFee);
                            if (gasValue > 0 && gasValue < 0.0001) {
                              return `< 0.0001 ${nativeSymbol}`;
                            }
                            return `${gasValue.toFixed(4)} ${nativeSymbol}`;
                          })()}
                        </p>
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-base font-normal">Unable to estimate</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-shrink-0 gap-3 px-3.5">
                <Button variant="outline" onClick={onCancel} disabled={isProcessing} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={onConfirm} disabled={!canConfirm} className="flex-1">
                  {gasEstimationError && !sponsored
                    ? 'Insufficient Funds'
                    : isProcessing
                      ? 'Processing...'
                      : 'Transact'}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </DefaultDialog>
  );
};

export * from './types';
