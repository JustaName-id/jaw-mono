'use client';

import { Button } from '../../ui/button';
import { Spinner } from '../../ui/spinner';
import { OtpInput, OTP_LENGTH } from '../OtpInput';
import { ErrorBanner, Section, StepLayout } from '../primitives';
import type { OnrampFlow } from '../../../hooks/useOnrampFlow';

/** Enter the SMS code that unlocks the payment link. */
export function OtpStep({
  flow,
  code,
  onCode,
  onBack,
}: {
  flow: OnrampFlow;
  code: string;
  onCode: (v: string) => void;
  onBack: () => void;
}) {
  return (
    <StepLayout
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length === OTP_LENGTH) void flow.submitOtp(code);
      }}
      footer={
        <>
          <Button type="button" variant="outline" className="flex-1" onClick={onBack}>
            Back
          </Button>
          <Button type="submit" className="flex-1" disabled={flow.busy || code.length !== OTP_LENGTH}>
            {flow.busy ? <Spinner /> : 'Verify'}
          </Button>
        </>
      }
    >
      <Section title="Verification code" className="gap-2.5">
        <OtpInput value={code} onChange={onCode} disabled={flow.busy} />
        <p className="text-muted-foreground text-xs font-normal">
          Enter the code sent to {flow.form.phoneNumber.trim()}.
        </p>
      </Section>
      {flow.error && <ErrorBanner>{flow.error}</ErrorBanner>}
    </StepLayout>
  );
}
