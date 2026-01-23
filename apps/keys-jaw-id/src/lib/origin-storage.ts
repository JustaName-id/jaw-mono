/**
 * Origin-namespaced storage utilities for per-origin isolation
 *
 * This module provides storage utilities that namespace data by origin,
 * allowing each dApp to have isolated encryption keys and session data.
 */

export interface SyncStorage {
  getItem: <T>(key: string) => T | null;
  removeItem: (key: string) => void;
  setItem: (key: string, value: unknown) => void;
}

/**
 * Hash origin to create a safe storage key
 * Uses base64 encoding and removes non-alphanumeric characters
 */
export function hashOrigin(origin: string): string {
  // Simple base64 encoding (safe for localStorage keys)
  return btoa(origin).replace(/[^a-zA-Z0-9]/g, '');
}

/**
 * Create localStorage-based storage with a given prefix
 */
function createLocalStorage(scope: string, name: string): SyncStorage {
  const prefix = `${scope}:${name}`;

  return {
    getItem: <T>(key: string): T | null => {
      if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
        return null;
      }
      const fullKey = `${prefix}:${key}`;
      const value = localStorage.getItem(fullKey);
      if (!value) return null;
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    },
    removeItem: (key: string): void => {
      if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
        return;
      }
      const fullKey = `${prefix}:${key}`;
      localStorage.removeItem(fullKey);
    },
    setItem: (key: string, value: unknown): void => {
      if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
        return;
      }
      const fullKey = `${prefix}:${key}`;
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(fullKey, serialized);
    },
  };
}

/**
 * Create origin-namespaced storage for KeyManager
 * Storage keys will be: jaw:keys:<origin-hash>:<key>
 */
export function createOriginKeyStorage(origin: string): SyncStorage {
  const hash = hashOrigin(origin);
  return createLocalStorage('jaw', `keys:${hash}`);
}

/**
 * Create origin-namespaced storage for sessions
 * Storage keys will be: jaw:session:<origin-hash>:<key>
 */
export function createOriginSessionStorage(origin: string): SyncStorage {
  const hash = hashOrigin(origin);
  return createLocalStorage('jaw', `session:${hash}`);
}
