/**
 * Chrome Storage Adapter
 *
 * Implements IStoragePort using the Chrome Extension storage APIs.
 * Supports session, local, and sync storage areas.
 *
 * Storage Areas:
 * - session: Cleared when browser closes (ephemeral)
 * - local: Persists until extension uninstall
 * - sync: Syncs across devices via Chrome account
 *
 * Error Handling:
 * - QUOTA_BYTES_PER_ITEM exceeded: Throws StorageQuotaError
 * - chrome.runtime.lastError: Wrapped in StorageError
 */

import type {
  IStoragePort,
  StorageArea,
  StorageChange,
  StorageChangeListener,
} from '../../ports/storage.js';

/**
 * Custom error for storage quota exceeded
 */
export class StorageQuotaError extends Error {
  constructor(
    message: string,
    public readonly area: StorageArea,
    public readonly bytesRequested?: number
  ) {
    super(message);
    this.name = 'StorageQuotaError';
  }
}

/**
 * Custom error for general storage operations
 */
export class StorageError extends Error {
  constructor(
    message: string,
    public readonly area: StorageArea,
    public readonly operation: 'get' | 'set' | 'remove' | 'clear'
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

/**
 * Chrome Storage Adapter
 *
 * Wraps chrome.storage API to implement IStoragePort interface.
 * Provides type-safe access to Chrome's three storage areas.
 */
export class ChromeStorageAdapter implements IStoragePort {
  /**
   * Maps StorageArea type to actual chrome.storage API namespace
   */
  private getStorageArea(area: StorageArea): chrome.storage.StorageArea {
    switch (area) {
      case 'session':
        return chrome.storage.session;
      case 'local':
        return chrome.storage.local;
      case 'sync':
        return chrome.storage.sync;
    }
  }

  /**
   * Checks chrome.runtime.lastError and throws appropriate error
   */
  private checkError(
    area: StorageArea,
    operation: 'get' | 'set' | 'remove' | 'clear'
  ): void {
    if (chrome.runtime.lastError) {
      const message = chrome.runtime.lastError.message ?? 'Unknown storage error';

      // Check for quota exceeded error
      if (
        message.includes('QUOTA_BYTES') ||
        message.includes('quota') ||
        message.includes('exceeded')
      ) {
        throw new StorageQuotaError(message, area);
      }

      throw new StorageError(message, area, operation);
    }
  }

  /**
   * Get value(s) from storage
   *
   * @param keys - Key or array of keys to retrieve
   * @param area - Storage area (defaults to 'session')
   * @returns Object with requested key-value pairs
   *
   * @example
   * // Get single key
   * const { runState } = await adapter.get<SessionStorageSchema>('runState');
   *
   * // Get multiple keys
   * const { runState, loginState } = await adapter.get<SessionStorageSchema>(['runState', 'loginState']);
   */
  async get<T extends Record<string, unknown>>(
    keys: keyof T | (keyof T)[],
    area: StorageArea = 'session'
  ): Promise<Partial<T>> {
    const storage = this.getStorageArea(area);

    return new Promise((resolve, reject) => {
      storage.get(keys as string | string[], (result) => {
        try {
          this.checkError(area, 'get');
          resolve(result as Partial<T>);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Set value(s) in storage
   *
   * @param items - Object with key-value pairs to store
   * @param area - Storage area (defaults to 'session')
   * @throws StorageQuotaError if quota exceeded
   *
   * @example
   * await adapter.set({ runState: newState }, 'session');
   */
  async set<T extends Record<string, unknown>>(
    items: T,
    area: StorageArea = 'session'
  ): Promise<void> {
    const storage = this.getStorageArea(area);

    return new Promise((resolve, reject) => {
      storage.set(items, () => {
        try {
          this.checkError(area, 'set');
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Remove key(s) from storage
   *
   * @param keys - Key or array of keys to remove
   * @param area - Storage area (defaults to 'session')
   *
   * @example
   * await adapter.remove('runState', 'session');
   * await adapter.remove(['key1', 'key2'], 'local');
   */
  async remove(
    keys: string | string[],
    area: StorageArea = 'session'
  ): Promise<void> {
    const storage = this.getStorageArea(area);

    return new Promise((resolve, reject) => {
      storage.remove(keys, () => {
        try {
          this.checkError(area, 'remove');
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Clear all keys from a storage area
   *
   * @param area - Storage area (defaults to 'session')
   *
   * @example
   * await adapter.clear('session'); // Clear session storage
   */
  async clear(area: StorageArea = 'session'): Promise<void> {
    const storage = this.getStorageArea(area);

    return new Promise((resolve, reject) => {
      storage.clear(() => {
        try {
          this.checkError(area, 'clear');
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Add listener for storage changes
   *
   * Listens to changes across all storage areas and filters/maps
   * Chrome's change events to the StorageChangeListener interface.
   *
   * @param listener - Callback for change events
   * @returns Unsubscribe function to remove the listener
   *
   * @example
   * const unsubscribe = adapter.addChangeListener((changes, area) => {
   *   if (changes.runState) {
   *     console.log('Run state changed:', changes.runState.newValue);
   *   }
   * });
   *
   * // Later, to stop listening:
   * unsubscribe();
   */
  addChangeListener(listener: StorageChangeListener): () => void {
    /**
     * Chrome's onChanged callback receives:
     * - changes: Object mapping changed keys to { oldValue, newValue }
     * - areaName: String indicating which storage area changed
     */
    const chromeListener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ): void => {
      // Map Chrome's area name to our StorageArea type
      const area = areaName as StorageArea;

      // Only process changes from known storage areas
      if (area !== 'session' && area !== 'local' && area !== 'sync') {
        return;
      }

      // Map Chrome's changes to our StorageChange interface
      const mappedChanges: Record<string, StorageChange<unknown>> = {};

      for (const [key, change] of Object.entries(changes)) {
        mappedChanges[key] = {
          oldValue: change.oldValue,
          newValue: change.newValue,
        };
      }

      listener(mappedChanges, area);
    };

    // Add the listener
    chrome.storage.onChanged.addListener(chromeListener);

    // Return unsubscribe function
    return () => {
      chrome.storage.onChanged.removeListener(chromeListener);
    };
  }
}

/**
 * Singleton instance for convenience.
 * In most cases, use this instead of creating new instances.
 */
let defaultAdapter: ChromeStorageAdapter | null = null;

/**
 * Get the default ChromeStorageAdapter instance.
 * Creates the instance on first call (lazy initialization).
 */
export function getStorageAdapter(): ChromeStorageAdapter {
  if (!defaultAdapter) {
    defaultAdapter = new ChromeStorageAdapter();
  }
  return defaultAdapter;
}

/**
 * Reset the default adapter (useful for testing).
 */
export function resetStorageAdapter(): void {
  defaultAdapter = null;
}

// Export the class as default for direct instantiation
export default ChromeStorageAdapter;
