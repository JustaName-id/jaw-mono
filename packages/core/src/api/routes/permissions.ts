import type {
  StorePermissionApiRequest,
  StorePermissionApiResponse,
  RevokePermissionApiResponse,
} from '../../rpc/permissions.js';

/**
 * Permissions API routes
 */
export const PERMISSIONS_ROUTE = '/permissions';

/**
 * Route definitions for permissions operations
 */
export interface PermissionsRoutes {
  STORE_PERMISSION: {
    request: StorePermissionApiRequest;
    response: StorePermissionApiResponse;
    headers: { 'x-api-key': string };
    pathParams?: never;
  };
  GET_PERMISSION: {
    request: Record<string, never>;
    response: StorePermissionApiResponse;
    headers: { 'x-api-key': string };
    pathParams: { hash: string };
  };
  DELETE_PERMISSION: {
    request: Record<string, never>;
    response: RevokePermissionApiResponse;
    headers: { 'x-api-key': string };
    pathParams: { hash: string };
  };
}