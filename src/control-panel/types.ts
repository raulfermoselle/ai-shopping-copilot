/**
 * Control Panel Types
 *
 * Type definitions for the Control Panel user interface layer.
 * Designed with CLI-first approach and renderer abstraction for future Web UI.
 *
 * Architecture: CLI-First with Renderer Abstraction
 * - SessionInput: User-provided configuration
 * - ProgressUpdate: Real-time feedback during execution
 * - FormattedReviewPack: Display-ready Review Pack sections
 * - Renderer: Interface for CLI/Web implementations
 *
 * Integration:
 * - Uses existing Coordinator types for ReviewPack
 * - Maps Coordinator SessionStatus to display-friendly formats
 */

import { z } from 'zod';
import type {
  ReviewPack as CoordinatorReviewPack,
  SessionStatus as CoordinatorSessionStatus,
} from '../agents/coordinator/types.js';

// Re-export Coordinator types for convenience
export type { CoordinatorReviewPack, CoordinatorSessionStatus };

// =============================================================================
// Session Input Types
// =============================================================================

/**
 * Merge strategy options for combining orders.
 */
export const MergeStrategyInputSchema = z.enum(['latest', 'combined']);
export type MergeStrategyInput = z.infer<typeof MergeStrategyInputSchema>;

/**
 * User input for starting a session via Control Panel.
 * Collected from CLI prompts or Web form.
 */
export const SessionInputSchema = z.object({
  /** Auchan account email */
  email: z.string().email('Invalid email format'),
  /** Household identifier for preferences */
  householdId: z.string().min(1, 'Household ID is required'),
  /** Number of recent orders to load (1-5) */
  orderCount: z.number().int().min(1).max(5).default(3),
  /** Strategy for merging multiple orders */
  mergeStrategy: MergeStrategyInputSchema.default('latest'),
});

export type SessionInput = z.infer<typeof SessionInputSchema>;

/**
 * Validate session input from user.
 */
export function validateSessionInput(input: unknown): SessionInput {
  return SessionInputSchema.parse(input);
}

// =============================================================================
// Progress Update Types (for UI rendering)
// =============================================================================

/**
 * Display-friendly phase names.
 */
export const DisplayPhaseSchema = z.enum([
  'initializing',
  'authenticating',
  'loading_cart',
  'generating_review',
  'review_ready',
  'completed',
  'cancelled',
  'error',
]);

export type DisplayPhase = z.infer<typeof DisplayPhaseSchema>;

/**
 * Progress update for UI rendering.
 * Sent during session execution to show real-time feedback.
 */
export const ProgressUpdateSchema = z.object({
  /** Current phase of execution */
  phase: DisplayPhaseSchema,
  /** Human-readable status message */
  message: z.string(),
  /** Completion percentage (0-100) */
  percentComplete: z.number().min(0).max(100),
  /** Whether this phase is complete */
  isComplete: z.boolean(),
  /** Whether this is an error state */
  isError: z.boolean(),
  /** Additional details (e.g., "Loading order 2/3") */
  details: z.string().optional(),
});

export type ProgressUpdate = z.infer<typeof ProgressUpdateSchema>;

/**
 * Map Coordinator SessionStatus to display-friendly ProgressUpdate.
 */
export function createProgressUpdate(
  status: CoordinatorSessionStatus,
  details?: string
): ProgressUpdate {
  const phaseMap: Record<CoordinatorSessionStatus, { phase: DisplayPhase; message: string; percent: number }> = {
    initializing: { phase: 'initializing', message: 'Initializing session...', percent: 10 },
    authenticating: { phase: 'authenticating', message: 'Authenticating...', percent: 25 },
    loading_cart: { phase: 'loading_cart', message: 'Loading cart...', percent: 50 },
    generating_review: { phase: 'generating_review', message: 'Generating review...', percent: 80 },
    review_ready: { phase: 'review_ready', message: 'Review Pack ready', percent: 100 },
    completed: { phase: 'completed', message: 'Session completed', percent: 100 },
    cancelled: { phase: 'cancelled', message: 'Session cancelled', percent: 0 },
  };

  const { phase, message, percent } = phaseMap[status];
  const isTerminal = ['review_ready', 'completed', 'cancelled'].includes(status);
  const isError = status === 'cancelled';

  return {
    phase,
    message: details ?? message,
    percentComplete: percent,
    isComplete: isTerminal,
    isError,
    details,
  };
}

