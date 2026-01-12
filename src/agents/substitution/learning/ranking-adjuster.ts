/**
 * Ranking Adjuster - Pure Functions
 *
 * Adjusts substitute ranking scores based on learned user preferences.
 * All functions are pure: no side effects, deterministic, operate only on inputs.
 *
 * Key operations:
 * - Apply product-specific acceptance history boost/penalty
 * - Apply brand pattern matching adjustments
 * - Apply category tolerance matching adjustments
 * - Calculate price/size tolerance penalties
 */

import type {
  SubstitutionLearningStore,
  ProductLearningSignal,
  CategoryTolerance,
  BrandTolerancePattern,
  LearningConfig,
  RankingAdjustmentResult,
} from './types.js';
import {
  getDecisionsByProduct,
  getProductAsSubstituteStats,
  getRecentDecisions,
  calculateRecencyWeight,
} from './substitution-tracker.js';
import { findBrandPattern, parseSize } from './tolerance-calculator.js';

// =============================================================================
// Product Learning Signals
// =============================================================================

/**
 * Calculate learning signals for a specific product.
 *
 * @param store - Learning store
 * @param productId - Product ID to analyze
 * @param config - Learning configuration
 * @param referenceDate - Reference date for recency weighting
 * @returns Product learning signal
 */
