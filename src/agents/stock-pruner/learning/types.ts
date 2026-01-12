/**
 * Adaptive Learning Types for StockPruner
 *
 * Type definitions for tracking cadence accuracy, processing user feedback,
 * and learning household-specific consumption patterns.
 *
 * All types are designed for:
 * - Persistence (serializable to JSON)
 * - Transparency (include reasoning metadata)
 * - Conservative defaults (err on side of keeping items)
 */

import { z } from 'zod';
import { ProductCategory, ProductCategorySchema } from '../types.js';

// =============================================================================
// Cadence Accuracy Tracking
// =============================================================================

/**
 * A single prediction record tracking predicted vs actual restock timing.
 */
export const CadencePredictionSchema = z.object({
  /** Predicted days until restock needed */
  predictedCadence: z.number().int().positive(),
  /** Actual days until user restocked (null if not yet known) */
  actualCadence: z.number().int().positive().nullable(),
  /** Whether the prediction was correct (null if outcome unknown) */
  wasCorrect: z.boolean().nullable(),
  /** When this prediction was made */
  timestamp: z.coerce.date(),
  /** Session ID when prediction was made */
  sessionId: z.string().optional(),
});

export type CadencePrediction = z.infer<typeof CadencePredictionSchema>;

/**
 * Tracks prediction accuracy for a specific product.
 * Used to learn optimal restock cadence from actual user behavior.
 */
export const CadenceAccuracySchema = z.object({
  /** Product identifier (if available) */
  productId: z.string().optional(),
  /** Product name for matching */
  productName: z.string().min(1),
  /** Detected or assigned product category */
  category: ProductCategorySchema,
  /** History of predictions for this product */
  predictions: z.array(CadencePredictionSchema),
  /** Learned cadence in days (adaptive) */
  learnedCadence: z.number().int().positive(),
  /** Default cadence from category */
  defaultCadence: z.number().int().positive(),
  /** Confidence in learned cadence (0-1) */
  confidence: z.number().min(0).max(1),
  /** Last updated timestamp */
  updatedAt: z.coerce.date(),
});

export type CadenceAccuracy = z.infer<typeof CadenceAccuracySchema>;

// =============================================================================
// Pruning Feedback Types
// =============================================================================

/**
 * Outcome of a pruning decision.
 */
export const PruningOutcomeSchema = z.enum([
  'correct', // Decision was right (user agreed or did not re-add)
  'wrong_removal', // Item was wrongly removed (user re-added it)
  'wrong_keep', // Item was wrongly kept (user removed it)
  'unknown', // Outcome not yet determined
]);

export type PruningOutcome = z.infer<typeof PruningOutcomeSchema>;

/**
 * Feedback record for a single pruning decision.
 */
export const PruningFeedbackSchema = z.object({
  /** Product identifier */
  productId: z.string().optional(),
  /** Product name */
  productName: z.string().min(1),
  /** Product category */
  category: ProductCategorySchema,
  /** What decision was made */
  decision: z.enum(['removed', 'kept']),
  /** What the outcome was */
  outcome: PruningOutcomeSchema,
  /** Confidence at decision time */
  originalConfidence: z.number().min(0).max(1),
  /** When the decision was made */
  decisionTimestamp: z.coerce.date(),
  /** When feedback was received (null if not yet) */
  feedbackTimestamp: z.coerce.date().nullable(),
  /** Session ID when decision was made */
  sessionId: z.string(),
  /** Reason for the original decision */
  reason: z.string().optional(),
});

export type PruningFeedback = z.infer<typeof PruningFeedbackSchema>;

/**
 * Types of user feedback signals.
 */
export const FeedbackSignalTypeSchema = z.enum([
  'explicit_correction', // User explicitly said "this was wrong"
  'implicit_re_add', // User added item back after removal suggestion
  'emergency_purchase', // Item purchased between regular shopping runs
  'ran_out_early', // User reported running out before expected
  'still_have_stock', // User reported still having stock
  'accepted_suggestion', // User accepted the pruning suggestion
  'quantity_adjusted', // User adjusted quantity (up or down)
]);

export type FeedbackSignalType = z.infer<typeof FeedbackSignalTypeSchema>;

/**
 * A feedback signal from user behavior or explicit input.
 */
export const FeedbackSignalSchema = z.object({
  /** Type of feedback */
  type: FeedbackSignalTypeSchema,
  /** Product identifier */
  productId: z.string().optional(),
  /** Product name */
  productName: z.string().min(1),
  /** Category of the product */
  category: ProductCategorySchema,
  /** Weight/importance of this signal (0-1) */
  weight: z.number().min(0).max(1),
  /** Timestamp of the feedback */
  timestamp: z.coerce.date(),
  /** Session ID */
  sessionId: z.string(),
  /** Additional metadata */
  metadata: z.record(z.unknown()).optional(),
});

