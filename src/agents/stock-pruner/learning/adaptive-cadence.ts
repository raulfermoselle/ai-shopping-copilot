/**
 * Adaptive Cadence Calculator - Pure Functions for Adaptive Restock Timing
 *
 * Calculates adaptive restock cadences by combining:
 * - Default category cadences
 * - Learned patterns from prediction history
 * - Household consumption profile adjustments
 * - Seasonal variations
 * - Confidence adjustments from feedback history
 *
 * All functions are pure: deterministic, no side effects, operate only on inputs.
 */

import type { ProductCategory } from '../types.js';
import {
  type LearningState,
  type AdaptiveCadenceConfig,
  type ConfidenceAdjustmentResult,
  type ConfidenceAdjustmentFactors,
  type HouseholdConsumptionProfile,
  type ProductKey,
  DEFAULT_SEASONAL_FACTORS,
  getProductKey,
  createDefaultAdaptiveCadenceConfig,
} from './types.js';
import { getLearnedCadence, calculateAccuracyStats } from './cadence-tracker.js';
import { analyzeProductFeedback } from './feedback-processor.js';

// =============================================================================
// Adaptive Cadence Calculation
// =============================================================================

/**
 * Result of adaptive cadence calculation.
 */
export interface AdaptiveCadenceResult {
  /** Final calculated cadence in days */
  cadenceDays: number;
  /** Base cadence before adjustments */
  baseCadence: number;
  /** Source of base cadence */
  source: 'learned' | 'category-default';
  /** Confidence in this cadence (0-1) */
  confidence: number;
  /** Seasonal adjustment factor applied */
  seasonalFactor: number;
  /** Household rate adjustment factor */
  householdFactor: number;
  /** Whether this item should be flagged for review */
  flagForReview: boolean;
  /** Detailed reasoning */
  reasoning: string[];
}

/**
 * Calculate adaptive restock cadence for a product.
 *
 * Combines multiple signals:
 * 1. Learned cadence from prediction history
 * 2. Category default as fallback
 * 3. Household consumption rate adjustment
 * 4. Seasonal variation adjustment
 *
 * @param state - Learning state with history
 * @param productId - Product identifier
 * @param productName - Product name
 * @param category - Product category
 * @param config - Adaptive cadence configuration
 * @param referenceDate - Reference date for seasonal calculations
 * @returns Adaptive cadence result
 *
 * @example
 * const result = calculateAdaptiveCadence(
 *   learningState,
 *   'prod-123',
 *   'Leite Mimosa 1L',
 *   ProductCategory.DAIRY,
 *   config,
 *   new Date('2026-07-15')
 * );
 * // Summer: might return shorter cadence for beverages
 */
