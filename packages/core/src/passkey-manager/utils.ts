import { restCall } from "../api/index.js";
import type { PasskeyRegistrationRequest, PasskeyLookupResponse } from "./types.js";

/**
 * Custom error for passkey registration failures
 */
export class PasskeyRegistrationError extends Error {
  constructor(message: string, public override readonly cause?: unknown) {
    super(message);
    this.name = 'PasskeyRegistrationError';
  }
}

/**
 * Custom error for passkey lookup failures
 */
export class PasskeyLookupError extends Error {
  constructor(message: string, public override readonly cause?: unknown) {
    super(message);
    this.name = 'PasskeyLookupError';
  }
}

/**
 * Register a passkey with the backend
 * @param request - The passkey registration request
 * @param apiKey - Optional API key for authentication
 * @param dev - Whether to use the staging environment
 * @param serverUrl - Optional custom server URL (defaults to https://api.justaname.id/wallet/v2/passkeys)
 * @throws {PasskeyRegistrationError} If registration fails
 */
export async function registerPasskeyInBackend(
  request: PasskeyRegistrationRequest,
  apiKey?: string,
  dev?: boolean,
  serverUrl?: string
): Promise<void> {
  try {
    await restCall(
      'REGISTER_PASSKEY',
      'POST',
      request,
      apiKey ? { 'x-api-key': apiKey } : {},
      dev,
      serverUrl
    );
  } catch (error) {
    throw new PasskeyRegistrationError(
      `Failed to register passkey: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error
    );
  }
}

/**
 * Lookup a single passkey by credential ID from the backend
 * @param credentialId - The credential ID to lookup
 * @param apiKey - Optional API key for authentication
 * @param dev - Whether to use the staging environment
 * @param serverUrl - Optional custom server URL (defaults to https://api.justaname.id/wallet/v2/passkeys)
 * @throws {PasskeyLookupError} If lookup fails or passkey not found
 */
export async function lookupPasskeyFromBackend(
  credentialId: string,
  apiKey?: string,
  dev?: boolean,
  serverUrl?: string
): Promise<PasskeyLookupResponse> {
  try {
    const response = await restCall(
      'LOOKUP_PASSKEYS',
      'GET',
      { credentialIds: [credentialId] },
      apiKey ? { 'x-api-key': apiKey } : {},
      dev,
      serverUrl
    );

    if (!response.passkeys || response.passkeys.length === 0) {
      throw new PasskeyLookupError(`Passkey not found for credential ID: ${credentialId}`);
    }

    const passkey = response.passkeys[0];
    if (!passkey) {
      throw new PasskeyLookupError(`Passkey not found for credential ID: ${credentialId}`);
    }

    return passkey;
  } catch (error) {
    if (error instanceof PasskeyLookupError) {
      throw error;
    }
    throw new PasskeyLookupError(
      `Failed to lookup passkey: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error
    );
  }
}
