// ============================================================================
// Persistent Memory Layer
// ============================================================================
// This module provides the persistent memory foundation for the AI Shopping
// Copilot. It enables agents to learn from history, recognize patterns, and
// make informed decisions across sessions.

// ============================================================================
// Main Manager
// ============================================================================
export { MemoryManager } from './memory-manager.js';
export type { MemoryManagerConfig, HouseholdContext } from './memory-manager.js';

// ============================================================================
// Store Classes
// ============================================================================
export { HouseholdPreferencesStore } from './stores/household-preferences.js';
export { ItemSignalsStoreClass } from './stores/item-signals.js';
export { SubstitutionHistoryStoreClass } from './stores/substitution-history.js';
export { CadenceSignalsStoreClass } from './stores/cadence-signals.js';
export { EpisodicMemoryStoreClass } from './stores/episodic-memory.js';

// ============================================================================
// Store Query Types
// ============================================================================
export type {
  SubstitutionPattern,
  BrandToleranceScore,
  PriceDeltaTolerance,
} from './stores/substitution-history.js';

export type {
  RunStatistics,
  PhasePerformance,
} from './stores/episodic-memory.js';

// ============================================================================
// Core Types
// ============================================================================
export type {
  // Common
  ItemIdentifier,

  // Household Preferences
  HouseholdPreferences,
  BrandPreference,
  Allergy,
  DietaryRestriction,

  // Item Signals
  ItemSignalsStore,
  ItemSignal,
  PurchaseRecord,

  // Substitution History
  SubstitutionHistoryStore,
  SubstitutionRecord,
  SubstitutionOutcome,

  // Cadence Signals
  CadenceSignalsStore,
  CategoryCadence,
  ItemCadence,

  // Episodic Memory
  EpisodicMemoryStore,
  EpisodicMemoryRecord,
  RunOutcome,
  RunPhase,
  ItemAction,
} from './types.js';

// ============================================================================
// Helper Functions
// ============================================================================
export {
  createEmptyHouseholdPreferences,
  createEmptyItemSignalsStore,
  createEmptySubstitutionHistoryStore,
  createEmptyCadenceSignalsStore,
  createEmptyEpisodicMemoryStore,
  MEMORY_SCHEMA_VERSION,
} from './types.js';

// ============================================================================
// File Utilities
// ============================================================================
export {
  atomicWrite,
  readFile,
  readJsonFile,
  writeJsonFile,
  fileExists,
  getFileStats,
  listFiles,
  deleteFile,
  ensureDir,
} from './utils/file-operations.js';

export type { WriteOptions } from './utils/file-operations.js';

// ============================================================================
// Base Store (for custom stores)
// ============================================================================
export { BaseStore } from './stores/base-store.js';
export type { BaseStoreConfig } from './stores/base-store.js';
