/**
 * Feedback Processor - Pure Functions for Processing User Feedback
 *
 * Processes various feedback signals (explicit corrections, implicit re-adds,
 * emergency purchases, etc.) to improve pruning accuracy over time.
 *
 * All functions are pure: deterministic, no side effects, operate only on inputs.
 */

import { ProductCategory } from '../types.js';
import {
  type PruningFeedback,
  type FeedbackSignal,
  type FeedbackSignalType,
  type LearningState,
  type HouseholdConsumptionProfile,
  type ProductKey,
  FEEDBACK_SIGNAL_WEIGHTS,
  getProductKey,
  type PruningOutcome,
} from './types.js';

// =============================================================================
// Feedback Signal Processing
// =============================================================================

/**
 * Result of processing a feedback signal.
 */
export interface ProcessFeedbackResult {
  /** Updated learning state */
  state: LearningState;
  /** Created feedback record */
  feedback: PruningFeedback | null;
  /** Applied signal */
  signal: FeedbackSignal;
  /** Human-readable description */
  description: string;
  /** Confidence adjustment to apply */
  confidenceAdjustment: number;
}

/**
 * Create a feedback signal from user action.
 *
 * @param type - Type of feedback signal
 * @param productId - Product identifier
 * @param productName - Product name
 * @param category - Product category
 * @param sessionId - Current session ID
 * @param timestamp - When signal occurred
 * @param metadata - Additional metadata
 * @returns Feedback signal
 *
 * @example
 * const signal = createFeedbackSignal(
 *   'implicit_re_add',
 *   'prod-123',
 *   'Leite Mimosa 1L',
 *   ProductCategory.DAIRY,
 *   'session-abc',
 *   new Date()
 * );
 */
export function createFeedbackSignal(
  type: FeedbackSignalType,
  productId: string | undefined,
  productName: string,
  category: ProductCategory,
  sessionId: string,
  timestamp: Date = new Date(),
  metadata?: Record<string, unknown>
): FeedbackSignal {
  return {
    type,
    productId,
    productName,
    category,
    weight: FEEDBACK_SIGNAL_WEIGHTS[type],
    timestamp,
    sessionId,
    metadata,
  };
}

/**
 * Convert feedback signal type to pruning outcome.
 */
function signalTypeToOutcome(signalType: FeedbackSignalType, originalDecision: 'removed' | 'kept'): PruningOutcome {
  switch (signalType) {
    case 'explicit_correction':
    case 'implicit_re_add':
    case 'ran_out_early':
    case 'emergency_purchase':
      // These indicate we wrongly removed something
      return originalDecision === 'removed' ? 'wrong_removal' : 'correct';

    case 'still_have_stock':
      // We should have removed it but kept it
      return originalDecision === 'kept' ? 'wrong_keep' : 'correct';

    case 'accepted_suggestion':
      return 'correct';

    case 'quantity_adjusted':
      // Partial feedback - count as correct but with lower confidence
      return 'correct';

    default:
      return 'unknown';
  }
}

/**
 * Process a feedback signal and update learning state.
 *
 * @param state - Current learning state
 * @param signal - Feedback signal to process
 * @param originalDecision - The original pruning decision ('removed' or 'kept')
 * @param originalConfidence - Confidence of original decision
 * @param decisionTimestamp - When original decision was made
 * @returns Processing result with updated state
 */
