/**
 * Coordinator Agent Types
 *
 * Type definitions for the Coordinator agent that orchestrates
 * the shopping cart preparation session.
 *
 * Phase 1 (Fast-Win MVP):
 * - Session lifecycle management
 * - CartBuilder delegation
 * - Review Pack generation
 *
 * Phase 2+ Extensions Reserved:
 * - Substitution worker delegation
 * - StockPruner worker delegation
 * - SlotScout worker delegation
 *
 * SAFETY CONSTRAINT: Coordinator NEVER submits orders - stops at review stage.
 */

import { z } from 'zod';
import type { CartDiffReport, CartBuilderConfig, CartItem as CBCartItem } from '../cart-builder/types.js';
import type { AgentResult } from '../../types/agent.js';
import type { AvailabilityResult, SubstitutionResult } from '../substitution/types.js';
import type { StockPruneReport, RecommendedPrune, UncertainItem } from '../stock-pruner/types.js';
import type { DaySlotGroup, RankedSlot } from '../slot-scout/types.js';

// =============================================================================
// Session State Types
// =============================================================================

/**
 * Session lifecycle states.
 *
 * State machine:
 * initializing → authenticating → loading_cart → generating_review → review_ready
 *      ↓              ↓                ↓               ↓                  ↓
 *    error          error            error           error            (success)
 *      ↓              ↓                ↓               ↓
 *   cancelled      cancelled       cancelled       cancelled
 */
export const SessionStatusSchema = z.enum([
  /** Session is being initialized (loading config, preferences) */
  'initializing',
  /** Login in progress */
  'authenticating',
  /** Loading cart via CartBuilder */
  'loading_cart',
  /** Generating Review Pack from worker results */
  'generating_review',
  /** Review Pack ready for user approval */
  'review_ready',
  /** Session was cancelled due to error or user request */
  'cancelled',
  /** Session completed - user approved or rejected */
  'completed',
]);

export type SessionStatus = z.infer<typeof SessionStatusSchema>;

/**
 * Error severity levels for Coordinator errors.
 */
export const ErrorSeveritySchema = z.enum([
  /** Informational - does not block progress */
  'info',
  /** Warning - may affect results but session continues */
  'warning',
  /** Error - significant issue but recovery attempted */
  'error',
  /** Fatal - session cannot continue */
  'fatal',
]);

export type ErrorSeverity = z.infer<typeof ErrorSeveritySchema>;

/**
 * Coordinator error with context for debugging and recovery.
 */
export const CoordinatorErrorSchema = z.object({
  /** Error code for categorization */
  code: z.string(),
  /** Human-readable error message */
  message: z.string(),
  /** Severity level */
  severity: ErrorSeveritySchema,
  /** Which worker/phase generated this error */
  source: z.enum(['coordinator', 'cart_builder', 'substitution', 'stock_pruner', 'slot_scout', 'login']),
  /** Whether recovery was attempted */
  recoveryAttempted: z.boolean().default(false),
  /** Recovery outcome if attempted */
  recoveryOutcome: z.string().optional(),
  /** Timestamp when error occurred */
  timestamp: z.coerce.date(),
  /** Additional context for debugging */
  context: z.record(z.unknown()).optional(),
});

export type CoordinatorError = z.infer<typeof CoordinatorErrorSchema>;

// =============================================================================
// Worker Result Types
// =============================================================================

/**
 * CartBuilder worker result stored in session.
 * Contains the full CartDiffReport for Review Pack generation.
 */
export const CartBuilderWorkerResultSchema = z.object({
  /** Whether CartBuilder succeeded */
  success: z.boolean(),
  /** Time taken in milliseconds */
  durationMs: z.number(),
  /** The cart diff report (if successful) */
  report: z.custom<CartDiffReport>().optional(),
  /** Error message if failed */
  errorMessage: z.string().optional(),
});

export type CartBuilderWorkerResult = z.infer<typeof CartBuilderWorkerResultSchema>;

/**
 * Substitution worker result stored in session.
 * Contains availability checks and substitute recommendations.
 */
export const SubstitutionWorkerResultSchema = z.object({
  /** Whether Substitution worker succeeded */
  success: z.boolean(),
  /** Time taken in milliseconds */
  durationMs: z.number(),
  /** Availability results for all checked items */
  availabilityResults: z.array(z.custom<AvailabilityResult>()).optional(),
  /** Substitution results for unavailable items */
  substitutionResults: z.array(z.custom<SubstitutionResult>()).optional(),
  /** Summary statistics */
  summary: z.object({
    totalItems: z.number().int().nonnegative(),
    availableItems: z.number().int().nonnegative(),
    unavailableItems: z.number().int().nonnegative(),
    itemsWithSubstitutes: z.number().int().nonnegative(),
    itemsWithoutSubstitutes: z.number().int().nonnegative(),
  }).optional(),
  /** Error message if failed */
  errorMessage: z.string().optional(),
}).nullable();

