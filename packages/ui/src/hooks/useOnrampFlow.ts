import { useCallback, useEffect, useRef, useState } from 'react';
import { JAW_ONRAMP_URL, type OnrampOrder, type OnrampParams } from '@jaw.id/core';
import { startOnramp, validateOtp } from '../utils/onramp/client';
import { parseOnrampEvent, isTerminalSuccess, isTerminalError } from '../utils/onramp/events';

export type OnrampStep = 'form' | 'otp' | 'pay' | 'success' | 'error';

export interface OnrampFormState {
  fiatAmount: string;
  email: string;
  phoneNumber: string;
  accepted: boolean;
}

export interface UseOnrampFlowArgs {
  apiKey: string;
  destinationAddress: string;
  presets?: OnrampParams;
  onComplete: (order: OnrampOrder) => void;
  onError: (error: Error) => void;
}

export function useOnrampFlow({ apiKey, destinationAddress, presets, onComplete, onError }: UseOnrampFlowArgs) {
  const [step, setStep] = useState<OnrampStep>('form');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<OnrampOrder | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [form, setFormState] = useState<OnrampFormState>({
    fiatAmount: presets?.fiatAmount ?? '25',
    email: '',
    phoneNumber: '+1',
    accepted: false,
  });
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const setForm = useCallback((patch: Partial<OnrampFormState>) => setFormState((f) => ({ ...f, ...patch })), []);

  const submitForm = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await startOnramp(
        {
          phoneNumber: form.phoneNumber.trim(),
          email: form.email.trim(),
          fiatAmount: form.fiatAmount,
          destinationAddress,
          fiatCurrency: presets?.fiatCurrency,
          cryptoCurrency: presets?.cryptoCurrency,
          network: presets?.network,
          paymentMethodHint: presets?.paymentMethodHint,
        },
        apiKey,
        JAW_ONRAMP_URL
      );
      setSessionId(res.sessionId);
      setStep('otp');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start onramp');
    } finally {
      setBusy(false);
    }
  }, [apiKey, destinationAddress, form, presets]);

  const submitOtp = useCallback(
    async (code: string) => {
      if (!sessionId) return;
      setBusy(true);
      setError(null);
      try {
        const res = await validateOtp({ sessionId, code }, apiKey, JAW_ONRAMP_URL);
        setOrder(res.order);
        setPayUrl(res.embeddable.url);
        setStep('pay');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Invalid code');
      } finally {
        setBusy(false);
      }
    },
    [apiKey, sessionId]
  );

  const finishWithCurrentStatus = useCallback(() => {
    if (order) onComplete(order);
  }, [order, onComplete]);

  const reset = useCallback(() => {
    setStep('form');
    setError(null);
    setOrder(null);
    setPayUrl(null);
    setSessionId(null);
  }, []);

  // Listen for the Coinbase pay widget's post-message events, but only from the
  // pay iframe (ignore the SDK's own postMessage channel and any other frame).
  useEffect(() => {
    if (step !== 'pay') return;
    function onMessage(e: MessageEvent) {
      if (iframeRef.current && e.source !== iframeRef.current.contentWindow) return;
      const parsed = parseOnrampEvent(e.data);
      if (!parsed) return;
      if (isTerminalSuccess(parsed.name)) {
        setOrder((o) => {
          const completed = o ? ({ ...o, status: 'COMPLETED' } as OnrampOrder) : o;
          if (completed) onComplete(completed);
          return completed;
        });
        setStep('success');
      } else if (isTerminalError(parsed.name)) {
        const message = parsed.errorMessage ?? parsed.errorCode ?? 'Payment failed';
        setError(message);
        setStep('error');
        onError(new Error(message));
      }
      // commit_success / load_* are reflected via UI/order status only.
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [step, onComplete, onError]);

  return {
    step,
    busy,
    error,
    order,
    payUrl,
    form,
    setForm,
    submitForm,
    submitOtp,
    finishWithCurrentStatus,
    reset,
    iframeRef,
  };
}