export function processFeedbackSignal(
  state: LearningState,
  signal: FeedbackSignal,
  originalDecision: 'removed' | 'kept',
  originalConfidence: number,
  decisionTimestamp: Date
): ProcessFeedbackResult {
  const outcome = signalTypeToOutcome(signal.type, originalDecision);

  // Create feedback record
  const feedback: PruningFeedback = {
    productId: signal.productId,
    productName: signal.productName,
    category: signal.category,
    decision: originalDecision,
    outcome,
    originalConfidence,
    decisionTimestamp,
    feedbackTimestamp: signal.timestamp,
    sessionId: signal.sessionId,
  };

  // Calculate confidence adjustment based on signal type and outcome
  const confidenceAdjustment = calculateConfidenceAdjustment(signal, outcome);

  // Update feedback history
  const updatedFeedbackHistory = [...state.feedbackHistory, feedback];

  // Update stats
  const updatedState: LearningState = {
    ...state,
    feedbackHistory: updatedFeedbackHistory,
    lastUpdated: signal.timestamp,
    stats: {
      ...state.stats,
      totalFeedbackSignals: state.stats.totalFeedbackSignals + 1,
    },
  };

  const outcomeDescription = outcome === 'correct'
    ? 'confirmed decision was correct'
    : outcome === 'wrong_removal'
      ? 'indicated item should NOT have been removed'
      : outcome === 'wrong_keep'
        ? 'indicated item SHOULD have been removed'
        : 'provided unclear feedback';

  return {
    state: updatedState,
    feedback,
    signal,
    description: `Processed ${signal.type} feedback for "${signal.productName}": ${outcomeDescription}`,
    confidenceAdjustment,
  };
}

/**
 * Calculate confidence adjustment from a feedback signal.
 *
 * Negative adjustments decrease confidence (we were wrong).
 * Positive adjustments increase confidence (we were right).
 */
function calculateConfidenceAdjustment(
  signal: FeedbackSignal,
  outcome: PruningOutcome
): number {
  const baseAdjustment = signal.weight;

  switch (outcome) {
    case 'wrong_removal':
      // Strong negative adjustment - we wrongly removed an item
      return -baseAdjustment * 0.3;

    case 'wrong_keep':
      // Moderate negative adjustment - we were too conservative
      return -baseAdjustment * 0.2;

    case 'correct':
      // Small positive adjustment - we were right
      return baseAdjustment * 0.1;

    case 'unknown':
    default:
      return 0;
  }
}

// =============================================================================
// Batch Feedback Processing
// =============================================================================

/**
 * Result of processing multiple feedback signals.
 */
export interface BatchFeedbackResult {
  /** Updated learning state */
  state: LearningState;
  /** Number of signals processed */
  processed: number;
  /** Signals that indicated errors */
  errors: FeedbackSignal[];
  /** Signals that confirmed correct decisions */
  confirmations: FeedbackSignal[];
  /** Summary description */
  summary: string;
}

/**
 * Input for batch feedback processing.
 */
export interface BatchFeedbackInput {
  signal: FeedbackSignal;
  originalDecision: 'removed' | 'kept';
  originalConfidence: number;
  decisionTimestamp: Date;
}

/**
 * Process multiple feedback signals in batch.
 *
 * @param state - Current learning state
 * @param inputs - Array of feedback inputs
 * @returns Batch processing result
 */
export function processBatchFeedback(
  state: LearningState,
  inputs: BatchFeedbackInput[]
): BatchFeedbackResult {
  let currentState = state;
  const errors: FeedbackSignal[] = [];
  const confirmations: FeedbackSignal[] = [];

  for (const input of inputs) {
    const result = processFeedbackSignal(
      currentState,
      input.signal,
      input.originalDecision,
      input.originalConfidence,
      input.decisionTimestamp
    );

    currentState = result.state;

    if (result.feedback?.outcome === 'wrong_removal' || result.feedback?.outcome === 'wrong_keep') {
      errors.push(input.signal);
    } else if (result.feedback?.outcome === 'correct') {
      confirmations.push(input.signal);
    }
  }

  const errorRate = inputs.length > 0 ? errors.length / inputs.length : 0;
  const summary = `Processed ${inputs.length} feedback signals: ` +
    `${confirmations.length} confirmations, ${errors.length} errors ` +
    `(${(errorRate * 100).toFixed(1)}% error rate)`;

  return {
    state: currentState,
    processed: inputs.length,
    errors,
    confirmations,
    summary,
  };
}

// =============================================================================
// Implicit Feedback Detection
// =============================================================================

