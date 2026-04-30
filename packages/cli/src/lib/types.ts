export interface JawConfig {
  apiKey?: string;
  defaultChain?: number;
  keysUrl?: string;
  paymasterUrl?: string;
  ens?: string;
  /** Relay WebSocket URL (e.g. wss://relay.jaw.id). Defaults to wss://relay.jaw.id. */
  relayUrl?: string;
}

export type OutputFormat = 'json' | 'human';
