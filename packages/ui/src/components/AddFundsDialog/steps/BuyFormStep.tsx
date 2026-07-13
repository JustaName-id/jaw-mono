'use client';

import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Checkbox } from '../../ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Spinner } from '../../ui/spinner';
import { ErrorBanner, FieldLabel, Section, StepLayout } from '../primitives';
import type { OnrampFlow } from '../../../hooks/useOnrampFlow';

const COINBASE_TERMS = 'https://www.coinbase.com/legal/guest-checkout/us';
const COINBASE_USER_AGREEMENT = 'https://www.coinbase.com/legal/user_agreement';
const COINBASE_PRIVACY = 'https://www.coinbase.com/legal/privacy';

/** Collect token / amount / contact / terms, then kick off the OTP. */
export function BuyFormStep({
  flow,
  chainName,
  canSubmit,
  onBack,
}: {
  flow: OnrampFlow;
  chainName: string;
  canSubmit: boolean;
  onBack: () => void;
}) {
  const { form, setForm, buyableTokens, bounds, asset, fiat } = flow;
  return (
    <StepLayout
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) void flow.submitForm();
      }}
      footer={
        <>
          <Button type="button" variant="outline" className="flex-1" onClick={onBack}>
            Back
          </Button>
          <Button type="submit" className="flex-1" disabled={!canSubmit}>
            {flow.busy ? <Spinner /> : 'Continue'}
          </Button>
        </>
      }
    >
      <Section title={`Buy on ${chainName}`}>
        <div className="flex flex-row gap-4">
          <div className="flex flex-1 flex-col gap-1.5">
            <FieldLabel>Token</FieldLabel>
            <Select value={asset} onValueChange={(v) => setForm({ cryptoCurrency: v })}>
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
            <FieldLabel>Amount ({fiat})</FieldLabel>
            <Input
              type="number"
              inputMode="decimal"
              min={String(bounds.min)}
              max={String(bounds.max)}
              step="0.01"
              placeholder="25"
              value={form.fiatAmount}
              onChange={(e) => setForm({ fiatAmount: e.target.value })}
            />
          </div>
        </div>
        <p className="text-muted-foreground text-xs font-normal">
          Min ${bounds.min} · Max ${bounds.max}
        </p>
        <div className="bg-border h-[1px] w-full flex-shrink-0 rounded-full" />
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Email</FieldLabel>
          <Input
            type="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => setForm({ email: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Phone (US)</FieldLabel>
          <Input
            type="tel"
            placeholder="+12025550123"
            value={form.phoneNumber}
            onChange={(e) => setForm({ phoneNumber: e.target.value })}
          />
        </div>
        <label className="flex cursor-pointer items-start gap-2">
          <Checkbox
            checked={form.accepted}
            onCheckedChange={(c) => setForm({ accepted: c === true })}
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
        {flow.error && <ErrorBanner>{flow.error}</ErrorBanner>}
      </Section>
    </StepLayout>
  );
}