/**
 * Detected implicit feedback from cart comparison.
 */
export interface DetectedImplicitFeedback {
  /** Product key */
  productKey: ProductKey;
  /** Product name */
  productName: string;
  /** Type of implicit feedback */
  type: FeedbackSignalType;
  /** Description of what was detected */
  description: string;
}

/**
 * Item state for feedback detection.
 */
export interface ItemState {
  productId?: string;
  productName: string;
  wasRemoved: boolean;
  wasKept: boolean;
  currentlyInCart: boolean;
  quantity: number;
}

/**
 * Detect implicit feedback by comparing cart states.
 *
 * Identifies:
 * - Re-added items (item was suggested for removal but user added it back)
 * - Removed kept items (item was kept but user removed it)
 *
 * @param previousDecisions - Previous pruning decisions (productKey -> removed/kept)
 * @param currentCartItems - Current cart items
 * @returns Array of detected implicit feedback
 */
export function detectImplicitFeedback(
  previousDecisions: Map<ProductKey, ItemState>,
  currentCartItems: Map<ProductKey, ItemState>
): DetectedImplicitFeedback[] {
  const feedback: DetectedImplicitFeedback[] = [];

  // Check each previous decision
  for (const [key, prevState] of previousDecisions) {
    const currState = currentCartItems.get(key);

    // Item was suggested for removal but is now in cart
    if (prevState.wasRemoved && currState?.currentlyInCart) {
      feedback.push({
        productKey: key,
        productName: prevState.productName,
        type: 'implicit_re_add',
        description: `"${prevState.productName}" was removed but user added it back`,
      });
    }

    // Item was kept but user removed it
    if (prevState.wasKept && currState && !currState.currentlyInCart) {
      feedback.push({
        productKey: key,
        productName: prevState.productName,
        type: 'still_have_stock',
        description: `"${prevState.productName}" was kept but user removed it`,
      });
    }

    // Quantity was adjusted
    if (
      prevState.currentlyInCart &&
      currState?.currentlyInCart &&
      prevState.quantity !== currState.quantity
    ) {
      feedback.push({
        productKey: key,
        productName: prevState.productName,
        type: 'quantity_adjusted',
        description: `"${prevState.productName}" quantity changed from ${prevState.quantity} to ${currState.quantity}`,
      });
    }
  }

  return feedback;
}

// =============================================================================
// Emergency Purchase Detection
// =============================================================================

/**
 * Detected emergency purchase.
 */
export interface EmergencyPurchase {
  productKey: ProductKey;
  productName: string;
  category: ProductCategory;
  daysSinceLastOrder: number;
  description: string;
}

/**
 * Purchase record for emergency detection.
 */
export interface PurchaseForDetection {
  productId?: string;
  productName: string;
  category: ProductCategory;
  purchaseDate: Date;
  orderId: string;
}

/**
 * Detect emergency purchases (items bought between regular shopping runs).
 *
 * Emergency purchases indicate we removed something the household needed.
 *
 * @param regularOrderDates - Dates of regular shopping orders
 * @param allPurchases - All purchase records including potential emergency buys
 * @param minDaysBetweenOrders - Minimum days between orders to consider regular
 * @returns Array of detected emergency purchases
 */
