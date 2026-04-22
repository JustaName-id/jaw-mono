'use client';

import { ANY_TARGET, ANY_FN_SEL } from '@jaw.id/core';
import { isNativeToken } from '../../utils/tokenBalance';
import { Button } from '../ui/button';
import { DefaultDialog } from '../DefaultDialog';
import { FeeTokenSelector } from '../FeeTokenSelector';
import { PermissionDialogProps } from './types';
import { useIsMobile, useChainIconURI, useFeeTokenPrice } from '../../hooks';
import { CopiedIcon, CopyIcon, WalletIcon } from '../../icons';
import { useState, useEffect, useRef } from 'react';
import { getJustaNameInstance } from '../../utils/justaNameInstance';
import { getChainLabel } from '../../utils/resolveChainLabel';

export const PermissionDialog = ({
  open,
  onOpenChange,
  mode,
  permissionId,
  spenderAddress,
  origin,
  spends = [],
  calls = [],
  expiryDate,
  networkName,
  chainId,
  chainIcon,
  apiKey,
  onConfirm,
  onCancel,
  isProcessing,
  status,
  isLoadingTokenInfo = false,
  timestamp = new Date(),
  warningMessage,
  gasFee,
  maxFee,
  gasPriceWei,
  gasUnits,
  gasFeeLoading = false,
  gasEstimationError,
  sponsored = false,
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
}: PermissionDialogProps) => {
  // Ref for scrollable container
  const scrollableRef = useRef<HTMLDivElement>(null);

  const isMobile = useIsMobile();

  // Get native token symbol from feeTokens, falling back to chain's native currency
  const nativeToken = feeTokens?.find((t) => t.isNative);
  const nativeSymbol = nativeToken?.symbol || nativeCurrencySymbol || 'ETH';

  // Fetch native token price dynamically based on the chain's native token symbol
  const nativeTokenPrice = useFeeTokenPrice(nativeSymbol);

  const [isPermissionIdCopied, setIsPermissionIdCopied] = useState(false);
  const [resolvedAddresses, setResolvedAddresses] = useState<Record<string, string>>({});
  const [isResolvingAddresses, setIsResolvingAddresses] = useState(true); // Start true to prevent early clicks

  // Resolve addresses to human-readable names
  useEffect(() => {
    if (!chainId) {
      setIsResolvingAddresses(false);
      return;
    }

    const justaName = getJustaNameInstance(mainnetRpcUrl);
    const addressesToResolve: string[] = [];

    if (spenderAddress) {
      addressesToResolve.push(spenderAddress);
    }

    calls.forEach((call) => {
      if (
        call.target &&
        !addressesToResolve.includes(call.target) &&
        call.target.toLowerCase() !== ANY_TARGET.toLowerCase()
      ) {
        addressesToResolve.push(call.target);
      }
    });

    if (addressesToResolve.length === 0) {
      setIsResolvingAddresses(false);
      return;
    }

    setIsResolvingAddresses(true);

    const resolvePromises = addressesToResolve.map(async (address) => {
      try {
        const result = await justaName.subnames.reverseResolve({
          address: address as `0x${string}`,
          chainId: chainId,
        });
        if (result) {
          const label = await getChainLabel(chainId, mainnetRpcUrl);
          return { address, name: label ? `${result}@${label}` : result };
        }
      } catch {
        // Silently fail if resolution fails
      }
      return null;
    });

    Promise.all(resolvePromises).then((results) => {
      const newResolved: Record<string, string> = {};
      results.forEach((result) => {
        if (result) {
          newResolved[result.address] = result.name;
        }
      });
      setResolvedAddresses((prev) => ({ ...prev, ...newResolved }));
      setIsResolvingAddresses(false);
    });
  }, [spenderAddress, calls, chainId]);

  // Handle wheel events for smooth scrolling over content
  useEffect(() => {
    const scrollable = scrollableRef.current;
    if (!scrollable) return;

    const handleWheel = (e: WheelEvent) => {
      // Prevent default to handle scroll manually
      e.preventDefault();
      // Smooth scroll
      scrollable.scrollTop += e.deltaY;
    };

    // Add event listener with passive: false to allow preventDefault
    scrollable.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      scrollable.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Get chain icon using the hook - fetch from capabilities chainMetadata
  const defaultChainIcon = useChainIconURI(chainId || 1, apiKey, 24);
  const displayChainIcon = chainIcon || defaultChainIcon;

  // Map known sentinel addresses to friendly labels
  const getContractDisplayName = (target: string): string | null => {
    if (target.toLowerCase() === ANY_TARGET.toLowerCase()) {
      return 'Any Contract';
    }
    return null;
  };

  const getFunctionDisplayName = (signature: string, selector?: string): string => {
    if (selector?.toLowerCase() === ANY_FN_SEL.toLowerCase()) {
      return 'Any Function';
    }
    return signature;
  };

  // Truncate address for display (e.g., 0x43e...ead3)
  const truncateAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 5)}...${address.slice(-4)}`;
  };

  // Copy to clipboard helper
  const copyToClipboard = (text: string, setCopied: (value: boolean) => void) => {
    if (typeof window !== 'undefined' && navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const hasGasPaymentOption = !gasEstimationError || sponsored;
  const canConfirm =
    !isProcessing && !isLoadingTokenInfo && !isResolvingAddresses && !gasFeeLoading && hasGasPaymentOption;

  // Count total permissions
  const totalSpends = spends.length;
  const totalCalls = calls.length;
  const totalPermissions = totalSpends + totalCalls;

  return (
    <DefaultDialog
      open={open}
      onOpenChange={isProcessing ? undefined : onOpenChange}
      header={
        <div className="flex flex-col gap-2.5 p-3.5">
          <p className="text-muted-foreground text-xs font-bold leading-[100%]">
            {timestamp.toLocaleDateString('en-US', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}{' '}
            at{' '}
            {timestamp.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              timeZoneName: 'short',
            })}
          </p>
          <p className="text-foreground text-[30px] font-normal leading-[100%]">
            {mode === 'grant' ? 'Permission Request' : 'Revoke Permission'}
          </p>
        </div>
      }
      contentStyle={
        isMobile
          ? {
              width: '100%',
              height: '100%',
              maxWidth: 'none',
              maxHeight: 'none',
            }
          : {
              width: '500px',
              minWidth: '500px',
              maxHeight: '90vh',
            }
      }
    >
      <div className="flex h-full flex-col justify-between gap-6 overflow-hidden max-md:h-full">
        {/* Scrollable Content Area */}
        <div
          ref={scrollableRef}
          className="flex max-h-[60vh] min-h-0 flex-1 flex-col gap-3 overflow-y-auto max-md:pb-2"
        >
          {/* Permission ID Card - Only for revoke mode */}
          {mode === 'revoke' && permissionId && (
            <div className="border-border flex flex-col gap-2.5 rounded-[6px] border p-3.5">
              <div className="flex flex-row items-center justify-between">
                <p className="text-foreground text-xs font-bold leading-[133%]">Permission ID</p>
                {isPermissionIdCopied ? (
                  <CopiedIcon width={16} height={16} />
                ) : (
                  <CopyIcon
                    width={16}
                    height={16}
                    onClick={() => copyToClipboard(permissionId, setIsPermissionIdCopied)}
                    className="cursor-pointer"
                  />
                )}
              </div>
              <p className="text-foreground break-all text-base font-normal leading-[150%]">{permissionId}</p>
            </div>
          )}

          {/* Requesting dApp + Spender Address */}
          <div className="border-border flex flex-col gap-3 rounded-[6px] border p-3.5">
            <div className="text-foreground flex min-w-0 flex-col gap-0.5">
              <p className="text-xs font-bold leading-[133%]">Requesting dApp</p>
              <p className="break-all text-base font-normal leading-[150%]">{origin}</p>
            </div>
            <div className="bg-border h-[1px] w-full flex-shrink-0 rounded-full" />
            <div className="text-foreground flex min-w-0 flex-col gap-0.5">
              <p className="text-xs font-bold leading-[133%]">Spender Address</p>
              <div className="flex flex-row items-center gap-1">
                <WalletIcon className="h-3 w-3 flex-shrink-0" stroke="currentColor" />
                <p className="break-all text-base font-normal leading-[150%]">
                  {resolvedAddresses[spenderAddress] || truncateAddress(spenderAddress)}
                </p>
              </div>
            </div>
          </div>

          {/* Permissions Summary */}
          <div className="border-border flex flex-row items-center justify-between gap-2.5 rounded-[6px] border p-3.5">
            <div className="text-foreground flex flex-1 flex-col gap-0.5">
              <p className="text-xs font-bold leading-[133%]">Network</p>
              <div className="flex flex-row items-center gap-1">
                {displayChainIcon}
                <p className="text-base font-normal leading-[150%]">{networkName}</p>
              </div>
            </div>
            <div className="bg-border h-full min-h-[50px] w-[1px] flex-shrink-0 rounded-full" />
            <div className="text-foreground flex flex-1 flex-col gap-0.5">
              <p className="text-xs font-bold leading-[133%]">Expiry Date</p>
              <p className="text-base font-normal leading-[150%]">{expiryDate}</p>
            </div>
          </div>

          {/* Spend Permissions Section */}
          {totalSpends > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-foreground px-1 text-sm font-bold">Spend Permissions ({totalSpends})</p>
              <div className="flex flex-col gap-2">
                {spends.map((spend, index) => (
                  <div
                    key={index}
                    className="border-border bg-background flex flex-col gap-3 rounded-[6px] border p-3.5"
                  >
                    {/* Amount */}
                    <div className="flex flex-col gap-0.5">
                      <p className="text-muted-foreground text-xs font-bold leading-[133%]">Amount</p>
                      {isLoadingTokenInfo ? (
                        <div className="bg-muted h-[30px] w-32 animate-pulse rounded" />
                      ) : (
                        <div className="flex items-center gap-2">
                          <p className="text-foreground text-xl font-normal leading-[150%]">{spend.amount}</p>
                          {spend.amountUsd && (
                            <p className="text-muted-foreground text-sm font-bold">${spend.amountUsd}</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Duration and Token */}
                    <div className="flex flex-row items-center justify-between gap-2.5">
                      <div className="flex flex-1 flex-col gap-0.5">
                        <p className="text-muted-foreground text-xs font-bold leading-[133%]">Duration</p>
                        <p className="text-foreground text-base font-normal leading-[150%]">{spend.duration}</p>
                      </div>
                      <div className="bg-border h-full min-h-[40px] w-[1px] flex-shrink-0 rounded-full" />
                      <div className="flex flex-1 flex-col gap-0.5">
                        <p className="text-muted-foreground text-xs font-bold leading-[133%]">Token</p>
                        <p className="text-foreground text-base font-normal leading-[150%]">
                          {isNativeToken(spend.tokenAddress) ? `Native (${nativeSymbol})` : spend.token}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Call Permissions Section */}
          {totalCalls > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-foreground px-1 text-sm font-bold">Call Permissions ({totalCalls})</p>
              <div className="flex flex-col gap-2">
                {calls.map((call, index) => (
                  <div
                    key={index}
                    className="border-border bg-background flex flex-col gap-2.5 rounded-[6px] border p-3.5"
                  >
                    <div className="flex flex-col gap-0.5">
                      <p className="text-muted-foreground text-xs font-bold leading-[133%]">Function</p>
                      <code className="text-foreground break-all font-mono text-sm leading-[150%]">
                        {getFunctionDisplayName(call.functionSignature, call.selector)}
                      </code>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <p className="text-muted-foreground text-xs font-bold leading-[133%]">Contract</p>
                      <p className="text-foreground break-all font-mono text-sm leading-[150%]">
                        {getContractDisplayName(call.target) || resolvedAddresses[call.target] || call.target}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warning (Grant) / Info (Revoke) Card */}
          {mode === 'grant' ? (
            <div className="border-border bg-warning/10 flex items-start gap-2.5 rounded-[6px] border p-3.5">
              <div className="text-warning mt-0.5 flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M8 1.5L1 14.5H15L8 1.5Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path d="M8 6V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="8" cy="11.5" r="0.5" fill="currentColor" />
                </svg>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-warning-foreground text-xs font-bold leading-[133%]">Warning</p>
                <p className="text-warning-foreground text-xs font-normal leading-[150%]">
                  {warningMessage ||
                    `You are granting ${totalPermissions} permission${totalPermissions > 1 ? 's' : ''} to this dApp until ${expiryDate}. Only approve if you trust this dApp.`}
                </p>
              </div>
            </div>
          ) : (
            <div className="border-border bg-info/10 flex items-start gap-2.5 rounded-[6px] border p-3.5">
              <div className="text-info mt-0.5 flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M8 7V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="8" cy="5" r="0.5" fill="currentColor" />
                </svg>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-info-foreground text-xs font-bold leading-[133%]">Info</p>
                <p className="text-info-foreground text-xs font-normal leading-[150%]">
                  This will revoke all permissions and prevent the spender from making any further transactions on your
                  behalf.
                </p>
              </div>
            </div>
          )}

          {/* Status Message */}
          {status && (
            <div
              className={`rounded-lg p-3 text-sm ${
                status.includes('Error')
                  ? 'bg-destructive/10 text-destructive'
                  : status.includes('successfully')
                    ? 'bg-success/10 text-success'
                    : 'bg-info/10 text-info'
              }`}
            >
              {status}
            </div>
          )}
        </div>

        {/* Fixed Bottom Section - Gas Estimation + Action Buttons */}
        <div className="flex-shrink-0 space-y-3">
          {/* Gas Estimation Section - Shown for both grant and revoke modes */}
          <div className="border-border flex flex-row items-center justify-between gap-2.5 rounded-[6px] border p-3.5">
            <div className="text-foreground flex flex-1 flex-col gap-0.5">
              <p className="text-xs font-bold leading-[133%]">Network</p>
              <div className="flex flex-row items-center gap-1">
                {displayChainIcon}
                <p className="truncate text-ellipsis text-base font-normal leading-[150%]">{networkName}</p>
              </div>
            </div>
            <div className="bg-border h-full min-h-[50px] w-[1px] rounded-full" />
            <div className="text-foreground flex flex-1 flex-col gap-0.5">
              <p className="text-xs font-bold leading-[133%]">Network Fees</p>
              <div className="flex w-full flex-row items-center justify-between gap-1">
                {gasFeeLoading && !isPayingWithErc20 ? (
                  <p className="text-muted-foreground text-base font-normal">Estimating...</p>
                ) : gasEstimationError && !sponsored ? (
                  <div className="flex w-full flex-col gap-0.5">
                    <div className="flex w-full items-center justify-between">
                      <div className="flex flex-col">
                        <p className="text-destructive text-sm font-medium">Gas Estimation Failed</p>
                        <p className="text-destructive text-xs">{gasEstimationError}</p>
                      </div>
                      {showFeeTokenSelector && feeTokens && onFeeTokenSelect && (
                        <FeeTokenSelector
                          tokens={feeTokens}
                          selectedToken={selectedFeeToken ?? null}
                          onSelect={onFeeTokenSelect}
                          isLoading={feeTokensLoading ?? false}
                          disabled={isProcessing}
                          nativeTokenPrice={nativeTokenPrice}
                          estimatedGasEth={gasFee || '0'}
                        />
                      )}
                    </div>
                  </div>
                ) : sponsored || gasFee === 'sponsored' ? (
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      {sponsored && gasFee && gasFee !== 'sponsored' && nativeTokenPrice > 0 && (
                        <div className="text-muted-foreground flex flex-col line-through">
                          <p className="text-base font-normal">${(nativeTokenPrice * Number(gasFee)).toFixed(4)}</p>
                        </div>
                      )}
                      <span className="text-success bg-success/10 rounded px-2 py-0.5 text-xs font-semibold">
                        Sponsored
                      </span>
                    </div>
                    <p className="text-muted-foreground text-xs font-normal">
                      {sponsored && gasFee && gasFee !== 'sponsored'
                        ? (() => {
                            const gasValue = Number(gasFee);
                            if (gasValue > 0 && gasValue < 0.0001) {
                              return '> 0.0001 ETH';
                            }
                            return gasValue.toFixed(4) + ' ETH';
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
                      {nativeTokenPrice > 0 && (
                        <p className="text-foreground text-base font-normal">
                          ${(nativeTokenPrice * Number(gasFee)).toFixed(4)}
                        </p>
                      )}
                      {showFeeTokenSelector && feeTokens && onFeeTokenSelect && selectedFeeToken && (
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
                    <p className="text-muted-foreground text-xs font-normal">
                      {(() => {
                        const gasValue = Number(gasFee);
                        if (gasValue > 0 && gasValue < 0.0001) {
                          return '< 0.0001 ETH';
                        }
                        return gasValue.toFixed(6) + ' ETH';
                      })()}
                    </p>
                    {maxFee && maxFee !== 'sponsored' && Number(maxFee) > Number(gasFee) && (
                      <p className="text-muted-foreground text-xs font-normal">
                        Up to{' '}
                        {nativeTokenPrice > 0
                          ? `$${(nativeTokenPrice * Number(maxFee)).toFixed(4)}`
                          : `${Number(maxFee).toFixed(6)} ETH`}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-base font-normal">-</p>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 p-3.5 max-md:mt-auto">
            <Button variant="outline" onClick={onCancel} disabled={isProcessing} className="flex-1">
              Cancel
            </Button>
            <Button
              variant={mode === 'revoke' ? 'destructive' : 'default'}
              onClick={onConfirm}
              disabled={!canConfirm}
              className="flex-1"
            >
              {isProcessing
                ? 'Processing...'
                : isLoadingTokenInfo || isResolvingAddresses || gasFeeLoading
                  ? 'Loading...'
                  : mode === 'grant'
                    ? 'Accept'
                    : 'Revoke'}
            </Button>
          </div>
        </div>
      </div>
    </DefaultDialog>
  );
};

export * from './types';
