/**
 * Correlation IDs store for tracking request/response pairs
 * Helps with logging and debugging by correlating related operations
 */

import { createMemoryStore, type Store } from '../../store/store.js';

type CorrelationIdsState = {
  correlationIds: Map<object, string>;
};

const defaultState: CorrelationIdsState = {
  correlationIds: new Map<object, string>(),
};

/**
 * In-memory store for correlation IDs
 * Note: Uses memory store since correlation IDs don't need persistence
 */
export const correlationIdsStore: Store<CorrelationIdsState> = createMemoryStore(defaultState);

/**
 * Correlation IDs manager
 */
export const correlationIds = {
  /**
   * Get correlation ID for a request
   */
  get: (key: object): string | undefined => {
    return correlationIdsStore.get().correlationIds.get(key);
  },

  /**
   * Set correlation ID for a request
   */
  set: (key: object, correlationId: string): void => {
    const current = correlationIdsStore.get().correlationIds;
    const newMap = new Map(current);
    newMap.set(key, correlationId);
    correlationIdsStore.set({ correlationIds: newMap });
  },

  /**
   * Delete correlation ID for a request
   */
  delete: (key: object): void => {
    const current = correlationIdsStore.get().correlationIds;
    const newMap = new Map(current);
    newMap.delete(key);
    correlationIdsStore.set({ correlationIds: newMap });
  },

  /**
   * Clear all correlation IDs
   */
  clear: (): void => {
    correlationIdsStore.clear();
  },

  /**
   * Get or create a correlation ID for a request
   */
  getOrCreate: (key: object): string => {
    let correlationId = correlationIdsStore.get().correlationIds.get(key);
    if (!correlationId) {
      correlationId = crypto.randomUUID();
      const current = correlationIdsStore.get().correlationIds;
      const newMap = new Map(current);
      newMap.set(key, correlationId);
      correlationIdsStore.set({ correlationIds: newMap });
    }
    return correlationId;
  },

  /**
   * Check if a correlation ID exists for a request
   */
  has: (key: object): boolean => {
    return correlationIdsStore.get().correlationIds.has(key);
  },

  /**
   * Get all correlation IDs
   */
  getAll: (): Map<object, string> => {
    return new Map(correlationIdsStore.get().correlationIds);
  },

  /**
   * Get count of tracked correlation IDs
   */
  size: (): number => {
    return correlationIdsStore.get().correlationIds.size;
  },
};

