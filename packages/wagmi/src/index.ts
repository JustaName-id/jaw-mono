// Connector
export {
  jawWallet,
  type JawWalletParameters,
  type WalletConnectCapabilities,
  type AccountWithCapabilities,
} from './lib/Connector.js';

// Actions namespace
export * as Actions from './lib/Actions.js';

// Hooks namespace
export * as Hooks from './lib/Hooks.js';

// Query namespace
export * as Query from './lib/Query.js';

// Also export individual hooks for convenience
export {
  useConnect,
  useDisconnect,
  useGrantPermissions,
  useRevokePermissions,
  usePermissions,
} from './lib/Hooks.js';

// Also export individual actions for convenience
export {
  connect,
  disconnect,
  grantPermissions,
  getPermissions,
  revokePermissions,
} from './lib/Actions.js';

// Also export query keys for convenience
export { getPermissionsQueryKey } from './lib/Query.js';
