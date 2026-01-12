/**
 * Preference Scorer
 *
 * Calculates preference scores and confidence levels from user decision history.
 * All functions are pure - they compute values without side effects.
 *
 * Scoring approach:
 * - Recent decisions weight more than old ones (recency decay)
 * - Multiple consistent decisions increase confidence
 * - Contradicting decisions reduce confidence
 *
 * Part of Sprint-CB-I-002: CartBuilder Preference Learning
 */

import type {
  ItemPreference,
  PreferenceStore,
  PreferenceScore,
  PreferenceScoreFactors,
  PreferenceLearningConfig,
  QuantityHistoryEntry,
  CartItemPreferenceCheck,
  CartPreferenceCheckResult,
} from './types.js';
import { createDefaultConfig } from './types.js';

// =============================================================================
// Recency Weighting (Time-decayed scoring)
// =============================================================================

/**
 * Calculate recency weight for a decision based on age.
 * Pure function - exponential decay based on days since decision.
 *
 * @param decisionDate - When the decision was made
 * @param referenceDate - Reference date (default: now)
 * @param decayRate - Daily decay rate (default: 0.98, meaning 2% decay per day)
 * @returns Weight between 0 and 1 (1 = most recent, approaches 0 for old decisions)
 */
export function calculateRecencyWeight(
  decisionDate: Date,
  referenceDate: Date = new Date(),
  decayRate: number = 0.98
): number {
  const daysDiff = (referenceDate.getTime() - decisionDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff <= 0) return 1;
  return Math.pow(decayRate, daysDiff);
}

/**
 * Calculate weighted approval ratio with recency decay.
 * Pure function - weights recent decisions more heavily.
 *
 * @param preference - Item preference with decision history
 * @param config - Learning configuration
 * @param referenceDate - Reference date for recency calculation
 * @returns Weighted approval ratio between 0 and 1
 */
export function calculateWeightedApprovalRatio(
  preference: ItemPreference,
  config: PreferenceLearningConfig,
  referenceDate: Date = new Date()
): { ratio: number; totalWeight: number } {
  // If no decisions, return neutral ratio
  const totalDecisions = preference.approvalCount + preference.rejectionCount;
  if (totalDecisions === 0) {
    return { ratio: 0.5, totalWeight: 0 };
  }

  // Calculate weights based on last decision date
  // This is a simplification - ideally we'd have timestamps for each decision
  // For now, use lastDecisionAt for the most recent decision's weight
  const lastDecisionWeight = preference.lastDecisionAt
    ? calculateRecencyWeight(preference.lastDecisionAt, referenceDate, config.recencyDecayRate)
    : 0.5;

  // Use quantity history timestamps for additional weighting signal
  let historyWeight = 0;
  let historyCount = 0;

  for (const entry of preference.quantityHistory) {
    const weight = calculateRecencyWeight(entry.timestamp, referenceDate, config.recencyDecayRate);
    historyWeight += weight;
    historyCount++;
  }

  // Average weight from quantity history (represents approvals with quantity data)
  const avgHistoryWeight = historyCount > 0 ? historyWeight / historyCount : 0.5;

  // Combine weights - use history weight for approvals if available
  const approvalWeight = historyCount > 0 ? avgHistoryWeight : lastDecisionWeight;
  const rejectionWeight = lastDecisionWeight * 0.9; // Slightly lower weight for rejections (no timestamps)

  // Calculate weighted counts
  const weightedApprovals = preference.approvalCount * approvalWeight;
  const weightedRejections = preference.rejectionCount * rejectionWeight;
  const totalWeight = weightedApprovals + weightedRejections;

  if (totalWeight === 0) {
    return { ratio: 0.5, totalWeight: 0 };
  }

  return {
    ratio: weightedApprovals / totalWeight,
    totalWeight,
  };
}

// =============================================================================
// Consistency Scoring
// =============================================================================

/**
 * Calculate consistency score based on decision pattern.
 * Pure function - measures how consistent user decisions have been.
 *
 * High consistency: user always approves or always rejects
 * Low consistency: user sometimes approves, sometimes rejects
 *
 * @param preference - Item preference
 * @returns Consistency score between 0 and 1
 */
