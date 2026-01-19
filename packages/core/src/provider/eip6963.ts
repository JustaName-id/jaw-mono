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
export const JAW_WALLET_ICON: `data:image/${string}` =
  `data:image/svg+xml,%3Csvg width='96' height='96' viewBox='0 0 96 96' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='96' height='96' rx='12' fill='%23020617'/%3E%3Cg transform='translate(24, 20)'%3E%3Crect width='7.39704' height='7.39704' transform='matrix(-0.866025 0.5 0 -1 21.9946 29.3014)' fill='white'/%3E%3Crect width='7.39704' height='7.39704' transform='matrix(-0.866025 0.5 0 -1 21.9946 20.8603)' fill='white'/%3E%3Crect width='7.39704' height='7.39704' transform='matrix(-0.866025 0.5 0 -1 34.7903 29.3014)' fill='white'/%3E%3Crect width='7.39704' height='7.39704' transform='matrix(-0.866025 0.5 0 -1 34.7903 20.8603)' fill='white'/%3E%3Crect width='7.39704' height='7.39704' transform='matrix(-0.866025 0.5 0 -1 34.7903 12.397)' fill='white'/%3E%3Crect width='7.39704' height='7.39704' transform='matrix(-0.866025 -0.5 0 1 15.606 25.6029)' fill='white'/%3E%3Crect width='7.39704' height='7.39704' transform='matrix(-0.866025 -0.5 0 1 28.4014 25.6029)' fill='white'/%3E%3Crect width='7.39704' height='7.39704' transform='matrix(-0.866025 -0.5 0 1 28.4014 17.1618)' fill='white'/%3E%3C/g%3E%3C/svg%3E`;

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
function createEIP1193Wrapper(provider: ProviderInterface): ProviderInterface {
  return {
    // EIP-1193: The sole mandatory method
    request: (args) => provider.request(args),

    // Provider disconnect
    disconnect: () => provider.disconnect(),

    // EIP-1193: Event methods per Node.js EventEmitter API
    on: (event, listener) => provider.on(event, listener),
    once: (event, listener) => provider.once(event, listener),
    off: (event, listener) => provider.off(event, listener),
    emit: (event, ...args) => provider.emit(event, ...args),
    addListener: (event, listener) => provider.addListener(event, listener),
    removeListener: (event, listener) => provider.removeListener(event, listener),
    removeAllListeners: (event) => provider.removeAllListeners(event),
    listeners: (event) => provider.listeners(event),
    listenerCount: (event) => provider.listenerCount(event),
    eventNames: () => provider.eventNames(),
  } as ProviderInterface;
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
 * Announces a JAW Provider via EIP-6963.
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

  // Create frozen provider detail per EIP-6963 spec
  const detail: EIP6963ProviderDetail = Object.freeze({
    info: Object.freeze(info),
    provider: wrappedProvider,
  });

  // Function to dispatch the announcement event
  const announce = () => {
    const announceEvent = new CustomEvent('eip6963:announceProvider', {
      detail,
    });
    window.dispatchEvent(announceEvent);
  };

  // Dispatch initial announcement
  announce();

  // Handler for request events - re-announces the provider
  const handleRequest = () => {
    announce();
  };

  // Listen for request events
  window.addEventListener('eip6963:requestProvider', handleRequest);

  // Mark as announced
  isAnnounced = true;

  // Create and store cleanup function
  activeCleanup = () => {
    window.removeEventListener('eip6963:requestProvider', handleRequest);
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
