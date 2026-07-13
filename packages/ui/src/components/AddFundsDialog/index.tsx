'use client';

import { useEffect, useState } from 'react';
import { DefaultDialog } from '../DefaultDialog';
import { useIsMobile } from '../../hooks';
import { useOnrampFlow } from '../../hooks/useOnrampFlow';
import { getDisplayAddress, getChainLabel, reverseResolveAddresses } from '../../utils';
import { HomeStep } from './steps/HomeStep';
import { BuyFormStep } from './steps/BuyFormStep';
import { OtpStep } from './steps/OtpStep';
import { PayStep } from './steps/PayStep';
import { SuccessStep } from './steps/SuccessStep';
import { ErrorStep } from './steps/ErrorStep';
import type { AddFundsDialogProps } from './types';

export const AddFundsDialog = ({
  open = true,
  apiKey,
  destinationAddress,
  mainnetRpcUrl,
  chains,
  defaultChainId,
  canBuy = false,
  presets,
  onComplete,
  onCancel,
  onError,
}: AddFundsDialogProps) => {
  const isMobile = useIsMobile();

  // Top network selector drives both sections. Default to the connected chain
  // when it's allowed, else the first allowed chain.
  const [selectedChainId, setSelectedChainId] = useState<number>(
    () => (defaultChainId && chains.some((c) => c.id === defaultChainId) ? defaultChainId : chains[0]?.id) ?? 0
  );
  const selectedChain = chains.find((c) => c.id === selectedChainId) ?? chains[0];
  const chainName = selectedChain?.name ?? 'this network';

  const flow = useOnrampFlow({ apiKey, destinationAddress, presets, selectedChainId, onComplete, onError });
  const canBuyOnChain = canBuy && flow.hasOnramp;

  const [code, setCode] = useState('');
  // The home view shows receive + a Buy CTA; tapping it opens the buy form.
  const [showBuy, setShowBuy] = useState(false);

  useEffect(() => {
    if (flow.step === 'otp') setCode('');
  }, [flow.step]);

  const { reset } = flow;
  useEffect(() => {
    if (!open) {
      reset();
      setShowBuy(false);
    }
  }, [open, reset]);

  // Switching to a chain without an onramp drops us back to the receive view.
  useEffect(() => {
    if (!canBuyOnChain) setShowBuy(false);
  }, [canBuyOnChain]);

  // Reverse-resolve the destination to name@chain, like the other dialogs.
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  useEffect(() => {
    if (!destinationAddress || !mainnetRpcUrl) return;
    let cancelled = false;
    reverseResolveAddresses([{ address: destinationAddress, chainId: 1 }], mainnetRpcUrl)
      .then(async (resolved) => {
        const name = resolved[destinationAddress.toLowerCase()];
        if (!name || cancelled) return;
        const label = await getChainLabel(1, mainnetRpcUrl);
        if (!cancelled) setResolvedName(label ? `${name}@${label}` : name);
      })
      .catch(() => {
        /* no name — keep the truncated address */
      });
    return () => {
      cancelled = true;
    };
  }, [destinationAddress, mainnetRpcUrl]);
  const accountDisplay = getDisplayAddress(resolvedName, destinationAddress);

  const amountValid =
    /^(?:0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(flow.form.fiatAmount) &&
    Number(flow.form.fiatAmount) >= flow.bounds.min &&
    Number(flow.form.fiatAmount) <= flow.bounds.max;
  const phoneValid = /^\+1\d{10}$/.test(flow.form.phoneNumber.trim());
  const emailValid = /.+@.+\..+/.test(flow.form.email.trim());
  const canSubmit = canBuyOnChain && !flow.busy && flow.form.accepted && amountValid && phoneValid && emailValid;

  const restart = () => {
    setCode('');
    flow.reset();
  };

  return (
    <DefaultDialog
      open={open}
      onOpenChange={(o) => !o && onCancel()}
      header={
        <div className="flex flex-col gap-2.5 p-3.5">
          <p className="text-muted-foreground text-xs font-bold leading-[100%]">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })} at{' '}
            {new Date().toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              timeZoneName: 'short',
            })}
          </p>
          <p className="text-foreground text-[30px] font-normal leading-[100%]">Add Funds</p>
        </div>
      }
      contentStyle={
        isMobile
          ? { width: '100%', height: '100%', maxWidth: 'none', maxHeight: 'none', overflowY: 'auto' }
          : { width: '500px', minWidth: '500px' }
      }
    >
      {flow.step === 'form' && (!showBuy || !canBuyOnChain) && (
        <HomeStep
          chains={chains}
          selectedChainId={selectedChainId}
          onSelectChain={setSelectedChainId}
          chainName={chainName}
          destinationAddress={destinationAddress}
          ensName={resolvedName}
          canBuyOnChain={canBuyOnChain}
          onBuy={() => setShowBuy(true)}
          onDone={onCancel}
        />
      )}

      {flow.step === 'form' && showBuy && canBuyOnChain && (
        <BuyFormStep flow={flow} chainName={chainName} canSubmit={canSubmit} onBack={() => setShowBuy(false)} />
      )}

      {flow.step === 'otp' && <OtpStep flow={flow} code={code} onCode={setCode} onBack={restart} />}

      {flow.step === 'pay' && flow.payUrl && (
        <PayStep
          flow={flow}
          chainName={chainName}
          accountDisplay={accountDisplay}
          destinationAddress={destinationAddress}
          onCancel={onCancel}
          onRestart={restart}
        />
      )}

      {flow.step === 'success' && flow.order && (
        <SuccessStep order={flow.order} onClose={flow.finishWithCurrentStatus} />
      )}

      {flow.step === 'error' && <ErrorStep error={flow.error} onClose={onCancel} onRetry={restart} />}
    </DefaultDialog>
  );
};

export * from './types';