export function calculateConsistencyScore(preference: ItemPreference): number {
  const total = preference.approvalCount + preference.rejectionCount;
  if (total === 0) return 0;
  if (total === 1) return 0.5; // Single decision = moderate confidence

  // Calculate how skewed the ratio is (higher = more consistent)
  const approvalRatio = preference.approvalCount / total;
  const deviation = Math.abs(approvalRatio - 0.5) * 2; // Scale to 0-1

  // Boost consistency for more decisions
  const decisionBoost = Math.min(total / 10, 1); // Max boost at 10 decisions

  return Math.min(deviation * (0.5 + 0.5 * decisionBoost), 1);
}

// =============================================================================
// Quantity Estimation
// =============================================================================

/**
 * Calculate median value from an array of numbers.
 * Pure function.
 */
export function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

/**
 * Calculate mean value from an array of numbers.
 * Pure function.
 */
export function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, val) => acc + val, 0);
  return sum / values.length;
}

/**
 * Calculate standard deviation from an array of numbers.
 * Pure function.
 */
export function calculateStdDev(values: number[]): number {
  if (values.length < 2) return 0;

  const mean = calculateMean(values);
  const squaredDiffs = values.map((val) => Math.pow(val - mean, 2));
  const avgSquaredDiff = calculateMean(squaredDiffs);

  return Math.sqrt(avgSquaredDiff);
}

/**
 * Estimate recommended quantity from quantity history.
 * Pure function - uses median or mean based on config.
 *
 * @param quantityHistory - History of quantity choices
 * @param config - Learning configuration
 * @param referenceDate - Reference date for recency weighting
 * @returns Recommended quantity or undefined if insufficient data
 */
export function estimateQuantity(
  quantityHistory: QuantityHistoryEntry[],
  config: PreferenceLearningConfig,
  referenceDate: Date = new Date()
): { quantity: number; confidence: number } | undefined {
  if (quantityHistory.length < config.minQuantityHistoryForEstimate) {
    return undefined;
  }

  // Extract quantities with recency weighting
  const weightedQuantities: { quantity: number; weight: number }[] = quantityHistory.map(
    (entry) => ({
      quantity: entry.quantity,
      weight: calculateRecencyWeight(entry.timestamp, referenceDate, config.recencyDecayRate),
    })
  );

  // Get base quantities for statistics
  const quantities = weightedQuantities.map((wq) => wq.quantity);

  // Calculate central tendency
  const quantity = config.useMedianForQuantity
    ? Math.round(calculateMedian(quantities))
    : Math.round(calculateMean(quantities));

  // Calculate confidence based on consistency
  const stdDev = calculateStdDev(quantities);
  const mean = calculateMean(quantities);
  const coefficientOfVariation = mean > 0 ? stdDev / mean : 1;

  // Lower CV = more consistent = higher confidence
  // CV of 0 = perfect consistency (1.0), CV of 1+ = low confidence (0.3)
  const consistencyConfidence = Math.max(0.3, 1 - coefficientOfVariation);

  // Boost confidence for more data points
  const dataPointBoost = Math.min(quantities.length / 10, 1); // Max boost at 10 entries

  const confidence = consistencyConfidence * (0.6 + 0.4 * dataPointBoost);

  return { quantity: Math.max(1, quantity), confidence };
}

/**
 * Calculate quantity stability score from history.
 * Pure function - measures how stable quantity choices have been.
 *
 * @param quantityHistory - History of quantity choices
 * @returns Stability score between 0 and 1
 */
export function calculateQuantityStabilityScore(
  quantityHistory: QuantityHistoryEntry[]
): number {
  if (quantityHistory.length < 2) return 0;

  const quantities = quantityHistory.map((entry) => entry.quantity);
  const stdDev = calculateStdDev(quantities);
  const mean = calculateMean(quantities);

  if (mean === 0) return 0;

  const cv = stdDev / mean;
  // Convert CV to stability score (inverse relationship)
  return Math.max(0, 1 - cv);
}

// =============================================================================
// Preference Scoring
// =============================================================================

/**
 * Calculate all scoring factors for a preference.
 * Pure function - computes factor breakdown.
 *
 * @param preference - Item preference
 * @param config - Learning configuration
 * @param referenceDate - Reference date for calculations
 * @returns Score factors breakdown
 */
