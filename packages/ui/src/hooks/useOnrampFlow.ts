import { useCallback, useEffect, useRef, useState } from 'react';
import { JAW_ONRAMP_URL, type OnrampOptions, type OnrampOrder, type OnrampParams } from '@jaw.id/core';
import { startOnramp, validateOtp, getOnrampOptions, OnrampApiError } from '../utils/onramp/client';
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

// Native Apple Pay is Safari-only on web; elsewhere the widget's button opens
// an in-frame QR, which is the only case where the frame grows.
const hasNativeApplePay = (): boolean => typeof window !== 'undefined' && 'ApplePaySession' in window;

export type OnrampPayStatus = 'loading' | 'ready' | 'failed';

export interface OnrampFormState {
  fiatAmount: string;
  email: string;
  phoneNumber: string;
  accepted: boolean;
  /** Selected pair (catalogue ids); '' until presets or options seed it. */
  cryptoCurrency: string;
  network: string;
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
  // Frame grows only when Apple Pay is unsupported (`needsQr`): the tap opens an
  // in-frame QR that needs room. Detected via focus moving into the iframe.
  const [expanded, setExpanded] = useState(false);
  const [needsQr, setNeedsQr] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  // Advisory: drives displayed asset/network/bounds; /start re-validates.
  const [options, setOptions] = useState<OnrampOptions | null>(null);
  const [form, setFormState] = useState<OnrampFormState>({
    fiatAmount: presets?.fiatAmount ?? '25',
    email: '',
    phoneNumber: '+1',
    accepted: false,
    cryptoCurrency: presets?.cryptoCurrency ?? '',
    network: presets?.network?.toLowerCase() ?? '',
  });
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const setForm = useCallback((patch: Partial<OnrampFormState>) => setFormState((f) => ({ ...f, ...patch })), []);

  useEffect(() => {
    let cancelled = false;
    getOnrampOptions(apiKey, JAW_ONRAMP_URL)
      .then((o) => {
        if (cancelled) return;
        setOptions(o);
        // Default an unset selection to the first pair; never override a choice.
        const first = o.tokens[0];
        if (first) {
          setFormState((f) => ({
            ...f,
            cryptoCurrency: f.cryptoCurrency || first.symbol,
            network: f.network || (first.networks[0]?.network ?? ''),
          }));
        }
      })
      .catch(() => {
        /* advisory only — keep the static defaults */
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

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
          // Omit when unset so the backend defaults from its allowlist.
          cryptoCurrency: form.cryptoCurrency || undefined,
          network: form.network || undefined,
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
        setExpanded(false);
        setNeedsQr(!hasNativeApplePay());
        setStep('pay');
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Invalid code';
        // 400/409 means the session is dead; retrying it always fails, so drop
        // it and return to the form for a fresh /start.
        if (e instanceof OnrampApiError && (e.status === 400 || e.status === 409)) {
          setSessionId(null);
          setStep('form');
          setError(`${message} — press Continue to get a new code.`);
        } else {
          setError(message);
        }
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
    setExpanded(false);
    setNeedsQr(false);
    setSessionId(null);
  }, []);

  /** Re-load the payment link after a recoverable load_error (e.g. Apple Pay just set up). */
  const retryPay = useCallback(() => {
    setPayError(null);
    setPayStatus('loading');
    setExpanded(false);
    setNeedsQr(!hasNativeApplePay());
    setIframeKey((k) => k + 1);
  }, []);

  // Gate widget events on origin: the `onramp_api.` prefix is forgeable, so
  // without this any co-resident frame could post a fake polling_success and
  // resolve wallet_onramp before payment. Origin (not e.source) because the
  // widget posts from nested frames that share the payUrl origin.
  useEffect(() => {
    if (step !== 'pay' || !payUrl) return;
    let payOrigin: string;
    try {
      payOrigin = new URL(payUrl).origin;
    } catch {
      return;
    }
    function onMessage(e: MessageEvent) {
      if (e.origin !== payOrigin) return;
      const parsed = parseOnrampEvent(e.data);
      if (!parsed) return;
      if (parsed.name === ONRAMP_EVENT.LOAD_SUCCESS) {
        setPayStatus((s) => (s === 'failed' ? s : 'ready'));
      } else if (parsed.name === ONRAMP_EVENT.LOAD_ERROR) {
        if (parsed.errorCode === ONRAMP_ERROR_CODE.APPLE_PAY_NOT_SUPPORTED) {
          // Not fatal on web: the button opens an in-frame QR on tap. Stay
          // compact but arm the grow-on-tap so the QR gets room.
          setPayStatus((s) => (s === 'failed' ? s : 'ready'));
          setNeedsQr(true);
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
  }, [step, payUrl, onComplete, onError]);

  // Reveal the button if load_success never arrives, so it can't stay trapped
  // behind the spinner. A later load_error still overrides this.
  useEffect(() => {
    if (step !== 'pay' || payStatus !== 'loading') return;
    const timer = setTimeout(() => setPayStatus((s) => (s === 'loading' ? 'ready' : s)), 6000);
    return () => clearTimeout(timer);
  }, [step, payStatus, iframeKey]);

  // Grow the frame when the user taps into the QR button (focus moves into the
  // cross-origin iframe). Only armed when Apple Pay is unsupported.
  useEffect(() => {
    if (step !== 'pay' || expanded || !needsQr) return;
    function onBlur() {
      setTimeout(() => {
        if (document.activeElement === iframeRef.current) setExpanded(true);
      }, 0);
    }
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [step, expanded, needsQr]);

  return {
    step,
    busy,
    error,
    order,
    payUrl,
    payStatus,
    payError,
    expanded,
    iframeKey,
    options,
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
