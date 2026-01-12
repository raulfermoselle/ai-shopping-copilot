/**
 * Substitution Learning Types
 *
 * Type definitions for tracking substitution decisions and learning
 * user preferences to improve future recommendations.
 *
 * Core concepts:
 * - SubstitutionDecision: Records what happened when a substitute was proposed
 * - CategoryTolerance: Learned tolerances at the category level
 * - BrandTolerancePattern: Brand acceptance patterns per category
 * - LearningSignals: Aggregated signals for ranking adjustment
 */

import { z } from 'zod';

// =============================================================================
// Schema Version
// =============================================================================

export const LEARNING_SCHEMA_VERSION = '1.0.0';

// =============================================================================
// Product Reference Types
// =============================================================================

/**
 * Reference to a product for decision tracking.
 * Contains key attributes needed for learning.
 */
export const ProductReferenceSchema = z.object({
  /** Auchan product ID */
  id: z.string(),
  /** Product name */
  name: z.string(),
  /** Brand name (if known) */
  brand: z.string().optional(),
  /** Unit price in euros */
  price: z.number().nonnegative(),
  /** Product category */
  category: z.string(),
  /** Size/weight (e.g., "500g", "1L") */
  size: z.string().optional(),
  /** Price per unit (e.g., "2.50/kg") */
  pricePerUnit: z.string().optional(),
});

export type ProductReference = z.infer<typeof ProductReferenceSchema>;

// =============================================================================
// Decision Types
// =============================================================================

/**
 * Possible user decisions when presented with a substitute.
 */
export const DecisionTypeSchema = z.enum([
  /** User accepted the proposed substitute */
  'accepted',
  /** User rejected the proposed substitute */
  'rejected',
  /** User chose a different substitute than proposed */
  'different_chosen',
]);

export type DecisionType = z.infer<typeof DecisionTypeSchema>;

/**
 * A recorded substitution decision from user interaction.
 */
export const SubstitutionDecisionSchema = z.object({
  /** Unique decision ID */
  id: z.string(),
  /** The original product that was unavailable */
  originalProduct: ProductReferenceSchema,
  /** The substitute that was proposed */
  proposedSubstitute: ProductReferenceSchema,
  /** What the user decided */
  decision: DecisionTypeSchema,
  /** If different_chosen, what product the user actually selected */
  actualChosen: ProductReferenceSchema.optional(),
  /** When the decision was made */
  timestamp: z.string().datetime(),
  /** Session/run ID for context */
  sessionId: z.string().optional(),
  /** The rank of the proposed substitute (1 = top recommendation) */
  proposedRank: z.number().int().positive().optional(),
  /** The original score assigned to the proposed substitute */
  proposedScore: z.number().min(0).max(1).optional(),
});

export type SubstitutionDecision = z.infer<typeof SubstitutionDecisionSchema>;

// =============================================================================
// Tolerance Types
// =============================================================================

/**
 * Brand tolerance level - how strict the user is about brands.
 */
export const BrandToleranceLevelSchema = z.enum([
  /** User strongly prefers specific brands, rarely accepts alternatives */
  'strict',
  /** User accepts some brand variation but has preferences */
  'flexible',
  /** User accepts any brand in this category */
  'any',
]);

export type BrandToleranceLevel = z.infer<typeof BrandToleranceLevelSchema>;

/**
 * Tolerance settings learned for a specific category.
 */
export const CategoryToleranceSchema = z.object({
  /** Product category this tolerance applies to */
  category: z.string(),
  /** How tolerant user is of brand changes */
  brandTolerance: BrandToleranceLevelSchema,
  /** Maximum acceptable price increase as percentage (0.15 = 15%) */
  maxPriceIncrease: z.number().min(0).max(1),
  /** Maximum acceptable size decrease as percentage (0.10 = 10% smaller) */
  maxSizeDecrease: z.number().min(0).max(1),
  /** Confidence in this tolerance (0-1, based on sample size and consistency) */
  confidence: z.number().min(0).max(1),
  /** Number of decisions this tolerance is based on */
  sampleSize: z.number().int().nonnegative(),
  /** When this tolerance was last updated */
  updatedAt: z.string().datetime(),
});

export type CategoryTolerance = z.infer<typeof CategoryToleranceSchema>;

/**
 * Brand-specific pattern for a category.
 * Tracks which brand substitutions work for users.
 */
export const BrandTolerancePatternSchema = z.object({
  /** Category this pattern applies to */
  category: z.string(),
  /** The original brand */
  fromBrand: z.string(),
  /** The substitute brand */
  toBrand: z.string(),
  /** Number of times this substitution was accepted */
  acceptedCount: z.number().int().nonnegative(),
  /** Number of times this substitution was rejected */
  rejectedCount: z.number().int().nonnegative(),
  /** Acceptance rate (accepted / total) */
  acceptanceRate: z.number().min(0).max(1),
  /** Confidence based on sample size */
  confidence: z.number().min(0).max(1),
  /** When this pattern was last updated */
  updatedAt: z.string().datetime(),
});

export type BrandTolerancePattern = z.infer<typeof BrandTolerancePatternSchema>;

// =============================================================================
// Learning Signals (for Ranking Adjustment)
// =============================================================================