// =============================================================================
// User Decision Types
// =============================================================================

/**
 * User decision on the Review Pack.
 */
export const UserDecisionSchema = z.enum(['approve', 'reject', 'cancel']);
export type UserDecision = z.infer<typeof UserDecisionSchema>;

/**
 * Result of a completed session.
 */
export const SessionResultSchema = z.object({
  /** Session identifier */
  sessionId: z.string(),
  /** Final status */
  status: z.enum(['completed', 'cancelled']),
  /** User's decision */
  decision: UserDecisionSchema,
  /** Confirmation message */
  message: z.string(),
  /** Duration in milliseconds */
  durationMs: z.number(),
});

export type SessionResult = z.infer<typeof SessionResultSchema>;

// =============================================================================
// Legacy Session State (preserved for compatibility)
// =============================================================================

/**
 * Session status (legacy - use CoordinatorSessionStatus for new code)
 * @deprecated Use CoordinatorSessionStatus from coordinator types
 */
export const SessionStatusSchema = z.enum([
  'initializing',
  'loading_orders',
  'building_cart',
  'checking_availability',
  'finding_substitutes',
  'pruning_stock',
  'scouting_slots',
  'generating_review',
  'awaiting_review',
  'approved',
  'cancelled',
  'error',
  'completed',
]);

export type SessionStatus = z.infer<typeof SessionStatusSchema>;

/**
 * Session progress update
 */
export const SessionProgressSchema = z.object({
  /** Current status */
  status: SessionStatusSchema,
  /** Progress percentage (0-100) */
  progress: z.number().min(0).max(100),
  /** Current step description */
  currentStep: z.string(),
  /** Steps completed */
  stepsCompleted: z.number().int().nonnegative(),
  /** Total steps */
  totalSteps: z.number().int().positive(),
  /** Last update time */
  updatedAt: z.date(),
  /** Any error message */
  error: z.string().optional(),
});

export type SessionProgress = z.infer<typeof SessionProgressSchema>;

// =============================================================================
// Review Pack Components
// =============================================================================

/**
 * Item added to cart
 */
export const AddedItemSchema = z.object({
  productId: z.string().optional(),
  name: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  totalPrice: z.number().nonnegative(),
  sourceOrder: z.string().optional(), // Which order this came from
  available: z.boolean().default(true),
});

export type AddedItem = z.infer<typeof AddedItemSchema>;

/**
 * Item suggested for removal
 */
export const SuggestedRemovalSchema = z.object({
  productId: z.string().optional(),
  name: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  daysSinceLastPurchase: z.number().int().nonnegative().optional(),
  /** User action: keep or remove */
  userAction: z.enum(['pending', 'keep', 'remove']).default('pending'),
});

export type SuggestedRemoval = z.infer<typeof SuggestedRemovalSchema>;

/**
 * Item with quantity changed
 */
export const QuantityChangeSchema = z.object({
  productId: z.string().optional(),
  name: z.string(),
  previousQuantity: z.number().int().positive(),
  newQuantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  reason: z.string().optional(),
});

export type QuantityChange = z.infer<typeof QuantityChangeSchema>;

/**
 * Unavailable item with substitutes
 */
export const UnavailableItemSchema = z.object({
  productId: z.string().optional(),
  name: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative().optional(),
  /** Proposed substitutes */
  substitutes: z.array(
    z.object({
      productId: z.string(),
      name: z.string(),
      unitPrice: z.number().nonnegative(),
      priceDelta: z.number(),
      reason: z.string(),
      score: z.number().min(0).max(1),
      /** User selection */
      selected: z.boolean().default(false),
    })
  ),
  /** User action: skip, use_substitute, or remove */
  userAction: z.enum(['pending', 'skip', 'use_substitute', 'remove']).default('pending'),
  /** Selected substitute index (if userAction is use_substitute) */
  selectedSubstituteIndex: z.number().int().nonnegative().optional(),
});

export type UnavailableItem = z.infer<typeof UnavailableItemSchema>;

/**
 * Delivery slot option for review
 */
