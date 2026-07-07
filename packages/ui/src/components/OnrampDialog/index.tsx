'use client';

import { useEffect, useState } from 'react';
import { DefaultDialog } from '../DefaultDialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { Spinner } from '../ui/spinner';
import { useIsMobile } from '../../hooks';
import { useOnrampFlow } from '../../hooks/useOnrampFlow';
import { formatAddress, getDisplayAddress, getChainLabel, reverseResolveAddresses } from '../../utils';
import type { OnrampDialogProps } from './types';

const COINBASE_TERMS = 'https://www.coinbase.com/legal/guest-checkout/us';
const COINBASE_USER_AGREEMENT = 'https://www.coinbase.com/legal/user_agreement';
const COINBASE_PRIVACY = 'https://www.coinbase.com/legal/privacy';

// The widget renders just a pay button when ready; when Apple Pay is
// unavailable in the browser it falls back to a full QR experience instead.
const PAY_FRAME_HEIGHT = { loading: 'h-0', ready: 'h-16', qr: 'h-[420px]', failed: 'h-0' } as const;

export const OnrampDialog = ({
  open = true,
  apiKey,
  destinationAddress,
  mainnetRpcUrl,
  presets,
  onComplete,
  onCancel,
  onError,
}: OnrampDialogProps) => {
  const isMobile = useIsMobile();
  const flow = useOnrampFlow({ apiKey, destinationAddress, presets, onComplete, onError });
  const [code, setCode] = useState('');

  const asset = presets?.cryptoCurrency ?? 'USDC';
  const network = presets?.network ?? 'Base';

  // Reverse-resolve the destination to a name (name@chain) like the other
  // dialogs; falls back to a truncated address when there's no name.
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

  const amountValid = /^(?:0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(flow.form.fiatAmount) && Number(flow.form.fiatAmount) > 0;
  const phoneValid = /^\+1\d{10}$/.test(flow.form.phoneNumber.trim());
  const emailValid = /.+@.+\..+/.test(flow.form.email.trim());
  const canSubmit = !flow.busy && flow.form.accepted && amountValid && phoneValid && emailValid;

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
          <p className="text-foreground text-[30px] font-normal leading-[100%]">Buy Crypto</p>
          <p className="text-muted-foreground text-sm">
            {asset} on {network} · Guest checkout by Coinbase
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
              overflowY: 'auto',
            }
          : {
              width: '500px',
              minWidth: '500px',
            }
      }
    >
      {/* ---- FORM ---- */}
      {flow.step === 'form' && (
        <form
          className="flex flex-col justify-between gap-6 max-md:h-full"
          onSubmit={(e) => {
            e.preventDefault();
            void flow.submitForm();
          }}
        >
          <div className="flex flex-col gap-3">
            <div className="border-border flex flex-col gap-3 rounded-[6px] border p-3.5">
              <div className="flex flex-col gap-1.5">
                <Label className="text-foreground text-xs font-bold leading-[133%]">Amount (USD)</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="2"
                  max="500"
                  step="0.01"
                  placeholder="25"
                  value={flow.form.fiatAmount}
                  onChange={(e) => flow.setForm({ fiatAmount: e.target.value })}
                />
                <p className="text-muted-foreground text-xs font-normal">Min $2 · Max $500</p>
              </div>
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
              <div className="bg-border h-[1px] w-full flex-shrink-0 rounded-full" />
              <div className="flex flex-col gap-1.5">
                <Label className="text-foreground text-xs font-bold leading-[133%]">Phone (US)</Label>
                <Input
                  type="tel"
                  placeholder="+12025550123"
                  value={flow.form.phoneNumber}
                  onChange={(e) => flow.setForm({ phoneNumber: e.target.value })}
                />
              </div>
            </div>

            <div className="border-border flex flex-col gap-0.5 rounded-[6px] border p-3.5">
              <p className="text-foreground text-xs font-bold leading-[133%]">To your account</p>
              <p className="text-foreground break-all text-base font-normal leading-[150%]" title={destinationAddress}>
                {accountDisplay}
              </p>
            </div>

            <label className="flex cursor-pointer items-start gap-2">
              <Checkbox
                checked={flow.form.accepted}
                onCheckedChange={(c) => flow.setForm({ accepted: c === true })}
                className="mt-0.5"
              />
              <span className="text-foreground text-xs font-medium leading-[150%]">
                I agree to Coinbase&apos;s{' '}
                <a className="text-primary hover:underline" href={COINBASE_TERMS} target="_blank" rel="noreferrer">
                  Guest Checkout Terms
                </a>
                ,{' '}
                <a
                  className="text-primary hover:underline"
                  href={COINBASE_USER_AGREEMENT}
                  target="_blank"
                  rel="noreferrer"
                >
                  User Agreement
                </a>{' '}
                and{' '}
                <a className="text-primary hover:underline" href={COINBASE_PRIVACY} target="_blank" rel="noreferrer">
                  Privacy Policy
                </a>
                .
              </span>
            </label>

            {flow.error && (
              <div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">{flow.error}</div>
            )}
          </div>

          <div className="flex flex-shrink-0 gap-3 p-3.5 max-md:mt-auto">
            <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
              Cancel
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
            void flow.submitOtp(code);
          }}
        >
          <div className="flex flex-col gap-3">
            <div className="border-border flex flex-col gap-1.5 rounded-[6px] border p-3.5">
              <Label className="text-foreground text-xs font-bold leading-[133%]">Verification code</Label>
              <Input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
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
            <Button type="submit" className="flex-1" disabled={flow.busy || !/^\d{4,8}$/.test(code)}>
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
                  {flow.order?.cryptoCurrency ?? asset}
                </p>
                <p className="text-muted-foreground text-xs leading-[133%]">on {flow.order?.network ?? network}</p>
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
                <p className="text-foreground text-xs font-bold leading-[133%]">
                  {flow.payStatus === 'qr' ? 'Scan to pay' : 'Pay with Apple Pay or Google Pay'}
                </p>
                {flow.payStatus === 'loading' && (
                  <div className="flex flex-row items-center gap-2">
                    <Spinner />
                    <p className="text-muted-foreground text-sm">Preparing secure payment…</p>
                  </div>
                )}
                {flow.payStatus === 'qr' && (
                  <p className="text-muted-foreground text-sm">
                    Apple Pay isn&apos;t available in this browser. Scan the QR code with your phone to finish paying.
                  </p>
                )}
                {/* Kept mounted while loading (h-0) so the widget can boot and emit load_* events. */}
                <div className={`overflow-hidden rounded-[6px] bg-white ${PAY_FRAME_HEIGHT[flow.payStatus]}`}>
                  <iframe
                    key={flow.iframeKey}
                    ref={flow.iframeRef}
                    title="Coinbase guest checkout"
                    src={flow.payUrl}
                    allow="payment"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    referrerPolicy="no-referrer"
                    className="h-full w-full"
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
              <>
                <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
                  Cancel
                </Button>
                <Button type="button" className="flex-1" onClick={flow.finishWithCurrentStatus}>
                  Done
                </Button>
              </>
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