/**
 * Aggregated signals for a product based on past decisions.
 * Used by the ranking adjuster to bias scores.
 */
export const ProductLearningSignalSchema = z.object({
  /** Product ID */
  productId: z.string(),
  /** Product name */
  productName: z.string(),
  /** Brand (if known) */
  brand: z.string().optional(),
  /** Category */
  category: z.string(),
  /** Times this product was accepted as a substitute */
  timesAccepted: z.number().int().nonnegative(),
  /** Times this product was rejected as a substitute */
  timesRejected: z.number().int().nonnegative(),
  /** Times user chose this when it wasn't the top recommendation */
  timesUserChose: z.number().int().nonnegative(),
  /** Overall acceptance rate */
  acceptanceRate: z.number().min(0).max(1),
  /** Calculated boost/penalty for ranking (-1 to 1) */
  rankingAdjustment: z.number().min(-1).max(1),
  /** Confidence in signals */
  confidence: z.number().min(0).max(1),
  /** When signals were last calculated */
  updatedAt: z.string().datetime(),
});

export type ProductLearningSignal = z.infer<typeof ProductLearningSignalSchema>;

// =============================================================================
// History Store
// =============================================================================

/**
 * Persistent store for substitution learning data.
 */
export const SubstitutionLearningStoreSchema = z.object({
  /** Schema version for migrations */
  version: z.string(),
  /** Household ID this store belongs to */
  householdId: z.string(),
  /** All recorded substitution decisions */
  decisions: z.array(SubstitutionDecisionSchema),
  /** Learned category tolerances */
  categoryTolerances: z.array(CategoryToleranceSchema),
  /** Brand-to-brand patterns by category */
  brandPatterns: z.array(BrandTolerancePatternSchema),
  /** Per-product learning signals */
  productSignals: z.array(ProductLearningSignalSchema),
  /** When the store was last updated */
  updatedAt: z.string().datetime(),
});

export type SubstitutionLearningStore = z.infer<typeof SubstitutionLearningStoreSchema>;

// =============================================================================
// Ranking Adjustment Result
// =============================================================================

/**
 * Result of applying learning to a substitute candidate.
 */
export interface RankingAdjustmentResult {
  /** Original score before adjustment */
  originalScore: number;
  /** Adjusted score after applying learning */
  adjustedScore: number;
  /** Total adjustment applied (-1 to 1 range, scaled) */
  totalAdjustment: number;
  /** Breakdown of adjustment factors */
  factors: {
    /** Adjustment from product-specific acceptance history */
    productHistory: number;
    /** Adjustment from brand pattern matching */
    brandPattern: number;
    /** Adjustment from category tolerance matching */
    categoryTolerance: number;
    /** Adjustment from price delta vs learned tolerance */
    priceTolerance: number;
    /** Adjustment from size delta vs learned tolerance */
    sizeTolerance: number;
  };
  /** Confidence in the adjustment */
  confidence: number;
  /** Human-readable reasoning */
  reasoning: string[];
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * Configuration for the learning system.
 */
export const LearningConfigSchema = z.object({
  /** Minimum decisions needed to start learning tolerances */
  minDecisionsForLearning: z.number().int().positive().default(3),
  /** How much to weight recent decisions vs older ones (0-1) */
  recencyBias: z.number().min(0).max(1).default(0.7),
  /** Maximum age in days for decisions to contribute to learning */
  maxDecisionAgeDays: z.number().int().positive().default(180),
  /** Weight of product history in ranking adjustment */
  productHistoryWeight: z.number().min(0).max(1).default(0.3),
  /** Weight of brand patterns in ranking adjustment */
  brandPatternWeight: z.number().min(0).max(1).default(0.25),
  /** Weight of category tolerance in ranking adjustment */
  categoryToleranceWeight: z.number().min(0).max(1).default(0.2),
  /** Weight of price tolerance in ranking adjustment */
  priceToleranceWeight: z.number().min(0).max(1).default(0.15),
  /** Weight of size tolerance in ranking adjustment */
  sizeToleranceWeight: z.number().min(0).max(1).default(0.1),
  /** Maximum boost/penalty that can be applied to scores */
  maxAdjustmentMagnitude: z.number().min(0).max(0.5).default(0.25),
  /** Default price tolerance when not learned (percentage) */
  defaultMaxPriceIncrease: z.number().min(0).max(1).default(0.2),
  /** Default size tolerance when not learned (percentage) */
  defaultMaxSizeDecrease: z.number().min(0).max(1).default(0.15),
});

export type LearningConfig = z.infer<typeof LearningConfigSchema>;

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an empty substitution learning store.
 */
export function createEmptyLearningStore(householdId: string): SubstitutionLearningStore {
  return {
    version: LEARNING_SCHEMA_VERSION,
    householdId,
    decisions: [],
    categoryTolerances: [],
    brandPatterns: [],
    productSignals: [],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Create default learning configuration.
 */
export function createDefaultLearningConfig(): LearningConfig {
  return LearningConfigSchema.parse({});
}

/**
 * Create a new substitution decision record.
 */
export function createSubstitutionDecision(
  params: Omit<SubstitutionDecision, 'id' | 'timestamp'>
): SubstitutionDecision {
  return {
    id: `sd-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    timestamp: new Date().toISOString(),
    ...params,
  };
}