export function detectEmergencyPurchases(
  regularOrderDates: Date[],
  allPurchases: PurchaseForDetection[],
  minDaysBetweenOrders: number = 3
): EmergencyPurchase[] {
  if (regularOrderDates.length < 2) {
    return [];
  }

  // Sort order dates
  const sortedOrders = [...regularOrderDates].sort((a, b) => a.getTime() - b.getTime());

  const emergencies: EmergencyPurchase[] = [];

  // Find purchases that happened between regular orders
  for (const purchase of allPurchases) {
    const purchaseTime = purchase.purchaseDate.getTime();

    // Find the order window this purchase falls into
    for (let i = 0; i < sortedOrders.length - 1; i++) {
      const prevOrder = sortedOrders[i]!;
      const nextOrder = sortedOrders[i + 1]!;

      const prevTime = prevOrder.getTime();
      const nextTime = nextOrder.getTime();
      const daysBetween = (nextTime - prevTime) / (24 * 60 * 60 * 1000);

      // Only consider windows with sufficient gap
      if (daysBetween < minDaysBetweenOrders * 2) {
        continue;
      }

      // Check if purchase is between these orders (not on same day as either)
      const minGap = minDaysBetweenOrders * 24 * 60 * 60 * 1000;
      if (purchaseTime > prevTime + minGap && purchaseTime < nextTime - minGap) {
        const daysSince = Math.floor((purchaseTime - prevTime) / (24 * 60 * 60 * 1000));

        emergencies.push({
          productKey: getProductKey(purchase.productId, purchase.productName),
          productName: purchase.productName,
          category: purchase.category,
          daysSinceLastOrder: daysSince,
          description: `"${purchase.productName}" purchased ${daysSince} days after regular order`,
        });
        break;
      }
    }
  }

  return emergencies;
}

// =============================================================================
// Feedback Analysis
// =============================================================================

/**
 * Analysis of feedback patterns for a product.
 */
export interface ProductFeedbackAnalysis {
  productKey: ProductKey;
  productName: string;
  totalFeedback: number;
  wrongRemovals: number;
  wrongKeeps: number;
  correct: number;
  netAdjustment: number;
  recommendation: 'trust_more' | 'trust_less' | 'needs_review' | 'insufficient_data';
  reasoning: string;
}

/**
 * Analyze feedback patterns for a specific product.
 *
 * @param state - Learning state
 * @param productKey - Product key to analyze
 * @returns Feedback analysis
 */
export function analyzeProductFeedback(
  state: LearningState,
  productKey: ProductKey
): ProductFeedbackAnalysis {
  const relevantFeedback = state.feedbackHistory.filter((f) => {
    const key = getProductKey(f.productId, f.productName);
    return key === productKey;
  });

  if (relevantFeedback.length === 0) {
    return {
      productKey,
      productName: '',
      totalFeedback: 0,
      wrongRemovals: 0,
      wrongKeeps: 0,
      correct: 0,
      netAdjustment: 0,
      recommendation: 'insufficient_data',
      reasoning: 'No feedback data available',
    };
  }

  const wrongRemovals = relevantFeedback.filter((f) => f.outcome === 'wrong_removal').length;
  const wrongKeeps = relevantFeedback.filter((f) => f.outcome === 'wrong_keep').length;
  const correct = relevantFeedback.filter((f) => f.outcome === 'correct').length;

  const totalErrors = wrongRemovals + wrongKeeps;
  const errorRate = totalErrors / relevantFeedback.length;
  const netAdjustment = (correct * 0.1) - (wrongRemovals * 0.3) - (wrongKeeps * 0.2);

  let recommendation: ProductFeedbackAnalysis['recommendation'];
  let reasoning: string;

  if (relevantFeedback.length < 3) {
    recommendation = 'insufficient_data';
    reasoning = 'Not enough feedback to make a recommendation';
  } else if (wrongRemovals >= 2) {
    recommendation = 'trust_less';
    reasoning = `High false removal rate (${wrongRemovals} incidents). Be more conservative.`;
  } else if (errorRate > 0.5) {
    recommendation = 'needs_review';
    reasoning = `Error rate of ${(errorRate * 100).toFixed(0)}% suggests unpredictable consumption`;
  } else if (correct > totalErrors * 2) {
    recommendation = 'trust_more';
    reasoning = `Good track record (${correct} correct vs ${totalErrors} errors)`;
  } else {
    recommendation = 'needs_review';
    reasoning = 'Mixed results - consider user override';
  }

  return {
    productKey,
    productName: relevantFeedback[0]?.productName ?? '',
    totalFeedback: relevantFeedback.length,
    wrongRemovals,
    wrongKeeps,
    correct,
    netAdjustment,
    recommendation,
    reasoning,
  };
}

