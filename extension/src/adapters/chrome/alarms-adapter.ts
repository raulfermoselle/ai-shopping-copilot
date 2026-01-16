/**
 * Chrome Alarms Adapter
 *
 * Implements IAlarmsPort using the Chrome Alarms API.
 * Used for scheduled tasks and service worker keep-alive functionality.
 *
 * IMPORTANT: Chrome enforces a minimum alarm period of 1 minute.
 * Values below this threshold will be silently upgraded to 1 minute by Chrome.
 */

import type {
  IAlarmsPort,
  AlarmInfo,
  AlarmCreateOptions,
  AlarmListener,
} from '../../ports/alarms.js';

/**
 * Maps a Chrome Alarm to our AlarmInfo interface
 */
function mapChromeAlarmToAlarmInfo(alarm: chrome.alarms.Alarm): AlarmInfo {
  return {
    name: alarm.name,
    scheduledTime: alarm.scheduledTime,
    periodInMinutes: alarm.periodInMinutes,
  };
}

/**
 * ChromeAlarmsAdapter
 *
 * Production implementation of IAlarmsPort using chrome.alarms API.
 * Handles alarm creation, retrieval, and lifecycle management.
 */
export class ChromeAlarmsAdapter implements IAlarmsPort {
  /**
   * Create a new alarm.
   *
   * Note: Chrome enforces a minimum 1-minute delay for alarms.
   * If `delayInMinutes` or `periodInMinutes` is less than 1,
   * Chrome will silently use 1 minute instead.
   *
   * @param name - Unique alarm identifier
   * @param options - Timing options for the alarm
   */
  async create(name: string, options: AlarmCreateOptions): Promise<void> {
    const chromeOptions: chrome.alarms.AlarmCreateInfo = {};

    if (options.when !== undefined) {
      chromeOptions.when = options.when;
    }

    if (options.delayInMinutes !== undefined) {
      chromeOptions.delayInMinutes = options.delayInMinutes;
    }

    if (options.periodInMinutes !== undefined) {
      chromeOptions.periodInMinutes = options.periodInMinutes;
    }

    // chrome.alarms.create is void, but we wrap in Promise for interface consistency
    return new Promise((resolve) => {
      chrome.alarms.create(name, chromeOptions);
      // Chrome alarms are created synchronously, resolve immediately
      resolve();
    });
  }

  /**
   * Get information about a specific alarm.
   *
   * @param name - Alarm identifier to retrieve
   * @returns Alarm info if found, undefined otherwise
   */
  async get(name: string): Promise<AlarmInfo | undefined> {
    return new Promise((resolve) => {
      chrome.alarms.get(name, (alarm) => {
        if (alarm) {
          resolve(mapChromeAlarmToAlarmInfo(alarm));
        } else {
          resolve(undefined);
        }
      });
    });
  }

  /**
   * Get all active alarms.
   *
   * @returns Array of all registered alarms
   */
  async getAll(): Promise<AlarmInfo[]> {
    return new Promise((resolve) => {
      chrome.alarms.getAll((alarms) => {
        resolve(alarms.map(mapChromeAlarmToAlarmInfo));
      });
    });
  }

  /**
   * Clear a specific alarm.
   *
   * @param name - Alarm identifier to clear
   * @returns true if alarm was found and cleared, false otherwise
   */
  async clear(name: string): Promise<boolean> {
    return new Promise((resolve) => {
      chrome.alarms.clear(name, (wasCleared) => {
        resolve(wasCleared);
      });
    });
  }

  /**
   * Clear all alarms registered by this extension.
   */
  async clearAll(): Promise<void> {
    return new Promise((resolve) => {
      chrome.alarms.clearAll(() => {
        resolve();
      });
    });
  }

  /**
   * Add a listener for alarm events.
   *
   * @param listener - Callback invoked when any alarm fires
   * @returns Unsubscribe function to remove the listener
   */
  addListener(listener: AlarmListener): () => void {
    // Wrap the listener to map Chrome's Alarm type to our AlarmInfo
    const wrappedListener = (alarm: chrome.alarms.Alarm): void => {
      listener(mapChromeAlarmToAlarmInfo(alarm));
    };

    chrome.alarms.onAlarm.addListener(wrappedListener);

    // Return unsubscribe function
    return () => {
      chrome.alarms.onAlarm.removeListener(wrappedListener);
    };
  }
}

/**
 * Create a ChromeAlarmsAdapter instance.
 * Factory function for dependency injection.
 */
export function createAlarmsAdapter(): IAlarmsPort {
  return new ChromeAlarmsAdapter();
}
