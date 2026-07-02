'use client';

import { useState } from 'react';
import { DefaultDialog } from '../DefaultDialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { Spinner } from '../ui/spinner';
import { useIsMobile } from '../../hooks';
import { useOnrampFlow } from '../../hooks/useOnrampFlow';
import type { OnrampDialogProps } from './types';

const COINBASE_TERMS = 'https://www.coinbase.com/legal/guest-checkout/us';
const COINBASE_USER_AGREEMENT = 'https://www.coinbase.com/legal/user_agreement';
const COINBASE_PRIVACY = 'https://www.coinbase.com/legal/privacy';

const truncate = (addr: string) => (addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr);

export const OnrampDialog = ({
  open = true,
  apiKey,
  destinationAddress,
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

  const amountValid = /^(?:0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(flow.form.fiatAmount) && Number(flow.form.fiatAmount) > 0;
  const phoneValid = /^\+1\d{10}$/.test(flow.form.phoneNumber.trim());
  const emailValid = /.+@.+\..+/.test(flow.form.email.trim());
  const canSubmit = !flow.busy && flow.form.accepted && amountValid && phoneValid && emailValid;

  return (
    <DefaultDialog
      open={open}
      onOpenChange={(o) => !o && onCancel()}
      header={
        <div className="flex flex-col gap-1 p-3.5">
          <p className="text-foreground text-[26px] font-medium leading-[100%]">Buy crypto</p>
          <p className="text-muted-foreground text-sm">
            {asset} on {network} · guest checkout
          </p>
        </div>
      }
      contentStyle={
        isMobile
          ? { width: '100%', height: '100%', maxWidth: 'none', maxHeight: 'none' }
          : { width: '460px', minWidth: '460px' }
      }
    >
      <div className="flex flex-col gap-4 px-3.5 pb-3.5">
        {/* ---- FORM ---- */}
        {flow.step === 'form' && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void flow.submitForm();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label className="text-foreground text-xs font-bold">Amount (USD)</Label>
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
              <p className="text-muted-foreground text-[11px]">Min $2 · Max $500</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-foreground text-xs font-bold">Email</Label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={flow.form.email}
                onChange={(e) => flow.setForm({ email: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-foreground text-xs font-bold">Phone (US)</Label>
              <Input
                type="tel"
                placeholder="+12025550123"
                value={flow.form.phoneNumber}
                onChange={(e) => flow.setForm({ phoneNumber: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-foreground text-xs font-bold">To your account</Label>
              <div
                className="bg-card border-border text-muted-foreground truncate rounded-[6px] border px-3 py-2 font-mono text-xs"
                title={destinationAddress}
              >
                {truncate(destinationAddress)}
              </div>
            </div>

            <label className="text-muted-foreground flex items-start gap-2 text-[11px] leading-snug">
              <Checkbox
                checked={flow.form.accepted}
                onCheckedChange={(c) => flow.setForm({ accepted: c === true })}
                className="mt-0.5"
              />
              <span>
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

            {flow.error && <p className="text-destructive text-sm">{flow.error}</p>}

            <div className="mt-1 flex gap-2">
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
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void flow.submitOtp(code);
            }}
          >
            <p className="text-muted-foreground text-sm">Enter the code sent to {flow.form.phoneNumber.trim()}.</p>
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
            {flow.error && <p className="text-destructive text-sm">{flow.error}</p>}
            <div className="mt-1 flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setCode('');
                  flow.reset();
                }}
              >
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
          <div className="flex flex-col gap-3">
            <p className="text-muted-foreground text-sm">Complete your purchase with Apple Pay or Google Pay.</p>
            <div className="border-border overflow-hidden rounded-[12px] border bg-white">
              <iframe
                ref={flow.iframeRef}
                title="Coinbase guest checkout"
                src={flow.payUrl}
                allow="payment"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                referrerPolicy="no-referrer"
                className="h-[480px] w-full"
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="button" className="flex-1" onClick={flow.finishWithCurrentStatus}>
                Done
              </Button>
            </div>
          </div>
        )}

        {/* ---- SUCCESS ---- */}
        {flow.step === 'success' && flow.order && (
          <div className="flex flex-col gap-3">
            <p className="text-foreground text-lg font-medium">Purchase complete</p>
            <div className="bg-card border-border flex flex-col gap-1.5 rounded-[6px] border p-3 text-sm">
              {flow.order.cryptoAmount && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Received</span>
                  <span className="text-foreground font-medium">
                    {flow.order.cryptoAmount} {flow.order.cryptoCurrency}
                  </span>
                </div>
              )}
              {flow.order.txHash && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Tx</span>
                  <span className="text-foreground break-all font-mono text-xs">{truncate(flow.order.txHash)}</span>
                </div>
              )}
            </div>
            <Button type="button" onClick={flow.finishWithCurrentStatus}>
              Close
            </Button>
          </div>
        )}

        {/* ---- ERROR ---- */}
        {flow.step === 'error' && (
          <div className="flex flex-col gap-3">
            <p className="text-destructive text-sm">{flow.error ?? 'Payment failed.'}</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
                Close
              </Button>
              <Button
                type="button"
                className="flex-1"
                onClick={() => {
                  setCode('');
                  flow.reset();
                }}
              >
                Try again
              </Button>
            </div>
          </div>
        )}
      </div>
    </DefaultDialog>
  );
};
