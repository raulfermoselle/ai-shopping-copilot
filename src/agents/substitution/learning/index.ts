/**
 * Substitution Learning Module
 *
 * Provides learning capabilities for the Substitution agent:
 * - Track user decisions on proposed substitutes
 * - Calculate tolerance patterns (brand, price, size)
 * - Adjust ranking scores based on learned preferences
 *
 * All functions are pure: no side effects, deterministic, operate only on inputs.
 * This enables easy testing and composability.
 *
 * @example
 * // Record a decision
 * import { recordAccepted, refreshAllLearnings, createEmptyLearningStore } from './learning';
 *
 * let store = createEmptyLearningStore('household-123');
 * store = recordAccepted(store, originalProduct, acceptedSubstitute);
 * store = refreshAllLearnings(store, config);
 *
 * // Apply learning to ranking
 * const adjusted = adjustAndRankCandidates(candidates, original, store, config);
 */

// =============================================================================
// Types
// =============================================================================

export {
  // Schema version
  LEARNING_SCHEMA_VERSION,

  // Schemas (for validation)
  ProductReferenceSchema,
  DecisionTypeSchema,
  SubstitutionDecisionSchema,
  BrandToleranceLevelSchema,
  CategoryToleranceSchema,
  BrandTolerancePatternSchema,
  ProductLearningSignalSchema,
  SubstitutionLearningStoreSchema,
  LearningConfigSchema,

  // Types
  type ProductReference,
  type DecisionType,
  type SubstitutionDecision,
  type BrandToleranceLevel,
  type CategoryTolerance,
  type BrandTolerancePattern,
  type ProductLearningSignal,
  type SubstitutionLearningStore,
  type LearningConfig,
  type RankingAdjustmentResult,

  // Factory functions
  createEmptyLearningStore,
  createDefaultLearningConfig,
  createSubstitutionDecision,
} from './types.js';

// =============================================================================
// Substitution Tracker - Decision Recording & Querying
// =============================================================================

export {
  // Recording decisions
  recordDecision,
  recordAccepted,
  recordRejected,
  recordDifferentChosen,

  // Querying decisions
  getDecisionsByCategory,
  getDecisionsByProduct,
  getDecisionsBySubstituteBrand,
  getDecisionsInTimeRange,
  getRecentDecisions,
  getDecisionsByType,

  // Aggregation
  calculateDecisionStats,
  getStatsByCategory,
  getBrandPairStats,
  getProductAsSubstituteStats,

  // Store maintenance
  pruneOldDecisions,
  mergeStores,

  // Utilities
  calculateRecencyWeight,
  hasEnoughDecisionsForLearning,

  // Types
  type DecisionStats,
  type BrandPairStats,
  type ProductAsSubstituteStats,
} from './substitution-tracker.js';

// =============================================================================
// Tolerance Calculator - Pattern Learning
// =============================================================================

export {
  // Analysis functions
  analyzePriceTolerance,
  analyzeSizeTolerance,
  analyzeBrandTolerance,

  // Category tolerance
  calculateCategoryTolerance,
  calculateAllCategoryTolerances,

  // Brand patterns
  calculateBrandPatterns,
  findBrandPattern,
  getBestBrandSubstitutes,

  // Store update
  updateStoreLearnings,

  // Utilities
  parseSize,
} from './tolerance-calculator.js';

// =============================================================================
// Ranking Adjuster - Score Modification
// =============================================================================

export {
  // Product signals
  calculateProductSignal,
  calculateAllProductSignals,

  // Score adjustment
  adjustScore,
  adjustAndRankCandidates,

  // Store updates
  updateStoreProductSignals,
  refreshAllLearnings,

  // Types
  type SubstituteCandidate,
  type OriginalProduct,
} from './ranking-adjuster.js';
