/**
 * StockPruner Adaptive Learning Module
 *
 * Exports all learning-related functionality for adaptive restock cadence.
 *
 * @module agents/stock-pruner/learning
 */

// =============================================================================
// Types
// =============================================================================

export {
  // Cadence accuracy types
  type CadencePrediction,
  type CadenceAccuracy,
  CadencePredictionSchema,
  CadenceAccuracySchema,

  // Feedback types
  type PruningOutcome,
  type PruningFeedback,
  type FeedbackSignalType,
  type FeedbackSignal,
  PruningOutcomeSchema,
  PruningFeedbackSchema,
  FeedbackSignalTypeSchema,
  FeedbackSignalSchema,

  // Consumption pattern types
  type SeasonalPattern,
  type SpecialEvent,
  type HouseholdConsumptionProfile,
  SeasonalPatternSchema,
  SpecialEventSchema,
  HouseholdConsumptionProfileSchema,

  // Confidence types
  type ConfidenceAdjustmentFactors,
  type ConfidenceAdjustmentResult,
  ConfidenceAdjustmentFactorsSchema,

  // State types
  type LearningState,
  LearningStateSchema,

  // Config types
  type AdaptiveCadenceConfig,
  AdaptiveCadenceConfigSchema,

  // Utility types
  type ProductKey,

  // Helper functions
  getProductKey,
  createDefaultConsumptionProfile,
  createDefaultLearningState,
  createDefaultAdaptiveCadenceConfig,

  // Constants
  FEEDBACK_SIGNAL_WEIGHTS,
  DEFAULT_SEASONAL_FACTORS,
} from './types.js';

// =============================================================================
// Cadence Tracker
// =============================================================================

export {
  // Prediction recording
  recordPrediction,
  type RecordPredictionResult,

  // Outcome recording
  recordPredictionOutcome,
  type RecordOutcomeResult,

  // Cadence calculation
  calculateLearnedCadence,
  type LearnedCadenceResult,

  // Statistics
  calculateAccuracyStats,
  type AccuracyStats,

  // State updates
  updateStateWithPrediction,
  updateStateWithOutcome,
  type UpdateLearningStateResult,

  // Queries
  getLearnedCadence,
  getProblematicProducts,
} from './cadence-tracker.js';

// =============================================================================
// Feedback Processor
// =============================================================================

export {
  // Signal creation
  createFeedbackSignal,

  // Signal processing
  processFeedbackSignal,
  type ProcessFeedbackResult,

  // Batch processing
  processBatchFeedback,
  type BatchFeedbackResult,
  type BatchFeedbackInput,

  // Implicit feedback detection
  detectImplicitFeedback,
  type DetectedImplicitFeedback,
  type ItemState,

  // Emergency purchase detection
  detectEmergencyPurchases,
  type EmergencyPurchase,
  type PurchaseForDetection,

  // Feedback analysis
  analyzeProductFeedback,
  type ProductFeedbackAnalysis,
  getProductsNeedingReview,

  // Consumption profile updates
  updateConsumptionProfileFromFeedback,
  type UpdateConsumptionProfileResult,
} from './feedback-processor.js';

// =============================================================================
// Adaptive Cadence Calculator
// =============================================================================

export {
  // Main calculation
  calculateAdaptiveCadence,
  type AdaptiveCadenceResult,

  // Factor calculations
  getHouseholdConsumptionFactor,
  getSeasonalFactor,

  // Confidence adjustment
  calculateConfidenceAdjustment,

  // Conservative decisions
  makeConservativePruneDecision,
  type ConservativePruneResult,

  // Batch operations
  calculateBatchAdaptiveCadence,
  type BatchCadenceInput,

  // Progress metrics
  calculateLearningProgress,
  type LearningProgressMetrics,
} from './adaptive-cadence.js';
