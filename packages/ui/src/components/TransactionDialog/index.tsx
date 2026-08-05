'use client';

import { Button } from '../ui/button';
import { Accordion } from '../ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { ShellDialog } from '../ShellDialog';
import { ProcessingScreen } from '../ProcessingScreen';
import { FeeTokenSelector } from '../FeeTokenSelector';
import { useState, useEffect, useRef } from 'react';
import { ethAddress } from 'viem';
import { Info, ArrowDown } from 'lucide-react';
import { TransactionDialogProps } from './types';
import { useChainIconURI, useFeeTokenPrice } from '../../hooks';
import { useDecodedCalldata } from '../../hooks/useDecodedCalldata';
import { caip10, getDefaultDescriptorSource } from '../../utils/clearSigning';
import { reverseResolveWithAvatars, getDisplayAddress, getChainLabel } from '../../utils';
import { formatNativeValue, subscriptDecimal } from '../../utils/displayFormat';
import { IdentityAvatar } from '../IdentityAvatar';
import { AppAvatar } from '../AppAvatar';
import { TokenIcon } from '../TokenIcon';
import { SubText } from '../SubText';
import { AssetPreview } from './AssetPreview';
import { callTitle } from './DecodedCalldata';
import { resolveBlockReason } from '../../utils/transactionFailure';
import { BatchStep, SingleCallData } from './CallSections';
import { Eyebrow, PartyRow, Row, ValueAmount } from './primitives';