export const SlotOptionSchema = z.object({
  date: z.date(),
  dayName: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  deliveryCost: z.number().nonnegative().optional(),
  isFree: z.boolean(),
  rank: z.number().int().positive(),
  reason: z.string(),
  /** User selection */
  selected: z.boolean().default(false),
});

export type SlotOption = z.infer<typeof SlotOptionSchema>;

// =============================================================================
// Review Pack
// =============================================================================

/**
 * Complete Review Pack for user approval
 */
export const ReviewPackSchema = z.object({
  /** Session ID */
  sessionId: z.string(),
  /** When the pack was generated */
  generatedAt: z.date(),

  // === Cart Summary ===
  /** Items added to cart */
  addedItems: z.array(AddedItemSchema),
  /** Items suggested for removal (stock pruning) */
  suggestedRemovals: z.array(SuggestedRemovalSchema),
  /** Items with quantity changes */
  quantityChanges: z.array(QuantityChangeSchema),
  /** Unavailable items with substitutes */
  unavailableItems: z.array(UnavailableItemSchema),

  // === Delivery Options ===
  /** Top delivery slot options */
  slotOptions: z.array(SlotOptionSchema),
  /** Whether slots are available */
  slotsAvailable: z.boolean(),

  // === Totals ===
  /** Cart subtotal (before delivery) */
  subtotal: z.number().nonnegative(),
  /** Estimated delivery cost */
  estimatedDeliveryCost: z.number().nonnegative().optional(),
  /** Total estimate */
  estimatedTotal: z.number().nonnegative(),

  // === Metadata ===
  /** Orders analyzed */
  ordersAnalyzed: z.array(z.string()),
  /** Screenshots captured during run */
  screenshots: z.array(z.string()).optional(),
  /** Confidence in the review pack */
  confidence: z.number().min(0).max(1),
  /** Any warnings or notes */
  warnings: z.array(z.string()).optional(),
});

export type ReviewPack = z.infer<typeof ReviewPackSchema>;

// =============================================================================
// User Actions
// =============================================================================

/**
 * User modification to the review pack
 */
export const UserModificationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('removal_decision'),
    productId: z.string(),
    action: z.enum(['keep', 'remove']),
  }),
  z.object({
    type: z.literal('substitute_decision'),
    productId: z.string(),
    action: z.enum(['skip', 'use_substitute', 'remove']),
    substituteIndex: z.number().int().nonnegative().optional(),
  }),
  z.object({
    type: z.literal('quantity_change'),
    productId: z.string(),
    newQuantity: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('slot_selection'),
    slotIndex: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('add_item'),
    productId: z.string(),
    name: z.string(),
    quantity: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('remove_item'),
    productId: z.string(),
  }),
]);

export type UserModification = z.infer<typeof UserModificationSchema>;

/**
 * User's final approval/rejection
 */
export const UserApprovalSchema = z.object({
  /** Approved or rejected */
  approved: z.boolean(),
  /** Modifications made by user */
  modifications: z.array(UserModificationSchema),
  /** Notes from user */
  notes: z.string().optional(),
  /** Timestamp */
  submittedAt: z.date(),
});

export type UserApproval = z.infer<typeof UserApprovalSchema>;

// =============================================================================
// Control Panel API Types
// =============================================================================

/**
 * Start session request
 */
export const StartSessionRequestSchema = z.object({
  /** Auchan username */
  username: z.string().email(),
  /** Auchan password */
  password: z.string().min(1),
  /** Household preferences ID */
  householdId: z.string().optional(),
  /** Number of recent orders to load */
  ordersToLoad: z.number().int().positive().default(3),
  /** Whether to skip substitution search */
  skipSubstitutions: z.boolean().default(false),
  /** Whether to skip stock pruning */
  skipPruning: z.boolean().default(false),
  /** Whether to skip slot scouting */
  skipSlotScout: z.boolean().default(false),
});

export type StartSessionRequest = z.infer<typeof StartSessionRequestSchema>;

/**
 * Start session response
 */
export const StartSessionResponseSchema = z.object({
  /** Session ID */
  sessionId: z.string(),
  /** Initial status */
  status: SessionStatusSchema,
  /** Message */
  message: z.string(),
});

export type StartSessionResponse = z.infer<typeof StartSessionResponseSchema>;

/**
 * Get session status response
 */
