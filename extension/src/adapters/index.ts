/**
 * Adapters
 *
 * This module exports all adapter implementations for port interfaces.
 *
 * Adapter categories:
 * - Chrome: Real Chrome Extension API implementations
 * - LLM: LLM API implementations (Anthropic)
 * - Fake: In-memory mocks for testing
 * - Factory: Dependency injection factory for creating adapter sets
 *
 * @example Basic usage with factory:
 * ```typescript
 * import { createAdapters, createTestAdapters } from './adapters';
 *
 * // Production (in service worker)
 * const adapters = createAdapters('production');
 *
 * // Testing
 * const adapters = createTestAdapters();
 * ```
 */

// Chrome adapters
export * from './chrome/index.js';

// LLM adapters
export * from './llm/index.js';

// Fake adapters for testing
export * from './fake/index.js';

// Adapter factory for dependency injection
export {
  createAdapters,
  createProductionAdapters,
  createTestAdapters,
  detectEnvironment,
  createAdaptersAuto,
  isTestAdapters,
  resetTestAdapters,
  type AdapterSet,
  type AdapterEnvironment,
} from './factory.js';
