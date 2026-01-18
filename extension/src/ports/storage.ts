/**
 * Storage Port
 *
 * Abstracts chrome.storage API for state persistence.
 * Supports three storage areas: session, local, and sync.
 */

/**
 * Storage areas supported by the extension
 */
export type StorageArea = 'session' | 'local' | 'sync';

/**
 * Change event for storage updates
 */
export interface StorageChange<T> {
  oldValue?: T;
  newValue?: T;
}

/**
 * Storage change listener callback
 */
export type StorageChangeListener = (
  changes: Record<string, StorageChange<unknown>>,
  area: StorageArea
) => void;

/**
 * IStoragePort - Interface for storage operations
 *
 * Implementations:
 * - ChromeStorageAdapter: Real Chrome storage API
 * - FakeStorageAdapter: In-memory storage for tests
 */
export interface IStoragePort {
  /**
   * Get value(s) from storage
   * @param keys - Key or array of keys to retrieve
   * @param area - Storage area (defaults to 'session')
   * @returns Object with requested key-value pairs
   */
  get<T extends Record<string, unknown>>(
    keys: keyof T | (keyof T)[],
    area?: StorageArea
  ): Promise<Partial<T>>;

  /**
   * Set value(s) in storage
   * @param items - Object with key-value pairs to store
   * @param area - Storage area (defaults to 'session')
   */
  set<T extends Record<string, unknown>>(
    items: T,
    area?: StorageArea
  ): Promise<void>;

  /**
   * Remove key(s) from storage
   * @param keys - Key or array of keys to remove
   * @param area - Storage area (defaults to 'session')
   */
  remove(
    keys: string | string[],
    area?: StorageArea
  ): Promise<void>;

  /**
   * Clear all keys from a storage area
   * @param area - Storage area (defaults to 'session')
   */
  clear(area?: StorageArea): Promise<void>;

  /**
   * Add listener for storage changes
   * @param listener - Callback for change events
   * @returns Unsubscribe function
   */
  addChangeListener(listener: StorageChangeListener): () => void;
}

/**
 * Storage keys used by the extension
 *
 * Session storage (cleared on browser close):
 * - runState: Current run orchestration state
 * - anthropicApiKey: API key (sensitive, ephemeral)
 *
 * Local storage (persists until uninstall):
 * - orderCache: Cached order history (24h TTL)
 * - selectorRegistry: Cached selectors
 *
 * Sync storage (synced across devices):
 * - userPreferences: User settings
 */
export interface SessionStorageSchema {
  runState: import('../types/state.js').RunState;
  anthropicApiKey: string;
  loginState: import('../types/state.js').LoginState;
}

export interface LocalStorageSchema {
  orderCache: {
    orders: import('../types/orders.js').OrderSummary[];
    lastFetched: number;
    expiresAt: number;
  };
  schemaVersion: number;
}

export interface SyncStorageSchema {
  userPreferences: {
    maxPriceDiffPercent: number;
    preferSameBrand: boolean;
    preferredDays: string[];
    preferredTimeStart: string;
    preferredTimeEnd: string;
    showNotifications: boolean;
  };
}