export const GetSessionStatusResponseSchema = z.object({
  /** Session ID */
  sessionId: z.string(),
  /** Current progress */
  progress: SessionProgressSchema,
  /** Review pack (if ready) */
  reviewPack: ReviewPackSchema.optional(),
});

export type GetSessionStatusResponse = z.infer<typeof GetSessionStatusResponseSchema>;

/**
 * Submit approval request
 */
export const SubmitApprovalRequestSchema = z.object({
  /** Session ID */
  sessionId: z.string(),
  /** User approval */
  approval: UserApprovalSchema,
});

export type SubmitApprovalRequest = z.infer<typeof SubmitApprovalRequestSchema>;

/**
 * Submit approval response
 */
export const SubmitApprovalResponseSchema = z.object({
  /** Success */
  success: z.boolean(),
  /** Message */
  message: z.string(),
  /** Final cart URL (for manual checkout) */
  cartUrl: z.string().url().optional(),
  /** Final cart summary */
  finalCart: z
    .object({
      itemCount: z.number().int().nonnegative(),
      total: z.number().nonnegative(),
    })
    .optional(),
});

export type SubmitApprovalResponse = z.infer<typeof SubmitApprovalResponseSchema>;

// =============================================================================
// Formatted Review Pack Types (for Display)
// =============================================================================

/**
 * Header section of formatted Review Pack.
 */
export interface HeaderSection {
  sessionId: string;
  generatedAt: string;
  householdId: string;
  confidencePercent: number;
  confidenceLabel: 'High' | 'Medium' | 'Low';
}

/**
 * Summary section of formatted Review Pack.
 */
export interface SummarySection {
  totalItems: number;
  totalPrice: string;
  currency: string;
  sourceOrders: string[];
}

/**
 * Individual item for display in changes section.
 */
export interface DisplayItem {
  name: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  sourceOrders?: string[];
}

/**
 * Quantity change item for display.
 */
export interface DisplayQuantityChange {
  name: string;
  previousQuantity: number;
  newQuantity: number;
  unitPrice: string;
  totalPrice: string;
  reason?: string;
}

/**
 * Changes section of formatted Review Pack.
 */
export interface ChangesSection {
  added: DisplayItem[];
  removed: DisplayItem[];
  quantityChanged: DisplayQuantityChange[];
  unchanged: DisplayItem[];
  summary: {
    addedCount: number;
    removedCount: number;
    changedCount: number;
    unchangedCount: number;
    priceDifference: string;
    priceDifferenceSign: '+' | '-' | '';
  };
}

/**
 * Warning severity for display.
 */
export type WarningSeverity = 'info' | 'warning' | 'error';

/**
 * Individual warning for display.
 */
export interface DisplayWarning {
  type: string;
  message: string;
  severity: WarningSeverity;
  itemName?: string;
}

/**
 * Warnings section of formatted Review Pack.
 */
export interface WarningSection {
  warnings: DisplayWarning[];
  hasWarnings: boolean;
  warningCount: number;
  errorCount: number;
}

/**
 * Substitution item for display (Phase 2).
 */
export interface DisplaySubstitution {
  originalName: string;
  substituteName: string;
  confidence: number;
  priceDifference: string;
}

/**
 * Substitutions section of formatted Review Pack (Phase 2).
 */
export interface SubstitutionSection {
  substitutions: DisplaySubstitution[];
  hasSubstitutions: boolean;
  count: number;
}

/**
 * Pruning suggestion for display (Phase 2).
 */
export interface DisplayPruning {
  itemName: string;
  reason: string;
  lastPurchased: string;
  estimatedNeed: string;
}

/**
 * Pruning section of formatted Review Pack (Phase 2).
 */
export interface PruningSection {
  suggestions: DisplayPruning[];
  hasSuggestions: boolean;
  count: number;
}

/**
 * Delivery slot for display (Phase 2).
 */
export interface DisplaySlot {
  date: string;
  timeWindow: string;
  price: string;
  isPreferred: boolean;
  availability: 'available' | 'limited' | 'full';
}

/**
 * Slots section of formatted Review Pack (Phase 2).
 */
export interface SlotsSection {
  slots: DisplaySlot[];
  hasSlots: boolean;
  count: number;
}

/**
 * Complete formatted Review Pack for display.
 * Transformed from API ReviewPack into display-ready sections.
 */
