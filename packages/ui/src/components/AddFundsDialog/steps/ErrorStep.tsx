'use client';

import { Button } from '../../ui/button';
import { ErrorBanner, StepLayout } from '../primitives';

/** Terminal error: close or restart the buy. */
export function ErrorStep({
  error,
  onClose,
  onRetry,
}: {
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <StepLayout
      footer={
        <>
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            Close
          </Button>
          <Button type="button" className="flex-1" onClick={onRetry}>
            Try again
          </Button>
        </>
      }
    >
      <ErrorBanner>{error ?? 'Payment failed.'}</ErrorBanner>
    </StepLayout>
  );
}