export type SubstitutionWorkerResult = z.infer<typeof SubstitutionWorkerResultSchema>;

/**
 * StockPruner worker result stored in session.
 * Contains pruning recommendations based on purchase history.
 */
export const StockPrunerWorkerResultSchema = z.object({
  /** Whether StockPruner worker succeeded */
  success: z.boolean(),
  /** Time taken in milliseconds */
  durationMs: z.number(),
  /** Full pruning report */
  report: z.custom<StockPruneReport>().optional(),
  /** High-confidence items to remove */
  recommendedRemovals: z.array(z.custom<RecommendedPrune>()).optional(),
  /** Items with uncertain status (need user review) */
  uncertainItems: z.array(z.custom<UncertainItem>()).optional(),
  /** Summary statistics */
  summary: z.object({
    totalItems: z.number().int().nonnegative(),
    suggestedForPruning: z.number().int().nonnegative(),
    keepInCart: z.number().int().nonnegative(),
    lowConfidenceDecisions: z.number().int().nonnegative(),
  }).optional(),
  /** Error message if failed */
  errorMessage: z.string().optional(),
}).nullable();

export type StockPrunerWorkerResult = z.infer<typeof StockPrunerWorkerResultSchema>;

/**
 * SlotScout worker result stored in session.
 * Contains delivery slot options ranked by preference.
 */
export const SlotScoutWorkerResultSchema = z.object({
  /** Whether SlotScout worker succeeded */
  success: z.boolean(),
  /** Time taken in milliseconds */
  durationMs: z.number(),
  /** Slots grouped by day */
  slotsByDay: z.array(z.custom<DaySlotGroup>()).optional(),
  /** Top ranked slot options */
  rankedSlots: z.array(z.custom<RankedSlot>()).optional(),
  /** Summary statistics */
  summary: z.object({
    daysChecked: z.number().int().nonnegative(),
    totalSlots: z.number().int().nonnegative(),
    availableSlots: z.number().int().nonnegative(),
    earliestAvailable: z.date().optional(),
    cheapestDelivery: z.number().nonnegative().optional(),
    freeDeliveryAvailable: z.boolean(),
  }).optional(),
  /** Minimum order value for delivery */
  minimumOrder: z.number().nonnegative().optional(),
  /** Error message if failed */
  errorMessage: z.string().optional(),
}).nullable();

export type SlotScoutWorkerResult = z.infer<typeof SlotScoutWorkerResultSchema>;

/**
 * Aggregated worker results for the session.
 */
export const WorkerResultsSchema = z.object({
  cartBuilder: CartBuilderWorkerResultSchema.nullable(),
  substitution: SubstitutionWorkerResultSchema,
  stockPruner: StockPrunerWorkerResultSchema,
  slotScout: SlotScoutWorkerResultSchema,
});

export type WorkerResults = z.infer<typeof WorkerResultsSchema>;

// =============================================================================
// Session Types
// =============================================================================

/**
 * Coordinator session state.
 * Tracks the full lifecycle of a shopping session.
 */
export const CoordinatorSessionSchema = z.object({
  /** Unique session identifier */
  sessionId: z.string().min(1),
  /** Session start time */
  startTime: z.coerce.date(),
  /** Session end time (when completed or cancelled) */
  endTime: z.coerce.date().optional(),
  /** Auchan username (email) */
  username: z.string().email(),
  /** Household identifier for preference lookup */
  householdId: z.string().min(1),
  /** Current session status */
  status: SessionStatusSchema,
  /** Worker results */
  workers: WorkerResultsSchema,
  /** Generated Review Pack (when status is review_ready) */
  reviewPack: z.custom<ReviewPack>().nullable(),
  /** Errors encountered during session */
  errors: z.array(CoordinatorErrorSchema),
  /** Screenshots captured during session */
  screenshots: z.array(z.string()),
});

export type CoordinatorSession = z.infer<typeof CoordinatorSessionSchema>;

// =============================================================================
// Review Pack Types
// =============================================================================

/**
 * Cart item for Review Pack display.
 * Simplified version for UI consumption.
 */
