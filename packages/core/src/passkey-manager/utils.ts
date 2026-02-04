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
 * Convert a base64url encoded credential ID to Uint8Array
 * @param credentialId - The base64url encoded credential ID
 * @returns Uint8Array representation of the credential ID
 */
function credentialIdToArrayBuffer(credentialId: string): Uint8Array<ArrayBuffer> {
  const base64 = credentialId.replace(/-/g, "+").replace(/_/g, "/");
  const paddedBase64 = base64 + "==".substring(0, (4 - (base64.length % 4)) % 4);
  const binaryString = atob(paddedBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes as Uint8Array<ArrayBuffer>;
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
  },
  getFn?: PasskeyGetFn
): Promise<WebAuthnAuthenticationResult> {
  // Check if WebAuthn is supported (only if no custom getFn provided)
  if (!getFn && (typeof window === 'undefined' || !window.PublicKeyCredential)) {
    throw new WebAuthnAuthenticationError('WebAuthn is not supported in this environment');
  }
  try {
    // Convert credentialId from base64url to binary format
    const credentialIdArray = credentialIdToArrayBuffer(credentialId);

    // Generate challenge
    const challenge = crypto.getRandomValues(new Uint8Array(32));

    // Build credential request options
    const credentialRequestOptions: CredentialRequestOptions = {
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
    };

    // Use custom getFn if provided (React Native), otherwise use navigator.credentials.get
    const credential = getFn
      ? (await getFn(credentialRequestOptions)) as PublicKeyCredential | null
      : (await navigator.credentials.get(credentialRequestOptions)) as PublicKeyCredential | null;

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


/**
 * Custom create function type for React Native passkey adapters
 * Uses generic types to avoid conflicts with ox/viem internal types
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PasskeyCreateFn = (options?: any) => Promise<any>;

/**
 * Custom get function type for React Native passkey adapters
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PasskeyGetFn = (options?: any) => Promise<any>;

/**
 * Native credential result type for React Native
 * This bypasses viem's createWebAuthnCredential which uses crypto.subtle
 */
export interface NativeCredentialResult {
  id: string;
  publicKey: `0x${string}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any;
}

/**
 * Native create function type that bypasses viem's createWebAuthnCredential
 * Use this for React Native to avoid crypto.subtle compatibility issues
 */
export type NativePasskeyCreateFn = (
  username: string,
  rpId: string,
  rpName: string
) => Promise<NativeCredentialResult>;

export async function createPasskeyUtils(
  username: string,
  rpId: string,
  rpName: string,
  createFn?: PasskeyCreateFn,
  nativeCreateFn?: NativePasskeyCreateFn,
  getFn?: PasskeyGetFn
): Promise<{ credentialId: string; publicKey: `0x${string}`; webAuthnAccount: WebAuthnAccount }> {

  // If native create function is provided, use it directly (bypasses createWebAuthnCredential)
  if (nativeCreateFn) {
    const nativeCredential = await nativeCreateFn(username, rpId, rpName);

    const webAuthnAccount = toWebAuthnAccount({
      credential: nativeCredential,
      getFn, // Pass through for React Native signing
      rpId,
    });

    await registerPasskeyInBackend({
      credentialId: nativeCredential.id,
      publicKey: nativeCredential.publicKey,
      displayName: username,
    });

    return {
      credentialId: nativeCredential.id,
      publicKey: nativeCredential.publicKey,
      webAuthnAccount: webAuthnAccount,
    };
  }

  // Only check for WebAuthn support if no custom createFn is provided (browser environment)
  if (!createFn && (typeof window === 'undefined' || !window.PublicKeyCredential)) {
    throw new PasskeyRegistrationError('WebAuthn is not supported in this environment');
  }

  const credential = await createWebAuthnCredential({
    name: username,
    rp: {
      id: rpId,
      name: rpName,
    },
    createFn, // Pass through custom create function for React Native
  });

  const webAuthnAccount = toWebAuthnAccount({
    credential,
    getFn, // Pass through for React Native signing (undefined on web = uses default)
    rpId,
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


export async function importPasskeyUtils(
  getFn?: PasskeyGetFn,
  rpId?: string
): Promise<ImportWebAuthnAuthenticationResult> {
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));

    // Resolve rpId - use provided value, or default to window.location.hostname in browser
    const resolvedRpId = rpId || (typeof window !== 'undefined' ? window.location.hostname : undefined);

    // Build credential request options (omit allowCredentials to enable discoverable mode)
    // When allowCredentials is undefined, iOS/Android show ALL passkeys for this rpId in a picker
    // When allowCredentials is provided, the OS filters and may auto-select if only one matches
    const credentialRequestOptions: CredentialRequestOptions = {
      publicKey: {
        challenge: challenge,
        rpId: resolvedRpId,
        userVerification: "preferred",
        timeout: 60000,
      },
    };

    // Use custom getFn if provided (React Native), otherwise use navigator.credentials.get
    const credential = getFn
      ? (await getFn(credentialRequestOptions)) as PublicKeyCredential
      : (await navigator.credentials.get(credentialRequestOptions)) as PublicKeyCredential;

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
