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
  /** @deprecated Use `paymasters` instead. Auto-migrated on load. */
  paymasterUrl?: string;
}

export type OutputFormat = 'json' | 'human';
