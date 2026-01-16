/**
 * Adapter Factory
 *
 * Factory functions for creating adapter instances.
 * Supports production (Chrome) and test (Fake) configurations.
 *
 * This module enables dependency injection by abstracting adapter creation.
 * Core business logic receives adapters via this factory, allowing:
 * - Production: Real Chrome API implementations
 * - Testing: In-memory fake implementations
 *
 * @example Production usage (in service worker):
 * ```typescript
 * const adapters = createAdapters('production');
 * const orchestrator = new Orchestrator(adapters);
 * ```
 *
 * @example Test usage:
 * ```typescript
 * const adapters = createAdapters('test');
 * const orchestrator = new Orchestrator(adapters);
 * adapters.storage.setDirect('runState', testState); // Test helper
 * ```
 */

import type { IStoragePort } from '../ports/storage.js';
import type { IMessagingPort } from '../ports/messaging.js';
import type { ITabsPort } from '../ports/tabs.js';
import type { IAlarmsPort } from '../ports/alarms.js';
import type { ILLMPort } from '../ports/llm.js';

// Chrome adapters
import { ChromeStorageAdapter } from './chrome/storage-adapter.js';
import { ChromeMessagingAdapter } from './chrome/messaging-adapter.js';
import { ChromeTabsAdapter } from './chrome/tabs-adapter.js';
import { ChromeAlarmsAdapter } from './chrome/alarms-adapter.js';

// LLM adapters
import { AnthropicAdapter } from './llm/anthropic-adapter.js';

// Fake adapters
import { FakeStorageAdapter } from './fake/fake-storage.js';
import { FakeMessagingAdapter } from './fake/fake-messaging.js';
import { FakeTabsAdapter } from './fake/fake-tabs.js';
import { FakeAlarmsAdapter } from './fake/fake-alarms.js';
import { FakeLLMAdapter } from './fake/fake-llm.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Collection of all adapters for dependency injection.
 *
 * This interface is used by core business logic to access platform services.
 * The implementation can be either Chrome APIs (production) or fakes (testing).
 */
export interface AdapterSet {
  /** Storage for persisting state */
  storage: IStoragePort;
  /** Messaging between extension components */
  messaging: IMessagingPort;
  /** Tab management and navigation */
  tabs: ITabsPort;
  /** Scheduled tasks and keep-alive */
  alarms: IAlarmsPort;
  /** LLM for AI-enhanced decisions */
  llm: ILLMPort;
}

/**
 * Environment type for adapter selection.
 *
 * - 'production': Real Chrome Extension APIs
 * - 'test': In-memory fake implementations
 */
export type AdapterEnvironment = 'production' | 'test';

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a complete set of adapters for the specified environment.
 *
 * In production, creates Chrome API adapters.
 * In test mode, creates in-memory fake adapters.
 *
 * @param env - The environment to create adapters for (default: 'production')
 * @returns Complete set of adapters implementing all port interfaces
 *
 * @example
 * ```typescript
 * // Production (in service worker)
 * const adapters = createAdapters('production');
 *
 * // Testing
 * const adapters = createAdapters('test');
 * ```
 */
export function createAdapters(env: AdapterEnvironment = 'production'): AdapterSet {
  if (env === 'test') {
    return createTestAdapters();
  }
  return createProductionAdapters();
}

/**
 * Create production adapters using real Chrome APIs.
 *
 * Note: AnthropicAdapter requires storage for API key persistence,
 * so we create storage first and inject it into the LLM adapter.
 *
 * @returns Production adapter set
 */
export function createProductionAdapters(): AdapterSet {
  const storage = new ChromeStorageAdapter();
  const messaging = new ChromeMessagingAdapter();
  const tabs = new ChromeTabsAdapter();
  const alarms = new ChromeAlarmsAdapter();
  // AnthropicAdapter needs storage for API key persistence
  const llm = new AnthropicAdapter(storage);

  return {
    storage,
    messaging,
    tabs,
    alarms,
    llm,
  };
}

/**
 * Create test adapters using in-memory fakes.
 *
 * All fake adapters have test helper methods for:
 * - Setting up initial state
 * - Simulating events
 * - Asserting on recorded actions
 *
 * @returns Test adapter set with fake implementations
 */
export function createTestAdapters(): AdapterSet {
  const storage = new FakeStorageAdapter();
  const messaging = new FakeMessagingAdapter();
  const tabs = new FakeTabsAdapter();
  const alarms = new FakeAlarmsAdapter();
  const llm = new FakeLLMAdapter();

  return {
    storage,
    messaging,
    tabs,
    alarms,
    llm,
  };
}

// ============================================================================
// Environment Detection
// ============================================================================

/**
 * Detect the current environment based on Chrome API availability.
 *
 * Returns 'production' if Chrome APIs are available (running as extension),
 * otherwise returns 'test' (running in Node.js test environment).
 *
 * @returns Detected environment
 */
export function detectEnvironment(): AdapterEnvironment {
  // Check if Chrome runtime API is available
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
    return 'production';
  }
  return 'test';
}

/**
 * Create adapters based on automatically detected environment.
 *
 * Convenience function that combines environment detection with adapter creation.
 * Use this when you want automatic environment selection.
 *
 * @returns Adapter set for the detected environment
 *
 * @example
 * ```typescript
 * // Automatically uses Chrome APIs in extension, fakes in tests
 * const adapters = createAdaptersAuto();
 * ```
 */
export function createAdaptersAuto(): AdapterSet {
  return createAdapters(detectEnvironment());
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if adapters are test adapters.
 *
 * Useful for accessing test-specific helper methods.
 *
 * @param adapters - Adapter set to check
 * @returns true if adapters are fake implementations
 *
 * @example
 * ```typescript
 * if (isTestAdapters(adapters)) {
 *   adapters.storage.setDirect('key', 'value'); // Test helper
 * }
 * ```
 */
export function isTestAdapters(
  adapters: AdapterSet
): adapters is {
  storage: FakeStorageAdapter;
  messaging: FakeMessagingAdapter;
  tabs: FakeTabsAdapter;
  alarms: FakeAlarmsAdapter;
  llm: FakeLLMAdapter;
} {
  return (
    adapters.storage instanceof FakeStorageAdapter &&
    adapters.messaging instanceof FakeMessagingAdapter &&
    adapters.tabs instanceof FakeTabsAdapter &&
    adapters.alarms instanceof FakeAlarmsAdapter &&
    adapters.llm instanceof FakeLLMAdapter
  );
}

/**
 * Reset all test adapters to initial state.
 *
 * Call this in test teardown to ensure clean state between tests.
 * Only works with test adapters (checks with isTestAdapters).
 *
 * @param adapters - Adapter set to reset
 * @throws Error if adapters are not test adapters
 *
 * @example
 * ```typescript
 * afterEach(() => {
 *   resetTestAdapters(adapters);
 * });
 * ```
 */
export function resetTestAdapters(adapters: AdapterSet): void {
  if (!isTestAdapters(adapters)) {
    throw new Error('resetTestAdapters can only be used with test adapters');
  }

  adapters.storage.reset();
  adapters.messaging.reset();
  adapters.tabs.reset();
  adapters.alarms.reset();
  adapters.llm.reset();
}
