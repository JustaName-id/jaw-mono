import { createWebAuthnCredential, toWebAuthnAccount } from "viem/account-abstraction";
import { restCall } from "../api/index.js";
import type { PasskeyRegistrationRequest, PasskeyLookupResponse } from "./types.js";
import type { WebAuthnAccount } from "viem/account-abstraction";

/**
 * WebAuthn authentication result
 */
export interface WebAuthnAuthenticationResult {
  credential: PublicKeyCredential;
  challenge: Uint8Array;
}

export interface ImportWebAuthnAuthenticationResult {
  name: string;
  credential: {
    id: string;
    publicKey: `0x${string}`;
  };
}

/**
 * Custom error for WebAuthn authentication failures
 */
export class WebAuthnAuthenticationError extends Error {
  constructor(message: string, public override readonly cause?: unknown) {
    super(message);
    this.name = 'WebAuthnAuthenticationError';
  }
}

/**
 * Authenticate with a WebAuthn passkey
 * @param credentialId - The base64url encoded credential ID
 * @param rpId - The relying party identifier (e.g., domain name)
 * @param options - Optional authentication options
 * @returns WebAuthn authentication result with credential and challenge
 * @throws {WebAuthnAuthenticationError} If authentication fails
 */
export async function authenticateWithWebAuthnUtils(
  rpId: string,
  credentialId: string,
  options?: {
    userVerification?: UserVerificationRequirement;
    timeout?: number;
    transports?: AuthenticatorTransport[];
  }
): Promise<WebAuthnAuthenticationResult> {
  // Check if WebAuthn is supported
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    throw new WebAuthnAuthenticationError('WebAuthn is not supported in this environment');
  }
  try {
    // Convert credentialId from base64url to binary format
    const base64 = credentialId.replace(/-/g, "+").replace(/_/g, "/");
    const paddedBase64 = base64 + "==".substring(0, (4 - (base64.length % 4)) % 4);
    const credentialIdArray = Uint8Array.from(atob(paddedBase64), (c) => c.charCodeAt(0));

    // Generate challenge
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    // Perform WebAuthn authentication
    const credential = (await navigator.credentials.get({
      publicKey: {
        challenge: challenge,
        rpId: rpId,
        allowCredentials: [{
          id: credentialIdArray,
          type: "public-key",
          transports: options?.transports ?? ["internal", "hybrid"],
        }],
        userVerification: options?.userVerification ?? "preferred",
        timeout: options?.timeout ?? 60000,
      },
    })) as PublicKeyCredential | null;

    if (!credential) {
      throw new WebAuthnAuthenticationError("Failed to authenticate with specified passkey");
    }

    return {
      credential,
      challenge,
    };
  } catch (error) {
    if (error instanceof WebAuthnAuthenticationError) {
      throw error;
    }
    throw new WebAuthnAuthenticationError(
      `WebAuthn authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error
    );
  }
}


export async function createPasskeyUtils(
  username: string,
  rpId: string,
  rpName: string
): Promise<{ credentialId: string; publicKey: `0x${string}`; webAuthnAccount: WebAuthnAccount }> {

  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    throw new PasskeyRegistrationError('WebAuthn is not supported in this environment');
  }

  const credential = await createWebAuthnCredential({
    name: username,
    rp: {
      id: rpId,
      name: rpName,
    },
  });

  const webAuthnAccount = toWebAuthnAccount({
    credential,
  });

  await registerPasskeyInBackend({
    credentialId: credential.id,
    publicKey: credential.publicKey,
    displayName: username,
  },
);


  return {
    credentialId: credential.id,
    publicKey: credential.publicKey,
    webAuthnAccount: webAuthnAccount,
  };
}


export async function importPasskeyUtils(): Promise<ImportWebAuthnAuthenticationResult> {
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));

    const credential = (await navigator.credentials.get({
      publicKey: {
        challenge: challenge,
        userVerification: "preferred",
        timeout: 60000,
      },
    })) as PublicKeyCredential;
    if (!credential) {
      throw new Error("No credential selected");
    }

    // credential.id is already the base64url-encoded version of rawId
    const passkeyData = await lookupPasskeyFromBackend(credential.id);

    return {
      name: passkeyData.displayName || "Passkey",
      credential: {
        id: credential.id,
        publicKey: passkeyData.publicKey,
      }
    };
  } catch (error) {
    throw new PasskeyLookupError(
      `Failed to import passkey: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error
    );
  }
}

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
      undefined,
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
      undefined,
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