export interface FormattedReviewPack {
  /** Header with session info and confidence */
  header: HeaderSection;
  /** Cart summary statistics */
  summary: SummarySection;
  /** Cart changes (added, removed, changed, unchanged) */
  changes: ChangesSection;
  /** Warnings and alerts */
  warnings: WarningSection;
  /** Substitution suggestions (Phase 2) */
  substitutions?: SubstitutionSection;
  /** Pruning suggestions (Phase 2) */
  pruning?: PruningSection;
  /** Delivery slot options (Phase 2) */
  slots?: SlotsSection;
}

// =============================================================================
// Renderer Interface
// =============================================================================

/**
 * Renderer interface for UI abstraction.
 * Enables CLI and Web implementations with same API.
 */
export interface Renderer {
  /**
   * Show header with session ID.
   */
  showHeader(sessionId: string): void;

  /**
   * Show progress update during execution.
   */
  showProgress(update: ProgressUpdate): void;

  /**
   * Show formatted Review Pack.
   */
  showReviewPack(pack: FormattedReviewPack): void;

  /**
   * Show error message.
   */
  showError(error: string, context?: string): void;

  /**
   * Show success message.
   */
  showSuccess(message: string): void;

  /**
   * Prompt user for decision on Review Pack.
   * Returns user's choice.
   */
  promptDecision(): Promise<UserDecision>;

  /**
   * Clear screen/output.
   */
  clear(): void;
}

// =============================================================================
// Formatting Utilities
// =============================================================================

/**
 * Currency formatting options.
 */
export interface CurrencyFormatOptions {
  currency: string;
  locale: string;
}

/**
 * Default currency formatting (EUR, Portuguese locale).
 */
export const DEFAULT_CURRENCY_OPTIONS: CurrencyFormatOptions = {
  currency: 'EUR',
  locale: 'pt-PT',
};

/**
 * Format a price for display.
 */
export function formatPrice(
  amount: number,
  options: CurrencyFormatOptions = DEFAULT_CURRENCY_OPTIONS
): string {
  return new Intl.NumberFormat(options.locale, {
    style: 'currency',
    currency: options.currency,
  }).format(amount);
}

/**
 * Format a date for display.
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('pt-PT', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Get confidence label from percentage.
 */
export function getConfidenceLabel(percent: number): 'High' | 'Medium' | 'Low' {
  if (percent >= 80) return 'High';
  if (percent >= 50) return 'Medium';
  return 'Low';
}

// =============================================================================
// CLI-Specific Types
// =============================================================================

/**
 * CLI color scheme for different message types.
 */
export interface CLIColorScheme {
  success: string;
  error: string;
  warning: string;
  info: string;
  header: string;
  highlight: string;
  muted: string;
}

/**
 * Default CLI color scheme.
 */
export const DEFAULT_CLI_COLORS: CLIColorScheme = {
  success: 'green',
  error: 'red',
  warning: 'yellow',
  info: 'blue',
  header: 'cyan',
  highlight: 'white',
  muted: 'gray',
};

/**
 * CLI table column definition.
 */
export interface TableColumn {
  header: string;
  key: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
}

// =============================================================================
// Control Panel Error Types
// =============================================================================

/**
 * Control Panel error codes.
 */
export const CP_ERROR_CODES = {
  INVALID_INPUT: 'CP_INVALID_INPUT',
  SESSION_START_FAILED: 'CP_SESSION_START_FAILED',
  SESSION_NOT_FOUND: 'CP_SESSION_NOT_FOUND',
  REVIEW_PACK_NOT_READY: 'CP_REVIEW_PACK_NOT_READY',
  DECISION_FAILED: 'CP_DECISION_FAILED',
  NETWORK_ERROR: 'CP_NETWORK_ERROR',
  TIMEOUT: 'CP_TIMEOUT',
} as const;

export type CPErrorCode = (typeof CP_ERROR_CODES)[keyof typeof CP_ERROR_CODES];

/**
 * Control Panel error with context.
 */
export class ControlPanelError extends Error {
  readonly code: CPErrorCode;
  readonly context: Record<string, unknown> | undefined;

  constructor(code: CPErrorCode, message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = 'ControlPanelError';
    this.code = code;
    this.context = context;
  }
}
