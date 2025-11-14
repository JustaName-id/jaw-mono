import { PasskeyRoutes, PASSKEY_ROUTE } from './passkey.js';
import { PermissionsRoutes, PERMISSIONS_ROUTE } from './permissions.js';

/**
 * All API routes combined
 */
export type ROUTES = PasskeyRoutes & PermissionsRoutes;

/**
 * Route paths mapped to their keys
 * Routes with dynamic segments use colon-prefixed parameters (e.g., :hash)
 */
export const Routes: Record<keyof ROUTES, string> = {
  REGISTER_PASSKEY: PASSKEY_ROUTE,
  LOOKUP_PASSKEYS: PASSKEY_ROUTE,
  STORE_PERMISSION: PERMISSIONS_ROUTE,
  GET_PERMISSION: `${PERMISSIONS_ROUTE}/:hash`,
  DELETE_PERMISSION: `${PERMISSIONS_ROUTE}/:hash`,
};

export { PASSKEY_ROUTE } from './passkey.js';
export type { PasskeyRoutes } from './passkey.js';
export { PERMISSIONS_ROUTE } from './permissions.js';
export type { PermissionsRoutes } from './permissions.js';
