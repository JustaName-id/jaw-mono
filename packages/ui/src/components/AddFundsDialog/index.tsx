'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { DefaultDialog } from '../DefaultDialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Spinner } from '../ui/spinner';
import { useIsMobile } from '../../hooks';
import { useOnrampFlow } from '../../hooks/useOnrampFlow';
import { formatAddress, getDisplayAddress, getChainLabel, reverseResolveAddresses } from '../../utils';
import { Receive } from './Receive';
import { PayButton } from './PayButton';
import type { AddFundsDialogProps } from './types';

const COINBASE_TERMS = 'https://www.coinbase.com/legal/guest-checkout/us';
const COINBASE_USER_AGREEMENT = 'https://www.coinbase.com/legal/user_agreement';
const COINBASE_PRIVACY = 'https://www.coinbase.com/legal/privacy';

// Compact crop IS the button: the iframe is over-scanned 32px per side so the
// widget's margins fall outside the pill window. It grows for the QR on tap.
const PAY_FRAME_COMPACT = 'h-10 rounded-full';
const PAY_FRAME_EXPANDED = 'h-[440px] rounded-[6px]';
const PAY_IFRAME_COMPACT = 'left-[-32px] w-[calc(100%+64px)]';
const PAY_IFRAME_EXPANDED = 'left-0 w-full';

const OTP_LENGTH = 6;

function OtpInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? '');
  const focusBox = (i: number) => refs.current[Math.min(Math.max(i, 0), OTP_LENGTH - 1)]?.focus();
  const setDigit = (i: number, d: string) => {
    if (i < 0) return;
    const next = digits.slice();
    next[i] = d;
    onChange(next.join('').slice(0, OTP_LENGTH));
  };

  return (
    <div className="flex gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          disabled={disabled}
          value={d}
          onChange={(e) => {
            const digit = e.target.value.replace(/\D/g, '').slice(-1);
            if (!digit) return;
            setDigit(i, digit);
            focusBox(i + 1);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace') {
              e.preventDefault();
              if (digits[i]) setDigit(i, '');
              else {
                setDigit(i - 1, '');
                focusBox(i - 1);
              }
            } else if (e.key === 'ArrowLeft') {
              focusBox(i - 1);
            } else if (e.key === 'ArrowRight') {
              focusBox(i + 1);
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
            if (!pasted) return;
            onChange(pasted);
            focusBox(pasted.length);
          }}
          className="border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 text-foreground h-12 w-full min-w-0 rounded-md border bg-transparent text-center text-lg font-medium outline-none transition-[color,box-shadow] focus-visible:ring-[1px] disabled:cursor-not-allowed disabled:opacity-50"
        />
      ))}
    </div>
  );
}

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
  const flow = useOnrampFlow({ apiKey, destinationAddress, presets, onComplete, onError });
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

  // Top network selector drives both sections. Default to the connected chain
  // when it's allowed, else the first allowed chain.
  const [selectedChainId, setSelectedChainId] = useState<number>(
    () => (defaultChainId && chains.some((c) => c.id === defaultChainId) ? defaultChainId : chains[0]?.id) ?? 0
  );
  const selectedChain = chains.find((c) => c.id === selectedChainId) ?? chains[0];
  const chainName = selectedChain?.name ?? 'this network';

  // Onramp availability for the selected chain, matched on chainId (options
  // networks carry chainId). Buyable tokens = tokens sold on this chain.
  const buyableTokens = useMemo(
    () => (flow.options?.tokens ?? []).filter((t) => t.networks.some((n) => Number(n.chainId) === selectedChainId)),
    [flow.options, selectedChainId]
  );
  const onrampNetwork = useMemo(
    () =>
      (flow.options?.tokens ?? []).flatMap((t) => t.networks).find((n) => Number(n.chainId) === selectedChainId)
        ?.network,
    [flow.options, selectedChainId]
  );
  const canBuyOnChain = canBuy && buyableTokens.length > 0 && !!onrampNetwork;
  const buyableSig = buyableTokens.map((t) => t.symbol).join(',');

  // Keep the onramp flow's network/token in sync with the selected chain.
  useEffect(() => {
    if (!canBuyOnChain || !onrampNetwork) return;
    flow.setForm({
      network: onrampNetwork,
      cryptoCurrency: buyableTokens.some((t) => t.symbol === flow.form.cryptoCurrency)
        ? flow.form.cryptoCurrency
        : (buyableTokens[0]?.symbol ?? ''),
    });
  }, [selectedChainId, canBuyOnChain, onrampNetwork, buyableSig]);

  // Switching to a chain without an onramp drops us back to the receive view.
  useEffect(() => {
    if (!canBuyOnChain) setShowBuy(false);
  }, [canBuyOnChain]);

  const asset = flow.form.cryptoCurrency || buyableTokens[0]?.symbol || 'USDC';

  const fiat = presets?.fiatCurrency?.toUpperCase() ?? 'USD';
  // Envelope across payment methods: the widget picks the method at pay time.
  const fiatLimits = flow.options?.fiatCurrencies.find((c) => c.currency === fiat)?.limits;
  const bounds = fiatLimits?.length
    ? {
        min: Math.min(...fiatLimits.map((l) => Number(l.min))),
        max: Math.max(...fiatLimits.map((l) => Number(l.max))),
      }
    : { min: 2, max: 500 };

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
    Number(flow.form.fiatAmount) >= bounds.min &&
    Number(flow.form.fiatAmount) <= bounds.max;
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
      {/* ---- HOME: network + buy CTA + receive ---- */}
      {flow.step === 'form' && (!showBuy || !canBuyOnChain) && (
        <div className="flex flex-col justify-between gap-6 max-md:h-full">
          <div className="flex flex-col gap-3">
            {/* Network selector (drives both sections) */}
            <div className="border-border flex flex-col gap-1.5 rounded-[6px] border p-3.5">
              <Label className="text-foreground text-xs font-bold leading-[133%]">Network</Label>
              <Select value={String(selectedChainId)} onValueChange={(v) => setSelectedChainId(Number(v))}>
                <SelectTrigger>
                  <SelectValue placeholder={chainName} />
                </SelectTrigger>
                <SelectContent>
                  {chains.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Receive address={destinationAddress} chainName={chainName} ensName={resolvedName} />

            {/* Buy CTA below receive — only when the chain has an onramp-supported token */}
            {canBuyOnChain && (
              <div className="border-border flex flex-col gap-2.5 rounded-[6px] border p-3.5">
                <p className="text-foreground text-xs font-bold leading-[133%]">Or buy on {chainName}</p>
                <PayButton onClick={() => setShowBuy(true)} />
              </div>
            )}
          </div>

          <div className="flex flex-shrink-0 gap-3 p-3.5 max-md:mt-auto">
            <Button type="button" variant="outline" className="w-full" onClick={onCancel}>
              Done
            </Button>
          </div>
        </div>
      )}

      {/* ---- BUY FORM: token/amount/contact/terms → OTP → pay ---- */}
      {flow.step === 'form' && showBuy && canBuyOnChain && (
        <form
          className="flex flex-col justify-between gap-6 max-md:h-full"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) void flow.submitForm();
          }}
        >
          <div className="flex flex-col gap-3">
            <div className="border-border flex flex-col gap-3 rounded-[6px] border p-3.5">
              <p className="text-foreground text-xs font-bold leading-[133%]">Buy on {chainName}</p>
              <div className="flex flex-row gap-4">
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label className="text-foreground text-xs font-bold leading-[133%]">Token</Label>
                  <Select value={asset} onValueChange={(v) => flow.setForm({ cryptoCurrency: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder={asset} />
                    </SelectTrigger>
                    <SelectContent>
                      {buyableTokens.map((t) => (
                        <SelectItem key={t.symbol} value={t.symbol}>
                          {t.symbol}
                          {t.name && t.name !== t.symbol ? ` — ${t.name}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="bg-border min-h-[40px] w-[1px]" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label className="text-foreground text-xs font-bold leading-[133%]">Amount ({fiat})</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={String(bounds.min)}
                    max={String(bounds.max)}
                    step="0.01"
                    placeholder="25"
                    value={flow.form.fiatAmount}
                    onChange={(e) => flow.setForm({ fiatAmount: e.target.value })}
                  />
                </div>
              </div>
              <p className="text-muted-foreground text-xs font-normal">
                Min ${bounds.min} · Max ${bounds.max}
              </p>
              <div className="bg-border h-[1px] w-full flex-shrink-0 rounded-full" />
              <div className="flex flex-col gap-1.5">
                <Label className="text-foreground text-xs font-bold leading-[133%]">Email</Label>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={flow.form.email}
                  onChange={(e) => flow.setForm({ email: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-foreground text-xs font-bold leading-[133%]">Phone (US)</Label>
                <Input
                  type="tel"
                  placeholder="+12025550123"
                  value={flow.form.phoneNumber}
                  onChange={(e) => flow.setForm({ phoneNumber: e.target.value })}
                />
              </div>
              <label className="flex cursor-pointer items-start gap-2">
                <Checkbox
                  checked={flow.form.accepted}
                  onCheckedChange={(c) => flow.setForm({ accepted: c === true })}
                  className="mt-0.5"
                />
                <span className="text-foreground text-xs font-medium leading-[150%]">
                  I agree to Coinbase&apos;s{' '}
                  <a className="text-primary underline" href={COINBASE_TERMS} target="_blank" rel="noreferrer">
                    Guest Checkout Terms
                  </a>
                  ,{' '}
                  <a className="text-primary underline" href={COINBASE_USER_AGREEMENT} target="_blank" rel="noreferrer">
                    User Agreement
                  </a>{' '}
                  and{' '}
                  <a className="text-primary underline" href={COINBASE_PRIVACY} target="_blank" rel="noreferrer">
                    Privacy Policy
                  </a>
                  .
                </span>
              </label>
              {flow.error && (
                <div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">{flow.error}</div>
              )}
            </div>
          </div>

          <div className="flex flex-shrink-0 gap-3 p-3.5 max-md:mt-auto">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowBuy(false)}>
              Back
            </Button>
            <Button type="submit" className="flex-1" disabled={!canSubmit}>
              {flow.busy ? <Spinner /> : 'Continue'}
            </Button>
          </div>
        </form>
      )}

      {/* ---- OTP ---- */}
      {flow.step === 'otp' && (
        <form
          className="flex flex-col justify-between gap-6 max-md:h-full"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length === OTP_LENGTH) void flow.submitOtp(code);
          }}
        >
          <div className="flex flex-col gap-3">
            <div className="border-border flex flex-col gap-2.5 rounded-[6px] border p-3.5">
              <Label className="text-foreground text-xs font-bold leading-[133%]">Verification code</Label>
              <OtpInput value={code} onChange={setCode} disabled={flow.busy} />
              <p className="text-muted-foreground text-xs font-normal">
                Enter the code sent to {flow.form.phoneNumber.trim()}.
              </p>
            </div>
            {flow.error && (
              <div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">{flow.error}</div>
            )}
          </div>
          <div className="flex flex-shrink-0 gap-3 p-3.5 max-md:mt-auto">
            <Button type="button" variant="outline" className="flex-1" onClick={restart}>
              Back
            </Button>
            <Button type="submit" className="flex-1" disabled={flow.busy || code.length !== OTP_LENGTH}>
              {flow.busy ? <Spinner /> : 'Verify'}
            </Button>
          </div>
        </form>
      )}

      {/* ---- PAY ---- */}
      {flow.step === 'pay' && flow.payUrl && (
        <div className="flex flex-col justify-between gap-6 max-md:h-full">
          <div className="flex flex-col gap-3">
            <div className="border-border flex flex-row items-center justify-between gap-2.5 rounded-[6px] border p-3.5">
              <div className="text-foreground flex flex-1 flex-col gap-0.5">
                <p className="text-xs font-bold leading-[133%]">Amount</p>
                <p className="text-base font-normal leading-[150%]">
                  ${flow.order?.fiatAmount ?? flow.form.fiatAmount} {flow.order?.fiatCurrency ?? 'USD'}
                </p>
              </div>
              <div className="bg-border h-full min-h-[50px] w-[1px] rounded-full" />
              <div className="text-foreground flex flex-1 flex-col gap-0.5">
                <p className="text-xs font-bold leading-[133%]">Receiving</p>
                <p className="text-base font-normal leading-[150%]">
                  {flow.order?.cryptoAmount ? `${flow.order.cryptoAmount} ` : ''}
                  {flow.order?.cryptoCurrency ?? asset}{' '}
                  <span className="text-muted-foreground text-sm">on {chainName}</span>
                </p>
              </div>
            </div>

            <div className="border-border flex flex-col gap-0.5 rounded-[6px] border p-3.5">
              <p className="text-foreground text-xs font-bold leading-[133%]">To your account</p>
              <p className="text-foreground break-all text-base font-normal leading-[150%]" title={destinationAddress}>
                {accountDisplay}
              </p>
            </div>

            {flow.payStatus === 'failed' && flow.payError ? (
              <div className="border-destructive/30 bg-destructive/10 flex flex-col gap-1 rounded-[6px] border p-3.5">
                <p className="text-destructive text-xs font-bold leading-[133%]">Payment unavailable</p>
                <p className="text-foreground text-xs font-normal leading-[150%]">{flow.payError.message}</p>
              </div>
            ) : (
              <div className="border-border flex flex-col gap-2.5 rounded-[6px] border p-3.5">
                <div className="flex flex-row items-center justify-between gap-2">
                  <p className="text-foreground text-xs font-bold leading-[133%]">Pay with Apple Pay or Google Pay</p>
                  {flow.payStatus === 'loading' && (
                    <div className="flex flex-row items-center gap-1.5">
                      <Spinner />
                      <p className="text-muted-foreground text-xs">Loading…</p>
                    </div>
                  )}
                </div>
                {/* Iframe stays full height; only the crop window grows on tap.
                    Resizing before the click would reflow the widget and eat it. */}
                <div
                  className={`relative w-full overflow-hidden transition-[height,border-radius] duration-300 ${
                    flow.expanded ? PAY_FRAME_EXPANDED : PAY_FRAME_COMPACT
                  }`}
                >
                  <iframe
                    key={flow.iframeKey}
                    ref={flow.iframeRef}
                    title="Coinbase guest checkout"
                    src={flow.payUrl}
                    allow="payment"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    referrerPolicy="no-referrer"
                    className={`absolute top-1/2 h-[440px] -translate-y-1/2 border-0 ${
                      flow.expanded ? PAY_IFRAME_EXPANDED : PAY_IFRAME_COMPACT
                    }`}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-shrink-0 gap-3 p-3.5 max-md:mt-auto">
            {flow.payStatus === 'failed' && flow.payError ? (
              <>
                <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
                  Close
                </Button>
                {flow.payError.retry === 'reload' && (
                  <Button type="button" className="flex-1" onClick={flow.retryPay}>
                    Try again
                  </Button>
                )}
                {flow.payError.retry === 'restart' && (
                  <Button type="button" className="flex-1" onClick={restart}>
                    Edit details
                  </Button>
                )}
              </>
            ) : (
              // No "Done": success auto-resolves via polling_success.
              <Button type="button" variant="outline" className="w-full" onClick={onCancel}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ---- SUCCESS ---- */}
      {flow.step === 'success' && flow.order && (
        <div className="flex flex-col justify-between gap-6 max-md:h-full">
          <div className="flex flex-col gap-3">
            <div className="bg-success/10 text-success rounded-lg p-3 text-sm">Purchase complete</div>
            <div className="border-border flex flex-col gap-3 rounded-[6px] border p-3.5">
              {flow.order.cryptoAmount && (
                <div className="text-foreground flex flex-col gap-0.5">
                  <p className="text-xs font-bold leading-[133%]">Received</p>
                  <p className="text-base font-normal leading-[150%]">
                    {flow.order.cryptoAmount} {flow.order.cryptoCurrency}
                  </p>
                </div>
              )}
              {flow.order.cryptoAmount && flow.order.txHash && (
                <div className="bg-border h-[1px] w-full flex-shrink-0 rounded-full" />
              )}
              {flow.order.txHash && (
                <div className="text-foreground flex flex-col gap-0.5">
                  <p className="text-xs font-bold leading-[133%]">Transaction</p>
                  <p className="break-all text-base font-normal leading-[150%]" title={flow.order.txHash}>
                    {formatAddress(flow.order.txHash)}
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-shrink-0 gap-3 p-3.5 max-md:mt-auto">
            <Button type="button" className="flex-1" onClick={flow.finishWithCurrentStatus}>
              Close
            </Button>
          </div>
        </div>
      )}

      {/* ---- ERROR ---- */}
      {flow.step === 'error' && (
        <div className="flex flex-col justify-between gap-6 max-md:h-full">
          <div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
            {flow.error ?? 'Payment failed.'}
          </div>
          <div className="flex flex-shrink-0 gap-3 p-3.5 max-md:mt-auto">
            <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
              Close
            </Button>
            <Button type="button" className="flex-1" onClick={restart}>
              Try again
            </Button>
          </div>
        </div>
      )}
    </DefaultDialog>
  );
};

export * from './types';
