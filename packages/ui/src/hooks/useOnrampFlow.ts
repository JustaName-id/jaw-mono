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

// Native Apple Pay is Safari-only on the web (`window.ApplePaySession`). Where
// it's absent (Chrome/Brave/Firefox), the widget's button opens an in-frame QR
// instead of a native sheet, so that's the only case where we grow the frame.
const hasNativeApplePay = (): boolean => typeof window !== 'undefined' && 'ApplePaySession' in window;

/** Pay-step scenario:
 *  - 'loading'/'ready': the compact "Buy with Apple/Google Pay" button.
 *  - 'failed': a genuinely terminal load error (region/asset/expired link).
 * The frame grows only when the user taps into the widget (see `expanded`), so
 * the button stays compact until pressed. */
export type OnrampPayStatus = 'loading' | 'ready' | 'failed';

export interface OnrampFormState {
  fiatAmount: string;
  email: string;
  phoneNumber: string;
  accepted: boolean;
  /** Selected pair (catalogue ids). Seeded from presets, then defaulted to the
   * catalogue's first allowlisted pair once options load; '' until then. */
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
  // The frame is a compact button until the user taps into the widget. It grows
  // ONLY when Apple Pay is unsupported (`needsQr`) — then the tap opens an
  // in-frame QR that needs room. On Safari the tap opens the native sheet, so it
  // stays a compact button. The iframe is cross-origin, so the tap is detected
  // via focus moving into it (see effect).
  const [expanded, setExpanded] = useState(false);
  const [needsQr, setNeedsQr] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  // Supported-options catalogue (allowlist ∩ provider catalogue). Advisory:
  // drives the displayed asset/network and amount bounds; the dialog falls
  // back to its static defaults while loading or when the fetch fails —
  // /start re-validates everything server-side anyway.
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
        // Default an unset selection to the first allowlisted pair — never
        // override a preset or a choice the user already made.
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
          // Selected pair (seeded from presets); omit when unset so the
          // backend defaults from its allowlist.
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
        // A 400/409 means the backend killed the session (wrong code, expired,
        // or a concurrent flow on the same phone) — retrying validate-otp with
        // the same sessionId always fails. Drop it and return to the form so
        // the next Continue starts a fresh session. Not automatic: /start is
        // rate-limited per phone.
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
      if (parsed.name === ONRAMP_EVENT.LOAD_SUCCESS) {
        setPayStatus((s) => (s === 'failed' ? s : 'ready'));
      } else if (parsed.name === ONRAMP_EVENT.LOAD_ERROR) {
        if (parsed.errorCode === ONRAMP_ERROR_CODE.APPLE_PAY_NOT_SUPPORTED) {
          // NOT fatal on web: the widget renders a button that opens its QR
          // overlay in-frame on tap. Stay compact but arm the grow-on-tap so the
          // QR gets room (also covers browsers ApplePaySession detection missed).
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
  }, [step, onComplete, onError]);

  // Fallback: reveal the frame if the widget never emits load_success within a
  // few seconds (missed/blocked message), so the pay button can't be trapped
  // behind the "Preparing…" spinner. A later load_error still overrides this.
  useEffect(() => {
    if (step !== 'pay' || payStatus !== 'loading') return;
    const timer = setTimeout(() => setPayStatus((s) => (s === 'loading' ? 'ready' : s)), 6000);
    return () => clearTimeout(timer);
  }, [step, payStatus, iframeKey]);

  // When Apple Pay is unsupported, the widget's button opens an in-frame QR, so
  // grow the frame the moment the user taps into it. Only armed for that case —
  // on Safari the tap opens the native sheet and the button stays compact. The
  // iframe is cross-origin, so we detect the tap via focus moving into it.
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