export function calculateAdaptiveCadence(
  state: LearningState,
  productId: string | undefined,
  productName: string,
  category: ProductCategory,
  config: AdaptiveCadenceConfig = createDefaultAdaptiveCadenceConfig(),
  referenceDate: Date = new Date()
): AdaptiveCadenceResult {
  const reasoning: string[] = [];
  // Note: CATEGORY_CADENCE_DEFAULTS[category] is used internally by getLearnedCadence

  // Step 1: Get learned cadence if available
  const learned = getLearnedCadence(state, productId, productName, category, config);
  reasoning.push(...learned.reasoning);

  const baseCadence = learned.learnedCadence;
  const source: 'learned' | 'category-default' =
    learned.dataPointsUsed >= config.minPredictionsForLearning ? 'learned' : 'category-default';

  // Step 2: Apply household consumption rate
  const householdFactor = getHouseholdConsumptionFactor(
    state.consumptionProfile,
    category
  );

  if (householdFactor !== 1.0) {
    reasoning.push(
      `Household consumption factor for ${category}: ${householdFactor.toFixed(2)}`
    );
  }

  // Step 3: Apply seasonal adjustment
  const seasonalFactor = getSeasonalFactor(
    state.consumptionProfile,
    category,
    referenceDate
  );

  if (seasonalFactor !== 1.0) {
    const month = referenceDate.toLocaleString('default', { month: 'long' });
    reasoning.push(
      `Seasonal factor for ${category} in ${month}: ${seasonalFactor.toFixed(2)}`
    );
  }

  // Step 4: Calculate adjusted cadence
  // Higher consumption (>1) = shorter cadence (divide)
  const combinedFactor = householdFactor * seasonalFactor;
  const adjustedCadence = baseCadence / combinedFactor;

  // Clamp to reasonable bounds (1-180 days)
  const finalCadence = Math.max(1, Math.min(180, Math.round(adjustedCadence)));

  // Step 5: Determine confidence and review flag
  const productKey = getProductKey(productId, productName);
  const feedbackAnalysis = analyzeProductFeedback(state, productKey);

  let confidence = learned.confidence;
  let flagForReview = false;

  // Reduce confidence if feedback indicates problems
  if (feedbackAnalysis.recommendation === 'trust_less') {
    confidence = Math.max(0.3, confidence - 0.2);
    flagForReview = true;
    reasoning.push(`Reduced confidence: ${feedbackAnalysis.reasoning}`);
  } else if (feedbackAnalysis.recommendation === 'needs_review') {
    flagForReview = true;
    reasoning.push(`Flagged for review: ${feedbackAnalysis.reasoning}`);
  }

  // Conservative mode requires multiple consistent signals
  if (config.conservativeMode && source === 'learned') {
    const accuracy = state.cadenceAccuracy[productKey];
    if (accuracy) {
      const stats = calculateAccuracyStats(accuracy.predictions);
      if (stats.completedPredictions < config.requiredConsistentSignals) {
        reasoning.push(
          `Conservative mode: Only ${stats.completedPredictions}/${config.requiredConsistentSignals} consistent signals`
        );
        confidence = Math.min(confidence, 0.5);
        flagForReview = true;
      }
    }
  }

  reasoning.push(
    `Final cadence: ${finalCadence} days ` +
    `(base: ${baseCadence}, household: x${householdFactor.toFixed(2)}, ` +
    `seasonal: x${seasonalFactor.toFixed(2)})`
  );

  return {
    cadenceDays: finalCadence,
    baseCadence,
    source,
    confidence,
    seasonalFactor,
    householdFactor,
    flagForReview,
    reasoning,
  };
}

// =============================================================================
// Household Consumption Factors
// =============================================================================

/**
 * Get household consumption factor for a category.
 *
 * @param profile - Household consumption profile
 * @param category - Product category
 * @returns Consumption factor (1.0 = average, >1 = faster, <1 = slower)
 */
export function getHouseholdConsumptionFactor(
  profile: HouseholdConsumptionProfile,
  category: ProductCategory
): number {
  // Category-specific rate if available
  const categoryRate = profile.categoryRates[category];
  if (categoryRate !== undefined) {
    return categoryRate;
  }

  // Fall back to overall household level
  return profile.overallConsumptionLevel;
}

/**
 * Get seasonal factor for a category at a given date.
 *
 * @param profile - Household consumption profile
 * @param category - Product category
 * @param date - Date for seasonal calculation
 * @returns Seasonal factor (1.0 = baseline, >1 = higher consumption)
 */
export function getSeasonalFactor(
  profile: HouseholdConsumptionProfile,
  category: ProductCategory,
  date: Date
): number {
  const month = (date.getMonth() + 1).toString(); // 1-12

  // Check household-specific seasonal patterns first
  const householdPattern = profile.seasonalPatterns.find(
    (p) => p.category === category
  );

  if (householdPattern?.monthlyFactors[month] !== undefined) {
    return householdPattern.monthlyFactors[month];
  }

  // Fall back to default seasonal factors
  const defaultFactors = DEFAULT_SEASONAL_FACTORS[category];
  if (defaultFactors?.[month] !== undefined) {
    return defaultFactors[month];
  }

  return 1.0;
}

// =============================================================================
// Confidence Adjustment
// =============================================================================

/**
 * Calculate confidence adjustment factors for a pruning decision.
 *
 * Adjusts base confidence based on:
 * - Prediction history accuracy
 * - Recent feedback signals
 * - Data freshness
 * - Seasonal factors
 *
 * @param state - Learning state
 * @param productId - Product identifier
 * @param productName - Product name
 * @param category - Product category
 * @param baseConfidence - Base confidence from heuristics
 * @param config - Adaptive cadence config
 * @param referenceDate - Reference date
 * @returns Confidence adjustment result
 */
