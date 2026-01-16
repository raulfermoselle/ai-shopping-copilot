/**
 * Chrome Adapters
 *
 * Exports all Chrome-specific implementations of port interfaces.
 * These adapters use Chrome Extension APIs (Manifest V3).
 */

export {
  ChromeStorageAdapter,
  StorageError,
  StorageQuotaError,
  getStorageAdapter,
  resetStorageAdapter,
} from './storage-adapter.js';
export { ChromeTabsAdapter } from './tabs-adapter.js';
export {
  ChromeMessagingAdapter,
  getMessagingAdapter,
  resetMessagingAdapter,
} from './messaging-adapter.js';
export {
  ChromeAlarmsAdapter,
  createAlarmsAdapter,
} from './alarms-adapter.js';
