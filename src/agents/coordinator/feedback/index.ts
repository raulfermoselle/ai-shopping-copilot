/**
 * Post-Run Feedback System
 *
 * Provides structured feedback capture for the AI Shopping Copilot.
 * Feedback is collected AFTER the run completes (never during).
 *
 * Features:
 * - Structured feedback types (good, remove_next_time, wrong_substitution, ran_out_early)
 * - Episodic memory storage (links feedback to sessions/items)
 * - Automatic learning pipeline integration
 * - Non-intrusive, optional feedback collection
 *
 * Usage:
 * ```typescript
 * import {
 *   createFeedbackCollector,
 *   createFeedbackProcessor,
 *   submitFeedback,
 *   getFeedback,
 *   processPendingFeedback,
 * } from './feedback';
 *
 * // After session completes, collect feedback
 * const collector = createFeedbackCollector({ householdId: 'house-123' });
 * collector.setActiveSession(session);
 *
 * // Submit item feedback
 * await collector.submitItemFeedback({
 *   sessionId: 'session-abc',
 *   productName: 'Milk 1L',
 *   feedbackType: 'good',
 * });
 *
 * // Process feedback into learning signals
 * const processor = createFeedbackProcessor({ householdId: 'house-123', autoApply: true });
 * await processor.processPendingFeedback();
 * ```
 */

// =============================================================================
// Types
// =============================================================================

// Core feedback types
export type { FeedbackType, DecisionType, SessionRating, LearningActionType } from './types.js';
export { FeedbackTypeSchema, DecisionTypeSchema, SessionRatingSchema, LearningActionTypeSchema } from './types.js';

// Item feedback
export type { ItemFeedback } from './types.js';
export { ItemFeedbackSchema } from './types.js';

// Session feedback
export type { SessionFeedback } from './types.js';
export { SessionFeedbackSchema } from './types.js';

// Store types
export type { FeedbackStore } from './types.js';
export { FeedbackStoreSchema } from './types.js';

// Learning action types
export type { LearningAction } from './types.js';
export { LearningActionSchema } from './types.js';

// API types
export type { SubmitItemFeedbackInput, SubmitSessionFeedbackInput, FeedbackSubmissionResult, FeedbackProcessingResult } from './types.js';
export { SubmitItemFeedbackInputSchema, SubmitSessionFeedbackInputSchema, FeedbackSubmissionResultSchema, FeedbackProcessingResultSchema } from './types.js';

// Factory and validation functions
export {
  createItemFeedback,
  createSessionFeedback,
  createEmptyFeedbackStore,
  createLearningAction,
  validateFeedbackTypeForDecision,
  getLearningActionForFeedback,
} from './types.js';

// =============================================================================
// Feedback Store
// =============================================================================

export { FeedbackStoreManager, createFeedbackStore } from './feedback-store.js';
export type { FeedbackStoreConfig } from './feedback-store.js';

// =============================================================================
// Feedback Collector
// =============================================================================

export { FeedbackCollector, FeedbackValidationError, createFeedbackCollector } from './feedback-collector.js';
export type { FeedbackCollectorConfig } from './feedback-collector.js';

// =============================================================================
// Feedback Processor
// =============================================================================

export { FeedbackProcessor, createFeedbackProcessor, processPendingFeedback } from './feedback-processor.js';
export type { FeedbackProcessorConfig, LearningActionHandler, ActionHandlerRegistry } from './feedback-processor.js';

// =============================================================================
// Convenience API
// =============================================================================

import { createFeedbackCollector, type FeedbackCollectorConfig } from './feedback-collector.js';
import type {
  SubmitItemFeedbackInput,
  SessionFeedback,
  FeedbackSubmissionResult,
} from './types.js';

/**
 * Submit feedback for a session item.
 * Convenience function that creates a collector and submits feedback.
 *
 * @param householdId - Household identifier
 * @param input - Feedback input
 * @param options - Optional configuration
 * @returns Submission result
 */
export async function submitFeedback(
  householdId: string,
  input: SubmitItemFeedbackInput,
  options?: Pick<FeedbackCollectorConfig, 'dataDir'>
): Promise<FeedbackSubmissionResult> {
  const config: FeedbackCollectorConfig = { householdId };
  if (options?.dataDir) {
    config.dataDir = options.dataDir;
  }
  const collector = createFeedbackCollector(config);
  return collector.submitItemFeedback(input);
}

/**
 * Get feedback for a session.
 * Convenience function that creates a collector and retrieves feedback.
 *
 * @param householdId - Household identifier
 * @param sessionId - Session to query
 * @param options - Optional configuration
 * @returns Session feedback or null
 */
export async function getFeedback(
  householdId: string,
  sessionId: string,
  options?: Pick<FeedbackCollectorConfig, 'dataDir'>
): Promise<SessionFeedback | null> {
  const config: FeedbackCollectorConfig = { householdId };
  if (options?.dataDir) {
    config.dataDir = options.dataDir;
  }
  const collector = createFeedbackCollector(config);
  return collector.getFeedback(sessionId);
}

/**
 * Process pending feedback and apply learning actions.
 * Re-exported from feedback-processor for convenience.
 */
export { processPendingFeedback as processAllPendingFeedback } from './feedback-processor.js';
