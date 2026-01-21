import { announceProvider as mipdAnnounceProvider } from 'mipd';
import type { EIP1193Provider } from 'mipd';
import type { ProviderInterface } from './interface.js';

// ============================================================================
// Types
// ============================================================================

/**
 * EIP-6963 Provider Info metadata
 * @see https://eips.ethereum.org/EIPS/eip-6963
 */
export interface EIP6963ProviderInfo {
  /** UUIDv4 unique to the wallet/provider session */
  uuid: string;
  /** Human-readable name of the wallet */
  name: string;
  /** Data URI (RFC-2397) of wallet icon (min 96x96px, PNG/WebP/SVG) */
  icon: `data:image/${string}`;
  /** Reverse domain name identifier (e.g., "keys.jaw.id") */
  rdns: string;
}

/**
 * EIP-6963 Provider Detail combining info and provider
 */
export interface EIP6963ProviderDetail<TProvider = ProviderInterface> {
  info: EIP6963ProviderInfo;
  provider: TProvider;
}

/**
 * Custom event for announcing an EIP-1193 provider
 */
export interface EIP6963AnnounceProviderEvent<TProvider = ProviderInterface>
  extends CustomEvent<EIP6963ProviderDetail<TProvider>> {
  type: 'eip6963:announceProvider';
}

/**
 * Event for requesting providers to re-announce
 */
export interface EIP6963RequestProviderEvent extends Event {
  type: 'eip6963:requestProvider';
}

/**
 * Configuration options for EIP-6963 announcer
 */
export interface EIP6963AnnouncerOptions {
  /** Custom wallet name (defaults to "JAW") */
  name?: string;
  /** Custom icon as data URI (defaults to JAW logo) */
  icon?: `data:image/${string}`;
  /** Custom reverse DNS (defaults to "keys.jaw.id") */
  rdns?: string;
}

/**
 * Return type of the announce function - cleanup function
 */
export type AnnounceProviderCleanup = () => void;

// ============================================================================
// Icon
// ============================================================================

/**
 * Default JAW Wallet icon as SVG data URI
 * Extracted from the JAW logo - the geometric "J" pattern
 * 96x96px as required by EIP-6963 spec
 *
 * @see https://eips.ethereum.org/EIPS/eip-6963
 */
export const JAW_WALLET_ICON: `data:image/${string}` = `data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzgiIGhlaWdodD0iMzgiIHZpZXdCb3g9IjAgMCAzOCAzOCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjcuMzk3MDQiIGhlaWdodD0iNy4zOTcwNCIgdHJhbnNmb3JtPSJtYXRyaXgoLTAuODY2MDI1IDAuNSAwIC0xIDIxLjk5NDYgMjkuMzAxNCkiIGZpbGw9IiMwMjA2MTciLz4KPHJlY3Qgd2lkdGg9IjcuMzk3MDQiIGhlaWdodD0iNy4zOTcwNCIgdHJhbnNmb3JtPSJtYXRyaXgoLTAuODY2MDI1IDAuNSAwIC0xIDIxLjk5NDYgMjAuODYwMykiIGZpbGw9IiMwMjA2MTciLz4KPHJlY3Qgd2lkdGg9IjcuMzk3MDQiIGhlaWdodD0iNy4zOTcwNCIgdHJhbnNmb3JtPSJtYXRyaXgoLTAuODY2MDI1IDAuNSAwIC0xIDM0Ljc5MDMgMjkuMzAxNCkiIGZpbGw9IiMwMjA2MTciLz4KPHJlY3Qgd2lkdGg9IjcuMzk3MDQiIGhlaWdodD0iNy4zOTcwNCIgdHJhbnNmb3JtPSJtYXRyaXgoLTAuODY2MDI1IDAuNSAwIC0xIDM0Ljc5MDMgMjAuODYwMykiIGZpbGw9IiMwMjA2MTciLz4KPHJlY3Qgd2lkdGg9IjcuMzk3MDQiIGhlaWdodD0iNy4zOTcwNCIgdHJhbnNmb3JtPSJtYXRyaXgoLTAuODY2MDI1IDAuNSAwIC0xIDM0Ljc5MDMgMTIuMzk3KSIgZmlsbD0iIzAyMDYxNyIvPgo8cmVjdCB3aWR0aD0iNy4zOTcwNCIgaGVpZ2h0PSI3LjM5NzA0IiB0cmFuc2Zvcm09Im1hdHJpeCgtMC44NjYwMjUgLTAuNSAwIDEgMTUuNjA2IDI1LjYwMjkpIiBmaWxsPSIjMDIwNjE3Ii8+CjxyZWN0IHdpZHRoPSI3LjM5NzA0IiBoZWlnaHQ9IjcuMzk3MDQiIHRyYW5zZm9ybT0ibWF0cml4KC0wLjg2NjAyNSAtMC41IDAgMSAyOC40MDE0IDI1LjYwMjkpIiBmaWxsPSIjMDIwNjE3Ii8+CjxyZWN0IHdpZHRoPSI3LjM5NzA0IiBoZWlnaHQ9IjcuMzk3MDQiIHRyYW5zZm9ybT0ibWF0cml4KC0wLjg2NjAyNSAtMC41IDAgMSAyOC40MDE0IDE3LjE2MTgpIiBmaWxsPSIjMDIwNjE3Ii8+Cjwvc3ZnPgo=`;

