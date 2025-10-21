import { restCall } from "../api/index.js";
import type { PasskeyRegistrationRequest, PasskeyLookupResponse } from "./types.js";

/**
 * Register a passkey with the backend
 */
export async function registerPasskeyInBackend(
  request: PasskeyRegistrationRequest,
  apiKey?: string,
  dev?: boolean
): Promise<void> {
  await restCall(
    'REGISTER_PASSKEY',
    'POST',
    request,
    apiKey ? { 'x-api-key': apiKey } : {},
    dev
  );
}

/**
 * Lookup a single passkey by credential ID from the backend
 */
export async function lookupPasskeyFromBackend(
  credentialId: string,
  apiKey?: string,
  dev?: boolean
): Promise<PasskeyLookupResponse> {
  const response = await restCall(
    'LOOKUP_PASSKEYS',
    'GET',
    { credentialIds: [credentialId] },
    apiKey ? { 'x-api-key': apiKey } : {},
    dev
  );

  if (!response.passkeys || response.passkeys.length === 0) {
    throw new Error('Passkey not found');
  }

  const passkey = response.passkeys[0];
  if (!passkey) {
    throw new Error('Passkey not found');
  }

  return passkey;
}
