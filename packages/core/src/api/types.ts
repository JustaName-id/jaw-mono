/**
 * Base response structure from the backend API
 */
export interface BaseResponse<T> {
    statusCode: number;
    result: {
        data: T | null;
        error: string | null;
    };
}