// ============================================================================
// Announcer
// ============================================================================

// Module-level UUID for the session (not per-instance)
let sessionUuid: string | null = null;

// Module-level singleton state for announcement
// Prevents duplicate announcements from React StrictMode, HMR, or multiple SDK instances
let isAnnounced = false;
let activeCleanup: AnnounceProviderCleanup | null = null;

/**
 * Generate or retrieve the session UUID
 * Uses a single UUID per browser session to comply with EIP-6963
 */
function getSessionUuid(): string {
  if (!sessionUuid) {
    sessionUuid = crypto.randomUUID();
  }
  return sessionUuid;
}

/**
 * Creates a minimal EIP-1193 wrapper around the provider.
 * Per EIP-1193:
 * - request: The sole mandatory method for RPC calls
 * - Event methods: MUST be implemented per Node.js EventEmitter API
 *
 * This hides all internal implementation details from devtools.
 */
function createEIP1193Wrapper(provider: ProviderInterface): EIP1193Provider {
  // Cast to EIP1193Provider - mipd's types are stricter but our provider is compatible
  return {
    request: provider.request.bind(provider),
    on: provider.on.bind(provider),
    removeListener: provider.removeListener.bind(provider),
    // Optional methods
    off: provider.off?.bind(provider) ?? undefined,
    once: provider.once?.bind(provider) ?? undefined,
    addListener: provider.addListener?.bind(provider) ?? undefined,
  } as unknown as EIP1193Provider;
}

/**
 * Default EIP-6963 provider info for JAW Wallet
 */
export const DEFAULT_PROVIDER_INFO: Omit<EIP6963ProviderInfo, 'uuid'> = {
  name: 'JAW',
  icon: JAW_WALLET_ICON,
  rdns: 'keys.jaw.id',
};

/**
 * Creates the provider info object with session UUID
 */
export function createProviderInfo(options?: EIP6963AnnouncerOptions): EIP6963ProviderInfo {
  return {
    uuid: getSessionUuid(),
    name: options?.name ?? DEFAULT_PROVIDER_INFO.name,
    icon: options?.icon ?? DEFAULT_PROVIDER_INFO.icon,
    rdns: options?.rdns ?? DEFAULT_PROVIDER_INFO.rdns,
  };
}

/**
 * Announces a JAW Provider via EIP-6963 using mipd.
 *
 * This function:
 * 1. Dispatches the initial `eip6963:announceProvider` event
 * 2. Sets up a listener for `eip6963:requestProvider` to re-announce
 * 3. Returns a cleanup function to remove the listener
 *
 * @param provider - The JAW provider to announce
 * @param options - Optional configuration for provider info
 * @returns A cleanup function to stop announcing
 *
 * @example
 * ```typescript
 * const jaw = JAW.create({ apiKey: '...' });
 * const stopAnnouncing = announceProvider(jaw.provider);
 *
 * // Later, to stop announcing:
 * stopAnnouncing();
 * ```
 */
export function announceProvider(
  provider: ProviderInterface,
  options?: EIP6963AnnouncerOptions
): AnnounceProviderCleanup | null {
  // Guard: only run in browser environments
  if (typeof window === 'undefined') {
    return null;
  }

  // Singleton guard: prevent duplicate announcements from React StrictMode, HMR, etc.
  if (isAnnounced) {
    return activeCleanup;
  }

  const info = createProviderInfo(options);

  // Wrap provider in minimal EIP-1193 wrapper to hide internal details
  const wrappedProvider = createEIP1193Wrapper(provider);

  // Use mipd's announceProvider for standard-compliant announcement
  const unsubscribe = mipdAnnounceProvider({
    info,
    provider: wrappedProvider,
  });

  // Mark as announced
  isAnnounced = true;

  // Create and store cleanup function
  activeCleanup = () => {
    unsubscribe();
    isAnnounced = false;
    activeCleanup = null;
  };

  return activeCleanup;
}

/**
 * Resets the session UUID (primarily for testing)
 * @internal
 */
export function _resetSessionUuid(): void {
  sessionUuid = null;
}

/**
 * Resets the announcement state (primarily for testing)
 * @internal
 */
export function _resetAnnouncementState(): void {
  if (activeCleanup) {
    activeCleanup();
  }
  isAnnounced = false;
  activeCleanup = null;
}