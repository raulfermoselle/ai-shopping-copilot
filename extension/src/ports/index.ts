/**
 * Ports (Interfaces)
 *
 * This module defines the interface contracts (ports) for external dependencies.
 * These interfaces are implemented by adapters in the adapters/ directory.
 *
 * Core business logic depends ONLY on these interfaces, never on concrete implementations.
 * This enables:
 * - Unit testing with fake adapters (no Chrome runtime)
 * - Dependency injection at runtime
 * - Future platform portability
 */

export * from './storage.js';
export * from './messaging.js';
export * from './tabs.js';
export * from './alarms.js';
export * from './llm.js';
export * from './dom-extractor.js';