export type FeedbackSignal = z.infer<typeof FeedbackSignalSchema>;

// =============================================================================
// Household Consumption Patterns
// =============================================================================

/**
 * Seasonal consumption pattern for a category.
 */
export const SeasonalPatternSchema = z.object({
  /** Product category */
  category: ProductCategorySchema,
  /** Seasonal adjustment factors by month (1-12) */
  monthlyFactors: z.record(z.string(), z.number().min(0.1).max(3.0)),
  /** Confidence in this pattern */
  confidence: z.number().min(0).max(1),
  /** Number of data points used to learn this */
  dataPoints: z.number().int().nonnegative(),
});

export type SeasonalPattern = z.infer<typeof SeasonalPatternSchema>;

/**
 * Special event that affects consumption.
 */
export const SpecialEventSchema = z.object({
  /** Event name/type */
  name: z.string().min(1),
  /** Start date */
  startDate: z.coerce.date(),
  /** End date (optional for one-day events) */
  endDate: z.coerce.date().optional(),
  /** Categories affected */
  affectedCategories: z.array(ProductCategorySchema),
  /** Consumption multiplier during event */
  consumptionMultiplier: z.number().min(0.5).max(5.0),
  /** Is this a recurring event? */
  recurring: z.boolean().default(false),
  /** Recurrence pattern (if recurring) */
  recurrencePattern: z.enum(['annual', 'monthly', 'weekly']).optional(),
});

export type SpecialEvent = z.infer<typeof SpecialEventSchema>;

/**
 * Household consumption profile.
 */
export const HouseholdConsumptionProfileSchema = z.object({
  /** Consumption rates by category (relative to default, 1.0 = default) */
  categoryRates: z.record(z.string(), z.number().min(0.1).max(5.0)),
  /** Seasonal patterns */
  seasonalPatterns: z.array(SeasonalPatternSchema),
  /** Known special events */
  specialEvents: z.array(SpecialEventSchema),
  /** Overall household consumption level (0.5-2.0, 1.0 = average) */
  overallConsumptionLevel: z.number().min(0.5).max(2.0).default(1.0),
  /** Confidence in profile */
  confidence: z.number().min(0).max(1),
  /** Last updated */
  updatedAt: z.coerce.date(),
  /** Data points used */
  totalDataPoints: z.number().int().nonnegative(),
});

export type HouseholdConsumptionProfile = z.infer<typeof HouseholdConsumptionProfileSchema>;

// =============================================================================
// Confidence Adjustment Types
// =============================================================================

/**
 * Factors that adjust confidence in a pruning decision.
 */
export const ConfidenceAdjustmentFactorsSchema = z.object({
  /** Base confidence from heuristics */
  baseConfidence: z.number().min(0).max(1),
  /** Adjustment from prediction history (-0.3 to +0.2) */
  historyAdjustment: z.number().min(-0.3).max(0.2),
  /** Adjustment from recent feedback (-0.3 to +0.2) */
  feedbackAdjustment: z.number().min(-0.3).max(0.2),
  /** Adjustment from data freshness (-0.2 to 0) */
  freshnessAdjustment: z.number().min(-0.2).max(0),
  /** Adjustment from seasonal factors (-0.2 to +0.2) */
  seasonalAdjustment: z.number().min(-0.2).max(0.2),
  /** Final adjusted confidence */
  finalConfidence: z.number().min(0).max(1),
  /** Components breakdown for explainability */
  reasoning: z.array(z.string()),
});

export type ConfidenceAdjustmentFactors = z.infer<typeof ConfidenceAdjustmentFactorsSchema>;

/**
 * Result of confidence adjustment calculation.
 */
export interface ConfidenceAdjustmentResult {
  /** Final adjusted confidence */
  confidence: number;
  /** All adjustment factors applied */
  factors: ConfidenceAdjustmentFactors;
  /** Whether item should be flagged for review */
  flagForReview: boolean;
  /** Human-readable explanation */
  explanation: string;
}

// =============================================================================
// Learning State Persistence
// =============================================================================

/**
 * Complete learning state for persistence.
 */
export const LearningStateSchema = z.object({
  /** Version for migration support */
  version: z.literal(1),
  /** Cadence accuracy records by product key */
  cadenceAccuracy: z.record(z.string(), CadenceAccuracySchema),
  /** Pruning feedback history */
  feedbackHistory: z.array(PruningFeedbackSchema),
  /** Household consumption profile */
  consumptionProfile: HouseholdConsumptionProfileSchema,
  /** Last time learning state was updated */
  lastUpdated: z.coerce.date(),
  /** Statistics */
  stats: z.object({
    totalPredictions: z.number().int().nonnegative(),
    correctPredictions: z.number().int().nonnegative(),
    totalFeedbackSignals: z.number().int().nonnegative(),
    productsLearned: z.number().int().nonnegative(),
  }),
});