export function calculateScoreFactors(
  preference: ItemPreference,
  config: PreferenceLearningConfig,
  referenceDate: Date = new Date()
): PreferenceScoreFactors {
  const { ratio: approvalRatio } = calculateWeightedApprovalRatio(
    preference,
    config,
    referenceDate
  );

  // Recency score: how recent is the last decision?
  const recencyScore = preference.lastDecisionAt
    ? calculateRecencyWeight(preference.lastDecisionAt, referenceDate, config.recencyDecayRate)
    : 0;

  const consistencyScore = calculateConsistencyScore(preference);
  const quantityStabilityScore = calculateQuantityStabilityScore(preference.quantityHistory);

  return {
    approvalRatioScore: approvalRatio,
    recencyScore,
    consistencyScore,
    quantityStabilityScore,
    dataPoints: preference.approvalCount + preference.rejectionCount,
  };
}

/**
 * Calculate overall confidence from factors.
 * Pure function.
 *
 * @param factors - Score factors
 * @param config - Learning configuration
 * @returns Overall confidence between 0 and 1
 */
export function calculateConfidenceFromFactors(
  factors: PreferenceScoreFactors,
  config: PreferenceLearningConfig
): number {
  // No data = no confidence
  if (factors.dataPoints === 0) return 0;

  // Base confidence from data points
  const dataPointConfidence = Math.min(factors.dataPoints / config.minDecisionsForConfidence, 1);

  // Weighted average of factors (excluding approval ratio which affects inclusion, not confidence)
  const factorConfidence =
    factors.recencyScore * 0.4 +
    factors.consistencyScore * 0.4 +
    factors.quantityStabilityScore * 0.2;

  return dataPointConfidence * factorConfidence;
}

/**
 * Calculate inclusion score (should item be in cart?).
 * Pure function.
 *
 * @param factors - Score factors
 * @param config - Learning configuration
 * @returns Inclusion score between 0 and 1
 */
export function calculateInclusionScore(
  factors: PreferenceScoreFactors,
  config: PreferenceLearningConfig
): number {
  // Weighted combination of factors
  return (
    factors.approvalRatioScore * config.approvalRatioWeight +
    factors.recencyScore * config.recencyWeight +
    factors.consistencyScore * config.consistencyWeight +
    factors.quantityStabilityScore * config.quantityStabilityWeight
  );
}

/**
 * Calculate full preference score for an item.
 * Pure function - main scoring entry point.
 *
 * @param preference - Item preference
 * @param config - Learning configuration
 * @param referenceDate - Reference date for calculations
 * @returns Complete PreferenceScore with breakdown
 */
export function scorePreference(
  preference: ItemPreference,
  config: PreferenceLearningConfig = createDefaultConfig(),
  referenceDate: Date = new Date()
): PreferenceScore {
  const factors = calculateScoreFactors(preference, config, referenceDate);
  const confidence = calculateConfidenceFromFactors(factors, config);
  const inclusionScore = calculateInclusionScore(factors, config);

  // Check for strong signals
  const total = preference.approvalCount + preference.rejectionCount;
  const hasEnoughDecisions = total >= config.minDecisionsForConfidence;

  const rejectionRatio = total > 0 ? preference.rejectionCount / total : 0;
  const approvalRatio = total > 0 ? preference.approvalCount / total : 0;

  const strongRejectSignal =
    hasEnoughDecisions && rejectionRatio >= config.strongRejectThreshold;
  const strongIncludeSignal =
    hasEnoughDecisions && approvalRatio >= config.strongIncludeThreshold;

  // Estimate quantity
  const quantityEstimate = estimateQuantity(preference.quantityHistory, config, referenceDate);

  // Build reasoning
  const reasoning: string[] = [];

  if (hasEnoughDecisions) {
    reasoning.push(
      `Based on ${total} decisions (${preference.approvalCount} approvals, ${preference.rejectionCount} rejections)`
    );
  } else {
    reasoning.push(
      `Limited data: only ${total} decision(s), need ${config.minDecisionsForConfidence} for confidence`
    );
  }

  if (strongRejectSignal) {
    reasoning.push(`Strong rejection signal: rejected ${Math.round(rejectionRatio * 100)}% of times`);
  } else if (strongIncludeSignal) {
    reasoning.push(`Strong inclusion signal: approved ${Math.round(approvalRatio * 100)}% of times`);
  }

  if (factors.recencyScore < 0.5) {
    reasoning.push('Last decision was made a while ago, confidence reduced');
  }

  if (quantityEstimate) {
    reasoning.push(
      `Typical quantity: ${quantityEstimate.quantity} (${Math.round(quantityEstimate.confidence * 100)}% confidence)`
    );
  }

  return {
    productId: preference.productId,
    productName: preference.productName,
    inclusionScore,
    recommendedQuantity: quantityEstimate?.quantity,
    confidence,
    strongRejectSignal,
    strongIncludeSignal,
    factors,
    reasoning,
  };
}

