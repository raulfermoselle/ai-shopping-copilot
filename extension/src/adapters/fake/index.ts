/**
 * Fake Adapters for Testing
 *
 * This module provides in-memory implementations of all port interfaces.
 * Use these adapters in unit tests to test core logic without Chrome runtime.
 *
 * Features:
 * - No Chrome API dependencies
 * - Synchronous, deterministic behavior
 * - Rich test helpers for assertions and setup
 * - Factory function for creating all adapters at once
 */

// ============================================================================
// Individual Adapter Exports
// ============================================================================

export {
  FakeStorageAdapter,
  createFakeStorage,
} from './fake-storage.js';

export {
  FakeMessagingAdapter,
  FakePort,
  createFakeMessaging,
  type RecordedMessage,
} from './fake-messaging.js';

export {
  FakeTabsAdapter,
  createFakeTabs,
} from './fake-tabs.js';

export {
  FakeAlarmsAdapter,
  createFakeAlarms,
  type RecordedAlarmEvent,
} from './fake-alarms.js';

export {
  FakeLLMAdapter,
  createFakeLLM,
  MOCK_RESPONSES,
  MOCK_ERRORS,
  type CannedResponse,
  type SimulatedError,
} from './fake-llm.js';

// ============================================================================
// Port Interface Re-exports (for convenience)
// ============================================================================

export type { IStoragePort, StorageArea, StorageChangeListener } from '../../ports/storage.js';
export type { IMessagingPort, IPort, MessageHandler } from '../../ports/messaging.js';
export type { ITabsPort, TabInfo, TabQueryOptions, TabUpdateOptions } from '../../ports/tabs.js';
export type { IAlarmsPort, AlarmInfo, AlarmCreateOptions, AlarmListener } from '../../ports/alarms.js';
export type { ILLMPort, LLMMessage, LLMCompletionOptions, LLMCompletionResponse, LLMError } from '../../ports/llm.js';

// ============================================================================
// Aggregate Types
// ============================================================================

import { FakeStorageAdapter } from './fake-storage.js';
import { FakeMessagingAdapter } from './fake-messaging.js';
import { FakeTabsAdapter } from './fake-tabs.js';
import { FakeAlarmsAdapter } from './fake-alarms.js';
import { FakeLLMAdapter } from './fake-llm.js';

/**
 * Collection of all fake adapters
 */
export interface FakeAdapters {
  storage: FakeStorageAdapter;
  messaging: FakeMessagingAdapter;
  tabs: FakeTabsAdapter;
  alarms: FakeAlarmsAdapter;
  llm: FakeLLMAdapter;
}

/**
 * Options for creating fake adapters
 */
export interface CreateFakeAdaptersOptions {
  /** Initial storage data */
  storage?: {
    session?: Record<string, unknown>;
    local?: Record<string, unknown>;
    sync?: Record<string, unknown>;
  };
  /** Initial tabs */
  tabs?: Array<{
    id?: number;
    url?: string;
    title?: string;
    active?: boolean;
    loading?: boolean;
  }>;
  /** LLM configuration */
  llm?: {
    available?: boolean;
    apiKey?: string;
  };
}

/**
 * Create all fake adapters at once.
 *
 * This is the recommended way to set up adapters for integration tests
 * that need multiple adapters to work together.
 *
 * @example
 * ```typescript
 * const adapters = createFakeAdapters({
 *   storage: {
 *     session: { runState: DEFAULT_RUN_STATE },
 *   },
 *   tabs: [
 *     { id: 1, url: 'https://www.auchan.pt/', active: true },
 *   ],
 *   llm: {
 *     available: true,
 *     apiKey: 'test-api-key',
 *   },
 * });
 *
 * // Use in tests
 * const { storage, messaging, tabs, alarms, llm } = adapters;
 *
 * // Reset all adapters between tests
 * resetFakeAdapters(adapters);
 * ```
 */
export function createFakeAdapters(options?: CreateFakeAdaptersOptions): FakeAdapters {
  const storage = new FakeStorageAdapter();
  const messaging = new FakeMessagingAdapter();
  const tabs = new FakeTabsAdapter();
  const alarms = new FakeAlarmsAdapter();
  const llm = new FakeLLMAdapter();

  // Apply initial storage data
  if (options?.storage) {
    for (const [area, data] of Object.entries(options.storage)) {
      if (data) {
        for (const [key, value] of Object.entries(data)) {
          storage.setDirect(key, value, area as 'session' | 'local' | 'sync');
        }
      }
    }
  }

  // Apply initial tabs
  if (options?.tabs) {
    for (const tab of options.tabs) {
      tabs.addTab(tab);
    }
  }

  // Apply LLM configuration
  if (options?.llm) {
    if (options.llm.apiKey) {
      llm.setApiKeyDirect(options.llm.apiKey);
    }
    if (options.llm.available !== undefined) {
      llm.setAvailable(options.llm.available);
    }
  }

  return { storage, messaging, tabs, alarms, llm };
}

/**
 * Reset all fake adapters to initial state.
 *
 * Call this in afterEach() to ensure clean state between tests.
 */
export function resetFakeAdapters(adapters: FakeAdapters): void {
  adapters.storage.reset();
  adapters.messaging.reset();
  adapters.tabs.reset();
  adapters.alarms.reset();
  adapters.llm.reset();
}

/**
 * Type guard to check if an object is a FakeAdapters collection
 */
export function isFakeAdapters(obj: unknown): obj is FakeAdapters {
  if (typeof obj !== 'object' || obj === null) return false;
  const adapters = obj as Record<string, unknown>;
  return (
    adapters.storage instanceof FakeStorageAdapter &&
    adapters.messaging instanceof FakeMessagingAdapter &&
    adapters.tabs instanceof FakeTabsAdapter &&
    adapters.alarms instanceof FakeAlarmsAdapter &&
    adapters.llm instanceof FakeLLMAdapter
  );
}
