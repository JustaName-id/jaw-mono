import type { X402Policy } from '../x402/policy.js';

export type PaymasterConfig = {
  url: string;
  context?: Record<string, unknown>;
};

export interface PermissionsConfig {
  calls?: Array<{ target: string; selector?: string }>;
  spends?: Array<{
    token: string;
    allowance: string;
    unit: string;
    multiplier?: number;
  }>;
}

export interface JawConfig {
  apiKey?: string;
  defaultChain?: number;
  keysUrl?: string;
  ens?: string;
  relayUrl?: string;
  paymasters?: Record<number, PaymasterConfig>;
  permissions?: PermissionsConfig;
  sessionExpiry?: number;
  /** x402 agentic-payment caps + allowlists (used by `jaw_pay_and_fetch`). */
  x402?: X402Policy;
  /** @deprecated Use `paymasters` instead. Auto-migrated on load. */
  paymasterUrl?: string;
}

/**
 * Config keys settable from a plain string value (`jaw config set`, jaw_config_set).
 * Excludes structured fields like `x402`/`paymasters`/`permissions`. Kept as a
 * narrow union rather than `keyof JawConfig` so it stays independent of those
 * object fields (which otherwise blow up the MCP SDK's tool-handler inference).
 */
export type SettableConfigKey = 'apiKey' | 'defaultChain' | 'keysUrl' | 'ens' | 'relayUrl' | 'sessionExpiry';

export type OutputFormat = 'json' | 'human';