export function calculateConfidenceAdjustment(
  state: LearningState,
  productId: string | undefined,
  productName: string,
  category: ProductCategory,
  baseConfidence: number,
  config: AdaptiveCadenceConfig = createDefaultAdaptiveCadenceConfig(),
  referenceDate: Date = new Date()
): ConfidenceAdjustmentResult {
  const productKey = getProductKey(productId, productName);
  const reasoning: string[] = [];

  // Start with base factors
  let historyAdjustment = 0;
  let feedbackAdjustment = 0;
  let freshnessAdjustment = 0;
  let seasonalAdjustment = 0;

  // 1. History accuracy adjustment
  const accuracy = state.cadenceAccuracy[productKey];
  if (accuracy) {
    const stats = calculateAccuracyStats(accuracy.predictions);

    if (stats.completedPredictions >= 3) {
      // Good accuracy = boost confidence
      if (stats.accuracyRate >= 0.8) {
        historyAdjustment = 0.15;
        reasoning.push(`High accuracy (${(stats.accuracyRate * 100).toFixed(0)}%): +0.15`);
      } else if (stats.accuracyRate >= 0.6) {
        historyAdjustment = 0.05;
        reasoning.push(`Moderate accuracy (${(stats.accuracyRate * 100).toFixed(0)}%): +0.05`);
      } else {
        historyAdjustment = -0.2;
        reasoning.push(`Low accuracy (${(stats.accuracyRate * 100).toFixed(0)}%): -0.20`);
      }

      // Check for systematic bias
      if (Math.abs(stats.biasDirection) > 3) {
        const direction = stats.biasDirection > 0 ? 'overestimate' : 'underestimate';
        historyAdjustment -= 0.1;
        reasoning.push(`Systematic ${direction} bias: -0.10`);
      }
    }
  }

  // 2. Feedback adjustment
  const feedbackAnalysis = analyzeProductFeedback(state, productKey);
  if (feedbackAnalysis.totalFeedback > 0) {
    if (feedbackAnalysis.recommendation === 'trust_more') {
      feedbackAdjustment = 0.1;
      reasoning.push(`Positive feedback history: +0.10`);
    } else if (feedbackAnalysis.recommendation === 'trust_less') {
      feedbackAdjustment = -0.25;
      reasoning.push(`Negative feedback history: -0.25`);
    } else if (feedbackAnalysis.recommendation === 'needs_review') {
      feedbackAdjustment = -0.15;
      reasoning.push(`Mixed feedback signals: -0.15`);
    }
  }

  // 3. Data freshness adjustment
  if (accuracy) {
    const lastPrediction = accuracy.predictions[accuracy.predictions.length - 1];
    if (lastPrediction) {
      const ageMs = referenceDate.getTime() - new Date(lastPrediction.timestamp).getTime();
      const ageDays = ageMs / (24 * 60 * 60 * 1000);

      if (ageDays > 90) {
        freshnessAdjustment = -0.15;
        reasoning.push(`Stale data (${Math.round(ageDays)} days old): -0.15`);
      } else if (ageDays > 60) {
        freshnessAdjustment = -0.1;
        reasoning.push(`Aging data (${Math.round(ageDays)} days old): -0.10`);
      } else if (ageDays > 30) {
        freshnessAdjustment = -0.05;
        reasoning.push(`Data moderately fresh (${Math.round(ageDays)} days): -0.05`);
      }
    }
  }

  // 4. Seasonal uncertainty adjustment
  const seasonalFactor = getSeasonalFactor(state.consumptionProfile, category, referenceDate);
  if (Math.abs(seasonalFactor - 1.0) > 0.2) {
    // High seasonal variation adds uncertainty
    seasonalAdjustment = -0.1;
    reasoning.push(`High seasonal variation (${seasonalFactor.toFixed(2)}x): -0.10`);
  }

  // Calculate final confidence
  const totalAdjustment = historyAdjustment + feedbackAdjustment + freshnessAdjustment + seasonalAdjustment;
  const finalConfidence = Math.max(0.1, Math.min(0.95, baseConfidence + totalAdjustment));

  // Determine if should flag for review
  const flagForReview =
    finalConfidence < 0.5 ||
    feedbackAnalysis.recommendation === 'needs_review' ||
    feedbackAnalysis.recommendation === 'trust_less' ||
    (config.conservativeMode && finalConfidence < 0.6);

  if (flagForReview && !reasoning.some(r => r.includes('flag'))) {
    reasoning.push(`Flagged for user review (confidence: ${finalConfidence.toFixed(2)})`);
  }

  const factors: ConfidenceAdjustmentFactors = {
    baseConfidence,
    historyAdjustment,
    feedbackAdjustment,
    freshnessAdjustment,
    seasonalAdjustment,
    finalConfidence,
    reasoning,
  };

  const explanation = generateConfidenceExplanation(factors, flagForReview);

  return {
    confidence: finalConfidence,
    factors,
    flagForReview,
    explanation,
  };
}

