import {WebAuthnAccount} from "viem/account-abstraction";

export interface PasskeyCredential {
  id: string
  name: string
  credential: {
    id: string
    publicKey: `0x${string}`
    raw?: unknown
    [key: string]: unknown
  }
}

export interface PasskeyAccount {
  creationDate: string;
  credentialId: string;
  isImported: boolean;
  username: string;
}

export interface AuthCheckResult {
  isAuthenticated: boolean;
  address?: string;
}

export interface AuthState {
  isLoggedIn: boolean;
  address: string;
  credentialId: string;
  timestamp: number;
}

export interface PasskeyRegistrationRequest {
  credentialId: string
  publicKey: string
  displayName: string
}

export interface LookupPasskeysRequest {
  credentialIds: string[];
}

export interface PasskeyLookupResponse {
  credentialId: string
  publicKey: string
  displayName: string
}

export interface BackendResponse<T> {
  statusCode: number
  result: {
    data: T
    error: null | string
  }
}

export interface PasskeysByCredIdsResponse {
  passkeys: PasskeyLookupResponse[]
}

export interface PasskeyConfig {
  mode?: 'app-specific' | 'cross-platform'
  serverUrl?: string
  apiKey?: string
  keysOrigin?: string
}

export type ExtendedWebAuthnAccount = Omit<WebAuthnAccount, 'sign'> & {
  sign(
      parameters: Parameters<WebAuthnAccount['sign']>[0],
      options?: { popup?: Window }
  ): ReturnType<WebAuthnAccount['sign']>
}