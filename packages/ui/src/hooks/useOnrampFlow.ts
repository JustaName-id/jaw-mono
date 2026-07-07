import { useCallback, useEffect, useRef, useState } from 'react';
import { JAW_ONRAMP_URL, type OnrampOrder, type OnrampParams } from '@jaw.id/core';
import { startOnramp, validateOtp } from '../utils/onramp/client';
import {
  parseOnrampEvent,
  isTerminalSuccess,
  isTerminalError,
  describeLoadError,
  ONRAMP_EVENT,
  ONRAMP_ERROR_CODE,
  type OnrampLoadError,
} from '../utils/onramp/events';

export type OnrampStep = 'form' | 'otp' | 'pay' | 'success' | 'error';

/** Pay-step scenario, driven by the widget's load_* events: loading until the
 * pay button renders, 'qr' when the browser falls back to an Apple Pay QR code. */
export type OnrampPayStatus = 'loading' | 'ready' | 'qr' | 'failed';

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
  const [payStatus, setPayStatus] = useState<OnrampPayStatus>('loading');
  const [payError, setPayError] = useState<OnrampLoadError | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
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
        setPayStatus('loading');
        setPayError(null);
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
    setPayStatus('loading');
    setPayError(null);
    setSessionId(null);
  }, []);

  /** Re-load the payment link after a recoverable load_error (e.g. Apple Pay just set up). */
  const retryPay = useCallback(() => {
    setPayError(null);
    setPayStatus('loading');
    setIframeKey((k) => k + 1);
  }, []);

  // Listen for the Coinbase pay widget's post-message events. We trust the
  // `onramp_api.` name filter in parseOnrampEvent rather than checking
  // e.source: the widget can post from a nested frame, so a strict
  // `e.source === iframe.contentWindow` check silently drops load_success and
  // leaves the button hidden behind the spinner forever.
  useEffect(() => {
    if (step !== 'pay') return;
    function onMessage(e: MessageEvent) {
      const parsed = parseOnrampEvent(e.data);
      if (!parsed) return;
      if (parsed.name === ONRAMP_EVENT.LOAD_PENDING) {
        setPayStatus((s) => (s === 'qr' ? s : 'loading'));
      } else if (parsed.name === ONRAMP_EVENT.LOAD_SUCCESS) {
        setPayStatus((s) => (s === 'qr' ? s : 'ready'));
      } else if (parsed.name === ONRAMP_EVENT.LOAD_ERROR) {
        if (parsed.errorCode === ONRAMP_ERROR_CODE.APPLE_PAY_NOT_SUPPORTED) {
          // Not an error on web: the widget falls back to an Apple Pay QR code,
          // so give the frame room to render it instead of failing.
          setPayStatus('qr');
        } else {
          setPayError(describeLoadError(parsed.errorCode, parsed.errorMessage));
          setPayStatus('failed');
        }
      } else if (isTerminalSuccess(parsed.name)) {
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
      // commit_success is reflected via order status only.
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [step, onComplete, onError]);

  // Fallback: reveal the frame if the widget never emits load_success within a
  // few seconds (missed/blocked message), so the pay button can't be trapped
  // behind the "Preparing…" spinner. A later load_error still overrides this.
  useEffect(() => {
    if (step !== 'pay' || payStatus !== 'loading') return;
    const timer = setTimeout(() => setPayStatus((s) => (s === 'loading' ? 'ready' : s)), 6000);
    return () => clearTimeout(timer);
  }, [step, payStatus, iframeKey]);

  return {
    step,
    busy,
    error,
    order,
    payUrl,
    payStatus,
    payError,
    iframeKey,
    form,
    setForm,
    submitForm,
    submitOtp,
    finishWithCurrentStatus,
    reset,
    retryPay,
    iframeRef,
  };
}
