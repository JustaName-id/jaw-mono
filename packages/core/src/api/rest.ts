import { controlledAxiosPromise, justANameInstance } from './axiosController.js';
import { Routes, ROUTES } from './routes/index.js';
import { InvalidConfigurationException } from '../errors/index.js';
import qs from 'qs';

/**
 * Makes a REST call to the JustaName API.
 * @typeparam T - The type of the route.
 * @param route - The route of the API.
 * @param method - The method of the API.
 * @param request - The request of the API.
 * @param headers - The headers of the API.
 * @returns The promise of the data.
 */
export const restCall = <
  T extends keyof ROUTES,
  K extends 'GET' | 'POST',
  U extends ROUTES[T]['request'],
  V extends ROUTES[T]['headers']
>(
  route: T,
  method: K,
  request: U,
  headers?: V,
  dev?: boolean
): Promise<ROUTES[T]['response']> => {
  return controlledAxiosPromise<ROUTES[T]['response']>(
    justANameInstance(dev).request({
      url: Routes[route],
      method,
      params: method === 'GET' ? request : undefined,
      paramsSerializer: (params) => {
        return qs.stringify(params, { arrayFormat: 'repeat' });
      },
      data: method === 'POST' ? request : undefined,
      headers: headers || {},
    })
  );
};

// Function overload when headers are not provided
export function assertRestCall<
  T extends keyof ROUTES,
  K extends 'GET' | 'POST',
  U extends Partial<ROUTES[T]['request']>
>(
  route: T,
  method: K,
  request: U,
  headers?: undefined,
  dev?: boolean
): <R extends Array<keyof Partial<ROUTES[T]['request']>>>(
  requiredFields: R
) => Promise<ROUTES[T]['response']>;

// Function overload when headers are provided
export function assertRestCall<
  T extends keyof ROUTES,
  K extends 'GET' | 'POST',
  U extends Partial<ROUTES[T]['request']>,
  V extends Partial<ROUTES[T]['headers']>
>(
  route: T,
  method: K,
  request: U,
  headers: V,
  dev?: boolean
): <
  R extends Array<keyof Partial<ROUTES[T]['request']>>,
  RO extends Array<keyof Partial<ROUTES[T]['headers']>>
>(
  requiredFields: R,
  requiredHeaders: RO
) => Promise<ROUTES[T]['response']>;

// Function implementation
export function assertRestCall<
  T extends keyof ROUTES,
  K extends 'GET' | 'POST',
  U extends Partial<ROUTES[T]['request']>,
  V extends Partial<ROUTES[T]['headers']> | undefined
>(route: T, method: K, request: U, headers?: V, dev?: boolean) {
  return (
    requiredFields: Array<keyof Partial<ROUTES[T]['request']>>,
    requiredHeaders?: Array<keyof Partial<ROUTES[T]['headers']>>
  ): Promise<ROUTES[T]['response']> => {
    const missingFields = requiredFields.filter(
      (field) => request[field] === undefined
    );
    if (missingFields.length) {
      throw InvalidConfigurationException.missingParameters(
        missingFields.map((field) => field.toString())
      );
    }

    if (headers && requiredHeaders) {
      const missingHeaders = requiredHeaders.filter(
        (header) => headers[header] === undefined
      );
      if (missingHeaders.length) {
        throw InvalidConfigurationException.missingHeaders(
          missingHeaders.map((header) => header.toString())
        );
      }
    } else if (requiredHeaders && requiredHeaders.length > 0) {
      throw InvalidConfigurationException.missingHeaders(
        requiredHeaders.map((header) => header.toString())
      );
    }

    return restCall(route, method, request as unknown as ROUTES[T]['request'], headers as ROUTES[T]['headers'], dev);
  };
}
export default {
  restCall,
  assertRestCall,
};