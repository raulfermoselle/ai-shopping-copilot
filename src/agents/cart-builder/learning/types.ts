/**
 * CartBuilder Preference Learning Types
 *
 * Type definitions for tracking and learning from user decisions during
 * Review Pack interactions. These types support:
 * - Tracking approved/rejected items
 * - Learning quantity preferences
 * - Building confidence in recommendations
 *
 * Part of Sprint-CB-I-002: CartBuilder Preference Learning
 */

import { z } from 'zod';

// =============================================================================
// User Decision Types
// =============================================================================

/**
 * Types of user decisions that can be made on cart items.
 */
export const UserDecisionTypeSchema = z.enum([
  /** User kept item in cart (implicit approval) */
  'approved',
  /** User removed item from cart */
  'rejected',
  /** User modified item quantity */
  'quantity_modified',
  /** User substituted item with alternative */
  'substituted',
]);

export type UserDecisionType = z.infer<typeof UserDecisionTypeSchema>;

/**
 * Single user decision on a cart item.
 * Recorded when user interacts with Review Pack.
 */
export const UserDecisionSchema = z.object({
  /** Product identifier */
  productId: z.string().min(1),
  /** Product name (for display and fallback matching) */
  productName: z.string().min(1),
  /** Type of decision made */
  decisionType: UserDecisionTypeSchema,
  /** Original quantity in cart (before decision) */
  originalQuantity: z.number().int().positive(),
  /** Final quantity after decision (0 if rejected) */
  finalQuantity: z.number().int().nonnegative(),
  /** Session ID where decision was made */
  sessionId: z.string().min(1),
  /** Timestamp of decision */
  timestamp: z.coerce.date(),
  /** Source orders that included this item */
  sourceOrders: z.array(z.string()).optional(),
});

export type UserDecision = z.infer<typeof UserDecisionSchema>;

// =============================================================================
// Quantity History Types
// =============================================================================

/**
 * Historical quantity entry for an item.
 * Tracks what quantity the user chose over time.
 */
export const QuantityHistoryEntrySchema = z.object({
  /** Quantity the user chose */
  quantity: z.number().int().positive(),
  /** When this quantity was chosen */
  timestamp: z.coerce.date(),
  /** Session ID for traceability */
  sessionId: z.string().min(1),
  /** Original suggested quantity (before user modification) */
  suggestedQuantity: z.number().int().positive().optional(),
});

export type QuantityHistoryEntry = z.infer<typeof QuantityHistoryEntrySchema>;

// =============================================================================
// Item Preference Types
// =============================================================================

/**
 * Aggregated preference data for a single product.
 * Evolves over time based on user decisions.
 */
export const ItemPreferenceSchema = z.object({
  /** Product identifier (primary key) */
  productId: z.string().min(1),
  /** Product name (for display and matching) */
  productName: z.string().min(1),

  // Approval/rejection tracking
  /** Number of times user approved (kept) this item */
  approvalCount: z.number().int().nonnegative().default(0),
  /** Number of times user rejected (removed) this item */
  rejectionCount: z.number().int().nonnegative().default(0),

  // Quantity tracking
  /** History of quantity choices */
  quantityHistory: z.array(QuantityHistoryEntrySchema).default([]),

  // Last decision info
  /** Most recent decision type */
  lastDecision: UserDecisionTypeSchema.optional(),
  /** Timestamp of last decision */
  lastDecisionAt: z.coerce.date().optional(),

  // Computed confidence (set by scorer)
  /** Confidence in this preference (0-1) */
  confidence: z.number().min(0).max(1).default(0),

  // Metadata
  /** When this preference was first created */
  createdAt: z.coerce.date(),
  /** When this preference was last updated */
  updatedAt: z.coerce.date(),
});

export type ItemPreference = z.infer<typeof ItemPreferenceSchema>;

// =============================================================================
// Preference Score Types
// =============================================================================

/**
 * Breakdown of factors contributing to a preference score.
 * Enables transparency and debugging.
 */
