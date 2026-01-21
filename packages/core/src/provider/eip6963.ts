import {
  announceProvider as mipdAnnounceProvider,
  type EIP1193Provider,
  type EIP6963ProviderInfo,
} from 'mipd';
import type { ProviderInterface } from './interface.js';

/**
 * Return type of the announce function - cleanup function
 */
export type AnnounceProviderCleanup = () => void;

/**
 * Default JAW Wallet icon as SVG data URI
 * @see https://eips.ethereum.org/EIPS/eip-6963
 */
export const JAW_WALLET_ICON: `data:image/${string}` = `data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzgiIGhlaWdodD0iMzgiIHZpZXdCb3g9IjAgMCAzOCAzOCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjcuMzk3MDQiIGhlaWdodD0iNy4zOTcwNCIgdHJhbnNmb3JtPSJtYXRyaXgoLTAuODY2MDI1IDAuNSAwIC0xIDIxLjk5NDYgMjkuMzAxNCkiIGZpbGw9IiMwMjA2MTciLz4KPHJlY3Qgd2lkdGg9IjcuMzk3MDQiIGhlaWdodD0iNy4zOTcwNCIgdHJhbnNmb3JtPSJtYXRyaXgoLTAuODY2MDI1IDAuNSAwIC0xIDIxLjk5NDYgMjAuODYwMykiIGZpbGw9IiMwMjA2MTciLz4KPHJlY3Qgd2lkdGg9IjcuMzk3MDQiIGhlaWdodD0iNy4zOTcwNCIgdHJhbnNmb3JtPSJtYXRyaXgoLTAuODY2MDI1IDAuNSAwIC0xIDM0Ljc5MDMgMjkuMzAxNCkiIGZpbGw9IiMwMjA2MTciLz4KPHJlY3Qgd2lkdGg9IjcuMzk3MDQiIGhlaWdodD0iNy4zOTcwNCIgdHJhbnNmb3JtPSJtYXRyaXgoLTAuODY2MDI1IDAuNSAwIC0xIDM0Ljc5MDMgMjAuODYwMykiIGZpbGw9IiMwMjA2MTciLz4KPHJlY3Qgd2lkdGg9IjcuMzk3MDQiIGhlaWdodD0iNy4zOTcwNCIgdHJhbnNmb3JtPSJtYXRyaXgoLTAuODY2MDI1IDAuNSAwIC0xIDM0Ljc5MDMgMTIuMzk3KSIgZmlsbD0iIzAyMDYxNyIvPgo8cmVjdCB3aWR0aD0iNy4zOTcwNCIgaGVpZ2h0PSI3LjM5NzA0IiB0cmFuc2Zvcm09Im1hdHJpeCgtMC44NjYwMjUgLTAuNSAwIDEgMTUuNjA2IDI1LjYwMjkpIiBmaWxsPSIjMDIwNjE3Ii8+CjxyZWN0IHdpZHRoPSI3LjM5NzA0IiBoZWlnaHQ9IjcuMzk3MDQiIHRyYW5zZm9ybT0ibWF0cml4KC0wLjg2NjAyNSAtMC41IDAgMSAyOC40MDE0IDI1LjYwMjkpIiBmaWxsPSIjMDIwNjE3Ii8+CjxyZWN0IHdpZHRoPSI3LjM5NzA0IiBoZWlnaHQ9IjcuMzk3MDQiIHRyYW5zZm9ybT0ibWF0cml4KC0wLjg2NjAyNSAtMC41IDAgMSAyOC40MDE0IDE3LjE2MTgpIiBmaWxsPSIjMDIwNjE3Ii8+Cjwvc3ZnPgo=`;

/** JAW Wallet name */
const JAW_WALLET_NAME = 'JAW';

/** JAW Wallet reverse DNS */
const JAW_WALLET_RDNS = 'keys.jaw.id';

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
 * Announces the JAW Provider via EIP-6963 using mipd.
 *
 * @param provider - The JAW provider to announce
 * @returns A cleanup function to stop announcing, or null if not in browser
 */
export function announceProvider(
  provider: ProviderInterface
): AnnounceProviderCleanup | null {
  if (typeof window === 'undefined') {
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
