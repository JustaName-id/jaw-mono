/**  Constants **/
export { JAW_RPC_URL, JAW_PAYMASTER_URL, JAW_WALLET_ICON, JAW_WALLET_NAME, JAW_WALLET_ID, JAW_WALLET_RDNS } from './constants.js';

/**  SDK Info **/
export { SDK_VERSION, SDK_NAME } from './sdk-info.js';

/** SDK exports **/
export { create, JAW, type CreateJAWSDKOptions } from './sdk/index.js';

/**  RPC types and utilities **/
export {
    // Capability types
    type SignInWithEthereumCapabilityRequest,
    type SignInWithEthereumCapabilityResponse,
    type SubnameTextRecordCapabilityRequest,
    type SubnameTextRecordCapabilityResponse,
    // Wallet connect types
    type WalletConnectCapabilities,
    type WalletConnectRequest,
    type WalletConnectResponse,
    // Viem RPC types
    type ViemRPCParams,
    type ViemRPCReturnType,
    // Permission types (used with Account.grantPermissions/revokePermission)
    type Permission,
    type SpendPeriod,
    type SpendPermissionDetail,
    type CallPermissionDetail,
    type PermissionsDetail,
    type PaymasterServiceCapability,
    type RequestCapabilities,
    type WalletGrantPermissionsRequest,
    type WalletGrantPermissionsResponse,
    type WalletGetPermissionsResponse,
    type WalletRevokePermissionsRequest,
    type RevokePermissionApiResponse,
    // Permission utilities for UI (fetching permission details without Account instance)
    getPermissionFromRelay,
    // Permission call builder (for gas estimation)
    buildGrantPermissionCall,
    // Capability utilities
    handleGetCapabilitiesRequest,
    // Permission selector constants
    ANY_TARGET,
    ANY_FN_SEL,
    EMPTY_CALLDATA_FN_SEL,
    // Asset types (EIP-7811 wallet_getAssets)
    type AssetType,
    type AssetMetadata,
    type Asset,
    type AssetFilterEntry,
    type AssetFilter,
    type WalletGetAssetsParams,
    type WalletGetAssetsResponse,
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
    type CreateProviderOptions,
} from './provider/index.js';

/** Passkey types (used with Account class) **/
export {
    type PasskeyAccount,
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
export {type Chain, type FeeToken, type FeeTokenCapability} from "./store/index.js"

/** Analytics exports **/
export {
    logAccountIssuance,
    type LogAccountIssuanceParams,
    type IssuanceType,
} from "./analytics/index.js"

/** UI Handler exports (for app-specific mode) **/
export type {
    UIHandler,
    UIHandlerConfig,
    UIRequest,
    UIResponse,
    UIRequestType,
    ConnectUIRequest,
    SignatureUIRequest,
    TypedDataUIRequest,
    TransactionUIRequest,
    PermissionUIRequest,
    RevokePermissionUIRequest,
    SendTransactionUIRequest,
    WalletSignUIRequest,
    UIHandlerOptions,
    BaseUIRequest,
    PermissionsCapability,
    PaymasterConfig,
    PersonalSignRequestData,
    TypedDataRequestData,
} from './ui/interface.js';

export { UIError, UIErrorCode } from './ui/interface.js';

/** Default export **/
export { create as default } from './sdk/createJAWSDK.js';
