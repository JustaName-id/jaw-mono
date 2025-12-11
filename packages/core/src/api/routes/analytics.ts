import type { Address } from 'viem';

/**
 * Analytics API route
 */
export const ANALYTICS_ROUTE = '/wallet/v2/analytics';

/**
 * Issuance type for analytics tracking
 */
export type IssuanceType = 'create' | 'import' | 'fromLocalAccount';

/**
 * Request payload for logging account issuance
 */
export interface LogAccountIssuanceRequest {
  address: Address;
  type: IssuanceType;
  timestamp: number;
}

/**
 * Route definitions for analytics operations
 */
export interface AnalyticsRoutes {
  LOG_ACCOUNT_ISSUANCE: {
    request: LogAccountIssuanceRequest;
    response: void;
    headers: Record<string, string>;
    pathParams?: never;
  };
}
