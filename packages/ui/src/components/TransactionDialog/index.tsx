'use client';

import { Button } from '../ui/button';
import { Accordion } from '../ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { ShellDialog } from '../ShellDialog';
import { ProcessingScreen } from '../ProcessingScreen';
import { FeeTokenSelector } from '../FeeTokenSelector';
import { CopiedIcon, CopyIcon } from '../../icons';
import { useState, useEffect, useRef, type ReactNode } from 'react';
import { formatEther, ethAddress } from 'viem';
import { Info, Globe, ArrowDown } from 'lucide-react';
import { TransactionDialogProps } from './types';
import { useChainIconURI, useFeeTokenPrice } from '../../hooks';
import { useDecodedCalldata } from '../../hooks/useDecodedCalldata';
import { caip10, getDefaultDescriptorSource } from '../../utils/clearSigning';
import {
  reverseResolveWithAvatars,
  getDisplayAddress,
  getChainLabel,
  isSafeImageUrl,
  sanitizeDisplayName,
} from '../../utils';
import { subscriptDecimal } from '../../utils/displayFormat';
import { IdentityAvatar } from '../IdentityAvatar';
import { AccountAvatar } from '../AccountAvatar';
import { TokenIcon } from '../TokenIcon';
import { SubText } from '../SubText';
import { AssetPreview } from './AssetPreview';
import { callTitle } from './DecodedCalldata';
import { BatchStep, SingleCallData } from './CallSections';

