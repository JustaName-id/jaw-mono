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
  const [isAddressCopied, setIsAddressCopied] = useState<{
    [key: string]: boolean;
  }>({});
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
            setResolvedAddresses((prev) => ({
              ...prev,
              [walletAddress]: result,
            }));
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
              setResolvedAddresses((prev) => ({
                ...prev,
                [transaction.to]: result,
              }));
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
          <p className="text-xs font-bold text-muted-foreground leading-[100%]">
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
          <p className="text-[30px] font-normal leading-[100%] text-foreground">{'Review Transaction'}</p>
          {totalTransactions > 1 && currentTransaction?.description && (
            <p className="text-sm text-muted-foreground">
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
        className={`flex flex-col gap-6 justify-between max-md:h-full ${!isSingleTransaction ? 'overflow-hidden h-full' : ''}`}
      >
        {isSingleTransaction ? (
          // Single Transaction Layout
          <>
            <div className="flex flex-col gap-3 flex-1 overflow-y-auto min-h-0 max-h-[60vh]">
              {/* From - To */}
              <div className="flex flex-row justify-between items-center gap-2.5 p-3.5 border border-border rounded-[6px]">
                <div className="flex flex-col text-foreground gap-0.5 min-w-0 flex-1">
                  <p className="text-xs font-bold leading-[133%]">From</p>
                  <div className="flex flex-row items-center gap-1 min-w-0">
                    <WalletIcon className="w-3 h-3 flex-shrink-0" stroke="currentColor" />
                    <p className="text-base font-normal leading-[150%]">{displayWalletAddress}</p>
                  </div>
                </div>
                <div className="w-[1px] rounded-full bg-border h-full flex-shrink-0 min-h-[70px]" />
                <div className="flex flex-col text-foreground gap-0.5 min-w-0 flex-1">
                  <p className="text-xs font-bold leading-[133%]">To</p>
                  <div className="flex flex-row items-center gap-1 min-w-0">
                    <WalletIcon className="w-3 h-3 flex-shrink-0" stroke="currentColor" />
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
                              setIsAddressCopied((prev) => ({
                                ...prev,
                                'single-to': true,
                              }));
                              setTimeout(
                                () =>
                                  setIsAddressCopied((prev) => ({
                                    ...prev,
                                    'single-to': false,
                                  })),
                                3000
                              );
                            }
                          }}
                          className="cursor-pointer flex-shrink-0"
                        />
                      ))}
                  </div>
                </div>
              </div>

              {/* Value */}
              {formatTransactionValue(currentTransaction?.value) && (
                <div className="flex flex-row justify-between items-center gap-2.5 p-3.5 border border-border rounded-[6px]">
                  <div className="flex flex-col text-foreground gap-0.5">
                    <p className="text-xs font-bold leading-[133%]">Value</p>
                    <p className="text-base font-normal leading-[150%]">
                      {formatTransactionValue(currentTransaction?.value)} {nativeSymbol}
                    </p>
                  </div>
                </div>
              )}

              {/* Network - Fees */}
              <div className="flex flex-row justify-between items-center gap-2.5 p-3.5 border border-border rounded-[6px]">
                <div className="flex flex-col text-foreground flex-1 gap-0.5">
                  <p className="text-xs font-bold leading-[133%]">Network</p>
                  <div className="flex flex-row items-center gap-1">
                    {chainIcon}
                    <p className="text-base font-normal text-ellipsis leading-[150%] truncate">
                      {networkName || 'Ethereum'}
                    </p>
                  </div>
                </div>
                <div className="w-[1px] rounded-full bg-border h-full min-h-[50px]" />
                <div className="flex flex-col text-foreground flex-1 gap-0.5">
                  <div className="flex items-center gap-1">
                    <p className="text-xs font-bold leading-[133%]">Network Fees</p>
                    <TooltipProvider delayDuration={0}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="size-3 text-muted-foreground cursor-help" />
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
                  <div className="flex flex-row items-center w-full justify-between gap-1">
                    {gasFeeLoading && !isPayingWithErc20 ? (
                      <p className="text-base font-normal text-muted-foreground">Estimating...</p>
                    ) : gasEstimationError && !sponsored ? (
                      <div className="flex flex-col">
                        <p className="text-sm text-destructive font-medium">{gasEstimationError}</p>
                      </div>
                    ) : sponsored ? (
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          {gasFee && gasFee !== 'sponsored' && nativeTokenPrice > 0 && (
                            <div className="flex flex-col line-through text-muted-foreground">
                              <p className="text-base font-normal">${(nativeTokenPrice * Number(gasFee)).toFixed(4)}</p>
                            </div>
                          )}
                          <span className="text-xs font-semibold text-success bg-success/10 px-2 py-0.5 rounded">
                            Sponsored
                          </span>
                        </div>
                        <p className="text-xs font-normal text-muted-foreground">
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
                      <div className="flex flex-col gap-0.5 w-full">
                        <div className="flex items-center justify-between w-full">
                          <p className="text-base font-normal text-foreground">
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
                          <p className="text-xs font-normal text-muted-foreground">
                            Up to {selectedFeeToken.gasCostFormatted} {selectedFeeToken.symbol}
                          </p>
                        )}
                      </div>
                    ) : gasFee && gasFee !== 'sponsored' ? (
                      <div className="flex flex-col gap-0.5 w-full">
                        <div className="flex items-center justify-between w-full">
                          <p className="text-base font-normal text-foreground">
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
                        <p className="text-xs font-normal text-muted-foreground">
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
                      <CopyIcon
                        width={16}
                        height={16}
                        onClick={() => {
                          if (typeof window !== 'undefined' && navigator?.clipboard) {
                            navigator.clipboard.writeText(currentTransaction?.data ?? '');
                            setIsDataCopied({ ...isDataCopied, 0: true });
                            setTimeout(
                              () =>
                                setIsDataCopied((prev) => ({
                                  ...prev,
                                  0: false,
                                })),
                              3000
                            );
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
                  className={`text-sm p-3 rounded-lg ${
                    transactionStatus.includes('Error')
                      ? 'bg-destructive/10 text-destructive'
                      : transactionStatus.includes('successfully')
                        ? 'bg-success/10 text-success'
                        : 'bg-info/10 text-info'
                  }`}
                >
                  {transactionStatus}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 p-3.5 max-md:mt-auto flex-shrink-0">
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
            <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto max-h-[60vh]">
              {/* From Address */}
              <div className="p-3.5 border border-border rounded-[6px] flex-shrink-0">
                <p className="text-xs font-bold leading-[133%] text-foreground mb-1">From</p>
                <div className="flex flex-row items-center gap-1">
                  <WalletIcon className="w-3 h-3 flex-shrink-0" stroke="currentColor" />
                  <p className="text-base font-normal leading-[150%]">{displayWalletAddress}</p>
                </div>
              </div>

              {/* Accordion for Transactions */}
              <div className="flex-1 overflow-y-auto min-h-0">
                <Accordion
                  type="multiple"
                  className="w-full space-y-3"
                  defaultValue={transactions.map((_, index) => `transaction-${index}`)}
                >
                  {transactions.map((transaction, index) => (
                    <AccordionItem
                      key={index}
                      value={`transaction-${index}`}
                      className="border border-border rounded-[6px] overflow-hidden"
                    >
                      <AccordionTrigger className="px-3.5 py-2.5 hover:no-underline">
                        <span className="text-base font-medium">Call {index + 1}</span>
                      </AccordionTrigger>
                      <AccordionContent className="px-3.5 pb-3.5">
                        <div className="flex flex-col gap-3">
                          {/* Interacting with (To) */}
                          <div className="flex flex-col gap-1 border border-border rounded-[6px] p-2">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold leading-[133%] text-foreground">Interacting with (to)</p>
                              {isAddressCopied[`to-${index}`] ? (
                                <CopiedIcon width={14} height={14} />
                              ) : (
                                <CopyIcon
                                  width={14}
                                  height={14}
                                  onClick={() => {
                                    if (typeof window !== 'undefined' && navigator?.clipboard) {
                                      navigator.clipboard.writeText(transaction.to);
                                      setIsAddressCopied((prev) => ({
                                        ...prev,
                                        [`to-${index}`]: true,
                                      }));
                                      setTimeout(
                                        () =>
                                          setIsAddressCopied((prev) => ({
                                            ...prev,
                                            [`to-${index}`]: false,
                                          })),
                                        3000
                                      );
                                    }
                                  }}
                                  className="cursor-pointer"
                                />
                              )}
                            </div>
                            <div className="flex flex-row items-center gap-1">
                              <WalletIcon className="w-3 h-3 flex-shrink-0" stroke="currentColor" />
                              <p className="text-sm font-normal leading-[150%]">
                                {getDisplayAddress(resolvedAddresses[transaction.to], transaction.to)}
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
                                  <p className="text-base font-normal">
                                    {formatTransactionValue(transaction.value)} {nativeSymbol}
                                  </p>
                                  {nativeTokenPrice > 0 && (
                                    <p className="text-sm text-muted-foreground">
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
                                        setIsDataCopied({
                                          ...isDataCopied,
                                          [index]: true,
                                        });
                                        setTimeout(
                                          () =>
                                            setIsDataCopied((prev) => ({
                                              ...prev,
                                              [index]: false,
                                            })),
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
                  className={`text-sm p-3 rounded-lg ${
                    transactionStatus.includes('Error')
                      ? 'bg-destructive/10 text-destructive'
                      : transactionStatus.includes('successfully')
                        ? 'bg-success/10 text-success'
                        : 'bg-info/10 text-info'
                  }`}
                >
                  {transactionStatus}
                </div>
              )}
            </div>

            {/* Fixed Bottom Section */}
            <div className="border-t pt-3 space-y-3 flex-shrink-0">
              {/* Network and Fees */}
              <div className="flex flex-row justify-between items-center gap-2.5 p-3.5 border border-border rounded-[6px]">
                <div className="flex flex-col text-foreground flex-1 gap-0.5">
                  <p className="text-xs font-bold leading-[133%]">Network</p>
                  <div className="flex flex-row items-center gap-1">
                    {chainIcon}
                    <p className="text-base font-normal text-ellipsis leading-[150%] truncate">
                      {networkName || 'Ethereum'}
                    </p>
                  </div>
                </div>
                <div className="w-[1px] rounded-full bg-border h-full min-h-[50px]" />
                <div className="flex flex-col text-foreground flex-1 gap-0.5">
                  <div className="flex items-center gap-1">
                    <p className="text-xs font-bold leading-[133%]">Network Fees</p>
                    <TooltipProvider delayDuration={0}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="size-3 text-muted-foreground cursor-help" />
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
                  <div className="flex flex-row items-center w-full justify-between gap-1">
                    {gasFeeLoading && !isPayingWithErc20 ? (
                      <p className="text-base font-normal text-muted-foreground">Estimating...</p>
                    ) : gasEstimationError && !sponsored ? (
                      <div className="flex flex-col">
                        <p className="text-sm text-destructive font-medium">{gasEstimationError}</p>
                      </div>
                    ) : sponsored ? (
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          {gasFee && gasFee !== 'sponsored' && nativeTokenPrice > 0 && (
                            <div className="flex flex-col line-through text-muted-foreground">
                              <p className="text-base font-normal">${(nativeTokenPrice * Number(gasFee)).toFixed(4)}</p>
                            </div>
                          )}
                          <span className="text-xs font-semibold text-success bg-success/10 px-2 py-0.5 rounded">
                            Sponsored
                          </span>
                        </div>
                        <p className="text-xs font-normal text-muted-foreground">
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
                      <div className="flex flex-col gap-0.5 w-full">
                        <div className="flex items-center justify-between w-full">
                          <p className="text-base font-normal text-foreground">
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
                          <p className="text-xs font-normal text-muted-foreground">
                            Up to {selectedFeeToken.gasCostFormatted} {selectedFeeToken.symbol}
                          </p>
                        )}
                      </div>
                    ) : gasFee && gasFee !== 'sponsored' ? (
                      <div className="flex flex-col gap-0.5 w-full">
                        <div className="flex items-center justify-between w-full">
                          <p className="text-base font-normal text-foreground">
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
                        <p className="text-xs font-normal text-muted-foreground">
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
                      <p className="text-base font-normal text-muted-foreground">Unable to estimate</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 px-3.5 flex-shrink-0">
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
