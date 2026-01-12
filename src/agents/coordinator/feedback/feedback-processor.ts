/**
 * Feedback Processor
 *
 * Routes post-run feedback to learning systems and memory stores.
 * Transforms user feedback into actionable learning signals.
 *
 * Learning Pipeline:
 * - "Good" -> increase item preference score
 * - "Remove next time" -> add to rejection list
 * - "Wrong substitution" -> decrease substitution tolerance
 * - "Ran out early" -> extend restock cadence
 *
 * Features:
 * - Processes unprocessed feedback automatically
 * - Generates learning actions from feedback
 * - Applies actions to memory stores
 * - Tracks processing history
 */

import {
  type ItemFeedback,
  type FeedbackType,
  type LearningAction,
  type LearningActionType,
  type FeedbackProcessingResult,
  createLearningAction,
  getLearningActionForFeedback,
} from './types.js';
import { FeedbackStoreManager, createFeedbackStore } from './feedback-store.js';

// =============================================================================
// Configuration
// =============================================================================

export interface FeedbackProcessorConfig {
  /** Household identifier */
  householdId: string;
  /** Base directory for data storage */
  dataDir?: string;
  /** Whether to automatically apply actions to memory stores */
  autoApply?: boolean;
  /** Batch size for processing */
  batchSize?: number;
}

// =============================================================================
// Learning Action Handlers
// =============================================================================

/**
 * Interface for learning action handlers.
 * Each handler applies a specific type of learning action to memory.
 */
export interface LearningActionHandler {
  type: LearningActionType;
  apply(action: LearningAction): Promise<boolean>;
}

/**
 * Registry of learning action handlers.
 */
export type ActionHandlerRegistry = Map<LearningActionType, LearningActionHandler>;

// =============================================================================
// Feedback Processor Class
// =============================================================================

/**
 * FeedbackProcessor transforms feedback into learning signals and applies them.
 *
 * Responsibilities:
 * - Query unprocessed feedback
 * - Generate learning actions from feedback
 * - Route actions to appropriate handlers
 * - Track processing status
 */
export class FeedbackProcessor {
  private readonly config: Required<FeedbackProcessorConfig>;
  private readonly store: FeedbackStoreManager;
  private readonly handlers: ActionHandlerRegistry = new Map();
  private readonly pendingActions: LearningAction[] = [];

  constructor(config: FeedbackProcessorConfig) {
    this.config = {
      householdId: config.householdId,
      dataDir: config.dataDir ?? process.cwd() + '/data/feedback',
      autoApply: config.autoApply ?? false,
      batchSize: config.batchSize ?? 50,
    };

    this.store = createFeedbackStore({
      householdId: this.config.householdId,
      dataDir: this.config.dataDir,
    });

    // Register default handlers
    this.registerDefaultHandlers();
  }

  // ===========================================================================
  // Handler Registration
  // ===========================================================================

  /**
   * Register a learning action handler.
   */
  registerHandler(handler: LearningActionHandler): void {
    this.handlers.set(handler.type, handler);
  }

  /**
   * Unregister a learning action handler.
   */
  unregisterHandler(type: LearningActionType): void {
    this.handlers.delete(type);
  }

  /**
   * Check if a handler is registered for a type.
   */
  hasHandler(type: LearningActionType): boolean {
    return this.handlers.has(type);
  }

  /**
   * Register default handlers for all action types.
   * These are placeholder implementations - real implementations
   * would integrate with memory stores.
   */
  private registerDefaultHandlers(): void {
    const defaultHandler = (type: LearningActionType): LearningActionHandler => ({
      type,
      apply: async (action: LearningAction) => {
        // Log the action for now - real implementation would update memory stores
        console.log(`[FeedbackProcessor] Applying action: ${type}`, {
          productName: action.productName,
          feedbackId: action.feedbackId,
          parameters: action.parameters,
        });
        return true;
      },
    });

    // Register handlers for all action types
    const actionTypes: LearningActionType[] = [
      'increase_preference',
      'decrease_preference',
      'add_to_rejection_list',
      'remove_from_rejection_list',
      'decrease_substitution_tolerance',
      'increase_substitution_tolerance',
      'extend_restock_cadence',
      'shorten_restock_cadence',
      'record_substitution_success',
      'record_substitution_failure',
    ];

    for (const type of actionTypes) {
      this.registerHandler(defaultHandler(type));
    }
  }

  // ===========================================================================
  // Processing Methods
  // ===========================================================================

