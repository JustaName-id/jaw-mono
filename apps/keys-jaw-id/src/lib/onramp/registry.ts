// Onramp provider registry (SERVER-ONLY).
//
// Single source of truth for which providers exist, declared explicitly here.
// No self-registration side effects, no mutable global state — adding a provider
// is one entry below. Factories are lazy so a provider is only constructed when
// used.
//
// Providers pull in node:crypto, so this module must only be imported from
// server code (API routes). The client gets the provider list from the backend
// via GET /api/onramp/providers — it never imports this file.

import type { OnrampProvider } from './types';
import { CoinbaseOnrampProvider } from './providers/coinbase';

const PROVIDERS: Record<string, () => OnrampProvider> = {
  coinbase: () => new CoinbaseOnrampProvider(),
};

/** Client-safe metadata about a provider (no methods, no secrets). */
export interface OnrampProviderInfo {
  id: string;
  label: string;
  supportedNetworks: readonly string[];
}

export function getOnrampProvider(id: string): OnrampProvider {
  const factory = PROVIDERS[id];
  if (!factory) {
    const available = Object.keys(PROVIDERS).join(', ') || 'none';
    throw new Error(`Unknown onramp provider "${id}" (available: ${available})`);
  }
  return factory();
}

export function listOnrampProviders(): OnrampProviderInfo[] {
  return Object.values(PROVIDERS).map((factory) => {
    const p = factory();
    return { id: p.id, label: p.label, supportedNetworks: p.supportedNetworks };
  });
}
