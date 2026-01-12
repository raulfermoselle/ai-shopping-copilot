/**
 * Feedback Collector
 *
 * Collects and validates post-run feedback from users.
 * Enforces the "zero questioning during run" principle by only
 * accepting feedback after the session is complete.
 *
 * Features:
 * - Validates feedback input
 * - Associates feedback with sessions and items
 * - Ensures feedback is collected post-run only
 * - Provides feedback submission API
 */

import {
  type SessionFeedback,
  type FeedbackType,
  type DecisionType,
  type FeedbackSubmissionResult,
  type SubmitItemFeedbackInput,
  SubmitItemFeedbackInputSchema,
  type SubmitSessionFeedbackInput,
  SubmitSessionFeedbackInputSchema,
  validateFeedbackTypeForDecision,
} from './types.js';
import { FeedbackStoreManager, createFeedbackStore } from './feedback-store.js';
import type { CoordinatorSession } from '../types.js';

// =============================================================================
// Configuration
// =============================================================================

export interface FeedbackCollectorConfig {
  /** Household identifier */
  householdId: string;
  /** Base directory for data storage */
  dataDir?: string;
  /** Whether to validate feedback type against decision type */
  strictValidation?: boolean;
}

// =============================================================================
// Validation Errors
// =============================================================================

export class FeedbackValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'FeedbackValidationError';
  }
}

// =============================================================================
// Feedback Collector Class
// =============================================================================

/**
 * FeedbackCollector handles post-run feedback collection.
 *
 * Responsibilities:
 * - Validate feedback input
 * - Enforce post-run timing (no feedback during session)
 * - Associate feedback with sessions/items
 * - Store feedback via FeedbackStoreManager
 */
export class FeedbackCollector {
  private readonly config: Required<FeedbackCollectorConfig>;
  private readonly store: FeedbackStoreManager;
  private activeSession: CoordinatorSession | null = null;

  constructor(config: FeedbackCollectorConfig) {
    this.config = {
      householdId: config.householdId,
      dataDir: config.dataDir ?? process.cwd() + '/data/feedback',
      strictValidation: config.strictValidation ?? true,
    };

    this.store = createFeedbackStore({
      householdId: this.config.householdId,
      dataDir: this.config.dataDir,
    });
  }

  // ===========================================================================
  // Session Lifecycle
  // ===========================================================================

  /**
   * Set the active session for context.
   * Called by Coordinator when session completes.
   */
  setActiveSession(session: CoordinatorSession): void {
    this.activeSession = session;
  }

  /**
   * Clear the active session.
   */
  clearActiveSession(): void {
    this.activeSession = null;
  }

  /**
   * Get the active session ID.
   */
  getActiveSessionId(): string | null {
    return this.activeSession?.sessionId ?? null;
  }

  /**
   * Check if the session is complete and ready for feedback.
   */
  isSessionReadyForFeedback(session?: CoordinatorSession): boolean {
    const targetSession = session ?? this.activeSession;
    if (!targetSession) {
      return false;
    }
    // Session must be in review_ready or completed state
    return targetSession.status === 'review_ready' || targetSession.status === 'completed';
  }

  // ===========================================================================
  // Feedback Submission
  // ===========================================================================

