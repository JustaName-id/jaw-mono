import type { Address } from 'viem';
import { restCall } from '../api/index.js';
import type { IssuanceType } from '../api/routes/index.js';

export type { IssuanceType } from '../api/routes/index.js';

/**
 * Parameters for logging account issuance
 */
export interface LogAccountIssuanceParams {
  /** The smart account address */
  address: Address;
  /** The type of account creation */
  type: IssuanceType;
  /** API key for authentication */
  apiKey: string;
}

/**
 * Log an account issuance for analytics and billing purposes.
 *
 * This function is fire-and-forget - it does not block and silently
 * swallows any errors to ensure it never affects the main flow.
 *
 * @param params - The issuance parameters
 */
export function logAccountIssuance(params: LogAccountIssuanceParams): void {
  try {
    const { address, type, apiKey } = params;

    restCall(
      'LOG_ACCOUNT_ISSUANCE',
      'POST',
      {
        address,
        type,
        timestamp: Date.now(),
      },
      { 'x-api-key': apiKey }
    ).catch(() => {
      // Silently swallow async errors
    });
  } catch {
    // Silently swallow any synchronous errors
  }
}
