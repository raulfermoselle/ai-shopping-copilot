/**
 * Post-Run Feedback Types
 *
 * Type definitions for the structured feedback system that allows users
 * to provide feedback AFTER the shopping session completes.
 *
 * Phase 3 Feature: Feedback loop for continuous learning.
 *
 * Design Principles:
 * - Zero user questioning during the run
 * - All feedback is optional and collected post-approval
 * - Non-intrusive UI
 * - Feedback feeds into learning pipelines automatically
 */

import { z } from 'zod';

// =============================================================================
// Feedback Type Enum
// =============================================================================

/**
 * Feedback types for individual items or decisions.
 *
 * Each type maps to a specific learning action:
 * - good: Increase item preference score
 * - remove_next_time: Add to rejection list
 * - wrong_substitution: Decrease substitution tolerance
 * - ran_out_early: Extend restock cadence
 */
export const FeedbackTypeSchema = z.enum([
  /** Item was a good suggestion - increase preference score */
  'good',
  /** Don't suggest this item again - add to rejection list */
  'remove_next_time',
  /** The substitute wasn't appropriate - decrease substitution tolerance */
  'wrong_substitution',
  /** Pruned item that was needed - extend restock cadence */
  'ran_out_early',
]);

export type FeedbackType = z.infer<typeof FeedbackTypeSchema>;

// =============================================================================
// Decision Context Types
// =============================================================================

/**
 * The type of decision the feedback relates to.
 * Helps route feedback to the correct learning pipeline.
 */
export const DecisionTypeSchema = z.enum([
  /** Feedback on an item that was added to cart */
  'cart_item',
  /** Feedback on a substitution suggestion */
  'substitution',
  /** Feedback on a pruning recommendation */
  'pruning',
  /** Feedback on an availability check */
  'availability',
  /** Feedback on a slot recommendation */
  'slot',
  /** General session feedback */
  'general',
]);

export type DecisionType = z.infer<typeof DecisionTypeSchema>;

// =============================================================================
// Item Feedback
// =============================================================================

/**
 * Feedback on a specific item or decision in the session.
 */
export const ItemFeedbackSchema = z.object({
  /** Unique feedback identifier */
  feedbackId: z.string().min(1),

  /** Session this feedback belongs to */
  sessionId: z.string().min(1),

  /** Product identifier (if available) */
  productId: z.string().optional(),

  /** Product name - required for display and matching */
  productName: z.string().min(1),

  /** Type of feedback */
  feedbackType: FeedbackTypeSchema,

  /** Type of decision this feedback relates to */
  decisionType: DecisionTypeSchema.default('cart_item'),

  /** Optional user comment */
  comment: z.string().optional(),

  /** When the feedback was submitted */
  timestamp: z.coerce.date(),

  /** Whether this feedback has been processed by learning pipelines */
  processed: z.boolean().default(false),

  /** When the feedback was processed (if processed) */
  processedAt: z.coerce.date().optional(),

  /** Additional context for the feedback */
  context: z.object({
    /** Original item (for substitution feedback) */
    originalProductId: z.string().optional(),
    originalProductName: z.string().optional(),

    /** Substitute that was used (for substitution feedback) */
    substituteProductId: z.string().optional(),
    substituteProductName: z.string().optional(),

    /** Days since last purchase (for pruning feedback) */
    daysSinceLastPurchase: z.number().optional(),

    /** Quantity in cart */
    quantity: z.number().optional(),

    /** Price at time of decision */
    price: z.number().optional(),

    /** Source order IDs */
    sourceOrders: z.array(z.string()).optional(),
  }).optional(),
});

export type ItemFeedback = z.infer<typeof ItemFeedbackSchema>;

// =============================================================================
// Session Feedback
// =============================================================================

/**
 * Overall session rating.
 */
export const SessionRatingSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export type SessionRating = z.infer<typeof SessionRatingSchema>;

/**
 * Aggregated feedback for an entire session.
 */
