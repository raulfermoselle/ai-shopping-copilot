/**
 * Alarms Port
 *
 * Abstracts chrome.alarms API for scheduled tasks and keep-alive.
 * Service workers terminate after ~30s of inactivity; alarms help manage lifecycle.
 */

/**
 * Alarm information
 */
export interface AlarmInfo {
  /** Alarm name */
  name: string;
  /** Time when alarm will fire (Unix timestamp ms) */
  scheduledTime: number;
  /** Period in minutes (for repeating alarms) */
  periodInMinutes?: number;
}

/**
 * Options for creating an alarm
 */
export interface AlarmCreateOptions {
  /**
   * Time when alarm should fire (Unix timestamp ms).
   * If omitted, uses `delayInMinutes` from now.
   */
  when?: number;

  /**
   * Minutes from now to fire the alarm.
   * Minimum: 1 minute (Chrome enforces this limit).
   */
  delayInMinutes?: number;

  /**
   * Period in minutes for repeating alarms.
   * Minimum: 1 minute (Chrome enforces this limit).
   */
  periodInMinutes?: number;
}

/**
 * Alarm fired listener callback
 */
export type AlarmListener = (alarm: AlarmInfo) => void;

/**
 * IAlarmsPort - Interface for scheduled task operations
 *
 * Implementations:
 * - ChromeAlarmsAdapter: Real Chrome alarms API
 * - FakeAlarmsAdapter: Mock alarms for tests
 *
 * IMPORTANT: Chrome enforces a minimum alarm period of 1 minute.
 * For keep-alive during active runs, use a combination of:
 * - Periodic alarms (every 1 minute)
 * - Port connections (keep service worker active)
 */
export interface IAlarmsPort {
  /**
   * Create a new alarm
   * @param name - Unique alarm name
   * @param options - Alarm timing options
   */
  create(name: string, options: AlarmCreateOptions): Promise<void>;

  /**
   * Get information about an alarm
   * @param name - Alarm name
   * @returns Alarm info or undefined if not found
   */
  get(name: string): Promise<AlarmInfo | undefined>;

  /**
   * Get all active alarms
   * @returns Array of all alarms
   */
  getAll(): Promise<AlarmInfo[]>;

  /**
   * Clear a specific alarm
   * @param name - Alarm name to clear
   * @returns true if alarm was found and cleared
   */
  clear(name: string): Promise<boolean>;

  /**
   * Clear all alarms
   */
  clearAll(): Promise<void>;

  /**
   * Add listener for alarm events
   * @param listener - Callback when alarm fires
   * @returns Unsubscribe function
   */
  addListener(listener: AlarmListener): () => void;
}

/**
 * Predefined alarm names used by the extension
 */
export const ALARM_NAMES = {
  /**
   * Keep-alive alarm during active runs.
   * Fires every 1 minute to prevent service worker termination.
   */
  KEEP_ALIVE: 'keep-alive',

  /**
   * State persistence alarm.
   * Fires periodically to ensure state is saved.
   */
  PERSIST_STATE: 'persist-state',

  /**
   * Cache cleanup alarm.
   * Fires daily to clear expired caches.
   */
  CACHE_CLEANUP: 'cache-cleanup',

  /**
   * Retry alarm for failed operations.
   * One-shot alarm to retry after error.
   */
  RETRY_OPERATION: 'retry-operation',
} as const;

export type AlarmName = (typeof ALARM_NAMES)[keyof typeof ALARM_NAMES];