  /**
   * Submit feedback for a single item.
   *
   * @param input - Item feedback input
   * @returns Submission result with feedback ID
   */
  async submitItemFeedback(
    input: SubmitItemFeedbackInput
  ): Promise<FeedbackSubmissionResult> {
    try {
      // Validate input
      const validatedInput = this.validateItemFeedbackInput(input);

      // Validate timing (must be post-run)
      this.validateFeedbackTiming(validatedInput.sessionId);

      // Add to store
      const feedback = await this.store.addItemFeedback(validatedInput);

      return {
        success: true,
        feedbackId: feedback.feedbackId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * Submit overall session feedback (rating, comments).
   *
   * @param input - Session feedback input
   * @returns Submission result
   */
  async submitSessionFeedback(
    input: SubmitSessionFeedbackInput
  ): Promise<FeedbackSubmissionResult> {
    try {
      // Validate input
      const parsed = SubmitSessionFeedbackInputSchema.safeParse(input);
      if (!parsed.success) {
        throw new FeedbackValidationError(
          `Invalid session feedback: ${parsed.error.message}`,
          'INVALID_INPUT',
          { errors: parsed.error.errors }
        );
      }

      // Validate timing
      this.validateFeedbackTiming(input.sessionId);

      // Update session feedback - only include defined properties
      const updates: {
        overallRating?: 1 | 2 | 3 | 4 | 5;
        generalComments?: string;
        cartApproved?: boolean;
      } = {};
      if (input.overallRating !== undefined) {
        updates.overallRating = input.overallRating;
      }
      if (input.generalComments !== undefined) {
        updates.generalComments = input.generalComments;
      }
      if (input.cartApproved !== undefined) {
        updates.cartApproved = input.cartApproved;
      }
      await this.store.updateSessionFeedback(input.sessionId, updates);

      return {
        success: true,
        feedbackId: input.sessionId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * Submit multiple item feedback at once (batch submission).
   *
   * @param feedbackItems - Array of item feedback inputs
   * @returns Array of submission results
   */
  async submitBatchFeedback(
    feedbackItems: SubmitItemFeedbackInput[]
  ): Promise<FeedbackSubmissionResult[]> {
    const results: FeedbackSubmissionResult[] = [];

    for (const input of feedbackItems) {
      const result = await this.submitItemFeedback(input);
      results.push(result);
    }

    return results;
  }

  /**
   * Complete feedback collection for a session.
   * Marks the session as ready for processing.
   *
   * @param sessionId - Session to complete
   * @returns The completed session feedback
   */
  async completeFeedbackCollection(sessionId: string): Promise<SessionFeedback | null> {
    await this.store.ensureLoaded();
    return this.store.completeSession(sessionId);
  }

  // ===========================================================================
  // Query Methods
  // ===========================================================================

  /**
   * Get all feedback for a session.
   *
   * @param sessionId - Session ID to query
   * @returns Session feedback or null
   */
  async getFeedback(sessionId: string): Promise<SessionFeedback | null> {
    await this.store.ensureLoaded();
    return this.store.getSession(sessionId);
  }

  /**
   * Get feedback statistics.
   */
  async getStatistics() {
    await this.store.ensureLoaded();
    return this.store.getStatistics();
  }

  /**
   * Get recent sessions with feedback.
   *
   * @param limit - Maximum number of sessions to return
   */
  async getRecentSessions(limit: number = 10): Promise<SessionFeedback[]> {
    await this.store.ensureLoaded();
    return this.store.getRecentSessions(limit);
  }

  // ===========================================================================
  // Item Context Helpers
  // ===========================================================================

  /**
   * Create feedback input with context from the active session.
   * Helps populate context fields automatically.
   *
   * @param productName - Product name
   * @param feedbackType - Type of feedback
   * @param decisionType - Type of decision
   * @param comment - Optional comment
   */
  createFeedbackWithContext(
    productName: string,
    feedbackType: FeedbackType,
    decisionType: DecisionType,
    comment?: string
  ): SubmitItemFeedbackInput | null {
    if (!this.activeSession || !this.isSessionReadyForFeedback()) {
      return null;
    }

    const input: SubmitItemFeedbackInput = {
      sessionId: this.activeSession.sessionId,
      productName,
      feedbackType,
      decisionType,
      comment,
    };

    // Try to find product context from review pack
    const reviewPack = this.activeSession.reviewPack;
    if (reviewPack) {
      // Look for item in cart
      const cartItem = reviewPack.cart.after.find(
        (item) => item.name.toLowerCase() === productName.toLowerCase()
      );
      if (cartItem) {
        input.context = {
          quantity: cartItem.quantity,
          price: cartItem.unitPrice,
        };
      }

      // Look for substitution context
      if (decisionType === 'substitution' && reviewPack.substitutions) {
        const substitution = reviewPack.substitutions.substitutionResults.find((s) => {
          if (s.originalProduct.name.toLowerCase() === productName.toLowerCase()) {
            return true;
          }
          const firstSub = s.substitutes[0];
          return firstSub !== undefined && firstSub.candidate.name.toLowerCase() === productName.toLowerCase();
        });
        if (substitution) {
          const topSubstitute = substitution.substitutes[0];
          input.context = {
            ...input.context,
            originalProductName: substitution.originalProduct.name,
            substituteProductName: topSubstitute?.candidate.name,
          };
        }
      }

      // Look for pruning context
      if (decisionType === 'pruning' && reviewPack.pruning) {
        const pruned = reviewPack.pruning.recommendedRemovals.find(
          (p) => p.productName.toLowerCase() === productName.toLowerCase()
        );
        if (pruned) {
          input.context = {
            ...input.context,
            daysSinceLastPurchase: pruned.daysSinceLastPurchase,
          };
        }
      }
    }

    return input;
  }

  /**
   * Get items available for feedback from the current session.
   * Returns a list of items with their decision types.
   */
  getAvailableFeedbackItems(): Array<{
    productName: string;
    decisionType: DecisionType;
    productId?: string;
    context?: Record<string, unknown>;
  }> {
    if (!this.activeSession?.reviewPack) {
      return [];
    }

    const items: Array<{
      productName: string;
      decisionType: DecisionType;
      productId?: string;
      context?: Record<string, unknown>;
    }> = [];

    const reviewPack = this.activeSession.reviewPack;

    // Cart items
    for (const item of reviewPack.cart.after) {
      items.push({
        productName: item.name,
        decisionType: 'cart_item',
        context: {
          quantity: item.quantity,
          price: item.unitPrice,
        },
      });
    }

    // Substitution items
    if (reviewPack.substitutions) {
      for (const result of reviewPack.substitutions.substitutionResults) {
        const topSubstitute = result.substitutes[0];
        if (topSubstitute) {
          items.push({
            productName: topSubstitute.candidate.name,
            decisionType: 'substitution',
            context: {
              originalProductName: result.originalProduct.name,
              substituteProductName: topSubstitute.candidate.name,
            },
          });
        }
      }
    }

    // Pruned items
    if (reviewPack.pruning) {
      for (const pruned of reviewPack.pruning.recommendedRemovals) {
        items.push({
          productName: pruned.productName,
          decisionType: 'pruning',
          context: {
            daysSinceLastPurchase: pruned.daysSinceLastPurchase,
            reason: pruned.reason,
          },
        });
      }
    }

    return items;
  }

  // ===========================================================================
  // Validation Methods
  // ===========================================================================

  /**
   * Validate item feedback input.
   */
  private validateItemFeedbackInput(input: SubmitItemFeedbackInput): SubmitItemFeedbackInput {
    // Schema validation
    const parsed = SubmitItemFeedbackInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new FeedbackValidationError(
        `Invalid item feedback: ${parsed.error.message}`,
        'INVALID_INPUT',
        { errors: parsed.error.errors }
      );
    }

    const validatedInput = parsed.data;

    // Validate feedback type against decision type
    if (this.config.strictValidation && validatedInput.decisionType) {
      const isValid = validateFeedbackTypeForDecision(
        validatedInput.feedbackType,
        validatedInput.decisionType
      );
      if (!isValid) {
        throw new FeedbackValidationError(
          `Feedback type '${validatedInput.feedbackType}' is not valid for decision type '${validatedInput.decisionType}'`,
          'INVALID_FEEDBACK_TYPE',
          {
            feedbackType: validatedInput.feedbackType,
            decisionType: validatedInput.decisionType,
          }
        );
      }
    }

    return validatedInput;
  }

  /**
   * Validate that feedback is being submitted at the right time.
   */
  private validateFeedbackTiming(sessionId: string): void {
    // If we have an active session, check if it matches and is ready
    if (this.activeSession) {
      if (this.activeSession.sessionId === sessionId) {
        if (!this.isSessionReadyForFeedback()) {
          throw new FeedbackValidationError(
            'Session is not ready for feedback. Feedback can only be submitted after the run completes.',
            'SESSION_NOT_READY',
            { status: this.activeSession.status }
          );
        }
      }
    }

    // For historical sessions, we always allow feedback
    // (they must have been completed at some point)
  }

  /**
   * Get the underlying store manager (for advanced operations).
   */
  getStore(): FeedbackStoreManager {
    return this.store;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a FeedbackCollector instance.
 */
export function createFeedbackCollector(config: FeedbackCollectorConfig): FeedbackCollector {
  return new FeedbackCollector(config);
}
