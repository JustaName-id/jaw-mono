/**
 * Storage abstraction
 * Supports both synchronous (localStorage) and asynchronous (IndexedDB) storage
 */

export type AsyncStorage = {
  getItem: <T>(key: string) => Promise<T | null>;
  removeItem: (key: string) => Promise<void>;
  setItem: (key: string, value: unknown) => Promise<void>;
};

export type SyncStorage = {
  getItem: <T>(key: string) => T | null;
  removeItem: (key: string) => void;
  setItem: (key: string, value: unknown) => void;
};

/**
 * Check if localStorage is available in the current environment
 */
function hasLocalStorage(): boolean {
  try {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

/**
 * Create localStorage-based storage with in-memory fallback
 * Falls back to in-memory storage when localStorage is unavailable (e.g., React Native, SSR)
 */
const globalMemoryStore = new Map<string, string>();

export function createLocalStorage(scope: string, name: string): SyncStorage {
  const prefix = `${scope}:${name}`;

  return {
    getItem: <T>(key: string): T | null => {
      const fullKey = `${prefix}:${key}`;
      const value = hasLocalStorage()
        ? localStorage.getItem(fullKey)
        : (globalMemoryStore.get(fullKey) ?? null);
      if (!value) return null;
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    },
    removeItem: (key: string): void => {
      const fullKey = `${prefix}:${key}`;
      if (hasLocalStorage()) {
        localStorage.removeItem(fullKey);
      } else {
        globalMemoryStore.delete(fullKey);
      }
    },
    setItem: (key: string, value: unknown): void => {
      const fullKey = `${prefix}:${key}`;
      const serialized =
        typeof value === "string" ? value : JSON.stringify(value);
      if (hasLocalStorage()) {
        localStorage.setItem(fullKey, serialized);
      } else {
        globalMemoryStore.set(fullKey, serialized);
      }
    },
  };
}

/**
 * Create IndexedDB-based storage
 */
export function createIndexedDBStorage(
  scope: string,
  name: string,
): AsyncStorage {
  const dbName = scope;
  const storeName = name;
  let dbPromise: Promise<IDBDatabase> | null = null;

  const getDB = (): Promise<IDBDatabase> => {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB not available"));
        return;
      }

      const request = indexedDB.open(dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName);
        }
      };
    });

    return dbPromise;
  };

  return {
    getItem: async <T>(key: string): Promise<T | null> => {
      try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
          const transaction = db.transaction(storeName, "readonly");
          const store = transaction.objectStore(storeName);
          const request = store.get(key);

          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result ?? null);
        });
      } catch {
        return null;
      }
    },

    removeItem: async (key: string): Promise<void> => {
      try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
          const transaction = db.transaction(storeName, "readwrite");
          const store = transaction.objectStore(storeName);
          const request = store.delete(key);

          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve();
        });
      } catch (error) {
        console.error("Error removing item from IndexedDB:", error);
      }
    },

    setItem: async (key: string, value: unknown): Promise<void> => {
      try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
          const transaction = db.transaction(storeName, "readwrite");
          const store = transaction.objectStore(storeName);
          const request = store.put(value, key);

          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve();
        });
      } catch (error) {
        console.error("Error setting item in IndexedDB:", error);
      }
    },
  };
}

/**
 * Create memory-based storage (no persistence)
 */
export function createMemoryStorage(): SyncStorage {
  const store = new Map<string, unknown>();

  return {
    getItem: <T>(key: string): T | null => {
      const value = store.get(key);
      return value !== undefined ? (value as T) : null;
    },
    removeItem: (key: string): void => {
      store.delete(key);
    },
    setItem: (key: string, value: unknown): void => {
      store.set(key, value);
    },
  };
}
