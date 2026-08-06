'use client';

import { useEffect, useRef, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button } from '../ui/button';
import { ShellDialog } from '../ShellDialog';
import { ProcessingScreen } from '../ProcessingScreen';
import { DialogAppHeader } from '../DialogAppHeader';
import { NetworkFeeRow } from '../NetworkFeeRow';
import { AppAvatar } from '../AppAvatar';
import { AccountAvatar } from '../AccountAvatar';
import { PartyRow } from '../primitives';
import { CopyButton } from '../CopyButton';
import { useChainIconURI, useFeeTokenPrice } from '../../hooks';
import { reverseResolveWithAvatars } from '../../utils/reverseResolve';
import { getChainLabel } from '../../utils/resolveChainLabel';
import { getDisplayAddress } from '../../utils';
import { resolveBlockReason } from '../../utils/transactionFailure';
import { PermissionDialogProps } from './types';
import { AllowedCalls, MetaCard, SpendLimits, isWildcard } from './Sections';

export const PermissionDialog = ({
  open,
  onOpenChange,
  mode,
  permissionId,
  spenderAddress,
  accountAddress,
  origin,
  appName,
  appLogoUrl,
  spends = [],
  calls = [],
  expiryDate,
  grantedDate,
  networkName,
  chainId,
  chainIcon,
  apiKey,
  onConfirm,
  onCancel,
  isProcessing,
  status,
  isLoadingTokenInfo = false,
  gasFee,
  gasFeeLoading = false,
  gasEstimationError = '',
  sponsored = false,
  feeTokens,
  feeTokensLoading,
  selectedFeeToken,
  onFeeTokenSelect,
  showFeeTokenSelector,
  isPayingWithErc20,
  mainnetRpcUrl,
  nativeCurrencySymbol,
}: PermissionDialogProps) => {
  const isGrant = mode === 'grant';

  const [resolvedAddresses, setResolvedAddresses] = useState<Record<string, string>>({});
  const [resolvedAvatars, setResolvedAvatars] = useState<Record<string, string>>({});
  // Starts true so the confirm button can't be hit before an identity is known.
  const [isResolvingAddresses, setIsResolvingAddresses] = useState(true);

  const defaultChainIcon = useChainIconURI(chainId || 1, apiKey, 24);
  const displayChainIcon = chainIcon || defaultChainIcon;

  const nativeToken = feeTokens?.find((t) => t.isNative);
  const nativeSymbol = nativeToken?.symbol || nativeCurrencySymbol || 'ETH';
  const nativeTokenPrice = useFeeTokenPrice(nativeSymbol);

  // Resolve the spender and every non-wildcard target in one batched request.
  useEffect(() => {
    if (!chainId) {
      setIsResolvingAddresses(false);
      return;
    }
    const targets = new Set<string>();
    if (spenderAddress) targets.add(spenderAddress);
    if (accountAddress) targets.add(accountAddress);
    calls.forEach((call) => {
      if (call.target && !isWildcard(call.target)) targets.add(call.target);
    });
    if (targets.size === 0) {
      setIsResolvingAddresses(false);
      return;
    }

    setIsResolvingAddresses(true);
    let cancelled = false;
    reverseResolveWithAvatars(
      [...targets].map((address) => ({ address, chainId })),
      mainnetRpcUrl
    )
      .then(async (resolved) => {
        if (cancelled) return;
        const label = await getChainLabel(chainId, mainnetRpcUrl);
        if (cancelled) return;
        const names: Record<string, string> = {};
        const avatars: Record<string, string> = {};
        for (const address of targets) {
          const identity = resolved[address.toLowerCase()];
          if (!identity) continue;
          names[address] = label ? `${identity.name}@${label}` : identity.name;
          if (identity.avatar) avatars[address] = identity.avatar;
        }
        setResolvedAddresses((prev) => ({ ...prev, ...names }));
        if (Object.keys(avatars).length > 0) setResolvedAvatars((prev) => ({ ...prev, ...avatars }));
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setIsResolvingAddresses(false);
      });
    return () => {
      cancelled = true;
    };
  }, [spenderAddress, accountAddress, calls, chainId, mainnetRpcUrl]);

  // Inside a Radix modal a nested container's wheel events get eaten — drive scrollTop manually.
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
  }, [isProcessing]);

  const hasSelectablePaymentOption =
    !feeTokens || feeTokens.length === 0 ? true : feeTokens.some((t) => t.isSelectable);

  // Same rule as the transaction screen, so a blocked fee reads identically on both.
  const blockReason = resolveBlockReason({
    hasSelectablePaymentOption,
    gasEstimationError,
    sponsored,
    isPayingWithErc20: !!isPayingWithErc20,
  });

  // The permission manager stores call rules; a spend-only grant has nothing to store and is
  // rejected onchain. Say so up front rather than letting the grant fail after a signature.
  const missingCalls = isGrant && calls.length === 0;

  // With no call rule the grant can't be built at all, so gas estimation fails for a reason that
  // has nothing to do with funds. Suppress the fee-derived cause and let the banner speak.
  const feeBlockReason = missingCalls ? null : blockReason;

  // An ERC-20 fee can't be confirmed until its worst-case ceiling has settled.
  const erc20EstimateMissing = isPayingWithErc20 && !selectedFeeToken?.gasCostMaxFormatted;
  const canConfirm =
    !isProcessing &&
    !isLoadingTokenInfo &&
    !isResolvingAddresses &&
    !gasFeeLoading &&
    !blockReason &&
    !missingCalls &&
    !erc20EstimateMissing;

  const displayAddress = (address: string) => getDisplayAddress(resolvedAddresses[address], address);
  const truncateAddress = (address: string) => getDisplayAddress(undefined, address);
  const hasError = !!status && status.includes('Error');

  return (
    <ShellDialog open={open} onOpenChange={onOpenChange} dismissable={!isProcessing} contentClassName="min-h-[510px]">
      {isProcessing ? (
        <ProcessingScreen
          seedAddress={accountAddress || spenderAddress}
          avatarUrl={resolvedAvatars[accountAddress || spenderAddress]}
          appAvatar={<AppAvatar appName={appName} appLogoUrl={appLogoUrl} />}
          title={isGrant ? 'Granting permission' : 'Revoking permission'}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-none px-6 pt-6">
            <DialogAppHeader
              appName={appName}
              appLogoUrl={appLogoUrl}
              origin={origin}
              chainName={networkName}
              chainIcon={displayChainIcon}
            />
            <h2 className="text-foreground mt-4 text-[26px] font-bold tracking-[-0.03em]">
              {isGrant ? 'Requesting Permission' : 'Revoke Permission'}
            </h2>
          </div>

          <div ref={scrollRef} className="jaw-scroll min-h-0 flex-1 space-y-2.5 overflow-y-auto px-6 pb-2.5 pt-3">
            {missingCalls && (
              <div className="flex items-start gap-2 rounded-[10px] bg-amber-500/10 p-3">
                <TriangleAlert className="mt-px size-3.5 flex-none text-amber-500" strokeWidth={2} />
                <p className="text-[11px] leading-[140%] text-amber-500">
                  This permission has no allowed calls. A grant needs at least one call rule, so spend limits alone
                  can't be granted.
                </p>
              </div>
            )}

            {/* Who the permission is for */}
            <div className="border-border rounded-[10.5px] border p-3">
              <PartyRow
                label="For"
                value={displayAddress(spenderAddress)}
                address={spenderAddress}
                avatarUrl={resolvedAvatars[spenderAddress]}
              />
            </div>

            {spends.length > 0 && (
              <SpendLimits
                spends={spends}
                chainId={chainId}
                nativeSymbol={nativeSymbol}
                isLoading={isLoadingTokenInfo}
              />
            )}

            <MetaCard
              rows={[
                ...(accountAddress
                  ? [
                      {
                        label: 'From',
                        value: (
                          <>
                            <AccountAvatar
                              seed={accountAddress}
                              avatarUrl={resolvedAvatars[accountAddress]}
                              size={15}
                              className="size-[15px] flex-none rounded-[4.5px]"
                            />
                            <span className="truncate">{displayAddress(accountAddress)}</span>
                            <CopyButton value={accountAddress} size={11} label="Copy account address" />
                          </>
                        ),
                      },
                    ]
                  : []),
                ...(grantedDate ? [{ label: 'Granted', value: grantedDate }] : []),
                ...(expiryDate ? [{ label: 'Until', value: expiryDate }] : []),
                ...(permissionId
                  ? [
                      {
                        label: 'permissionId',
                        value: (
                          <>
                            <span className="truncate">{truncateAddress(permissionId)}</span>
                            <CopyButton value={permissionId} size={11} label="Copy permission ID" />
                          </>
                        ),
                      },
                    ]
                  : []),
              ]}
            />

            {calls.length > 0 && (
              <AllowedCalls
                calls={calls}
                resolvedAddresses={resolvedAddresses}
                resolvedAvatars={resolvedAvatars}
                truncateAddress={truncateAddress}
              />
            )}

            {calls.length > 0 && (
              <AllowedCalls
                calls={calls}
                resolvedAddresses={resolvedAddresses}
                resolvedAvatars={resolvedAvatars}
                truncateAddress={truncateAddress}
              />
            )}

            <p className="text-muted-foreground px-0.5 text-[11px] leading-[140%]">
              {isGrant
                ? 'Limits are enforced onchain. Revoke anytime, one tap.'
                : 'Revoking is onchain and immediate. This spender loses all access above.'}
            </p>

            {hasError && (
              <div className="bg-destructive/10 rounded-[10.5px] p-3">
                <p className="text-destructive text-[12px]">{status}</p>
              </div>
            )}
          </div>

          <div className="border-border flex-none space-y-3 border-t px-6 py-3.5">
            <NetworkFeeRow
              blockReason={feeBlockReason}
              gasFee={gasFee}
              gasFeeLoading={gasFeeLoading}
              sponsored={sponsored}
              nativeSymbol={nativeSymbol}
              nativeTokenPrice={nativeTokenPrice}
              networkName={networkName}
              chainId={chainId}
              chainIcon={displayChainIcon}
              feeTokens={feeTokens}
              feeTokensLoading={feeTokensLoading}
              selectedFeeToken={selectedFeeToken}
              onFeeTokenSelect={onFeeTokenSelect}
              showFeeTokenSelector={showFeeTokenSelector}
              isPayingWithErc20={isPayingWithErc20}
              hasSelectablePaymentOption={hasSelectablePaymentOption}
              disabled={isProcessing}
            />

            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={onCancel}
                disabled={isProcessing}
                className="h-11 flex-1 rounded-[10.5px] text-[13px] font-semibold focus-visible:ring-1"
              >
                {isGrant ? 'Cancel' : 'Keep it'}
              </Button>
              <Button
                onClick={onConfirm}
                disabled={!canConfirm}
                variant={isGrant ? 'default' : 'destructive'}
                className="h-11 flex-1 rounded-[10.5px] text-[13px] font-semibold focus-visible:ring-1"
              >
                {feeBlockReason === 'funds' ? 'Insufficient Funds' : isGrant ? 'Grant' : 'Revoke'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ShellDialog>
  );
};

export * from './types';
