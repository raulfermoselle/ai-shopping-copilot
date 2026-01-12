/**
 * CartBuilder Preference Learning Module
 *
 * Exports for the preference learning system that tracks and learns from
 * user decisions during Review Pack interactions.
 *
 * Part of Sprint-CB-I-002: CartBuilder Preference Learning
 */

// =============================================================================
// Types
// =============================================================================

export type {
  // Decision types
  UserDecisionType,
  UserDecision,
  QuantityHistoryEntry,

  // Preference types
  ItemPreference,
  PreferenceScore,
  PreferenceScoreFactors,

  // Review Pack types
  ReviewPackOutcome,

  // Store types
  PreferenceStore,

  // Configuration
  PreferenceLearningConfig,

  // Cart checking types
  CartItemPreferenceCheck,
  CartPreferenceCheckResult,
} from './types.js';

// =============================================================================
// Schemas (for validation)
// =============================================================================

export {
  UserDecisionTypeSchema,
  UserDecisionSchema,
  QuantityHistoryEntrySchema,
  ItemPreferenceSchema,
  PreferenceScoreSchema,
  PreferenceScoreFactorsSchema,
  ReviewPackOutcomeSchema,
  PreferenceStoreSchema,
  PreferenceLearningConfigSchema,
  CartItemPreferenceCheckSchema,
  CartPreferenceCheckResultSchema,
} from './types.js';

// =============================================================================
// Factory Functions
// =============================================================================

export {
  createDefaultConfig,
  createEmptyStore,
  createItemPreference,
  createUserDecision,
} from './types.js';

// =============================================================================
// Preference Tracker Functions
// =============================================================================

export {
  // Core tracking
  applyDecisionToPreference,
  applyDecisionsToStore,
  addQuantityHistoryEntry,

  // Review Pack processing
  extractDecisionsFromOutcome,
  processReviewPackOutcome,

  // Cart comparison
  extractDecisionsFromCartComparison,
  type CartComparisonItem,

  // Pruning
  pruneQuantityHistory,
  prunePreferenceStore,

  // Query functions
  getPreference,
  getPreferences,
  getStrongRejections,
  getStrongInclusions,

  // Statistics
  computeStoreStatistics,
  type PreferenceStoreStats,

  // Persistence interface
  type PreferenceStorePersistence,
  InMemoryPreferenceStore,
} from './preference-tracker.js';

// =============================================================================
// Preference Scorer Functions
// =============================================================================

export {
  // Recency weighting
  calculateRecencyWeight,
  calculateWeightedApprovalRatio,

  // Consistency
  calculateConsistencyScore,

  // Quantity estimation
  calculateMedian,
  calculateMean,
  calculateStdDev,
  estimateQuantity,
  calculateQuantityStabilityScore,

  // Factor calculation
  calculateScoreFactors,
  calculateConfidenceFromFactors,
  calculateInclusionScore,

  // Main scoring
  scorePreference,

  // Cart checking
  checkItemPreference,
  checkCartPreferences,
  type CartItemForCheck,

  // Batch scoring
  scoreAllPreferences,
  getItemsByInclusionScore,
  getStrongRejectItems,
  getStrongIncludeItems,
} from './preference-scorer.js';
