import {
  announceProvider as mipdAnnounceProvider,
  type EIP1193Provider,
  type EIP6963ProviderInfo,
} from 'mipd';
import type { ProviderInterface } from './interface.js';
import {JAW_WALLET_ICON, JAW_WALLET_NAME, JAW_WALLET_RDNS} from "../constants.js";

/**
 * Return type of the announce function - cleanup function
 */
export type AnnounceProviderCleanup = () => void;

// Module-level UUID for the session
let sessionUuid: string | null = null;

// Singleton state to prevent duplicate announcements
let isAnnounced = false;
let activeCleanup: AnnounceProviderCleanup | null = null;

function getSessionUuid(): string {
  if (!sessionUuid) {
    sessionUuid = crypto.randomUUID();
  }
  return sessionUuid;
}

function createEIP1193Wrapper(provider: ProviderInterface): EIP1193Provider {
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

function createProviderInfo(): EIP6963ProviderInfo {
  return {
    uuid: getSessionUuid(),
    name: JAW_WALLET_NAME,
    icon: JAW_WALLET_ICON,
    rdns: JAW_WALLET_RDNS,
  };
}

/**
 * Check if we're in a browser environment (not React Native)
 */
function isBrowserEnvironment(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  // React Native has window but not CustomEvent
  if (typeof CustomEvent === 'undefined') {
    return false;
  }

  // Additional React Native detection
  // @ts-expect-error - navigator.product may exist
  if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
    return false;
  }

  return true;
}

/**
 * Announces the JAW Provider via EIP-6963 using mipd.
 *
 * @param provider - The JAW provider to announce
 * @returns A cleanup function to stop announcing, or null if not in browser
 */
export function announceProvider(
  provider: ProviderInterface
): AnnounceProviderCleanup | null {
  if (!isBrowserEnvironment()) {
    return null;
  }

  // Singleton guard: prevent duplicate announcements
  if (isAnnounced) {
    return activeCleanup;
  }

  const unsubscribe = mipdAnnounceProvider({
    info: createProviderInfo(),
    provider: createEIP1193Wrapper(provider),
  });

  isAnnounced = true;

  activeCleanup = () => {
    unsubscribe();
    isAnnounced = false;
    activeCleanup = null;
  };

  return activeCleanup;
}

/** @internal */
export function _resetSessionUuid(): void {
  sessionUuid = null;
}

/** @internal */
export function _resetAnnouncementState(): void {
  if (activeCleanup) {
    activeCleanup();
  }
  isAnnounced = false;
  activeCleanup = null;
}
