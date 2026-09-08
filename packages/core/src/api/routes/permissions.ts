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
        // Optional here and required on its siblings: this is the only relay read
        // a dApp makes for itself. The writes are made where a key is always present.
        headers: { 'x-api-key'?: string };
        pathParams: { hash: string };
    };
    DELETE_PERMISSION: {
        request: Record<string, never>;
        response: RevokePermissionApiResponse;
        headers: { 'x-api-key': string };
        pathParams: { hash: string };
    };
}