export function calculateProductSignal(
  store: SubstitutionLearningStore,
  productId: string,
  config: LearningConfig,
  referenceDate: Date = new Date()
): ProductLearningSignal | null {
  const decisions = getDecisionsByProduct(store, productId);
  if (decisions.length === 0) return null;

  // Get the most recent decision to get product info
  const sortedDecisions = [...decisions].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const latestDecision = sortedDecisions[0];
  if (!latestDecision) return null;

  // Determine product info from decisions
  let productName = '';
  let brand: string | undefined;
  let category = '';

  // Check if this product was the proposed substitute
  if (latestDecision.proposedSubstitute.id === productId) {
    productName = latestDecision.proposedSubstitute.name;
    brand = latestDecision.proposedSubstitute.brand;
    category = latestDecision.originalProduct.category;
  } else if (latestDecision.actualChosen?.id === productId) {
    productName = latestDecision.actualChosen.name;
    brand = latestDecision.actualChosen.brand;
    category = latestDecision.originalProduct.category;
  }

  // Count weighted outcomes
  let weightedAccepted = 0;
  let weightedRejected = 0;
  let weightedChosen = 0;
  let totalWeight = 0;

  for (const decision of decisions) {
    const weight = calculateRecencyWeight(decision, config, referenceDate);
    totalWeight += weight;

    if (decision.proposedSubstitute.id === productId) {
      if (decision.decision === 'accepted') {
        weightedAccepted += weight;
      } else {
        weightedRejected += weight;
      }
    }

    if (decision.actualChosen?.id === productId) {
      weightedChosen += weight;
    }
  }

  // Normalize to counts (rounded)
  const timesAccepted = Math.round(weightedAccepted);
  const timesRejected = Math.round(weightedRejected);
  const timesChosen = Math.round(weightedChosen);

  // Calculate acceptance rate
  const totalProposed = timesAccepted + timesRejected;
  const acceptanceRate = totalProposed > 0 ? timesAccepted / totalProposed : 0.5;

  // Calculate ranking adjustment
  // Positive for good history, negative for bad history
  const rankingAdjustment = calculateProductRankingAdjustment(
    acceptanceRate,
    timesChosen,
    totalProposed + timesChosen,
    config
  );

  // Confidence based on total interactions
  const confidence = calculateSignalConfidence(totalProposed + timesChosen, config.minDecisionsForLearning);

  return {
    productId,
    productName,
    brand,
    category,
    timesAccepted,
    timesRejected,
    timesUserChose: timesChosen,
    acceptanceRate,
    rankingAdjustment,
    confidence,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Calculate all product signals for the store.
 *
 * @param store - Learning store
 * @param config - Learning configuration
 * @param referenceDate - Reference date for calculations
 * @returns Array of product signals
 */
export function calculateAllProductSignals(
  store: SubstitutionLearningStore,
  config: LearningConfig,
  referenceDate: Date = new Date()
): ProductLearningSignal[] {
  const recentDecisions = getRecentDecisions(store, config, referenceDate);
  const stats = getProductAsSubstituteStats(recentDecisions);

  const signals: ProductLearningSignal[] = [];

  for (const stat of stats) {
    const signal = calculateProductSignal(store, stat.productId, config, referenceDate);
    if (signal) {
      signals.push(signal);
    }
  }

  return signals;
}

/**
 * Calculate ranking adjustment for a product based on its history.
 */
function calculateProductRankingAdjustment(
  acceptanceRate: number,
  timesChosen: number,
  totalInteractions: number,
  config: LearningConfig
): number {
  if (totalInteractions === 0) return 0;

  // Base adjustment from acceptance rate
  // 0.5 acceptance rate = 0 adjustment
  // 1.0 acceptance rate = +maxAdjustment
  // 0.0 acceptance rate = -maxAdjustment
  let adjustment = (acceptanceRate - 0.5) * 2 * config.maxAdjustmentMagnitude;

  // Bonus for being explicitly chosen by user (when not top recommendation)
  // This is a strong signal that user prefers this product
  if (timesChosen > 0) {
    const chosenBonus = Math.min(timesChosen * 0.05, config.maxAdjustmentMagnitude * 0.5);
    adjustment += chosenBonus;
  }

  // Clamp to valid range
  return Math.max(-config.maxAdjustmentMagnitude, Math.min(config.maxAdjustmentMagnitude, adjustment));
}

/**
 * Calculate confidence for a product signal.
 */
function calculateSignalConfidence(interactions: number, minRequired: number): number {
  if (interactions === 0) return 0;
  if (interactions < minRequired) return interactions / minRequired * 0.5;
  return Math.min(0.5 + Math.log2(interactions / minRequired) * 0.2, 0.95);
}

// =============================================================================
// Ranking Adjustment Application
// =============================================================================

/**
 * Candidate substitute information for ranking adjustment.
 */
export interface SubstituteCandidate {
  /** Product ID */
  productId: string;
  /** Product name */
  name: string;
  /** Brand (if known) */
  brand?: string;
  /** Unit price */
  unitPrice: number;
  /** Size string (e.g., "500g") */
  size?: string;
  /** Base score before learning adjustment */
  baseScore: number;
}

/**
 * Original product information for comparison.
 */
export interface OriginalProduct {
  /** Product ID */
  productId: string;
  /** Product name */
  name: string;
  /** Brand (if known) */
  brand?: string;
  /** Category */
  category: string;
  /** Unit price */
  unitPrice: number;
  /** Size string */
  size?: string;
}

/**
 * Apply learning-based adjustments to a substitute candidate's score.
 *
 * @param candidate - Substitute candidate to adjust
 * @param original - Original product being replaced
 * @param store - Learning store with signals and tolerances
 * @param config - Learning configuration
 * @returns Adjustment result with breakdown
 *
 * @example
 * const result = adjustScore(
 *   { productId: '456', name: 'Milk B', brand: 'BrandB', unitPrice: 1.60, baseScore: 0.75 },
 *   { productId: '123', name: 'Milk A', brand: 'BrandA', category: 'dairy', unitPrice: 1.50 },
 *   store,
 *   config
 * );
 * // => { originalScore: 0.75, adjustedScore: 0.82, totalAdjustment: 0.07, ... }
 */
export function adjustScore(
  candidate: SubstituteCandidate,
  original: OriginalProduct,
  store: SubstitutionLearningStore,
  config: LearningConfig
): RankingAdjustmentResult {
  const reasoning: string[] = [];
  const factors = {
    productHistory: 0,
    brandPattern: 0,
    categoryTolerance: 0,
    priceTolerance: 0,
    sizeTolerance: 0,
  };

  // 1. Product-specific history adjustment
  const productSignal = store.productSignals.find((s) => s.productId === candidate.productId);
  if (productSignal && productSignal.confidence > 0.3) {
    factors.productHistory = productSignal.rankingAdjustment * config.productHistoryWeight;
    if (factors.productHistory > 0) {
      reasoning.push(`Previously accepted substitute (${Math.round(productSignal.acceptanceRate * 100)}% acceptance)`);
    } else if (factors.productHistory < 0) {
      reasoning.push(`Previously rejected substitute (${Math.round(productSignal.acceptanceRate * 100)}% acceptance)`);
    }
  }

  // 2. Brand pattern adjustment
  const brandPattern = findBrandPattern(
    store.brandPatterns,
    original.category,
    original.brand,
    candidate.brand
  );
  if (brandPattern && brandPattern.confidence > 0.3) {
    // Convert acceptance rate to adjustment (-maxMagnitude to +maxMagnitude)
    factors.brandPattern =
      (brandPattern.acceptanceRate - 0.5) * 2 * config.maxAdjustmentMagnitude * config.brandPatternWeight;
    if (factors.brandPattern > 0) {
      reasoning.push(`${original.brand} -> ${candidate.brand} historically accepted (${Math.round(brandPattern.acceptanceRate * 100)}%)`);
    } else if (factors.brandPattern < 0) {
      reasoning.push(`${original.brand} -> ${candidate.brand} often rejected`);
    }
  }

  // 3. Category tolerance matching
  const categoryTolerance = store.categoryTolerances.find(
    (t) => t.category.toLowerCase() === original.category.toLowerCase()
  );

  if (categoryTolerance && categoryTolerance.confidence > 0.3) {
    // Check brand tolerance
    const brandMatch = checkBrandToleranceMatch(
      original.brand,
      candidate.brand,
      categoryTolerance.brandTolerance
    );
    factors.categoryTolerance = brandMatch * config.categoryToleranceWeight * config.maxAdjustmentMagnitude;
    if (brandMatch > 0) {
      reasoning.push(`Brand change matches ${original.category} tolerance (${categoryTolerance.brandTolerance})`);
    } else if (brandMatch < 0) {
      reasoning.push(`Brand change outside ${original.category} tolerance (user is ${categoryTolerance.brandTolerance})`);
    }

    // 4. Price tolerance
    const priceDelta = calculatePriceDelta(original.unitPrice, candidate.unitPrice);
    const priceMatch = checkPriceToleranceMatch(priceDelta, categoryTolerance.maxPriceIncrease);
    factors.priceTolerance = priceMatch * config.priceToleranceWeight * config.maxAdjustmentMagnitude;
    if (priceMatch < 0) {
      reasoning.push(`Price increase (${Math.round(priceDelta * 100)}%) exceeds tolerance (${Math.round(categoryTolerance.maxPriceIncrease * 100)}%)`);
    }

    // 5. Size tolerance
    const sizeDelta = calculateSizeDelta(original.size, candidate.size);
    if (sizeDelta !== null && sizeDelta > 0) {
      const sizeMatch = checkSizeToleranceMatch(sizeDelta, categoryTolerance.maxSizeDecrease);
      factors.sizeTolerance = sizeMatch * config.sizeToleranceWeight * config.maxAdjustmentMagnitude;
      if (sizeMatch < 0) {
        reasoning.push(`Size decrease (${Math.round(sizeDelta * 100)}%) exceeds tolerance (${Math.round(categoryTolerance.maxSizeDecrease * 100)}%)`);
      }
    }
  } else {
    // No learned tolerance - apply default checks
    const priceDelta = calculatePriceDelta(original.unitPrice, candidate.unitPrice);
    if (priceDelta > config.defaultMaxPriceIncrease) {
      factors.priceTolerance = -config.priceToleranceWeight * config.maxAdjustmentMagnitude;
      reasoning.push(`Price increase (${Math.round(priceDelta * 100)}%) exceeds default tolerance`);
    }
  }

  // Calculate total adjustment
  const totalAdjustment =
    factors.productHistory +
    factors.brandPattern +
    factors.categoryTolerance +
    factors.priceTolerance +
    factors.sizeTolerance;

  // Apply adjustment to base score
  const adjustedScore = Math.max(0, Math.min(1, candidate.baseScore + totalAdjustment));

  // Calculate overall confidence (weighted average of available signals)
  const confidence = calculateOverallConfidence(productSignal, brandPattern, categoryTolerance);

  if (reasoning.length === 0) {
    reasoning.push('No learning signals available for this substitute');
  }

  return {
    originalScore: candidate.baseScore,
    adjustedScore,
    totalAdjustment,
    factors,
    confidence,
    reasoning,
  };
}

/**
 * Apply learning adjustments to a list of substitute candidates and re-rank.
 *
 * @param candidates - List of candidates with base scores
 * @param original - Original product
 * @param store - Learning store
 * @param config - Learning configuration
 * @returns Candidates with adjusted scores, sorted by adjusted score descending
 */
export function adjustAndRankCandidates(
  candidates: SubstituteCandidate[],
  original: OriginalProduct,
  store: SubstitutionLearningStore,
  config: LearningConfig
): Array<{ candidate: SubstituteCandidate; adjustment: RankingAdjustmentResult }> {
  // Apply adjustments to all candidates
  const adjusted = candidates.map((candidate) => ({
    candidate,
    adjustment: adjustScore(candidate, original, store, config),
  }));

  // Sort by adjusted score descending
  adjusted.sort((a, b) => b.adjustment.adjustedScore - a.adjustment.adjustedScore);

  return adjusted;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if brand change matches the tolerance level.
 * Returns positive for good match, negative for poor match, 0 for neutral.
 */
function checkBrandToleranceMatch(
  originalBrand: string | undefined,
  substituteBrand: string | undefined,
  toleranceLevel: 'strict' | 'flexible' | 'any'
): number {
  // Same brand is always good
  if (
    originalBrand &&
    substituteBrand &&
    originalBrand.toLowerCase() === substituteBrand.toLowerCase()
  ) {
    return 0.5; // Slight boost for same brand
  }

  // Different brand
  switch (toleranceLevel) {
    case 'any':
      return 0.3; // User accepts any brand
    case 'flexible':
      return 0; // Neutral
    case 'strict':
      return -0.5; // User prefers same brand
    default:
      return 0;
  }
}

/**
 * Calculate price delta as percentage increase.
 */
function calculatePriceDelta(originalPrice: number, substitutePrice: number): number {
  if (originalPrice <= 0) return 0;
  return Math.max(0, (substitutePrice - originalPrice) / originalPrice);
}

/**
 * Check if price increase is within tolerance.
 * Returns 0 for within tolerance, negative for exceeding.
 */
function checkPriceToleranceMatch(priceDelta: number, maxIncrease: number): number {
  if (priceDelta <= 0) {
    return 0.2; // Slight boost for cheaper/same price
  }
  if (priceDelta <= maxIncrease) {
    return 0; // Within tolerance
  }
  // Penalty proportional to how much it exceeds
  const excessRatio = (priceDelta - maxIncrease) / maxIncrease;
  return -Math.min(excessRatio, 1);
}

/**
 * Calculate size delta as percentage decrease.
 * Returns null if sizes can't be compared.
 */
function calculateSizeDelta(originalSize: string | undefined, substituteSize: string | undefined): number | null {
  const original = parseSize(originalSize);
  const substitute = parseSize(substituteSize);

  if (original === null || substitute === null || original <= 0) {
    return null;
  }

  // Positive = substitute is smaller
  return Math.max(0, (original - substitute) / original);
}

/**
 * Check if size decrease is within tolerance.
 */
function checkSizeToleranceMatch(sizeDecrease: number, maxDecrease: number): number {
  if (sizeDecrease <= 0) {
    return 0.1; // Slight boost for same/larger size
  }
  if (sizeDecrease <= maxDecrease) {
    return 0; // Within tolerance
  }
  // Penalty proportional to how much it exceeds
  const excessRatio = (sizeDecrease - maxDecrease) / maxDecrease;
  return -Math.min(excessRatio, 1);
}

/**
 * Calculate overall confidence from available signals.
 */
function calculateOverallConfidence(
  productSignal: ProductLearningSignal | undefined,
  brandPattern: BrandTolerancePattern | undefined,
  categoryTolerance: CategoryTolerance | undefined
): number {
  const confidences: number[] = [];

  if (productSignal) confidences.push(productSignal.confidence);
  if (brandPattern) confidences.push(brandPattern.confidence);
  if (categoryTolerance) confidences.push(categoryTolerance.confidence);

  if (confidences.length === 0) return 0.1;

  // Use the highest confidence among available signals
  return Math.max(...confidences);
}

// =============================================================================
// Store Update with Product Signals
// =============================================================================

/**
 * Update the learning store with freshly calculated product signals.
 *
 * @param store - Current store
 * @param config - Learning configuration
 * @param referenceDate - Reference date for calculations
 * @returns New store with updated product signals
 */
export function updateStoreProductSignals(
  store: SubstitutionLearningStore,
  config: LearningConfig,
  referenceDate: Date = new Date()
): SubstitutionLearningStore {
  const productSignals = calculateAllProductSignals(store, config, referenceDate);

  return {
    ...store,
    productSignals,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Fully refresh all learning data in the store.
 * Call this after recording new decisions to update all derived data.
 *
 * @param store - Current store
 * @param config - Learning configuration
 * @param referenceDate - Reference date for calculations
 * @returns New store with all learnings updated
 */
export function refreshAllLearnings(
  store: SubstitutionLearningStore,
  config: LearningConfig,
  referenceDate: Date = new Date()
): SubstitutionLearningStore {
  // Import updateStoreLearnings to avoid circular dependency at runtime
  // This updates categoryTolerances and brandPatterns
  const { updateStoreLearnings } = require('./tolerance-calculator.js') as typeof import('./tolerance-calculator.js');

  let updated = updateStoreLearnings(store, config, referenceDate);
  updated = updateStoreProductSignals(updated, config, referenceDate);

  return updated;
}
