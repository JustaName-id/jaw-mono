/**
 * Simple store interface for core package
 * Provides basic key-value storage with persistence
 */

export interface StoreValue {
  [key: string]: unknown;
}

export interface Store<T extends StoreValue> {
  get(): T;
  set(value: Partial<T>): void;
  clear(): void;
}

/**
 * Create a simple store with localStorage persistence
 */
export function createStore<T extends StoreValue>(
  key: string,
  defaultValue: T
): Store<T> {
  const storageKey = `jaw-store:${key}`;

  const get = (): T => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        return { ...defaultValue, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.error(`Error reading store ${key}:`, error);
    }
    return { ...defaultValue };
  };

  const set = (value: Partial<T>): void => {
    try {
      const current = get();
      const updated = { ...current, ...value };
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (error) {
      console.error(`Error writing to store ${key}:`, error);
    }
  };

  const clear = (): void => {
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.error(`Error clearing store ${key}:`, error);
    }
  };

  return { get, set, clear };
}

/**
 * In-memory store (no persistence)
 */
export function createMemoryStore<T extends StoreValue>(
  defaultValue: T
): Store<T> {
  let data: T = { ...defaultValue };

  return {
    get: () => ({ ...data }),
    set: (value: Partial<T>) => {
      data = { ...data, ...value };
    },
    clear: () => {
      data = { ...defaultValue };
    },
  };
}