/** A one-line red message with the detail behind an info tooltip. */
function InlineWarning({ text, detail }: { text: string; detail: string }) {
  return (
    <div className="flex items-center gap-1">
      <p className="text-destructive font-mono text-[11px] font-medium">{text}</p>
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="text-destructive size-3 flex-none cursor-help" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[240px] text-xs">
            <p>{detail}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
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
  assetPreviewRevertCause,
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

  const blockReason = resolveBlockReason({
    hasSelectablePaymentOption,
    gasEstimationError,
    sponsored,
    isPayingWithErc20: !!isPayingWithErc20,
    revertCause: assetPreviewRevertCause,
  });

  // An ERC-20 fee can't be confirmed until its worst-case ceiling has settled.
  const erc20EstimateMissing = isPayingWithErc20 && !selectedFeeToken?.gasCostMaxFormatted;
  const canConfirm = !isProcessing && !gasFeeLoading && !blockReason && !erc20EstimateMissing;

  // Reverts, but gas estimated fine, so it stays submittable: warn rather than block.
  const softRevertWarning = !blockReason && !!assetPreviewWillRevert;

  const singleValue = isSingleTransaction ? formatNativeValue(currentTransaction?.value) : null;
  // A pure native transfer (value, no calldata) reads as a "Send"; everything else is a generic review.
  const isNativeSend =
    isSingleTransaction && !!singleValue && (!currentTransaction?.data || currentTransaction.data === '0x');

  // One decode names both the headline and the calldata card.
  const isSingleCall = isSingleTransaction && !isNativeSend && !!currentTransaction?.data;
  const singleCallDecode = useDecodedCalldata(
    isSingleCall ? currentTransaction?.to : undefined,
    isSingleCall ? currentTransaction?.data : undefined,
    currentTransaction?.chainId ?? 1,
    apiKey
  );
  const title = isNativeSend ? "You're Sending" : (callTitle(singleCallDecode) ?? 'Review Transaction');

  // A single call's calldata unfolds only when there's no You-send/You-get summary to stand in
  // for it; otherwise that review screen would open with nothing on it. Batch steps always
  // start collapsed — their headers name the action, so the user opens the one they care about.
  const calldataOpen = !!assetPreviewError || ((assetsOut?.length ?? 0) === 0 && (assetsIn?.length ?? 0) === 0);

  const hasError = transactionStatus.includes('Error');

  // While blocked the selector stays as long as some token is selectable — switching to it clears
  // the block. Suppressed only when nothing can pay, where the choice would change nothing.
  const feeSelector =
    showFeeTokenSelector &&
    !sponsored &&
    !(blockReason && !hasSelectablePaymentOption) &&
    feeTokens &&
    onFeeTokenSelect ? (
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

  const blockedCopy =
    blockReason === 'funds'
      ? {
          text: 'Insufficient funds',
          detail:
            assetPreviewRevertCause === 'balance'
              ? "This account doesn't hold enough of the asset this transaction spends."
              : `This account can't cover the network fee in ${nativeSymbol} or any supported token.`,
        }
      : {
          text: 'Transaction will fail',
          detail: 'Simulating this transaction reverted, so the fee can’t be estimated and it can’t be submitted.',
        };

  const feeValue = (() => {
    if (gasFeeLoading && !isPayingWithErc20) {
      return <p className="text-muted-foreground font-mono text-[11px]">Estimating...</p>;
    }
    // Blocked: one short red string in the slot the fee would occupy, detail in the tooltip.
    if (blockReason) {
      return <InlineWarning {...blockedCopy} />;
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
          appAvatar={<AppAvatar appName={appName} appLogoUrl={appLogoUrl} />}
          title="Submitting transaction"
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Pinned header */}
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
            {/* Native send → one prominent hero amount */}
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
            <div className="border-border flex flex-col gap-2 rounded-[10.5px] border p-3">
              <PartyRow
                label="From"
                value={displayWalletAddress}
                address={walletAddress}
                avatarUrl={resolvedAvatars[walletAddress]}
              />
              {isSingleTransaction && currentTransaction?.to && (
                <>
                  <div className="flex items-center">
                    <div className="bg-border h-px flex-1" />
                    <ArrowDown className="text-muted-foreground mx-1.5 size-3 flex-none" strokeWidth={2} />
                    <div className="bg-border h-px flex-1" />
                  </div>
                  <PartyRow
                    label="To"
                    value={displayToAddress}
                    address={currentTransaction.to}
                    avatarUrl={resolvedAvatars[currentTransaction.to]}
                  />
                </>
              )}
            </div>

            {/* Reverts but gas estimated fine, so it stays submittable. */}
            {softRevertWarning && (
              <div className="px-0.5">
                <InlineWarning
                  text="Transaction is likely to fail"
                  detail="Simulation shows this transaction reverting on-chain. You can still submit it, but it will probably fail and consume gas."
                />
              </div>
            )}

            {/* Asset changes — a native send shows the same information in its hero. */}
            {!isNativeSend && (
              <AssetPreview
                assetsOut={assetsOut ?? []}
                assetsIn={assetsIn ?? []}
                error={assetPreviewError ?? false}
                nativeSymbol={nativeSymbol}
                chainId={currentTransaction?.chainId}
              />
            )}

            {/* Value (single, non-native) */}
            {isSingleTransaction && !isNativeSend && singleValue && (
              <Row label="Value">
                <ValueAmount
                  amount={singleValue}
                  symbol={nativeSymbol}
                  price={nativeTokenPrice}
                  className="text-foreground font-mono text-[13px] font-semibold"
                />
              </Row>
            )}

            {/* Calldata (single tx) */}
            {isSingleTransaction && currentTransaction?.data && currentTransaction.data !== '0x' && (
              <Accordion type="single" collapsible defaultValue={calldataOpen ? 'calldata' : undefined}>
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

            {/* Batch steps */}
            {!isSingleTransaction && (
              <Accordion type="multiple" className="space-y-2.5">
                {transactions.map((transaction, index) => (
                  <BatchStep
                    key={index}
                    transaction={transaction}
                    index={index}
                    nativeSymbol={nativeSymbol}
                    nativeTokenPrice={nativeTokenPrice}
                    displayContractAddress={displayContractAddress}
                    apiKey={apiKey}
                    resolvedAddresses={resolvedAddresses}
                    resolvedAvatars={resolvedAvatars}
                    mainnetRpcUrl={mainnetRpcUrl}
                  />
                ))}
              </Accordion>
            )}

            {/* Error banner */}
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
                    <Eyebrow>Network fee</Eyebrow>
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
                {blockReason === 'funds' ? 'Insufficient Funds' : isProcessing ? 'Processing...' : 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ShellDialog>
  );
};

export * from './types';
