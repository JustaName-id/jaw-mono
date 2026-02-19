'use client'

import { ANY_TARGET, ANY_FN_SEL } from "@jaw.id/core";
import { isNativeToken } from "../../utils/tokenBalance";
import { Button } from "../ui/button";
import { DefaultDialog } from "../DefaultDialog";
import { FeeTokenSelector } from "../FeeTokenSelector";
import { PermissionDialogProps } from "./types";
import { useIsMobile, useChainIconURI, useFeeTokenPrice } from "../../hooks";
import {CopiedIcon, CopyIcon, WalletIcon} from "../../icons";
import { useState, useEffect, useRef } from "react";
import { getJustaNameInstance } from "../../utils/justaNameInstance";

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
}: PermissionDialogProps) => {
  // Ref for scrollable container
  const scrollableRef = useRef<HTMLDivElement>(null);

  const isMobile = useIsMobile();

  // Get native token symbol from feeTokens (defaults to ETH if not found)
  const nativeToken = feeTokens?.find(t => t.isNative);
  const nativeSymbol = nativeToken?.symbol || 'ETH';

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
      if (call.target && !addressesToResolve.includes(call.target)
          && call.target.toLowerCase() !== ANY_TARGET.toLowerCase()) {
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
          return { address, name: result };
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
      setResolvedAddresses(prev => ({ ...prev, ...newResolved }));
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

  const getFunctionDisplayName = (signature: string, selector: string): string => {
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
  const canConfirm = !isProcessing && !isLoadingTokenInfo && !isResolvingAddresses && !gasFeeLoading && hasGasPaymentOption;

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
          <p className="text-xs font-bold text-muted-foreground leading-[100%]">
            {timestamp.toLocaleDateString('en-US', {
              weekday: 'long',
              day: 'numeric',
              month: 'long'
            })} at {timestamp.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              timeZoneName: 'short'
            })}
          </p>
          <p className="text-[30px] font-normal leading-[100%] text-foreground">
            {mode === 'grant' ? 'Permission Request' : 'Revoke Permission'}
          </p>
        </div>
      }
      contentStyle={isMobile ? {
        width: '100%',
        height: '100%',
        maxWidth: 'none',
        maxHeight: 'none',
      } : {
        width: '500px',
        minWidth: '500px',
        maxHeight: '90vh',
      }}
    >
      <div className="flex flex-col gap-6 justify-between max-md:h-full h-full overflow-hidden">
        {/* Scrollable Content Area */}
        <div ref={scrollableRef} className="flex flex-col gap-3 flex-1 overflow-y-auto min-h-0 max-h-[60vh] max-md:pb-2">
          {/* Permission ID Card - Only for revoke mode */}
          {mode === 'revoke' && permissionId && (
            <div className="flex flex-col gap-2.5 p-3.5 border border-border rounded-[6px]">
              <div className="flex flex-row items-center justify-between">
                <p className="text-xs font-bold leading-[133%] text-foreground">Permission ID</p>
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
              <p className="text-base font-normal leading-[150%] text-foreground break-all">
                {permissionId}
              </p>
            </div>
          )}

          {/* Requesting dApp + Spender Address */}
          <div className="flex flex-row justify-between items-center gap-2.5 p-3.5 border border-border rounded-[6px]">
            <div className="flex flex-col text-foreground gap-0.5 min-w-0 flex-1">
              <p className="text-xs font-bold leading-[133%]">Requesting dApp</p>
              <p className="text-base font-normal leading-[150%] truncate overflow-hidden">
                {origin}
              </p>
            </div>
            <div className="w-[1px] rounded-full bg-border h-full flex-shrink-0 min-h-[50px]" />
            <div className="flex flex-col text-foreground gap-0.5 min-w-0 flex-1">
              <p className="text-xs font-bold leading-[133%]">Spender Address</p>
              <div className="flex flex-row items-center gap-1">
                  <WalletIcon className="w-3 h-3 flex-shrink-0" stroke="black" />
                  <p className="text-base font-normal leading-[150%] truncate overflow-hidden">
                  {resolvedAddresses[spenderAddress] || truncateAddress(spenderAddress)}
                </p>
              </div>
            </div>
          </div>

          {/* Permissions Summary */}
          <div className="flex flex-row justify-between items-center gap-2.5 p-3.5 border border-border rounded-[6px]">
            <div className="flex flex-col text-foreground gap-0.5 flex-1">
              <p className="text-xs font-bold leading-[133%]">Network</p>
              <div className="flex flex-row items-center gap-1">
                {displayChainIcon}
                <p className="text-base font-normal leading-[150%]">{networkName}</p>
              </div>
            </div>
            <div className="w-[1px] rounded-full bg-border h-full flex-shrink-0 min-h-[50px]" />
            <div className="flex flex-col text-foreground gap-0.5 flex-1">
              <p className="text-xs font-bold leading-[133%]">Expiry Date</p>
              <p className="text-base font-normal leading-[150%]">{expiryDate}</p>
            </div>
          </div>

          {/* Spend Permissions Section */}
          {totalSpends > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-bold text-foreground px-1">
                Spend Permissions ({totalSpends})
              </p>
              <div className="flex flex-col gap-2">
                {spends.map((spend, index) => (
                  <div
                    key={index}
                    className="flex flex-col gap-3 p-3.5 border border-border rounded-[6px] bg-background"
                  >
                    {/* Amount */}
                    <div className="flex flex-col gap-0.5">
                      <p className="text-xs font-bold leading-[133%] text-muted-foreground">Amount</p>
                      {isLoadingTokenInfo ? (
                        <div className="h-[30px] w-32 bg-muted animate-pulse rounded" />
                      ) : (
                        <div className="flex items-center gap-2">
                          <p className="text-xl font-normal leading-[150%] text-foreground">
                            {spend.amount}
                          </p>
                          {spend.amountUsd && (
                            <p className="text-sm font-bold text-muted-foreground">${spend.amountUsd}</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Duration and Token */}
                    <div className="flex flex-row justify-between items-center gap-2.5">
                      <div className="flex flex-col gap-0.5 flex-1">
                        <p className="text-xs font-bold leading-[133%] text-muted-foreground">Duration</p>
                        <p className="text-base font-normal leading-[150%] text-foreground">{spend.duration}</p>
                      </div>
                      <div className="w-[1px] rounded-full bg-border h-full flex-shrink-0 min-h-[40px]" />
                      <div className="flex flex-col gap-0.5 flex-1">
                        <p className="text-xs font-bold leading-[133%] text-muted-foreground">Token</p>
                        <p className="text-base font-normal leading-[150%] text-foreground">{isNativeToken(spend.tokenAddress) ? `Native (${nativeSymbol})` : spend.token}</p>
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
              <p className="text-sm font-bold text-foreground px-1">
                Call Permissions ({totalCalls})
              </p>
              <div className="flex flex-col gap-2">
                {calls.map((call, index) => (
                  <div
                    key={index}
                    className="flex flex-col gap-2.5 p-3.5 border border-border rounded-[6px] bg-background"
                  >
                    <div className="flex flex-col gap-0.5">
                      <p className="text-xs font-bold leading-[133%] text-muted-foreground">Function</p>
                      <code className="text-sm font-mono leading-[150%] text-foreground break-all">
                        {getFunctionDisplayName(call.functionSignature, call.selector)}
                      </code>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <p className="text-xs font-bold leading-[133%] text-muted-foreground">Contract</p>
                      <p className="text-sm font-mono leading-[150%] text-foreground break-all">
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
            <div className="flex items-start gap-2.5 p-3.5 border border-border rounded-[6px] bg-yellow-50">
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="flex-shrink-0 mt-0.5"
              >
                <path
                  d="M8 1.5L1 14.5H15L8 1.5Z"
                  stroke="#F59E0B"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M8 6V9"
                  stroke="#F59E0B"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <circle
                  cx="8"
                  cy="11.5"
                  r="0.5"
                  fill="#F59E0B"
                />
              </svg>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-bold leading-[133%] text-yellow-800">Warning</p>
                <p className="text-xs font-normal leading-[150%] text-yellow-900">
                  {warningMessage || `You are granting ${totalPermissions} permission${totalPermissions > 1 ? 's' : ''} to this dApp until ${expiryDate}. Only approve if you trust this dApp.`}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 p-3.5 border border-border rounded-[6px] bg-blue-50">
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="flex-shrink-0 mt-0.5"
              >
                <circle
                  cx="8"
                  cy="8"
                  r="6.5"
                  stroke="#3B82F6"
                  strokeWidth="1.5"
                />
                <path
                  d="M8 7V11"
                  stroke="#3B82F6"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <circle
                  cx="8"
                  cy="5"
                  r="0.5"
                  fill="#3B82F6"
                />
              </svg>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-bold leading-[133%] text-blue-800">Info</p>
                <p className="text-xs font-normal leading-[150%] text-blue-900">
                  This will revoke all permissions and prevent the spender from making any further transactions on your behalf.
                </p>
              </div>
            </div>
          )}

          {/* Status Message */}
          {status && (
            <div className={`text-sm p-3 rounded-lg ${
              status.includes('Error') ? 'bg-red-50 text-red-600' :
              status.includes('successfully') ? 'bg-green-50 text-green-600' :
              'bg-blue-50 text-blue-600'
            }`}>
              {status}
            </div>
          )}
        </div>

        {/* Fixed Bottom Section - Gas Estimation + Action Buttons */}
        <div className="flex-shrink-0 space-y-3">
          {/* Gas Estimation Section - Shown for both grant and revoke modes */}
          <div className="flex flex-row justify-between items-center gap-2.5 p-3.5 border border-border rounded-[6px]">
              <div className="flex flex-col text-foreground flex-1 gap-0.5">
                <p className="text-xs font-bold leading-[133%]">Network</p>
                <div className="flex flex-row items-center gap-1">
                  {displayChainIcon}
                  <p className="text-base font-normal text-ellipsis leading-[150%] truncate">{networkName}</p>
                </div>
              </div>
              <div className="w-[1px] rounded-full bg-border h-full min-h-[50px]" />
              <div className="flex flex-col text-foreground flex-1 gap-0.5">
                <p className="text-xs font-bold leading-[133%]">Network Fees</p>
                <div className="flex flex-row items-center w-full justify-between gap-1">
                  {gasFeeLoading && !isPayingWithErc20 ? (
                    <p className="text-base font-normal text-muted-foreground">Estimating...</p>
                  ) : gasEstimationError && !sponsored ? (
                    <div className="flex flex-col gap-0.5 w-full">
                      <div className="flex items-center justify-between w-full">
                        <div className="flex flex-col">
                          <p className="text-sm text-red-600 font-medium">Gas Estimation Failed</p>
                          <p className="text-xs text-red-500">{gasEstimationError}</p>
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
                          <div className="flex flex-col line-through text-muted-foreground">
                            <p className="text-base font-normal">
                              ${(nativeTokenPrice * Number(gasFee)).toFixed(4)}
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
                        {nativeTokenPrice > 0 && (
                          <p className="text-base font-normal text-foreground">
                            ${(nativeTokenPrice * Number(gasFee)).toFixed(4)}
                          </p>
                        )}
                        {/* Inline Fee Token Selector (when paying with ETH but selector is available) */}
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
                    <p className="text-base font-normal text-muted-foreground">-</p>
                  )}
                </div>
              </div>
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
              variant={mode === 'revoke' ? 'destructive' : 'default'}
              onClick={onConfirm}
              disabled={!canConfirm}
              className="flex-1"
            >
              {isProcessing ? 'Processing...' : (isLoadingTokenInfo || isResolvingAddresses || gasFeeLoading) ? 'Loading...' : mode === 'grant' ? 'Accept' : 'Revoke'}
            </Button>
          </div>
        </div>
      </div>
    </DefaultDialog>
  );
};

export * from './types';