export const SessionFeedbackSchema = z.object({
  /** Session this feedback belongs to */
  sessionId: z.string().min(1),

  /** Household identifier */
  householdId: z.string().min(1),

  /** Overall session rating (1-5 stars) */
  overallRating: SessionRatingSchema.optional(),

  /** Individual item feedback */
  itemFeedback: z.array(ItemFeedbackSchema),

  /** When feedback collection started */
  collectedAt: z.coerce.date(),

  /** When feedback collection was completed */
  completedAt: z.coerce.date().optional(),

  /** General comments on the session */
  generalComments: z.string().optional(),

  /** Whether the user approved the cart */
  cartApproved: z.boolean().optional(),

  /** Summary statistics */
  summary: z.object({
    totalItemsReviewed: z.number().int().nonnegative().default(0),
    goodFeedbackCount: z.number().int().nonnegative().default(0),
    removeNextTimeCount: z.number().int().nonnegative().default(0),
    wrongSubstitutionCount: z.number().int().nonnegative().default(0),
    ranOutEarlyCount: z.number().int().nonnegative().default(0),
  }).optional(),
});

export type SessionFeedback = z.infer<typeof SessionFeedbackSchema>;

// =============================================================================
// Feedback Store Types
// =============================================================================

/**
 * Persistent store for session feedback (episodic memory).
 */
export const FeedbackStoreSchema = z.object({
  /** Schema version for migration support */
  version: z.string(),

  /** Household identifier */
  householdId: z.string().min(1),

  /** Last update timestamp */
  updatedAt: z.coerce.date(),

  /** All session feedback records */
  sessions: z.array(SessionFeedbackSchema),
});

export type FeedbackStore = z.infer<typeof FeedbackStoreSchema>;

// =============================================================================
// Learning Action Types
// =============================================================================

/**
 * Action types that the feedback processor can emit.
 */
export const LearningActionTypeSchema = z.enum([
  /** Increase preference score for an item */
  'increase_preference',
  /** Decrease preference score for an item */
  'decrease_preference',
  /** Add item to rejection list */
  'add_to_rejection_list',
  /** Remove item from rejection list */
  'remove_from_rejection_list',
  /** Decrease substitution tolerance for an item */
  'decrease_substitution_tolerance',
  /** Increase substitution tolerance for an item */
  'increase_substitution_tolerance',
  /** Extend restock cadence for an item */
  'extend_restock_cadence',
  /** Shorten restock cadence for an item */
  'shorten_restock_cadence',
  /** Record successful substitution */
  'record_substitution_success',
  /** Record failed substitution */
  'record_substitution_failure',
]);

export type LearningActionType = z.infer<typeof LearningActionTypeSchema>;

/**
 * A learning action to be applied to the memory system.
 */
export const LearningActionSchema = z.object({
  /** Action type */
  type: LearningActionTypeSchema,

  /** Item identifier */
  productId: z.string().optional(),
  productName: z.string(),

  /** Source feedback */
  feedbackId: z.string(),
  sessionId: z.string(),

  /** Action parameters */
  parameters: z.record(z.unknown()).optional(),

  /** When the action was created */
  createdAt: z.coerce.date(),

  /** Whether the action has been applied */
  applied: z.boolean().default(false),

  /** When the action was applied */
  appliedAt: z.coerce.date().optional(),

  /** Error if action failed */
  error: z.string().optional(),
});

export type LearningAction = z.infer<typeof LearningActionSchema>;

// =============================================================================
// API Types
// =============================================================================

/**
 * Input for submitting feedback on a single item.
 */
export const SubmitItemFeedbackInputSchema = z.object({
  sessionId: z.string().min(1),
  productId: z.string().optional(),
  productName: z.string().min(1),
  feedbackType: FeedbackTypeSchema,
  decisionType: DecisionTypeSchema.optional(),
  comment: z.string().optional(),
  context: ItemFeedbackSchema.shape.context.optional(),
});

export type SubmitItemFeedbackInput = z.infer<typeof SubmitItemFeedbackInputSchema>;

/**
 * Input for submitting overall session feedback.
 */
export const SubmitSessionFeedbackInputSchema = z.object({
  sessionId: z.string().min(1),
  overallRating: SessionRatingSchema.optional(),
  generalComments: z.string().optional(),
  cartApproved: z.boolean().optional(),
});

export type SubmitSessionFeedbackInput = z.infer<typeof SubmitSessionFeedbackInputSchema>;

/**
 * Result of submitting feedback.
 */