export const PreferenceScoreFactorsSchema = z.object({
  /** Score from approval/rejection ratio */
  approvalRatioScore: z.number(),
  /** Score from recency of decisions */
  recencyScore: z.number(),
  /** Score from decision consistency */
  consistencyScore: z.number(),
  /** Score from quantity stability */
  quantityStabilityScore: z.number(),
  /** Number of data points used */
  dataPoints: z.number().int().nonnegative(),
});

export type PreferenceScoreFactors = z.infer<typeof PreferenceScoreFactorsSchema>;

/**
 * Preference score for an item with full breakdown.
 */
export const PreferenceScoreSchema = z.object({
  /** Product identifier */
  productId: z.string().min(1),
  /** Product name */
  productName: z.string().min(1),

  // Main scores
  /** Overall inclusion score (0-1): should this item be in cart? */
  inclusionScore: z.number().min(0).max(1),
  /** Recommended quantity based on history */
  recommendedQuantity: z.number().int().positive().optional(),
  /** Confidence in the recommendation (0-1) */
  confidence: z.number().min(0).max(1),

  // Decision signals
  /** Strong signal to reject (always remove) */
  strongRejectSignal: z.boolean(),
  /** Strong signal to include (always include) */
  strongIncludeSignal: z.boolean(),

  // Breakdown
  /** Factor contributions to score */
  factors: PreferenceScoreFactorsSchema,

  // Reasoning
  /** Human-readable reasoning for the score */
  reasoning: z.array(z.string()),
});

export type PreferenceScore = z.infer<typeof PreferenceScoreSchema>;

// =============================================================================
// Review Pack Outcome Types
// =============================================================================

/**
 * Outcome of a Review Pack review by the user.
 * Contains all decisions made in a single session.
 */
export const ReviewPackOutcomeSchema = z.object({
  /** Session ID */
  sessionId: z.string().min(1),
  /** Household ID */
  householdId: z.string().min(1),
  /** When review was completed */
  completedAt: z.coerce.date(),

  // Overall outcome
  /** Whether cart was approved as a whole */
  cartApproved: z.boolean(),
  /** Whether cart was rejected entirely */
  cartRejected: z.boolean(),

  // Item decisions
  /** All item-level decisions made */
  decisions: z.array(UserDecisionSchema),

  // Summary statistics
  /** Number of items approved (kept) */
  itemsApproved: z.number().int().nonnegative(),
  /** Number of items rejected (removed) */
  itemsRejected: z.number().int().nonnegative(),
  /** Number of items with quantity changes */
  itemsQuantityModified: z.number().int().nonnegative(),
});

export type ReviewPackOutcome = z.infer<typeof ReviewPackOutcomeSchema>;

// =============================================================================
// Preference Store Types
// =============================================================================

/**
 * Preference store file format.
 * Persisted to enable learning across sessions.
 */
export const PreferenceStoreSchema = z.object({
  /** Household ID this store belongs to */
  householdId: z.string().min(1),
  /** Map of productId to ItemPreference */
  preferences: z.record(z.string(), ItemPreferenceSchema),
  /** When store was last updated */
  lastUpdated: z.coerce.date(),
  /** Total decisions recorded */
  totalDecisions: z.number().int().nonnegative(),
  /** Version of the store format */
  version: z.string().default('1.0'),
});

export type PreferenceStore = z.infer<typeof PreferenceStoreSchema>;

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Configuration for preference learning.
 */
export const PreferenceLearningConfigSchema = z.object({
  // Weighting
  /** Decay rate for older decisions (per day) */
  recencyDecayRate: z.number().min(0).max(1).default(0.98),
  /** Maximum age (days) to consider for decisions */
  maxDecisionAgeDays: z.number().int().positive().default(180),

  // Thresholds
  /** Minimum decisions before confidence is meaningful */
  minDecisionsForConfidence: z.number().int().positive().default(3),
  /** Rejection ratio to trigger strong reject signal */
  strongRejectThreshold: z.number().min(0).max(1).default(0.8),
  /** Approval ratio to trigger strong include signal */
  strongIncludeThreshold: z.number().min(0).max(1).default(0.9),

  // Score weights
  /** Weight for approval ratio in scoring */
  approvalRatioWeight: z.number().min(0).max(1).default(0.4),
  /** Weight for recency in scoring */
  recencyWeight: z.number().min(0).max(1).default(0.25),
  /** Weight for consistency in scoring */
  consistencyWeight: z.number().min(0).max(1).default(0.2),
  /** Weight for quantity stability in scoring */
  quantityStabilityWeight: z.number().min(0).max(1).default(0.15),

  // Quantity estimation
  /** Use median (true) or mean (false) for quantity estimation */
  useMedianForQuantity: z.boolean().default(true),
  /** Minimum quantity history entries for estimation */
  minQuantityHistoryForEstimate: z.number().int().positive().default(2),
});