export const ReviewCartItemSchema = z.object({
  /** Product name */
  name: z.string(),
  /** Quantity */
  quantity: z.number().int().positive(),
  /** Unit price in EUR */
  unitPrice: z.number().nonnegative(),
  /** Total price (quantity * unitPrice) */
  totalPrice: z.number().nonnegative(),
  /** Product image URL */
  imageUrl: z.string().url().optional(),
  /** Whether item is currently available */
  available: z.boolean().default(true),
});

export type ReviewCartItem = z.infer<typeof ReviewCartItemSchema>;

/**
 * Cart diff item for Review Pack.
 */
export const ReviewDiffItemSchema = z.object({
  /** Product name */
  name: z.string(),
  /** Quantity */
  quantity: z.number().int().positive(),
  /** Unit price */
  unitPrice: z.number().nonnegative(),
  /** Source order IDs */
  sourceOrders: z.array(z.string()).optional(),
});

export type ReviewDiffItem = z.infer<typeof ReviewDiffItemSchema>;

/**
 * Quantity change in Review Pack.
 */
export const ReviewQuantityChangeSchema = z.object({
  /** Product name */
  name: z.string(),
  /** Previous quantity */
  previousQuantity: z.number().int().nonnegative(),
  /** New quantity */
  newQuantity: z.number().int().positive(),
  /** Unit price */
  unitPrice: z.number().nonnegative(),
  /** Reason for change */
  reason: z.string().optional(),
});

export type ReviewQuantityChange = z.infer<typeof ReviewQuantityChangeSchema>;

/**
 * Cart diff for Review Pack display.
 */
export const ReviewCartDiffSchema = z.object({
  /** Items added to cart */
  added: z.array(ReviewDiffItemSchema),
  /** Items removed from cart */
  removed: z.array(ReviewDiffItemSchema),
  /** Items with quantity changes */
  quantityChanged: z.array(ReviewQuantityChangeSchema),
  /** Summary counts */
  summary: z.object({
    addedCount: z.number().int().nonnegative(),
    removedCount: z.number().int().nonnegative(),
    changedCount: z.number().int().nonnegative(),
    unchangedCount: z.number().int().nonnegative(),
    totalItems: z.number().int().nonnegative(),
    priceDifference: z.number(),
    newTotalPrice: z.number().nonnegative(),
  }),
});

export type ReviewCartDiff = z.infer<typeof ReviewCartDiffSchema>;

/**
 * Warning types for Review Pack.
 */
export const ReviewWarningTypeSchema = z.enum([
  /** Item is out of stock */
  'out_of_stock',
  /** Price has changed since last order */
  'price_change',
  /** Data quality issue (partial extraction, etc.) */
  'data_quality',
  /** Item from order history not found in cart */
  'missing_item',
  /** Order loading was partial */
  'partial_order_load',
]);

export type ReviewWarningType = z.infer<typeof ReviewWarningTypeSchema>;

/**
 * Warning in Review Pack.
 */
export const ReviewWarningSchema = z.object({
  /** Warning type */
  type: ReviewWarningTypeSchema,
  /** Human-readable message */
  message: z.string(),
  /** Severity (info, warning, error) */
  severity: z.enum(['info', 'warning', 'error']),
  /** Related item name (if applicable) */
  itemName: z.string().optional(),
  /** Related order ID (if applicable) */
  orderId: z.string().optional(),
});

export type ReviewWarning = z.infer<typeof ReviewWarningSchema>;

/**
 * User action types available on Review Pack.
 */
export const UserActionTypeSchema = z.enum([
  /** Review a specific item */
  'review_item',
  /** Approve entire cart */
  'approve_cart',
  /** Reject cart (start over) */
  'reject_cart',
  /** Remove specific item from cart */
  'remove_item',
  /** Modify item quantity */
  'modify_quantity',
  /** Request substitution for item */
  'request_substitution',
]);

export type UserActionType = z.infer<typeof UserActionTypeSchema>;

/**
 * User action available in Review Pack.
 */
export const UserActionSchema = z.object({
  /** Action identifier */
  id: z.string(),
  /** Action type */
  type: UserActionTypeSchema,
  /** Human-readable description */
  description: z.string(),
  /** Target item name (if action is item-specific) */
  targetItem: z.string().optional(),
  /** Whether action is enabled */
  enabled: z.boolean().default(true),
});

export type UserAction = z.infer<typeof UserActionSchema>;

/**
 * Confidence scores for Review Pack.
 */
