/**
 * Passkey Create Adapter
 *
 * Adapter for viem's createWebAuthnCredential to work with react-native-passkeys
 *
 * Usage:
 * ```typescript
 * import { createWebAuthnCredential } from 'viem/account-abstraction';
 * import { createCredentialAdapter } from '@jaw/ui-native/passkey';
 *
 * const credential = await createWebAuthnCredential({
 *   name: 'user@example.com',
 *   rp: { id: 'keys.jaw.id', name: 'JAW' },
 *   createFn: createCredentialAdapter,
 * });
 * ```
 */

import {
  arrayBufferToBase64URL,
  base64URLToArrayBuffer,
  arrayBufferToHex,
} from './utils';

// Types for WebAuthn credential creation
export interface PublicKeyCredentialCreationOptions {
  challenge: ArrayBuffer;
  rp: {
    id?: string;
    name: string;
  };
  user: {
    id: ArrayBuffer;
    name: string;
    displayName: string;
  };
  pubKeyCredParams: Array<{
    type: 'public-key';
    alg: number;
  }>;
  timeout?: number;
  excludeCredentials?: Array<{
    type: 'public-key';
    id: ArrayBuffer;
    transports?: Array<'usb' | 'ble' | 'nfc' | 'internal'>;
  }>;
  authenticatorSelection?: {
    authenticatorAttachment?: 'platform' | 'cross-platform';
    requireResidentKey?: boolean;
    residentKey?: 'discouraged' | 'preferred' | 'required';
    userVerification?: 'discouraged' | 'preferred' | 'required';
  };
  attestation?: 'none' | 'indirect' | 'direct' | 'enterprise';
}

// Types for react-native-passkeys create options
export interface RNPasskeyCreateOptions {
  challenge: string; // Base64URL
  rp: {
    id: string;
    name: string;
  };
  user: {
    id: string; // Base64URL
    name: string;
    displayName: string;
  };
  pubKeyCredParams: Array<{
    type: 'public-key';
    alg: number;
  }>;
  timeout?: number;
  excludeCredentials?: Array<{
    type: 'public-key';
    id: string; // Base64URL
    transports?: Array<string>;
  }>;
  authenticatorSelection?: {
    authenticatorAttachment?: 'platform' | 'cross-platform';
    requireResidentKey?: boolean;
    residentKey?: 'discouraged' | 'preferred' | 'required';
    userVerification?: 'discouraged' | 'preferred' | 'required';
  };
  attestation?: 'none' | 'indirect' | 'direct' | 'enterprise';
}

// Types for react-native-passkeys create response
export interface RNPasskeyCreateResponse {
  id: string; // Base64URL
  rawId: string; // Base64URL
  type: 'public-key';
  response: {
    clientDataJSON: string; // Base64URL
    attestationObject: string; // Base64URL
  };
  authenticatorAttachment?: string;
}

// Types for WebAuthn credential response (what viem expects)
export interface PublicKeyCredential {
  id: string;
  rawId: ArrayBuffer;
  type: 'public-key';
  response: {
    clientDataJSON: ArrayBuffer;
    attestationObject: ArrayBuffer;
    getPublicKey(): ArrayBuffer | null;
    getAuthenticatorData(): ArrayBuffer;
    getTransports(): string[];
  };
  getClientExtensionResults(): Record<string, unknown>;
}

/**
 * Converts viem's credential creation options to react-native-passkeys format
 */
function convertToRNOptions(
  options: PublicKeyCredentialCreationOptions
): RNPasskeyCreateOptions {
  return {
    challenge: arrayBufferToBase64URL(options.challenge),
    rp: {
      id: options.rp.id || 'keys.jaw.id',
      name: options.rp.name,
    },
    user: {
      id: arrayBufferToBase64URL(options.user.id),
      name: options.user.name,
      displayName: options.user.displayName,
    },
    pubKeyCredParams: options.pubKeyCredParams,
    timeout: options.timeout,
    excludeCredentials: options.excludeCredentials?.map((cred) => ({
      type: cred.type,
      id: arrayBufferToBase64URL(cred.id),
      transports: cred.transports,
    })),
    authenticatorSelection: options.authenticatorSelection,
    attestation: options.attestation,
  };
}

/**
 * Converts react-native-passkeys response to WebAuthn credential format
 */
function convertFromRNResponse(
  response: RNPasskeyCreateResponse
): PublicKeyCredential {
  const rawId = base64URLToArrayBuffer(response.rawId);
  const clientDataJSON = base64URLToArrayBuffer(response.response.clientDataJSON);
  const attestationObject = base64URLToArrayBuffer(
    response.response.attestationObject
  );

  return {
    id: response.id,
    rawId,
    type: 'public-key',
    response: {
      clientDataJSON,
      attestationObject,
      getPublicKey: () => {
        // Extract public key from attestationObject if needed
        // For now, return null - viem will extract it from attestationObject
        return null;
      },
      getAuthenticatorData: () => {
        // Extract authenticator data from attestationObject
        // This is a simplified implementation
        return attestationObject;
      },
      getTransports: () => {
        return ['internal'];
      },
    },
    getClientExtensionResults: () => ({}),
  };
}

/**
 * Create credential adapter for react-native-passkeys
 *
 * This function adapts viem's createWebAuthnCredential to work with
 * the react-native-passkeys library
 *
 * @param options - WebAuthn credential creation options (from viem)
 * @returns Promise<PublicKeyCredential> - The created credential
 */
export async function createCredentialAdapter(
  options: CredentialCreationOptions
): Promise<Credential | null> {
  // Dynamically import react-native-passkeys to avoid bundling issues
  // when the adapter is imported but not used
  let Passkey: { create: (options: RNPasskeyCreateOptions) => Promise<RNPasskeyCreateResponse> };

  try {
    // Use destructuring to get the Passkey class from the module namespace
    const module = await import('react-native-passkey');
    Passkey = module.Passkey;
  } catch (error) {
    throw new Error(
      'react-native-passkey is not installed. Please install it with: npm install react-native-passkey'
    );
  }

  if (!options.publicKey) {
    throw new Error('publicKey options are required');
  }

  const publicKeyOptions = options.publicKey as PublicKeyCredentialCreationOptions;

  // Convert options to react-native-passkeys format
  const rnOptions = convertToRNOptions(publicKeyOptions);

  try {
    // Call react-native-passkeys
    const rnResponse = await Passkey.create(rnOptions);

    // Convert response back to WebAuthn format
    const credential = convertFromRNResponse(rnResponse);

    return credential as unknown as Credential;
  } catch (error) {
    // Handle specific passkey errors
    if (error instanceof Error) {
      if (error.message.includes('cancelled') || error.message.includes('canceled')) {
        throw new DOMException('User cancelled the operation', 'NotAllowedError');
      }
      if (error.message.includes('not supported')) {
        throw new DOMException('Passkeys not supported on this device', 'NotSupportedError');
      }
    }
    throw error;
  }
}

export type { PublicKeyCredentialCreationOptions, PublicKeyCredential };
