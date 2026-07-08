import type { OnrampOptions, OnrampOrder } from '@jaw.id/core';
import type { StartOnrampRequest, StartOnrampResponse, ValidateOtpRequest, ValidateOtpResponse } from './types';

// The proxy wraps every response as { statusCode, result: { data, error } }
// (ResponseTransformInterceptor). Mirror core/api/axiosController.ts's unwrap.
interface Envelope<T> {
  statusCode?: number;
  result?: { data: T | null; error: string | null };
}

export class OnrampApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'OnrampApiError';
  }
}

// `baseUrl` is required (callers pass JAW_ONRAMP_URL) so this module carries no
// runtime import of @jaw.id/core — only type-only ones — keeping the test's
// module graph free of cross-package runtime code.
async function call<T>(
  method: 'GET' | 'POST',
  path: string,
  apiKey: string,
  baseUrl: string,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = { 'x-api-key': apiKey };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  let parsed: Envelope<T> | null = null;
  try {
    parsed = (await res.json()) as Envelope<T>;
  } catch {
    /* non-JSON error body */
  }

  const data = parsed?.result?.data ?? null;
  const error = parsed?.result?.error ?? null;

  if (!res.ok || data === null) {
    throw new OnrampApiError(error ?? `Onramp request failed (${res.status})`, res.status);
  }
  return data;
}

export function startOnramp(body: StartOnrampRequest, apiKey: string, baseUrl: string): Promise<StartOnrampResponse> {
  return call<StartOnrampResponse>('POST', '/start', apiKey, baseUrl, body);
}

export function validateOtp(body: ValidateOtpRequest, apiKey: string, baseUrl: string): Promise<ValidateOtpResponse> {
  return call<ValidateOtpResponse>('POST', '/validate-otp', apiKey, baseUrl, body);
}

export function getOnrampOrder(orderId: string, apiKey: string, baseUrl: string): Promise<OnrampOrder> {
  return call<OnrampOrder>('GET', `/orders/${encodeURIComponent(orderId)}`, apiKey, baseUrl);
}

/** Supported tokens/networks and fiat limits (allowlist ∩ provider catalogue, cached server-side). */
export function getOnrampOptions(apiKey: string, baseUrl: string): Promise<OnrampOptions> {
  return call<OnrampOptions>('GET', '/options', apiKey, baseUrl);
}
