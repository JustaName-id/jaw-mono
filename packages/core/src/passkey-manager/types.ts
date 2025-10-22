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
  publicKey: `0x${string}`;
}

export interface AuthCheckResult {
  isAuthenticated: boolean;
  address?: string;
}

export interface AuthState {
  isLoggedIn: boolean;
  address: string;
  credentialId: string;
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