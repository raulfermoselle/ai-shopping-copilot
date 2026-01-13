/**
 * StockPruner Agent
 *
 * Analyzes cart items against purchase history to suggest items
 * that likely don't need to be reordered yet.
 *
 * Now with adaptive learning for household-specific restock patterns.
 *
 * @module agents/stock-pruner
 */

// Main agent class and factory functions
export {
  StockPruner,
  createStockPruner,
  createConservativeStockPruner,
  createAggressiveStockPruner,
  createAdaptiveStockPruner,
  type StockPrunerResult,
  type StockPrunerResultData,
  type StockPrunerRunInput,
} from './stock-pruner.js';

// Pure heuristic functions for testing and composition
export {
  // Category detection
  detectCategory,
  type CategoryDetectionResult,

  // Cadence calculation
  calculateRestockCadence,
  type CadenceCalculationResult,

  // Timing estimation
  estimateRestockTiming,
  type RestockTimingResult,

  // Pruning decisions
  shouldPruneItem,
  findItemHistory,
  findDuplicatesInCart,
  processCartItems,

  // Adaptive learning integration
  processCartItemsWithLearning,
  type ProcessWithLearningResult,

  // Summary statistics
  summarizeDecisions,
  type PruningSummary,
  type CartItemForPruning,
} from './heuristics.js';

// Type definitions
export {
  // Enums
  ProductCategory,
  PruneReason,

  // Schemas (for validation)
  ProductCategorySchema,
  PurchaseRecordSchema,
  ItemPurchaseHistorySchema,
  RestockCadenceSourceSchema,
  RestockProfileSchema,
  HouseholdStockProfileSchema,
  UserOverrideSchema,
  PruneDecisionContextSchema,
  PruneDecisionSchema,
  HistoryAnalysisSummarySchema,
  RecommendedPruneSchema,
  UncertainItemSchema,
  StockPruneReportSchema,
  StockPrunerConfigSchema,
  PruneHistoryRecordSchema,
  PurchaseHistoryFileSchema,
  RestockProfilesFileSchema,
  UserOverridesFileSchema,

  // Constants
  CATEGORY_CADENCE_DEFAULTS,
  CATEGORY_KEYWORDS,

  // Types (inferred from schemas)
  type PurchaseRecord,
  type ItemPurchaseHistory,
  type RestockCadenceSource,
  type RestockProfile,
  type HouseholdStockProfile,
  type UserOverride,
  type PruneDecisionContext,
  type PruneDecision,
  type HistoryAnalysisSummary,
  type RecommendedPrune,
  type UncertainItem,
  type StockPruneReport,
  type StockPrunerConfig,
  type StockPrunerContext,
  type StockPrunerAgent,
  type PruneHistoryRecord,
  type PurchaseHistoryFile,
  type RestockProfilesFile,
  type UserOverridesFile,
} from './types.js';

// =============================================================================
// Adaptive Learning Module
// =============================================================================

// Re-export learning module for direct access
export * as learning from './learning/index.js';

// Key learning types and functions for convenience
export {
  // State types
  type LearningState,
  type AdaptiveCadenceConfig,
  type LearningProgressMetrics,

  // Feedback types
  type PruningFeedback,
  type FeedbackSignal,
  type FeedbackSignalType,
  type PruningOutcome,

  // Cadence tracking types
  type CadenceAccuracy,
  type CadencePrediction,

  // Consumption profile types
  type HouseholdConsumptionProfile,
  type SeasonalPattern,

  // Factory functions
  createDefaultLearningState,
  createDefaultAdaptiveCadenceConfig,
  createDefaultConsumptionProfile,

  // Cadence tracking
  recordPrediction,
  recordPredictionOutcome,
  getLearnedCadence,
  calculateLearnedCadence,

  // Feedback processing
  createFeedbackSignal,
  processFeedbackSignal,
  processBatchFeedback,
  detectImplicitFeedback,
  detectEmergencyPurchases,
  analyzeProductFeedback,
  getProductsNeedingReview,

  // Adaptive cadence calculation
  calculateAdaptiveCadence,
  calculateConfidenceAdjustment,
  makeConservativePruneDecision,
  calculateLearningProgress,

  // State management
  updateStateWithPrediction,
  updateStateWithOutcome,
  updateConsumptionProfileFromFeedback,

  // Utilities
  getProductKey,
  type ProductKey,
} from './learning/index.js';

// =============================================================================
// LLM Enhancement Module
// =============================================================================

// LLM-powered decision enhancement
export {
  // Main enhancer class
  LLMEnhancer,
  createLLMEnhancer,
  enhanceWithLLM,

  // Configuration
  DEFAULT_LLM_ENHANCER_CONFIG,
  type LLMEnhancerConfig,

  // Enhanced types
  type EnhancedPruneDecision,
  type LLMEnhancementResult,
} from './llm-enhancer.js';

// =============================================================================
// Product Analytics Module
// =============================================================================

// Analytics engine for rich statistical analysis
export {
  // Engine
  ProductAnalyticsEngine,
  createAnalyticsEngine,
  normalizeProductName,

  // Prompt building
  buildAnalyticsSystemPrompt,
  buildRichBatchPrompt,
  prepareItemsForPrompt,
} from './analytics/index.js';

export type {
  // Types
  ProductAnalytics,
  PurchaseRecord as AnalyticsPurchaseRecord,
  IntervalStats,
  QuantityStats,
  TrendAnalysis,
  SeasonalityAnalysis,
  CoPurchaseRelation,
  DetectedBundle,
  AnalyticsSummary,
  AnalyticsEngineConfig,
} from './analytics/index.js';