  /**
   * Process all pending (unprocessed) feedback.
   */
  async processPendingFeedback(): Promise<FeedbackProcessingResult> {
    await this.store.ensureLoaded();

    const result: FeedbackProcessingResult = {
      success: true,
      processedCount: 0,
      actionsGenerated: 0,
      actionsApplied: 0,
      errors: [],
    };

    try {
      // Get unprocessed feedback
      const unprocessed = await this.store.getUnprocessedFeedback();

      if (unprocessed.length === 0) {
        return result;
      }

      // Process in batches
      const batches = this.batchArray(unprocessed, this.config.batchSize);

      for (const batch of batches) {
        const batchResult = await this.processBatch(batch);
        result.processedCount += batchResult.processedCount;
        result.actionsGenerated += batchResult.actionsGenerated;
        result.actionsApplied += batchResult.actionsApplied;
        result.errors.push(...batchResult.errors);
      }

      result.success = result.errors.length === 0;
    } catch (error) {
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : String(error));
    }

    return result;
  }

  /**
   * Process a batch of feedback items.
   */
  private async processBatch(
    feedbackItems: ItemFeedback[]
  ): Promise<FeedbackProcessingResult> {
    const result: FeedbackProcessingResult = {
      success: true,
      processedCount: 0,
      actionsGenerated: 0,
      actionsApplied: 0,
      errors: [],
    };

    const processedIds: string[] = [];

    for (const feedback of feedbackItems) {
      try {
        // Generate learning actions for this feedback
        const actions = this.generateActions(feedback);
        result.actionsGenerated += actions.length;

        // Apply actions if auto-apply is enabled
        if (this.config.autoApply) {
          for (const action of actions) {
            try {
              const applied = await this.applyAction(action);
              if (applied) {
                result.actionsApplied++;
              }
            } catch (actionError) {
              result.errors.push(
                `Failed to apply action ${action.type} for feedback ${feedback.feedbackId}: ${actionError}`
              );
            }
          }
        } else {
          // Store actions for later application
          this.pendingActions.push(...actions);
        }

        processedIds.push(feedback.feedbackId);
        result.processedCount++;
      } catch (feedbackError) {
        result.errors.push(
          `Failed to process feedback ${feedback.feedbackId}: ${feedbackError}`
        );
      }
    }

    // Mark feedback as processed
    if (processedIds.length > 0) {
      await this.store.markAsProcessed(processedIds);
    }

    result.success = result.errors.length === 0;
    return result;
  }

  /**
   * Generate learning actions from a feedback item.
   */
  generateActions(feedback: ItemFeedback): LearningAction[] {
    const actionTypes = getLearningActionForFeedback(
      feedback.feedbackType,
      feedback.decisionType
    );

    const actions: LearningAction[] = [];

    for (const actionType of actionTypes) {
      const parameters = this.buildActionParameters(feedback, actionType);
      const action = createLearningAction(actionType, feedback, parameters);
      actions.push(action);
    }

    return actions;
  }

  /**
   * Build parameters for a learning action based on feedback context.
   */
  private buildActionParameters(
    feedback: ItemFeedback,
    actionType: LearningActionType
  ): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    // Add common parameters
    params.source = 'user_feedback';
    params.feedbackType = feedback.feedbackType;
    params.decisionType = feedback.decisionType;

    // Add context-specific parameters
    if (feedback.context) {
      switch (actionType) {
        case 'extend_restock_cadence':
        case 'shorten_restock_cadence':
          if (feedback.context.daysSinceLastPurchase !== undefined) {
            params.currentCadenceDays = feedback.context.daysSinceLastPurchase;
            // Extend by 25% for "ran_out_early", shorten by 20% for "good" pruning
            if (actionType === 'extend_restock_cadence') {
              params.adjustmentFactor = 1.25;
            } else {
              params.adjustmentFactor = 0.8;
            }
          }
          break;

        case 'record_substitution_success':
        case 'record_substitution_failure':
        case 'increase_substitution_tolerance':
        case 'decrease_substitution_tolerance':
          params.originalProductName = feedback.context.originalProductName;
          params.substituteProductName = feedback.context.substituteProductName;
          break;

        case 'increase_preference':
        case 'decrease_preference':
          if (feedback.context.quantity !== undefined) {
            params.quantity = feedback.context.quantity;
          }
          if (feedback.context.price !== undefined) {
            params.price = feedback.context.price;
          }
          break;
      }
    }

    // Add user comment if present
    if (feedback.comment) {
      params.userComment = feedback.comment;
    }

    return params;
  }

  /**
   * Apply a learning action using the registered handler.
   */
  async applyAction(action: LearningAction): Promise<boolean> {
    const handler = this.handlers.get(action.type);

    if (!handler) {
      console.warn(`[FeedbackProcessor] No handler registered for action type: ${action.type}`);
      return false;
    }

    try {
      const success = await handler.apply(action);
      if (success) {
        action.applied = true;
        action.appliedAt = new Date();
      }
      return success;
    } catch (error) {
      action.error = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  /**
   * Apply all pending actions that haven't been applied yet.
   */
  async applyPendingActions(): Promise<{
    applied: number;
    failed: number;
    errors: string[];
  }> {
    const result = {
      applied: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const action of this.pendingActions) {
      if (!action.applied) {
        try {
          const success = await this.applyAction(action);
          if (success) {
            result.applied++;
          } else {
            result.failed++;
            if (action.error) {
              result.errors.push(action.error);
            }
          }
        } catch (error) {
          result.failed++;
          result.errors.push(error instanceof Error ? error.message : String(error));
        }
      }
    }

    // Clear applied actions from pending list
    this.pendingActions.splice(
      0,
      this.pendingActions.length,
      ...this.pendingActions.filter((a) => !a.applied)
    );

    return result;
  }

  /**
   * Get pending actions that haven't been applied.
   */
  getPendingActions(): LearningAction[] {
    return [...this.pendingActions];
  }

  /**
   * Clear all pending actions.
   */
  clearPendingActions(): void {
    this.pendingActions.length = 0;
  }

  // ===========================================================================
  // Analysis Methods
  // ===========================================================================

  /**
   * Analyze feedback patterns for a product.
   */
  async analyzeProductFeedback(productName: string): Promise<{
    totalFeedback: number;
    feedbackByType: Record<FeedbackType, number>;
    recentTrend: 'positive' | 'negative' | 'neutral';
    recommendations: string[];
  }> {
    await this.store.ensureLoaded();

    const feedback = await this.store.getFeedbackByProduct(productName);

    const feedbackByType: Record<FeedbackType, number> = {
      good: 0,
      remove_next_time: 0,
      wrong_substitution: 0,
      ran_out_early: 0,
    };

    for (const f of feedback) {
      feedbackByType[f.feedbackType]++;
    }

    // Determine trend based on recent feedback
    const recentFeedback = feedback
      .slice()
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5);

    let positiveCount = 0;
    let negativeCount = 0;

    for (const f of recentFeedback) {
      if (f.feedbackType === 'good') {
        positiveCount++;
      } else {
        negativeCount++;
      }
    }

    let recentTrend: 'positive' | 'negative' | 'neutral';
    if (positiveCount > negativeCount) {
      recentTrend = 'positive';
    } else if (negativeCount > positiveCount) {
      recentTrend = 'negative';
    } else {
      recentTrend = 'neutral';
    }

    // Generate recommendations
    const recommendations: string[] = [];

    if (feedbackByType.remove_next_time > 2) {
      recommendations.push('Consider adding this item to the rejection list');
    }
    if (feedbackByType.wrong_substitution > 1) {
      recommendations.push('Review substitution rules for this product category');
    }
    if (feedbackByType.ran_out_early > 1) {
      recommendations.push('Consider extending restock cadence for this item');
    }

    return {
      totalFeedback: feedback.length,
      feedbackByType,
      recentTrend,
      recommendations,
    };
  }

  /**
   * Get overall feedback health metrics.
   */
  async getHealthMetrics(): Promise<{
    totalUnprocessed: number;
    averageRating: number | null;
    positiveRatio: number;
    topIssues: Array<{ type: FeedbackType; count: number }>;
  }> {
    await this.store.ensureLoaded();
    const stats = await this.store.getStatistics();

    const total = stats.totalFeedbackItems;
    const positiveRatio = total > 0 ? stats.byType.good / total : 0;

    const topIssues = Object.entries(stats.byType)
      .filter(([type]) => type !== 'good')
      .map(([type, count]) => ({ type: type as FeedbackType, count }))
      .sort((a, b) => b.count - a.count);

    return {
      totalUnprocessed: stats.unprocessedCount,
      averageRating: stats.averageRating,
      positiveRatio,
      topIssues,
    };
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Split array into batches.
   */
  private batchArray<T>(array: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Get the underlying store manager.
   */
  getStore(): FeedbackStoreManager {
    return this.store;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a FeedbackProcessor instance.
 */
export function createFeedbackProcessor(config: FeedbackProcessorConfig): FeedbackProcessor {
  return new FeedbackProcessor(config);
}

// =============================================================================
// Convenience API Functions
// =============================================================================

/**
 * Process all pending feedback for a household.
 * Convenience function for simple use cases.
 */
export async function processPendingFeedback(
  householdId: string,
  options?: { dataDir?: string; autoApply?: boolean }
): Promise<FeedbackProcessingResult> {
  const config: FeedbackProcessorConfig = {
    householdId,
    autoApply: options?.autoApply ?? true,
  };
  if (options?.dataDir) {
    config.dataDir = options.dataDir;
  }
  const processor = createFeedbackProcessor(config);

  return processor.processPendingFeedback();
}