/** One label/value micro-row card, matching the revamped signing dialogs. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-border rounded-[10.5px] border p-3">
      <p className="text-muted-foreground mb-1 font-mono text-[8px] font-semibold uppercase tracking-[0.13em]">
        {label}
      </p>
      {children}
    </div>
  );
}

export const TransactionDialog = ({
  transactions,
  walletAddress,
  gasFee,
  gasFeeLoading,
  gasEstimationError,
  sponsored,
  assetsOut,
  assetsIn,
  assetPreviewError,
  assetPreviewWillRevert,
  onConfirm,
  onCancel,
  isProcessing,
  transactionStatus,
  networkName,
  apiKey,
  appName,
  appLogoUrl,
  feeTokens,
  feeTokensLoading,
  selectedFeeToken,
  onFeeTokenSelect,
  showFeeTokenSelector,
  isPayingWithErc20,
  mainnetRpcUrl,
  nativeCurrencySymbol,
}: TransactionDialogProps) => {
  const [isAddressCopied, setIsAddressCopied] = useState<{ [key: string]: boolean }>({});
  const [resolvedAddresses, setResolvedAddresses] = useState<Record<string, string>>({});
  const [resolvedAvatars, setResolvedAvatars] = useState<Record<string, string>>({});

  const totalTransactions = transactions.length;
  const isSingleTransaction = totalTransactions === 1;
  const currentTransaction = transactions[0];

  const chainIcon = useChainIconURI(currentTransaction?.chainId || 1, apiKey, 24);

  const nativeToken = feeTokens?.find((t) => t.isNative);
  const nativeSymbol = nativeToken?.symbol || nativeCurrencySymbol || 'ETH';
  const nativeTokenPrice = useFeeTokenPrice(nativeSymbol);

  // If feeTokens isn't loaded yet (null/undefined/empty), assume there are selectable options.
  const hasSelectablePaymentOption =
    !feeTokens || feeTokens.length === 0 ? true : feeTokens.some((t) => t.isSelectable);

  // Inside a Radix modal, native wheel scrolling of a nested container can get eaten —
  // drive scrollTop manually (mirrors the signing dialogs).
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollHeight <= el.clientHeight) return;
      el.scrollTop += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [isProcessing, transactions]);

  // Resolve wallet + transaction 'to' addresses to ENS names in one batched request.
  useEffect(() => {
    const inputs: { address: string; chainId: number }[] = [];
    if (walletAddress && currentTransaction?.chainId) {
      inputs.push({ address: walletAddress, chainId: currentTransaction.chainId });
    }
    transactions.forEach((transaction) => {
      if (transaction.to && transaction.chainId) {
        inputs.push({ address: transaction.to, chainId: transaction.chainId });
      }
    });
    if (inputs.length === 0) return;

    let cancelled = false;
    reverseResolveWithAvatars(inputs, mainnetRpcUrl)
      .then(async (resolved) => {
        if (cancelled) return;
        const next: Record<string, string> = {};
        const avatarByAddress: Record<string, string> = {};
        for (const { address, chainId } of inputs) {
          const identity = resolved[address.toLowerCase()];
          if (!identity) continue;
          const label = await getChainLabel(chainId, mainnetRpcUrl);
          next[address] = label ? `${identity.name}@${label}` : identity.name;
          if (identity.avatar) avatarByAddress[address] = identity.avatar;
        }
        if (cancelled) return;
        if (Object.keys(next).length > 0) {
          setResolvedAddresses((prev) => ({ ...prev, ...next }));
        }
        if (Object.keys(avatarByAddress).length > 0) {
          setResolvedAvatars((prev) => ({ ...prev, ...avatarByAddress }));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [walletAddress, transactions, currentTransaction?.chainId]);

  // Resolve ERC-7730 `metadata.contractName` for every unique `to` in the batch.
  const [contractNames, setContractNames] = useState<Record<string, string>>({});
  const txSignature = transactions
    .filter((t) => !!t.to)
    .map((t) => caip10(t.chainId, t.to))
    .sort()
    .join('|');
  useEffect(() => {
    if (!txSignature) return;
    let cancelled = false;
    (async () => {
      const source = getDefaultDescriptorSource();
      let index;
      try {
        index = await source.getCalldataIndex();
      } catch (err) {
        console.debug('[TransactionDialog] calldata index fetch failed:', err);
        return;
      }

      const lookups = new Map<string, string>();
      for (const t of transactions) {
        if (!t.to) continue;
        const key = t.to.toLowerCase();
        if (lookups.has(key)) continue;
        const path = index[caip10(t.chainId, t.to)];
        if (path) lookups.set(key, path);
      }

      const results = await Promise.all(
        Array.from(lookups, async ([addr, path]) => {
          try {
            const desc = await source.getDescriptor(path);
            const name = desc.metadata?.contractName ?? desc.context?.$id;
            return name ? ([addr, name] as const) : null;
          } catch (err) {
            console.debug('[TransactionDialog] descriptor fetch failed:', path, err);
            return null;
          }
        })
      );

      if (cancelled) return;
      const updates: Record<string, string> = {};
      for (const r of results) if (r) updates[r[0]] = r[1];
      if (Object.keys(updates).length > 0) {
        setContractNames((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [txSignature]);

  // Prefer ENS reverse-resolved name, then ERC-7730 contractName, then truncated address.
  const displayContractAddress = (address: string | undefined): string => {
    if (!address) return '';
    const ens = resolvedAddresses[address];
    if (ens) return ens;
    const cn = contractNames[address.toLowerCase()];
    if (cn) return cn;
    return getDisplayAddress(undefined, address);
  };

  const displayWalletAddress = getDisplayAddress(resolvedAddresses[walletAddress], walletAddress);
  const displayToAddress = displayContractAddress(currentTransaction?.to);

  const formatTransactionValue = (value?: string) => {
    if (!value || value === '0' || value === '0x0') return null;
    try {
      if (value.startsWith('0x')) return formatEther(BigInt(value));
      if (/^\d+$/.test(value) && value.length > 10) return formatEther(BigInt(value));
      if (/^\d+\.?\d*$/.test(value) && value.length <= 20) return value;
      return formatEther(BigInt(value));
    } catch (error) {
      console.warn('Failed to format transaction value:', value, error);
      return null;
    }
  };

  // Confirmation gating (unchanged): not processing, gas not loading, a selectable
  // payment option exists, and an ERC-20 fee has a settled ceiling.
  const hasInsufficientFunds = !hasSelectablePaymentOption || (gasEstimationError && !sponsored && !isPayingWithErc20);
  const erc20EstimateMissing = isPayingWithErc20 && !selectedFeeToken?.gasCostMaxFormatted;
  const canConfirm = !isProcessing && !gasFeeLoading && !hasInsufficientFunds && !erc20EstimateMissing;

  const singleValue = isSingleTransaction ? formatTransactionValue(currentTransaction?.value) : null;
  // A pure native transfer (value, no calldata) reads as a "Send"; everything else is a generic review.
  const isNativeSend =
    isSingleTransaction && !!singleValue && (!currentTransaction?.data || currentTransaction.data === '0x');

  // One decode for the whole single-call path: it names the headline AND the calldata card,
  // so a lone decoded call reads "Approve" rather than the generic "Review Transaction".
  const isSingleCall = isSingleTransaction && !isNativeSend && !!currentTransaction?.data;
  const singleCallDecode = useDecodedCalldata(
    isSingleCall ? currentTransaction?.to : undefined,
    isSingleCall ? currentTransaction?.data : undefined,
    currentTransaction?.chainId ?? 1,
    apiKey
  );
  const title = isNativeSend ? "You're Sending" : (callTitle(singleCallDecode) ?? 'Review Transaction');

  // The You-send/You-get summary stands in for the raw detail, so calldata and batch steps
  // start folded when it's there — and stay open when it isn't, rather than leaving the
  // review screen with nothing on it.
  const hasAssetSummary = !assetPreviewError && ((assetsOut?.length ?? 0) > 0 || (assetsIn?.length ?? 0) > 0);
  const detailsOpen = !hasAssetSummary;

  const hasError = transactionStatus.includes('Error');

  // Processing-screen flow target: the requesting dApp's logo, falling back to a neutral
  // globe. Never the chain badge — that belongs to the network fee row.
  const safeAppName = sanitizeDisplayName(appName ?? '') || 'dApp';
  const appAvatar = isSafeImageUrl(appLogoUrl) ? (
    <img
      src={appLogoUrl ?? undefined}
      alt={`${safeAppName} logo`}
      className="h-full w-full rounded-full object-cover"
    />
  ) : (
    <Globe className="text-muted-foreground m-auto h-1/2 w-1/2" strokeWidth={1.5} />
  );

  // Fee-token chip — one instance, shared by the fee row.
  const feeSelector =
    showFeeTokenSelector && !sponsored && feeTokens && onFeeTokenSelect ? (
      <FeeTokenSelector
        tokens={feeTokens}
        chainId={currentTransaction?.chainId}
        selectedToken={selectedFeeToken ?? null}
        onSelect={onFeeTokenSelect}
        isLoading={feeTokensLoading ?? false}
        disabled={isProcessing}
        nativeTokenPrice={nativeTokenPrice}
        estimatedGasEth={gasFee || '0'}
      />
    ) : null;

  // The fee VALUE block — every state preserved from the pre-revamp dialog.
  const feeValue = (() => {
    if (gasFeeLoading && !isPayingWithErc20) {
      return <p className="text-muted-foreground font-mono text-[11px]">Estimating...</p>;
    }
    if (gasEstimationError && !sponsored) {
      return <p className="text-destructive font-mono text-[11px] font-medium">{gasEstimationError}</p>;
    }
    if (sponsored) {
      return (
        <div className="flex flex-col items-start gap-0.5">
          <div className="flex items-center gap-2">
            {gasFee && gasFee !== 'sponsored' && nativeTokenPrice > 0 && (
              <span className="text-muted-foreground font-mono text-[11px] line-through">
                ${(nativeTokenPrice * Number(gasFee)).toFixed(4)}
              </span>
            )}
            <span className="text-success bg-success/10 rounded px-2 py-0.5 text-[10px] font-semibold">Sponsored</span>
          </div>
          <p className="text-muted-foreground font-mono text-[10px]">
            <SubText>
              {gasFee && gasFee !== 'sponsored'
                ? (() => {
                    const g = Number(gasFee);
                    return g > 0 && g < 0.0001
                      ? `${subscriptDecimal(g)} ${nativeSymbol}`
                      : `${g.toFixed(4)} ${nativeSymbol}`;
                  })()
                : 'Gas fees covered'}
            </SubText>
          </p>
        </div>
      );
    }
    if (isPayingWithErc20 && selectedFeeToken) {
      return (
        <div className="flex flex-col items-start gap-0.5">
          <p className="font-mono leading-tight">
            {selectedFeeToken.gasCostFormatted ? (
              <>
                <span className="text-foreground text-[14px] font-semibold">${selectedFeeToken.gasCostFormatted}</span>
                <span className="text-muted-foreground ml-1 text-[11px] font-normal">
                  ≈ {selectedFeeToken.gasCostFormatted} {selectedFeeToken.symbol}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground text-[11px]">Estimating...</span>
            )}
          </p>
          {(selectedFeeToken.gasCostMaxFormatted ?? selectedFeeToken.gasCostFormatted) && (
            <p className="text-muted-foreground font-mono text-[10px]">
              Up to {selectedFeeToken.gasCostMaxFormatted ?? selectedFeeToken.gasCostFormatted}{' '}
              {selectedFeeToken.symbol}
            </p>
          )}
        </div>
      );
    }
    if (gasFee && gasFee !== 'sponsored') {
      const g = Number(gasFee);
      const nativeAmt =
        g > 0 && g < 0.0001 ? `${subscriptDecimal(g)} ${nativeSymbol}` : `${g.toFixed(4)} ${nativeSymbol}`;
      return (
        <p className="font-mono leading-tight">
          {nativeTokenPrice > 0 ? (
            <>
              <span className="text-foreground text-[14px] font-semibold">
                ${(nativeTokenPrice * Number(gasFee)).toFixed(4)}
              </span>
              <span className="text-muted-foreground ml-1 text-[11px] font-normal">
                ≈ <SubText>{nativeAmt}</SubText>
              </span>
            </>
          ) : (
            <SubText className="text-foreground text-[14px] font-semibold">{nativeAmt}</SubText>
          )}
        </p>
      );
    }
    return <p className="text-muted-foreground font-mono text-[11px]">Unable to estimate</p>;
  })();

  return (
    <ShellDialog
      open={true}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
      dismissable={!isProcessing}
      contentClassName="min-h-[510px]"
    >
      {isProcessing ? (
        <ProcessingScreen
          seedAddress={walletAddress}
          avatarUrl={resolvedAvatars[walletAddress]}
          appAvatar={appAvatar}
          title="Submitting transaction"
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Pinned header — action title only (no timestamp, no app header, no X). */}
          <div className="flex-none px-6 pt-7">
            <h2 className="text-foreground text-[26px] font-bold tracking-[-0.03em]">{title}</h2>
            {totalTransactions > 1 && currentTransaction?.description && (
              <p className="text-muted-foreground mt-0.5 text-[12px]">
                {currentTransaction.action}: {currentTransaction.description}
              </p>
            )}
          </div>

          {/* Scrollable body */}
          <div ref={scrollRef} className="jaw-scroll min-h-0 flex-1 space-y-2.5 overflow-y-auto px-6 pb-2.5 pt-3">
            {/* Native send → one prominent hero amount (replaces the asset-preview row + value card). */}
            {isNativeSend && (
              <div className="flex items-center gap-3 pb-0.5 pt-1">
                <TokenIcon
                  chainId={currentTransaction.chainId}
                  address={ethAddress}
                  symbol={nativeSymbol}
                  className="size-11 flex-none"
                  fallback={<IdentityAvatar />}
                />
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="text-foreground text-[26px] font-bold tracking-[-0.02em]">
                    {singleValue} {nativeSymbol}
                  </span>
                  {nativeTokenPrice > 0 && (
                    <span className="text-muted-foreground text-[15px] font-normal">
                      ≈ ${(Number(singleValue) * nativeTokenPrice).toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* From / To */}
            <div className="border-border flex flex-col gap-2.5 rounded-[10.5px] border p-3">
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-muted-foreground font-mono text-[8px] font-semibold uppercase tracking-[0.13em]">
                  From
                </p>
                <div className="flex min-w-0 items-center gap-2">
                  <AccountAvatar
                    seed={walletAddress}
                    avatarUrl={resolvedAvatars[walletAddress]}
                    size={32}
                    className="size-8 flex-none rounded-[9px]"
                  />
                  <p className="text-foreground min-w-0 break-all font-mono text-[12px] font-medium">
                    {displayWalletAddress}
                  </p>
                  {isAddressCopied['single-from'] ? (
                    <CopiedIcon width={13} height={13} className="flex-none" />
                  ) : (
                    <CopyIcon
                      width={13}
                      height={13}
                      onClick={() => {
                        if (typeof window !== 'undefined' && navigator?.clipboard) {
                          navigator.clipboard.writeText(walletAddress).catch(() => undefined);
                          setIsAddressCopied((prev) => ({ ...prev, 'single-from': true }));
                          setTimeout(() => setIsAddressCopied((prev) => ({ ...prev, 'single-from': false })), 3000);
                        }
                      }}
                      className="flex-none cursor-pointer"
                    />
                  )}
                </div>
              </div>
              {isSingleTransaction && currentTransaction?.to && (
                <>
                  <div className="flex items-center py-0.5">
                    <div className="bg-border h-px flex-1" />
                    <ArrowDown className="text-muted-foreground mx-1.5 size-3 flex-none" strokeWidth={2} />
                    <div className="bg-border h-px flex-1" />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="text-muted-foreground font-mono text-[8px] font-semibold uppercase tracking-[0.13em]">
                      To
                    </p>
                    <div className="flex min-w-0 items-center gap-2">
                      <AccountAvatar
                        seed={currentTransaction.to}
                        avatarUrl={resolvedAvatars[currentTransaction.to]}
                        size={32}
                        className="size-8 flex-none rounded-[9px]"
                      />
                      <p className="text-foreground min-w-0 break-all font-mono text-[12px] font-medium">
                        {displayToAddress}
                      </p>
                      {isAddressCopied['single-to'] ? (
                        <CopiedIcon width={13} height={13} className="flex-none" />
                      ) : (
                        <CopyIcon
                          width={13}
                          height={13}
                          onClick={() => {
                            if (typeof window !== 'undefined' && navigator?.clipboard) {
                              navigator.clipboard.writeText(currentTransaction.to).catch(() => undefined);
                              setIsAddressCopied((prev) => ({ ...prev, 'single-to': true }));
                              setTimeout(() => setIsAddressCopied((prev) => ({ ...prev, 'single-to': false })), 3000);
                            }
                          }}
                          className="flex-none cursor-pointer"
                        />
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Asset changes — for a native send the hero already shows it, so only surface
                the preview when it carries a revert warning. */}
            {(!isNativeSend || assetPreviewWillRevert) && (
              <AssetPreview
                assetsOut={assetsOut ?? []}
                assetsIn={assetsIn ?? []}
                error={assetPreviewError ?? false}
                willRevert={assetPreviewWillRevert ?? false}
                nativeSymbol={nativeSymbol}
                chainId={currentTransaction?.chainId}
              />
            )}

            {/* Value (single, non-native — a native send shows it in the hero) */}
            {isSingleTransaction && !isNativeSend && singleValue && (
              <Row label="Value">
                <p className="text-foreground font-mono text-[13px] font-semibold">
                  {singleValue} {nativeSymbol}
                  {nativeTokenPrice > 0 && (
                    <span className="text-muted-foreground ml-1.5 text-[11px] font-normal">
                      ≈ ${(Number(singleValue) * nativeTokenPrice).toFixed(2)}
                    </span>
                  )}
                </p>
              </Row>
            )}

            {/* Calldata (single tx) — folded behind the decoded call name */}
            {isSingleTransaction && currentTransaction?.data && currentTransaction.data !== '0x' && (
              <Accordion type="single" collapsible defaultValue={detailsOpen ? 'calldata' : undefined}>
                <SingleCallData
                  to={currentTransaction.to}
                  data={currentTransaction.data}
                  decode={singleCallDecode}
                  chainId={currentTransaction.chainId}
                  apiKey={apiKey}
                  resolvedAddresses={resolvedAddresses}
                  resolvedAvatars={resolvedAvatars}
                  mainnetRpcUrl={mainnetRpcUrl}
                />
              </Accordion>
            )}

            {/* Batch — numbered steps named by their decoded action */}
            {!isSingleTransaction && (
              <Accordion
                type="multiple"
                className="space-y-2.5"
                defaultValue={detailsOpen ? transactions.map((_, index) => `transaction-${index}`) : []}
              >
                {transactions.map((transaction, index) => (
                  <BatchStep
                    key={index}
                    transaction={transaction}
                    index={index}
                    nativeSymbol={nativeSymbol}
                    nativeTokenPrice={nativeTokenPrice}
                    formatValue={formatTransactionValue}
                    displayContractAddress={displayContractAddress}
                    apiKey={apiKey}
                    resolvedAddresses={resolvedAddresses}
                    resolvedAvatars={resolvedAvatars}
                    mainnetRpcUrl={mainnetRpcUrl}
                  />
                ))}
              </Accordion>
            )}

            {/* Error banner (processing/success now live in the ProcessingScreen state above). */}
            {hasError && (
              <div className="bg-destructive/10 rounded-[10.5px] p-3">
                <p className="text-destructive text-[12px]">{transactionStatus}</p>
              </div>
            )}
          </div>

          {/* Pinned fee row + actions */}
          <div className="border-border flex-none space-y-3 border-t px-6 py-3.5">
            {/* Network fee */}
            <div className="border-border rounded-[10.5px] border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-muted-foreground font-mono text-[8px] font-semibold uppercase tracking-[0.13em]">
                      Network fee
                    </p>
                    <TooltipProvider delayDuration={0}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="text-muted-foreground size-3 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p>
                            Gas fees paid to network validators to process your transaction. You can pay with{' '}
                            {nativeSymbol} or supported tokens.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="mt-1.5">{feeValue}</div>
                </div>
                {/* Right column: chain on top, fee-token chip below. */}
                <div className="flex flex-none flex-col items-end gap-1.5">
                  <div className="text-muted-foreground flex items-center gap-1 font-mono text-[10px]">
                    {/* Round chain badge — clipped to a circle so the logo never stretches. */}
                    <span className="border-border bg-secondary flex size-4 flex-none items-center justify-center overflow-hidden rounded-full border [&>*]:!h-full [&>*]:!w-full [&>*]:!min-w-0">
                      {chainIcon}
                    </span>
                    <span className="truncate">{networkName || 'Ethereum'}</span>
                  </div>
                  {feeSelector}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={onCancel}
                disabled={isProcessing}
                className="h-11 flex-1 rounded-[10.5px] text-[13px] font-semibold focus-visible:ring-1"
              >
                Cancel
              </Button>
              <Button
                onClick={onConfirm}
                disabled={!canConfirm}
                className="h-11 flex-1 rounded-[10.5px] text-[13px] font-semibold focus-visible:ring-1"
              >
                {hasInsufficientFunds ? 'Insufficient Funds' : isProcessing ? 'Processing...' : 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ShellDialog>
  );
};

export * from './types';
