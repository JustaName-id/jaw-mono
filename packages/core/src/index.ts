/**  Constants **/
export { JAW_KEYS_URL, JAW_PASSKEYS_URL, JAW_RPC_URL, FACTORY_ADDRESS, CONTRACT_NAME, CONTRACT_VERSION, SPEND_PERMISSIONS_MANAGER_ADDRESS } from './constants.js';

/**  SDK Info **/
export { SDK_VERSION, SDK_NAME } from './sdk-info.js';

/** SDK exports **/
export { create, JAW, type CreateJAWSDKOptions } from './sdk/index.js';

/**  RPC exports **/
export {
    type SignInWithEthereumCapabilityRequest,
    type SignInWithEthereumCapabilityResponse,
    type SubnameTextRecordCapabilityRequest,
    type WalletConnectRequest,
    type WalletConnectResponse,
    type ViemRPCParams,
    type ViemRPCReturnType,
    type SpendPermission,
    type SpendPeriod,
    type SpendPermissionDetail,
    type PermissionsDetail,
    type WalletGrantPermissionsRequest,
    type WalletGrantPermissionsResponse,
    type WalletRevokePermissionsRequest,
    type RevokePermissionApiResponse,
    grantPermissions,
    revokePermission,
    getPermissionFromRelay,
    spend,
} from './rpc/index.js';

/**  Account exports **/
export * from './account/index.js';

/**  Error exports **/
export * from './errors/index.js';

/** Provider exports **/
export {
    type RequestArguments,
    type ProviderRpcError,
    type ProviderConnectInfo,
    type ProviderInterface,
    type AppMetadata,
    type JawProviderPreference,
    type ModeType,
    type ProviderEventCallback,
    Mode,
    JAWProvider,
    createJAWProvider,
    type CreateProviderOptions
} from './provider/index.js';

/** Passkey Manager exports **/
export {
    PasskeyManager,
    type PasskeyCredential,
    type PasskeyAccount,
    type AuthCheckResult,
    type AuthState,
    type PasskeyRegistrationRequest,
    type PasskeyLookupResponse,
    type BackendResponse,
    type PasskeysByCredIdsResponse,
    type LookupPasskeysRequest,
    type WebAuthnAuthenticationResult,
    WebAuthnAuthenticationError,
} from './passkey-manager/index.js';

/** Key Manager exports **/
export {
    KeyManager
} from "./key-manager/index.js"

/** Messages exports **/
export * from "./messages/index.js"

/** Utils exports **/
export * from "./utils/index.js"

/** Store exports **/
export {type Chain} from "./store/index.js"

/** Default export **/
export { create as default } from './sdk/createJAWSDK.js';