/**
 * Generate human-readable confidence explanation.
 */
function generateConfidenceExplanation(
  factors: ConfidenceAdjustmentFactors,
  flagForReview: boolean
): string {
  const parts: string[] = [];

  parts.push(`Base confidence: ${(factors.baseConfidence * 100).toFixed(0)}%`);

  if (factors.historyAdjustment !== 0) {
    const sign = factors.historyAdjustment > 0 ? '+' : '';
    parts.push(`History: ${sign}${(factors.historyAdjustment * 100).toFixed(0)}%`);
  }

  if (factors.feedbackAdjustment !== 0) {
    const sign = factors.feedbackAdjustment > 0 ? '+' : '';
    parts.push(`Feedback: ${sign}${(factors.feedbackAdjustment * 100).toFixed(0)}%`);
  }

  if (factors.freshnessAdjustment !== 0) {
    parts.push(`Freshness: ${(factors.freshnessAdjustment * 100).toFixed(0)}%`);
  }

  if (factors.seasonalAdjustment !== 0) {
    parts.push(`Seasonal: ${(factors.seasonalAdjustment * 100).toFixed(0)}%`);
  }

  parts.push(`Final: ${(factors.finalConfidence * 100).toFixed(0)}%`);

  if (flagForReview) {
    parts.push('(Needs review)');
  }

  return parts.join(' | ');
}

// =============================================================================
// Conservative Decision Making
// =============================================================================

/**
 * Result of conservative pruning decision.
 */
export interface ConservativePruneResult {
  /** Should prune this item? */
  shouldPrune: boolean;
  /** Confidence in decision */
  confidence: number;
  /** Whether to flag for user review */
  flagForReview: boolean;
  /** Reasoning for decision */
  reasoning: string[];
}

/**
 * Make a conservative pruning decision.
 *
 * Conservative behavior:
 * - Default to keeping items when uncertain
 * - Require multiple consistent signals before pruning
 * - Flag uncertain items for user review
 *
 * @param state - Learning state
 * @param productId - Product identifier
 * @param productName - Product name
 * @param category - Product category
 * @param heuristicPrune - Whether heuristics suggest pruning
 * @param heuristicConfidence - Confidence from heuristics
 * @param config - Adaptive cadence config
 * @returns Conservative prune decision
 */
export function makeConservativePruneDecision(
  state: LearningState,
  productId: string | undefined,
  productName: string,
  category: ProductCategory,
  heuristicPrune: boolean,
  heuristicConfidence: number,
  config: AdaptiveCadenceConfig = createDefaultAdaptiveCadenceConfig()
): ConservativePruneResult {
  const reasoning: string[] = [];
  const productKey = getProductKey(productId, productName);

  // Get adjusted confidence
  const confidenceResult = calculateConfidenceAdjustment(
    state,
    productId,
    productName,
    category,
    heuristicConfidence,
    config
  );

  const confidence = confidenceResult.confidence;
  let shouldPrune = heuristicPrune;
  let flagForReview = confidenceResult.flagForReview;

  reasoning.push(`Heuristic suggests: ${heuristicPrune ? 'prune' : 'keep'}`);
  reasoning.push(confidenceResult.explanation);

  // Conservative checks
  if (config.conservativeMode) {
    // Check 1: Require minimum confidence for pruning
    if (shouldPrune && confidence < config.minLearnedConfidence) {
      shouldPrune = false;
      flagForReview = true;
      reasoning.push(
        `Conservative: Confidence ${(confidence * 100).toFixed(0)}% below ` +
        `minimum ${(config.minLearnedConfidence * 100).toFixed(0)}%. Keeping item.`
      );
    }

    // Check 2: Require consistent signals
    const accuracy = state.cadenceAccuracy[productKey];
    if (shouldPrune && accuracy) {
      const stats = calculateAccuracyStats(accuracy.predictions);
      if (stats.completedPredictions < config.requiredConsistentSignals) {
        shouldPrune = false;
        flagForReview = true;
        reasoning.push(
          `Conservative: Only ${stats.completedPredictions} data points. ` +
          `Need ${config.requiredConsistentSignals} before trusting prune.`
        );
      }
    }

    // Check 3: Check for recent wrong removals
    const feedbackAnalysis = analyzeProductFeedback(state, productKey);
    if (shouldPrune && feedbackAnalysis.wrongRemovals > 0) {
      // Had wrong removals recently - be extra careful
      const wrongRemovalPenalty = feedbackAnalysis.wrongRemovals * 0.1;
      if (confidence < 0.7 + wrongRemovalPenalty) {
        shouldPrune = false;
        flagForReview = true;
        reasoning.push(
          `Conservative: ${feedbackAnalysis.wrongRemovals} previous false removals. ` +
          `Requires higher confidence.`
        );
      }
    }
  }

  // Always flag low-confidence prune decisions
  if (shouldPrune && confidence < 0.6) {
    flagForReview = true;
    reasoning.push('Flagged for review: Low confidence prune suggestion.');
  }

  return {
    shouldPrune,
    confidence,
    flagForReview,
    reasoning,
  };
}

