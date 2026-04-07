import { standardErrorCodes } from './constants.js';
import { serialize } from './utils.js';

/**
 * Serializes an error to a format that is compatible with the Ethereum JSON RPC error format.
 */
export function serializeError(error: unknown) {
    const serialized = serialize(getErrorObject(error), {
        shouldIncludeStack: true,
    });

    return serialized;
}

/**
 * Converts an error to a serializable object.
 */
function getErrorObject(error: unknown) {
    if (typeof error === 'string') {
        return {
            message: error,
            code: standardErrorCodes.rpc.internal,
        };
    }

    // Handle error objects with code and message
    if (typeof error === 'object' && error !== null) {
        const errorObj = error as Record<string, unknown>;

        // Check if it's an error response with errorCode and errorMessage
        if ('errorCode' in errorObj || 'errorMessage' in errorObj) {
            const message = (errorObj.errorMessage as string) || (errorObj.message as string) || 'Unknown error';
            const code =
                (errorObj.errorCode as number) ??
                (errorObj.code as number) ??
                (message.match(/(denied|rejected)/i)
                    ? standardErrorCodes.provider.userRejectedRequest
                    : standardErrorCodes.rpc.internal);

            return {
                ...errorObj,
                message,
                code,
                data: errorObj.data || { method: errorObj.method },
            };
        }
    }

    return error;
}