export type PreferenceLearningConfig = z.infer<typeof PreferenceLearningConfigSchema>;

// =============================================================================
// Cart Preference Check Types
// =============================================================================

/**
 * Result of checking preferences for a cart item.
 */
export const CartItemPreferenceCheckSchema = z.object({
  /** Product identifier */
  productId: z.string().min(1),
  /** Product name */
  productName: z.string().min(1),

  // Recommendation
  /** Should include in cart */
  include: z.boolean(),
  /** Recommended quantity (if include is true) */
  recommendedQuantity: z.number().int().positive().optional(),
  /** Original quantity from order */
  originalQuantity: z.number().int().positive(),

  // Confidence
  /** Confidence in recommendation (0-1) */
  confidence: z.number().min(0).max(1),
  /** Whether recommendation is actionable (high enough confidence) */
  actionable: z.boolean(),

  // Reasoning
  /** Human-readable explanation */
  reason: z.string(),
  /** Detailed reasoning points */
  reasoning: z.array(z.string()),

  // Source data
  /** Preference data if available */
  preference: ItemPreferenceSchema.optional(),
});

export type CartItemPreferenceCheck = z.infer<typeof CartItemPreferenceCheckSchema>;

/**
 * Complete preference check result for a cart.
 */
export const CartPreferenceCheckResultSchema = z.object({
  /** Session ID */
  sessionId: z.string().min(1),
  /** Timestamp of check */
  timestamp: z.coerce.date(),

  // Item checks
  /** Preference check for each cart item */
  itemChecks: z.array(CartItemPreferenceCheckSchema),

  // Summary
  /** Items recommended for exclusion */
  excludedItems: z.array(z.string()),
  /** Items with quantity adjustments */
  quantityAdjustments: z.array(
    z.object({
      productId: z.string(),
      productName: z.string(),
      originalQuantity: z.number().int().positive(),
      recommendedQuantity: z.number().int().positive(),
    })
  ),

  // Statistics
  /** Number of items with preferences */
  itemsWithPreferences: z.number().int().nonnegative(),
  /** Number of items without preferences */
  itemsWithoutPreferences: z.number().int().nonnegative(),
  /** Average confidence across all checks */
  averageConfidence: z.number().min(0).max(1),
});

export type CartPreferenceCheckResult = z.infer<typeof CartPreferenceCheckResultSchema>;

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create default preference learning configuration.
 */
export function createDefaultConfig(): PreferenceLearningConfig {
  return PreferenceLearningConfigSchema.parse({});
}

/**
 * Create empty preference store for a household.
 */
export function createEmptyStore(householdId: string): PreferenceStore {
  return {
    householdId,
    preferences: {},
    lastUpdated: new Date(),
    totalDecisions: 0,
    version: '1.0',
  };
}

/**
 * Create a new item preference entry.
 */
export function createItemPreference(
  productId: string,
  productName: string
): ItemPreference {
  const now = new Date();
  return {
    productId,
    productName,
    approvalCount: 0,
    rejectionCount: 0,
    quantityHistory: [],
    confidence: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Create a user decision record.
 */
export function createUserDecision(
  productId: string,
  productName: string,
  decisionType: UserDecisionType,
  originalQuantity: number,
  finalQuantity: number,
  sessionId: string,
  sourceOrders?: string[]
): UserDecision {
  return {
    productId,
    productName,
    decisionType,
    originalQuantity,
    finalQuantity,
    sessionId,
    timestamp: new Date(),
    sourceOrders,
  };
}
