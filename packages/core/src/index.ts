/**  Constants **/
export { JAW_KEYS_URL, JAW_PASSKEYS_URL, JAW_RPC_URL, FACTORY_ADDRESS, CONTRACT_NAME, CONTRACT_VERSION } from './constants.js';

/**  SDK Info **/
export { SDK_VERSION, SDK_NAME } from './sdk-info.js';

/** SDK exports **/
export { createJAWSDK, type CreateJAWSDKOptions } from './sdk/index.js';

/**  RPC exports **/
export {
    type SignInWithEthereumCapabilityRequest,
    type SignInWithEthereumCapabilityResponse,
    type WalletConnectRequest,
    type WalletConnectResponse,
    type ViemRPCParams,
    type ViemRPCReturnType,
    SUPPORTED_METHODS,
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
    type ProviderEventCallback,
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
} from './passkey-manager/index.js';

/** Key Manager exports **/
export {
    KeyManager
} from "./key-manager/index.js"

/** Messages exports **/
export * from "./messages/index.js"

/** Utils exports **/
export * from "./utils/index.js"

/** Default export **/
export { createJAWSDK as default } from './sdk/createJAWSDK.js';