// =============================================================================
// Cart Preference Checking
// =============================================================================

/**
 * Cart item for preference checking.
 */
export interface CartItemForCheck {
  productId: string;
  productName: string;
  quantity: number;
}

/**
 * Check preference for a single cart item.
 * Pure function - determines if item should be included with what quantity.
 *
 * @param item - Cart item to check
 * @param store - Preference store
 * @param config - Learning configuration
 * @param referenceDate - Reference date for calculations
 * @returns Preference check result for the item
 */
export function checkItemPreference(
  item: CartItemForCheck,
  store: PreferenceStore,
  config: PreferenceLearningConfig = createDefaultConfig(),
  referenceDate: Date = new Date()
): CartItemPreferenceCheck {
  const preference = store.preferences[item.productId];

  // No preference data - include by default with low confidence
  if (!preference) {
    return {
      productId: item.productId,
      productName: item.productName,
      include: true,
      recommendedQuantity: item.quantity,
      originalQuantity: item.quantity,
      confidence: 0,
      actionable: false,
      reason: 'No preference data available',
      reasoning: ['This item has not been reviewed before', 'Including by default'],
    };
  }

  // Score the preference
  const score = scorePreference(preference, config, referenceDate);

  // Determine recommendation
  let include = true;
  let reason: string;
  const reasoning: string[] = [...score.reasoning];

  if (score.strongRejectSignal) {
    include = false;
    reason = `User typically removes this item (rejected ${preference.rejectionCount}/${preference.approvalCount + preference.rejectionCount} times)`;
    reasoning.push('Recommendation: EXCLUDE from cart');
  } else if (score.strongIncludeSignal) {
    include = true;
    reason = `User typically keeps this item (approved ${preference.approvalCount}/${preference.approvalCount + preference.rejectionCount} times)`;
    reasoning.push('Recommendation: INCLUDE in cart');
  } else if (score.inclusionScore < 0.4) {
    include = false;
    reason = `Low inclusion score (${Math.round(score.inclusionScore * 100)}%) suggests removal`;
    reasoning.push('Recommendation: Consider excluding from cart');
  } else {
    include = true;
    reason = `Moderate preference data supports inclusion`;
    reasoning.push('Recommendation: INCLUDE in cart');
  }

  // Determine quantity
  let recommendedQuantity = item.quantity;
  if (include && score.recommendedQuantity) {
    recommendedQuantity = score.recommendedQuantity;
    if (recommendedQuantity !== item.quantity) {
      reasoning.push(
        `Quantity adjustment: ${item.quantity} -> ${recommendedQuantity} based on history`
      );
    }
  }

  // Is this actionable? (high enough confidence to act on)
  const actionable = score.confidence >= 0.5 || score.strongRejectSignal || score.strongIncludeSignal;

  return {
    productId: item.productId,
    productName: item.productName,
    include,
    recommendedQuantity: include ? recommendedQuantity : undefined,
    originalQuantity: item.quantity,
    confidence: score.confidence,
    actionable,
    reason,
    reasoning,
    preference,
  };
}

/**
 * Check preferences for all items in a cart.
 * Pure function - batch preference checking.
 *
 * @param items - Cart items to check
 * @param store - Preference store
 * @param sessionId - Session identifier
 * @param config - Learning configuration
 * @param referenceDate - Reference date for calculations
 * @returns Complete preference check result for the cart
 */
