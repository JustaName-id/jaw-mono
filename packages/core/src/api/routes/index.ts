import { PasskeyRoutes, PASSKEY_ROUTE } from './passkey.js';

/**
 * All API routes combined
 */
export type ROUTES = PasskeyRoutes;

/**
 * Route paths mapped to their keys
 */
export const Routes: Record<keyof ROUTES, string> = {
  REGISTER_PASSKEY: PASSKEY_ROUTE,
  LOOKUP_PASSKEYS: PASSKEY_ROUTE,
};

export { PASSKEY_ROUTE } from './passkey.js';
export type { PasskeyRoutes } from './passkey.js';
