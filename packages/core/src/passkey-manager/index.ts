export { PasskeyManager } from "./passkeyManager.js";
export type {
  PasskeyCredential,
  PasskeyAccount,
  AuthCheckResult,
  AuthState,
  PasskeyRegistrationRequest,
  PasskeyLookupResponse,
  BackendResponse,
  PasskeysByCredIdsResponse,
  LookupPasskeysRequest,
} from "./types.js";
export {
  registerPasskeyInBackend,
  lookupPasskeyFromBackend,
  PasskeyRegistrationError,
  PasskeyLookupError,
  WebAuthnAuthenticationError,
  type WebAuthnAuthenticationResult,
  type PasskeyCreateFn,
  type PasskeyGetFn,
  type NativePasskeyCreateFn,
  type NativeCredentialResult,
  type ImportWebAuthnAuthenticationResult,
  type WebAuthnCredentialResult,
  resolveRpId,
} from "./utils.js";
