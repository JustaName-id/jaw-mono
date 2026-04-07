import type {
    PasskeyRegistrationRequest,
    PasskeysByCredIdsResponse,
    LookupPasskeysRequest,
} from '../../passkey-manager/types.js';

/**
 * Passkey API routes
 */
export const PASSKEY_ROUTE = '/wallet/v2/passkeys';

/**
 * Route definitions for passkey operations
 */
export interface PasskeyRoutes {
    REGISTER_PASSKEY: {
        request: PasskeyRegistrationRequest;
        response: void;
        headers: Record<string, string>;
        pathParams?: never;
    };
    LOOKUP_PASSKEYS: {
        request: LookupPasskeysRequest;
        response: PasskeysByCredIdsResponse;
        headers: Record<string, string>;
        pathParams?: never;
    };
}
