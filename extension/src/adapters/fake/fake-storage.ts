/**
 * Fake Storage Adapter
 *
 * In-memory implementation of IStoragePort for unit testing.
 * Stores data in Maps and fires change listeners on updates.
 */

import type {
  IStoragePort,
  StorageArea,
  StorageChange,
  StorageChangeListener,
} from '../../ports/storage.js';

/**
 * FakeStorageAdapter - In-memory storage for tests
 *
 * Features:
 * - Separate Maps for session, local, and sync storage areas
 * - Change listeners fire on set/remove/clear operations
 * - Test helpers for inspection and reset
 */
export class FakeStorageAdapter implements IStoragePort {
  private stores: Record<StorageArea, Map<string, unknown>> = {
    session: new Map<string, unknown>(),
    local: new Map<string, unknown>(),
    sync: new Map<string, unknown>(),
  };

  private listeners: StorageChangeListener[] = [];

  // ============================================================================
  // Test Helpers
  // ============================================================================

  /**
   * Get the internal store for a storage area.
   * Use for test assertions.
   */
  getStore(area: StorageArea): Map<string, unknown> {
    return this.stores[area];
  }

  /**
   * Reset all storage areas and clear listeners.
   * Call in test teardown.
   */
  reset(): void {
    this.stores.session.clear();
    this.stores.local.clear();
    this.stores.sync.clear();
    this.listeners = [];
  }

  /**
   * Get all registered change listeners.
   * Use for test assertions.
   */
  getListeners(): StorageChangeListener[] {
    return [...this.listeners];
  }

  /**
   * Directly set a value without firing listeners.
   * Use for test setup.
   */
  setDirect<T>(key: string, value: T, area: StorageArea = 'session'): void {
    this.stores[area].set(key, value);
  }

  /**
   * Get count of items in a storage area.
   */
  getItemCount(area: StorageArea = 'session'): number {
    return this.stores[area].size;
  }

  // ============================================================================
  // IStoragePort Implementation
  // ============================================================================

  async get<T extends Record<string, unknown>>(
    keys: keyof T | (keyof T)[],
    area: StorageArea = 'session'
  ): Promise<Partial<T>> {
    const store = this.stores[area];
    const keyArray = Array.isArray(keys) ? keys : [keys];
    const result: Partial<T> = {};

    for (const key of keyArray) {
      const stringKey = String(key);
      if (store.has(stringKey)) {
        (result as Record<string, unknown>)[stringKey] = store.get(stringKey);
      }
    }

    return result;
  }

  async set<T extends Record<string, unknown>>(
    items: T,
    area: StorageArea = 'session'
  ): Promise<void> {
    const store = this.stores[area];
    const changes: Record<string, StorageChange<unknown>> = {};

    for (const [key, newValue] of Object.entries(items)) {
      const oldValue = store.get(key);
      store.set(key, newValue);

      changes[key] = {
        oldValue,
        newValue,
      };
    }

    // Notify listeners of changes
    this.notifyListeners(changes, area);
  }

  async remove(
    keys: string | string[],
    area: StorageArea = 'session'
  ): Promise<void> {
    const store = this.stores[area];
    const keyArray = Array.isArray(keys) ? keys : [keys];
    const changes: Record<string, StorageChange<unknown>> = {};

    for (const key of keyArray) {
      if (store.has(key)) {
        const oldValue = store.get(key);
        store.delete(key);

        changes[key] = {
          oldValue,
          newValue: undefined,
        };
      }
    }

    // Only notify if there were actual changes
    if (Object.keys(changes).length > 0) {
      this.notifyListeners(changes, area);
    }
  }

  async clear(area: StorageArea = 'session'): Promise<void> {
    const store = this.stores[area];
    const changes: Record<string, StorageChange<unknown>> = {};

    // Build changes for all existing keys
    for (const [key, oldValue] of store.entries()) {
      changes[key] = {
        oldValue,
        newValue: undefined,
      };
    }

    store.clear();

    // Only notify if there were items to clear
    if (Object.keys(changes).length > 0) {
      this.notifyListeners(changes, area);
    }
  }

  addChangeListener(listener: StorageChangeListener): () => void {
    this.listeners.push(listener);

    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index !== -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private notifyListeners(
    changes: Record<string, StorageChange<unknown>>,
    area: StorageArea
  ): void {
    for (const listener of this.listeners) {
      try {
        listener(changes, area);
      } catch (error) {
        // Swallow listener errors in tests, but log for debugging
        console.error('FakeStorageAdapter: Listener threw error:', error);
      }
    }
  }
}

/**
 * Create a pre-populated FakeStorageAdapter for tests
 */
export function createFakeStorage(
  initialData?: Partial<Record<StorageArea, Record<string, unknown>>>
): FakeStorageAdapter {
  const adapter = new FakeStorageAdapter();

  if (initialData) {
    for (const [area, data] of Object.entries(initialData)) {
      if (data) {
        for (const [key, value] of Object.entries(data)) {
          adapter.setDirect(key, value, area as StorageArea);
        }
      }
    }
  }

  return adapter;
}