// =============================================================================
// Batch Adaptive Cadence
// =============================================================================

/**
 * Input for batch cadence calculation.
 */
export interface BatchCadenceInput {
  productId?: string;
  productName: string;
  category: ProductCategory;
}

/**
 * Calculate adaptive cadences for multiple products.
 *
 * @param state - Learning state
 * @param products - Array of products to calculate
 * @param config - Adaptive cadence config
 * @param referenceDate - Reference date for calculations
 * @returns Map of product key to adaptive cadence result
 */
export function calculateBatchAdaptiveCadence(
  state: LearningState,
  products: BatchCadenceInput[],
  config: AdaptiveCadenceConfig = createDefaultAdaptiveCadenceConfig(),
  referenceDate: Date = new Date()
): Map<ProductKey, AdaptiveCadenceResult> {
  const results = new Map<ProductKey, AdaptiveCadenceResult>();

  for (const product of products) {
    const key = getProductKey(product.productId, product.productName);
    const result = calculateAdaptiveCadence(
      state,
      product.productId,
      product.productName,
      product.category,
      config,
      referenceDate
    );
    results.set(key, result);
  }

  return results;
}

// =============================================================================
// Learning Progress Metrics
// =============================================================================

/**
 * Metrics about learning progress.
 */
export interface LearningProgressMetrics {
  /** Number of products with learned cadences */
  productsLearned: number;
  /** Number of products still using defaults */
  productsUsingDefaults: number;
  /** Overall prediction accuracy */
  overallAccuracy: number;
  /** Products needing attention */
  productsNeedingReview: number;
  /** Average confidence across learned products */
  averageConfidence: number;
  /** Days since last learning update */
  daysSinceUpdate: number;
  /** Summary description */
  summary: string;
}

/**
 * Calculate learning progress metrics.
 *
 * @param state - Learning state
 * @param config - Adaptive cadence config
 * @param referenceDate - Reference date
 * @returns Learning progress metrics
 */
export function calculateLearningProgress(
  state: LearningState,
  config: AdaptiveCadenceConfig = createDefaultAdaptiveCadenceConfig(),
  referenceDate: Date = new Date()
): LearningProgressMetrics {
  let productsLearned = 0;
  let productsUsingDefaults = 0;
  let totalCorrect = 0;
  let totalCompleted = 0;
  let totalConfidence = 0;
  let productsNeedingReview = 0;

  for (const accuracy of Object.values(state.cadenceAccuracy)) {
    const stats = calculateAccuracyStats(accuracy.predictions);

    if (stats.completedPredictions >= config.minPredictionsForLearning) {
      productsLearned++;
      totalConfidence += accuracy.confidence;
    } else {
      productsUsingDefaults++;
    }

    totalCorrect += stats.correctPredictions;
    totalCompleted += stats.completedPredictions;

    if (accuracy.confidence < 0.5 || stats.accuracyRate < 0.5) {
      productsNeedingReview++;
    }
  }

  const overallAccuracy = totalCompleted > 0 ? totalCorrect / totalCompleted : 0;
  const averageConfidence = productsLearned > 0 ? totalConfidence / productsLearned : 0;

  const daysSinceUpdate = Math.floor(
    (referenceDate.getTime() - new Date(state.lastUpdated).getTime()) / (24 * 60 * 60 * 1000)
  );

  const summary =
    `Learned ${productsLearned} products (${productsUsingDefaults} using defaults). ` +
    `Overall accuracy: ${(overallAccuracy * 100).toFixed(0)}%. ` +
    `${productsNeedingReview} products need review.`;

  return {
    productsLearned,
    productsUsingDefaults,
    overallAccuracy,
    productsNeedingReview,
    averageConfidence,
    daysSinceUpdate,
    summary,
  };
}