export const ReviewConfidenceSchema = z.object({
  /** Overall cart accuracy (0-1) */
  cartAccuracy: z.number().min(0).max(1),
  /** Data quality score (0-1) */
  dataQuality: z.number().min(0).max(1),
  /** Order IDs that were used as source */
  sourceOrders: z.array(z.string()),
});

export type ReviewConfidence = z.infer<typeof ReviewConfidenceSchema>;

/**
 * Cart summary for Review Pack display.
 */
export const CartSummarySchema = z.object({
  /** Total item count */
  itemCount: z.number().int().nonnegative(),
  /** Total price in EUR */
  totalPrice: z.number().nonnegative(),
  /** Currency code */
  currency: z.string().default('EUR'),
});

export type CartSummary = z.infer<typeof CartSummarySchema>;

/**
 * Review Pack - final output for user approval.
 *
 * This is the main deliverable of a Coordinator session.
 * Contains all information needed for user to review and approve the cart.
 */
export const ReviewPackSchema = z.object({
  // Metadata
  /** Session ID this Review Pack belongs to */
  sessionId: z.string(),
  /** When this Review Pack was generated */
  generatedAt: z.coerce.date(),
  /** Household ID */
  householdId: z.string(),

  // Cart State
  cart: z.object({
    /** Summary statistics */
    summary: CartSummarySchema,
    /** Cart diff (changes made by CartBuilder) */
    diff: ReviewCartDiffSchema,
    /** Cart items before session */
    before: z.array(ReviewCartItemSchema),
    /** Cart items after session */
    after: z.array(ReviewCartItemSchema),
  }),

  // Warnings & Actions
  /** Warnings to display to user */
  warnings: z.array(ReviewWarningSchema),
  /** Available user actions */
  actions: z.array(UserActionSchema),

  // Quality & Confidence
  /** Confidence scores */
  confidence: ReviewConfidenceSchema,

  // Phase 2 Extensions
  /** Substitution data (availability + suggestions) */
  substitutions: z.object({
    /** Availability results for all items */
    availabilityResults: z.array(z.custom<AvailabilityResult>()),
    /** Items with substitutes found */
    substitutionResults: z.array(z.custom<SubstitutionResult>()),
    /** Summary */
    summary: z.object({
      totalItems: z.number().int().nonnegative(),
      availableItems: z.number().int().nonnegative(),
      unavailableItems: z.number().int().nonnegative(),
      itemsWithSubstitutes: z.number().int().nonnegative(),
      itemsWithoutSubstitutes: z.number().int().nonnegative(),
    }),
  }).optional(),

  /** Stock pruning recommendations */
  pruning: z.object({
    /** High-confidence items to remove */
    recommendedRemovals: z.array(z.custom<RecommendedPrune>()),
    /** Items needing user review */
    uncertainItems: z.array(z.custom<UncertainItem>()),
    /** Summary */
    summary: z.object({
      totalItems: z.number().int().nonnegative(),
      suggestedForPruning: z.number().int().nonnegative(),
      keepInCart: z.number().int().nonnegative(),
    }),
    /** Overall confidence */
    overallConfidence: z.number().min(0).max(1),
  }).optional(),

  /** Delivery slot options */
  slots: z.object({
    /** Slots grouped by day */
    slotsByDay: z.array(z.custom<DaySlotGroup>()),
    /** Top ranked slots */
    rankedSlots: z.array(z.custom<RankedSlot>()),
    /** Summary */
    summary: z.object({
      daysChecked: z.number().int().nonnegative(),
      totalSlots: z.number().int().nonnegative(),
      availableSlots: z.number().int().nonnegative(),
      earliestAvailable: z.date().optional(),
      cheapestDelivery: z.number().nonnegative().optional(),
      freeDeliveryAvailable: z.boolean(),
    }),
    /** Minimum order value for delivery */
    minimumOrder: z.number().nonnegative().optional(),
  }).optional(),
});

export type ReviewPack = z.infer<typeof ReviewPackSchema>;

// =============================================================================
// Coordinator Configuration Types
// =============================================================================

/**
 * Merge strategy for combining orders into cart.
 */
export const CoordinatorMergeStrategySchema = z.enum([
  /** Use most recent order only */
  'latest',
  /** Combine items from multiple orders, sum quantities */
  'combined',
  /** Use most frequently ordered items (Phase 3) */
  'most_frequent',
]);

export type CoordinatorMergeStrategy = z.infer<typeof CoordinatorMergeStrategySchema>;

/**
 * Coordinator configuration for a session.
 */