export const FeedbackSubmissionResultSchema = z.object({
  success: z.boolean(),
  feedbackId: z.string().optional(),
  error: z.string().optional(),
});

export type FeedbackSubmissionResult = z.infer<typeof FeedbackSubmissionResultSchema>;

/**
 * Result of processing feedback.
 */
export const FeedbackProcessingResultSchema = z.object({
  success: z.boolean(),
  processedCount: z.number().int().nonnegative(),
  actionsGenerated: z.number().int().nonnegative(),
  actionsApplied: z.number().int().nonnegative(),
  errors: z.array(z.string()),
});

export type FeedbackProcessingResult = z.infer<typeof FeedbackProcessingResultSchema>;

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a new ItemFeedback with defaults.
 */
export function createItemFeedback(
  input: SubmitItemFeedbackInput,
  feedbackId: string
): ItemFeedback {
  return {
    feedbackId,
    sessionId: input.sessionId,
    productId: input.productId,
    productName: input.productName,
    feedbackType: input.feedbackType,
    decisionType: input.decisionType ?? 'cart_item',
    comment: input.comment,
    timestamp: new Date(),
    processed: false,
    context: input.context,
  };
}

/**
 * Create a new SessionFeedback with defaults.
 */
export function createSessionFeedback(
  sessionId: string,
  householdId: string
): SessionFeedback {
  return {
    sessionId,
    householdId,
    itemFeedback: [],
    collectedAt: new Date(),
    summary: {
      totalItemsReviewed: 0,
      goodFeedbackCount: 0,
      removeNextTimeCount: 0,
      wrongSubstitutionCount: 0,
      ranOutEarlyCount: 0,
    },
  };
}

/**
 * Create an empty FeedbackStore.
 */
export function createEmptyFeedbackStore(householdId: string): FeedbackStore {
  return {
    version: '1.0.0',
    householdId,
    updatedAt: new Date(),
    sessions: [],
  };
}

/**
 * Create a LearningAction from feedback.
 */
export function createLearningAction(
  type: LearningActionType,
  feedback: ItemFeedback,
  parameters?: Record<string, unknown>
): LearningAction {
  return {
    type,
    productId: feedback.productId,
    productName: feedback.productName,
    feedbackId: feedback.feedbackId,
    sessionId: feedback.sessionId,
    parameters,
    createdAt: new Date(),
    applied: false,
  };
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate feedback type is appropriate for decision type.
 */
export function validateFeedbackTypeForDecision(
  feedbackType: FeedbackType,
  decisionType: DecisionType
): boolean {
  const validCombinations: Record<DecisionType, FeedbackType[]> = {
    cart_item: ['good', 'remove_next_time'],
    substitution: ['good', 'wrong_substitution'],
    pruning: ['good', 'ran_out_early'],
    availability: ['good'],
    slot: ['good'],
    general: ['good', 'remove_next_time'],
  };

  return validCombinations[decisionType]?.includes(feedbackType) ?? false;
}

/**
 * Get the learning action type for a feedback type.
 */
export function getLearningActionForFeedback(
  feedbackType: FeedbackType,
  decisionType: DecisionType
): LearningActionType[] {
  const actionMap: Record<FeedbackType, Record<DecisionType, LearningActionType[]>> = {
    good: {
      cart_item: ['increase_preference'],
      substitution: ['record_substitution_success', 'increase_substitution_tolerance'],
      pruning: ['shorten_restock_cadence'],
      availability: ['increase_preference'],
      slot: [],
      general: ['increase_preference'],
    },
    remove_next_time: {
      cart_item: ['add_to_rejection_list', 'decrease_preference'],
      substitution: [],
      pruning: [],
      availability: [],
      slot: [],
      general: ['add_to_rejection_list'],
    },
    wrong_substitution: {
      cart_item: [],
      substitution: ['record_substitution_failure', 'decrease_substitution_tolerance'],
      pruning: [],
      availability: [],
      slot: [],
      general: [],
    },
    ran_out_early: {
      cart_item: [],
      substitution: [],
      pruning: ['extend_restock_cadence'],
      availability: [],
      slot: [],
      general: [],
    },
  };

  return actionMap[feedbackType]?.[decisionType] ?? [];
}