/**
 * Get products that need attention based on feedback patterns.
 *
 * @param state - Learning state
 * @param minFeedback - Minimum feedback count to consider
 * @returns Array of products needing review
 */
export function getProductsNeedingReview(
  state: LearningState,
  minFeedback: number = 2
): ProductFeedbackAnalysis[] {
  // Get unique product keys from feedback
  const productKeys = new Set<ProductKey>();
  for (const feedback of state.feedbackHistory) {
    productKeys.add(getProductKey(feedback.productId, feedback.productName));
  }

  const analyses: ProductFeedbackAnalysis[] = [];

  for (const key of productKeys) {
    const analysis = analyzeProductFeedback(state, key);
    if (
      analysis.totalFeedback >= minFeedback &&
      (analysis.recommendation === 'needs_review' || analysis.recommendation === 'trust_less')
    ) {
      analyses.push(analysis);
    }
  }

  // Sort by net adjustment (most problematic first)
  return analyses.sort((a, b) => a.netAdjustment - b.netAdjustment);
}

// =============================================================================
// Consumption Profile Updates
// =============================================================================

/**
 * Result of updating consumption profile from feedback.
 */
export interface UpdateConsumptionProfileResult {
  profile: HouseholdConsumptionProfile;
  adjustments: Array<{
    category: ProductCategory;
    oldRate: number;
    newRate: number;
    reason: string;
  }>;
}

/**
 * Update household consumption profile based on feedback patterns.
 *
 * @param profile - Current consumption profile
 * @param feedbackHistory - Recent feedback history
 * @param timestamp - Current timestamp
 * @returns Updated profile
 */
export function updateConsumptionProfileFromFeedback(
  profile: HouseholdConsumptionProfile,
  feedbackHistory: PruningFeedback[],
  timestamp: Date = new Date()
): UpdateConsumptionProfileResult {
  const adjustments: UpdateConsumptionProfileResult['adjustments'] = [];

  // Group feedback by category
  const feedbackByCategory = new Map<ProductCategory, PruningFeedback[]>();

  for (const feedback of feedbackHistory) {
    const existing = feedbackByCategory.get(feedback.category) ?? [];
    existing.push(feedback);
    feedbackByCategory.set(feedback.category, existing);
  }

  // Update category rates based on feedback
  const updatedRates: Record<string, number> = { ...profile.categoryRates };

  for (const [category, categoryFeedback] of feedbackByCategory) {
    if (categoryFeedback.length < 3) continue;

    const wrongRemovals = categoryFeedback.filter((f) => f.outcome === 'wrong_removal').length;
    const wrongKeeps = categoryFeedback.filter((f) => f.outcome === 'wrong_keep').length;

    const currentRate = updatedRates[category] ?? 1.0;
    let newRate = currentRate;

    // Adjust rate based on feedback patterns
    if (wrongRemovals > wrongKeeps * 2) {
      // Household consumes faster than expected
      newRate = Math.min(currentRate * 1.1, 2.0);
      adjustments.push({
        category,
        oldRate: currentRate,
        newRate,
        reason: `Increased rate: ${wrongRemovals} false removals suggest faster consumption`,
      });
    } else if (wrongKeeps > wrongRemovals * 2) {
      // Household consumes slower than expected
      newRate = Math.max(currentRate * 0.9, 0.5);
      adjustments.push({
        category,
        oldRate: currentRate,
        newRate,
        reason: `Decreased rate: ${wrongKeeps} false keeps suggest slower consumption`,
      });
    }

    updatedRates[category] = newRate;
  }

  const updatedProfile: HouseholdConsumptionProfile = {
    ...profile,
    categoryRates: updatedRates,
    confidence: Math.min(profile.confidence + 0.05, 0.9),
    updatedAt: timestamp,
    totalDataPoints: profile.totalDataPoints + feedbackHistory.length,
  };

  return {
    profile: updatedProfile,
    adjustments,
  };
}