export type LearningState = z.infer<typeof LearningStateSchema>;

// =============================================================================
// Adaptive Cadence Configuration
// =============================================================================

/**
 * Configuration for adaptive cadence learning.
 */
export const AdaptiveCadenceConfigSchema = z.object({
  /** Minimum predictions before using learned cadence */
  minPredictionsForLearning: z.number().int().positive().default(3),
  /** Maximum age of predictions to consider (days) */
  predictionMaxAgeDays: z.number().int().positive().default(180),
  /** Weight decay factor for older predictions */
  predictionDecayRate: z.number().min(0).max(1).default(0.1),
  /** Minimum confidence to apply learned cadence */
  minLearnedConfidence: z.number().min(0).max(1).default(0.5),
  /** How much to blend learned vs default (0=all default, 1=all learned) */
  learnedCadenceWeight: z.number().min(0).max(1).default(0.7),
  /** Maximum cadence adjustment per learning cycle (percentage) */
  maxAdjustmentPercent: z.number().min(0).max(0.5).default(0.2),
  /** Enable conservative mode (require more signals before trusting) */
  conservativeMode: z.boolean().default(true),
  /** Number of consistent signals required before trusting */
  requiredConsistentSignals: z.number().int().positive().default(3),
});

export type AdaptiveCadenceConfig = z.infer<typeof AdaptiveCadenceConfigSchema>;

// =============================================================================
// Default Values
// =============================================================================

/**
 * Create default household consumption profile.
 */
export function createDefaultConsumptionProfile(): HouseholdConsumptionProfile {
  return {
    categoryRates: {},
    seasonalPatterns: [],
    specialEvents: [],
    overallConsumptionLevel: 1.0,
    confidence: 0.3,
    updatedAt: new Date(),
    totalDataPoints: 0,
  };
}

/**
 * Create default learning state.
 */
export function createDefaultLearningState(): LearningState {
  return {
    version: 1,
    cadenceAccuracy: {},
    feedbackHistory: [],
    consumptionProfile: createDefaultConsumptionProfile(),
    lastUpdated: new Date(),
    stats: {
      totalPredictions: 0,
      correctPredictions: 0,
      totalFeedbackSignals: 0,
      productsLearned: 0,
    },
  };
}

/**
 * Create default adaptive cadence config.
 */
export function createDefaultAdaptiveCadenceConfig(): AdaptiveCadenceConfig {
  return AdaptiveCadenceConfigSchema.parse({});
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Product key for lookup (productId or normalized name).
 */
export type ProductKey = string;

/**
 * Generate product key from product info.
 */
export function getProductKey(productId: string | undefined, productName: string): ProductKey {
  if (productId) {
    return `id:${productId}`;
  }
  // Normalize name for consistent matching
  return `name:${productName.toLowerCase().trim()}`;
}

/**
 * Feedback weight by signal type.
 * Higher weights = more influence on learning.
 */
export const FEEDBACK_SIGNAL_WEIGHTS: Record<FeedbackSignalType, number> = {
  explicit_correction: 1.0, // Strongest signal - user explicitly said we were wrong
  ran_out_early: 0.9, // Strong signal - household ran out
  emergency_purchase: 0.85, // Strong signal - needed item urgently
  implicit_re_add: 0.7, // Good signal - user re-added what we removed
  still_have_stock: 0.6, // Moderate signal - we were too aggressive
  quantity_adjusted: 0.4, // Weak signal - partial disagreement
  accepted_suggestion: 0.3, // Weak positive signal - could be passive acceptance
};

/**
 * Default seasonal factors by category and month.
 * Month keys are 1-12 (January-December).
 */
export const DEFAULT_SEASONAL_FACTORS: Partial<Record<ProductCategory, Record<string, number>>> = {
  [ProductCategory.BEVERAGES]: {
    '1': 0.8, '2': 0.8, '3': 0.9, '4': 1.0,
    '5': 1.1, '6': 1.3, '7': 1.4, '8': 1.4,
    '9': 1.2, '10': 1.0, '11': 0.9, '12': 1.0,
  },
  [ProductCategory.FRESH_PRODUCE]: {
    '1': 0.9, '2': 0.9, '3': 1.0, '4': 1.1,
    '5': 1.2, '6': 1.2, '7': 1.1, '8': 1.1,
    '9': 1.0, '10': 0.95, '11': 0.9, '12': 0.95,
  },
};
