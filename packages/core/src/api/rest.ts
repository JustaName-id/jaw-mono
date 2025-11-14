import {backendInstance, controlledAxiosPromise} from './axiosController.js';
import { Routes, ROUTES } from './routes/index.js';
import qs from 'qs';

/**
 * Makes a REST call to the Backend API.
 * @typeparam T - The type of the route.
 * @param route - The route of the API.
 * @param method - The method of the API.
 * @param request - The request of the API.
 * @param headers - The headers of the API.
 * @param pathParams - Optional path parameters to replace in the URL (e.g., { hash: "abc123" } for /permissions/:hash)
 * @param dev - Whether to use the staging environment.
 * @param serverUrl - Optional custom server URL to override the default.
 * @returns The promise of the data.
 */
export const restCall = <
  T extends keyof ROUTES,
  K extends 'GET' | 'POST' | 'DELETE',
  U extends ROUTES[T]['request'],
  V extends ROUTES[T]['headers'],
  P extends ROUTES[T]['pathParams']
>(
  route: T,
  method: K,
  request: U,
  headers?: V,
  pathParams?: P,
  dev?: boolean,
  serverUrl?: string
): Promise<ROUTES[T]['response']> => {
  // Get the route template
  let url = Routes[route];

  // Replace path parameters if provided
  if (pathParams) {
    Object.entries(pathParams as Record<string, string>).forEach(([key, value]) => {
      url = url.replace(`:${key}`, encodeURIComponent(value));
    });
  }

  return controlledAxiosPromise<ROUTES[T]['response']>(
      backendInstance(dev, serverUrl).request({
      url,
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