export function checkCartPreferences(
  items: CartItemForCheck[],
  store: PreferenceStore,
  sessionId: string,
  config: PreferenceLearningConfig = createDefaultConfig(),
  referenceDate: Date = new Date()
): CartPreferenceCheckResult {
  // Check each item
  const itemChecks: CartItemPreferenceCheck[] = items.map((item) =>
    checkItemPreference(item, store, config, referenceDate)
  );

  // Compute aggregates
  const excludedItems: string[] = [];
  const quantityAdjustments: CartPreferenceCheckResult['quantityAdjustments'] = [];
  let itemsWithPreferences = 0;
  let totalConfidence = 0;

  for (const check of itemChecks) {
    if (check.preference) {
      itemsWithPreferences++;
      totalConfidence += check.confidence;
    }

    if (!check.include && check.actionable) {
      excludedItems.push(check.productId);
    }

    if (
      check.include &&
      check.recommendedQuantity &&
      check.recommendedQuantity !== check.originalQuantity &&
      check.actionable
    ) {
      quantityAdjustments.push({
        productId: check.productId,
        productName: check.productName,
        originalQuantity: check.originalQuantity,
        recommendedQuantity: check.recommendedQuantity,
      });
    }
  }

  const itemsWithoutPreferences = items.length - itemsWithPreferences;
  const averageConfidence =
    itemsWithPreferences > 0 ? totalConfidence / itemsWithPreferences : 0;

  return {
    sessionId,
    timestamp: referenceDate,
    itemChecks,
    excludedItems,
    quantityAdjustments,
    itemsWithPreferences,
    itemsWithoutPreferences,
    averageConfidence,
  };
}

// =============================================================================
// Batch Scoring
// =============================================================================

/**
 * Score all preferences in a store.
 * Pure function - useful for analytics and reporting.
 *
 * @param store - Preference store
 * @param config - Learning configuration
 * @param referenceDate - Reference date for calculations
 * @returns Map of productId to PreferenceScore
 */
export function scoreAllPreferences(
  store: PreferenceStore,
  config: PreferenceLearningConfig = createDefaultConfig(),
  referenceDate: Date = new Date()
): Map<string, PreferenceScore> {
  const scores = new Map<string, PreferenceScore>();

  for (const [productId, preference] of Object.entries(store.preferences)) {
    scores.set(productId, scorePreference(preference, config, referenceDate));
  }

  return scores;
}

/**
 * Get items sorted by inclusion score (highest first).
 * Pure function.
 *
 * @param store - Preference store
 * @param config - Learning configuration
 * @param referenceDate - Reference date for calculations
 * @returns Array of PreferenceScore sorted by inclusion score descending
 */
export function getItemsByInclusionScore(
  store: PreferenceStore,
  config: PreferenceLearningConfig = createDefaultConfig(),
  referenceDate: Date = new Date()
): PreferenceScore[] {
  const scores = Array.from(scoreAllPreferences(store, config, referenceDate).values());
  return scores.sort((a, b) => b.inclusionScore - a.inclusionScore);
}

/**
 * Get items with strong rejection signals.
 * Pure function.
 *
 * @param store - Preference store
 * @param config - Learning configuration
 * @param referenceDate - Reference date for calculations
 * @returns Array of PreferenceScore for items with strong rejection signals
 */
export function getStrongRejectItems(
  store: PreferenceStore,
  config: PreferenceLearningConfig = createDefaultConfig(),
  referenceDate: Date = new Date()
): PreferenceScore[] {
  const allScores = scoreAllPreferences(store, config, referenceDate);
  return Array.from(allScores.values()).filter((score) => score.strongRejectSignal);
}

/**
 * Get items with strong inclusion signals.
 * Pure function.
 *
 * @param store - Preference store
 * @param config - Learning configuration
 * @param referenceDate - Reference date for calculations
 * @returns Array of PreferenceScore for items with strong inclusion signals
 */
export function getStrongIncludeItems(
  store: PreferenceStore,
  config: PreferenceLearningConfig = createDefaultConfig(),
  referenceDate: Date = new Date()
): PreferenceScore[] {
  const allScores = scoreAllPreferences(store, config, referenceDate);
  return Array.from(allScores.values()).filter((score) => score.strongIncludeSignal);
}