export const CoordinatorConfigSchema = z.object({
  /** Maximum number of orders to load from history */
  maxOrdersToLoad: z.number().int().positive().default(3),
  /** Whether to include favorites in cart building */
  includeFavorites: z.boolean().default(false),
  /** Strategy for merging orders */
  mergeStrategy: CoordinatorMergeStrategySchema.default('latest'),
  /** Whether to capture screenshots at key steps */
  captureScreenshots: z.boolean().default(true),
  /** Session timeout in milliseconds */
  sessionTimeout: z.number().int().positive().default(300000), // 5 minutes
  /** Maximum retries for failed operations */
  maxRetries: z.number().int().nonnegative().default(2),
  /** Whether to clear existing cart before loading orders */
  clearExistingCart: z.boolean().default(false),

  // Phase 2+ options (reserved)
  /** Enable substitution worker (Phase 2) */
  enableSubstitution: z.boolean().default(false),
  /** Enable stock pruning worker (Phase 2) */
  enableStockPruning: z.boolean().default(false),
  /** Enable slot scouting worker (Phase 2) */
  enableSlotScouting: z.boolean().default(false),
});

export type CoordinatorConfig = z.infer<typeof CoordinatorConfigSchema>;

// =============================================================================
// Coordinator Result Types
// =============================================================================

/**
 * Data returned by successful Coordinator execution.
 */
export const CoordinatorResultDataSchema = z.object({
  /** Session ID */
  sessionId: z.string(),
  /** Generated Review Pack */
  reviewPack: ReviewPackSchema,
  /** Screenshots captured */
  screenshots: z.array(z.string()),
  /** Session duration in milliseconds */
  durationMs: z.number(),
  /** Final session status */
  status: SessionStatusSchema,
});

export type CoordinatorResultData = z.infer<typeof CoordinatorResultDataSchema>;

/**
 * Coordinator agent result.
 * Extends base AgentResult with typed data.
 */
export interface CoordinatorResult extends AgentResult {
  data?: CoordinatorResultData;
}

// =============================================================================
// Coordinator Context Types
// =============================================================================

/**
 * Context passed to worker agents for delegation.
 * Contains shared resources and session state.
 */
export interface CoordinatorContext {
  /** Current session state */
  session: CoordinatorSession;
  /** Configuration for this session */
  config: CoordinatorConfig;
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a CartBuilderConfig from CoordinatorConfig.
 * Maps Coordinator configuration to CartBuilder-specific options.
 */
export function createCartBuilderConfig(config: CoordinatorConfig): CartBuilderConfig {
  return {
    maxOrdersToLoad: config.maxOrdersToLoad,
    includeFavorites: config.includeFavorites,
    mergeStrategy: config.mergeStrategy === 'most_frequent' ? 'most-frequent' : config.mergeStrategy,
    clearExistingCart: config.clearExistingCart,
  };
}

/**
 * Create an empty session with initial state.
 */
export function createSession(
  sessionId: string,
  username: string,
  householdId: string
): CoordinatorSession {
  return {
    sessionId,
    startTime: new Date(),
    username,
    householdId,
    status: 'initializing',
    workers: {
      cartBuilder: null,
      substitution: null,
      stockPruner: null,
      slotScout: null,
    },
    reviewPack: null,
    errors: [],
    screenshots: [],
  };
}

/**
 * Create a CoordinatorError with defaults.
 */
export function createError(
  code: string,
  message: string,
  severity: ErrorSeverity,
  source: CoordinatorError['source'],
  context?: Record<string, unknown>
): CoordinatorError {
  return {
    code,
    message,
    severity,
    source,
    recoveryAttempted: false,
    timestamp: new Date(),
    context,
  };
}

/**
 * Convert CartBuilder CartItem to ReviewCartItem.
 */
export function toReviewCartItem(item: CBCartItem): ReviewCartItem {
  return {
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    totalPrice: item.quantity * item.unitPrice,
    available: item.available,
  };
}

/**
 * Create default user actions for Review Pack.
 */
export function createDefaultActions(): UserAction[] {
  return [
    {
      id: 'approve',
      type: 'approve_cart',
      description: 'Approve cart and proceed to checkout review',
      enabled: true,
    },
    {
      id: 'reject',
      type: 'reject_cart',
      description: 'Reject cart and start over',
      enabled: true,
    },
  ];
}

// =============================================================================
// Re-exports for Coordinator convenience
// =============================================================================

// Re-export types needed for worker inputs
export type { CartSnapshot, CartDiffReport } from '../cart-builder/types.js';
export type { PurchaseRecord } from '../stock-pruner/types.js';
export type { SlotPreferences } from '../slot-scout/types.js';
