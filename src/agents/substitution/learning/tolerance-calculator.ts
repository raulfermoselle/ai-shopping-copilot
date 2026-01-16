/**
 * Tolerance Calculator - Pure Functions
 *
 * Calculates user tolerance patterns from substitution history.
 * All functions are pure: no side effects, deterministic, operate only on inputs.
 *
 * Key calculations:
 * - Category-level tolerances (brand, price, size)
 * - Brand-to-brand substitution patterns
 * - Confidence scoring based on sample size and consistency
 */

import type {
  SubstitutionDecision,
  SubstitutionLearningStore,
  CategoryTolerance,
  BrandTolerancePattern,
  BrandToleranceLevel,
  LearningConfig,
} from './types.js';
import {
  getRecentDecisions,
  getBrandPairStats,
  calculateRecencyWeight,
} from './substitution-tracker.js';

// =============================================================================
// Category Tolerance Calculation
// =============================================================================

/**
 * Result of analyzing price tolerance from decisions.
 */
interface PriceToleranceAnalysis {
  /** Maximum accepted price increase (percentage) */
  maxAcceptedIncrease: number;
  /** Maximum rejected price increase (percentage) */
  maxRejectedIncrease: number;
  /** Calculated tolerance threshold */
  toleranceThreshold: number;
  /** Sample size */
  sampleSize: number;
  /** Confidence in the calculation */
  confidence: number;
}

/**
 * Analyze price tolerance from a set of decisions.
 *
 * Algorithm:
 * 1. Calculate price delta percentage for each decision
 * 2. Find the boundary between accepted and rejected price increases
 * 3. Use weighted average based on recency
 *
 * @param decisions - Decisions to analyze
 * @param config - Learning configuration
 * @param referenceDate - Reference date for recency weighting
 * @returns Price tolerance analysis
 */
export function analyzePriceTolerance(
  decisions: SubstitutionDecision[],
  config: LearningConfig,
  referenceDate: Date = new Date()
): PriceToleranceAnalysis {
  if (decisions.length === 0) {
    return {
      maxAcceptedIncrease: config.defaultMaxPriceIncrease,
      maxRejectedIncrease: 0,
      toleranceThreshold: config.defaultMaxPriceIncrease,
      sampleSize: 0,
      confidence: 0.1,
    };
  }

  // Calculate price delta for each decision
  const priceDeltas: Array<{
    delta: number; // percentage
    accepted: boolean;
    weight: number;
  }> = [];

  for (const decision of decisions) {
    const originalPrice = decision.originalProduct.price;
    if (originalPrice <= 0) continue;

    const substitutePrice = decision.proposedSubstitute.price;
    const delta = (substitutePrice - originalPrice) / originalPrice;

    const accepted = decision.decision === 'accepted';
    const weight = calculateRecencyWeight(decision, config, referenceDate);

    priceDeltas.push({ delta, accepted, weight });
  }

  if (priceDeltas.length === 0) {
    return {
      maxAcceptedIncrease: config.defaultMaxPriceIncrease,
      maxRejectedIncrease: 0,
      toleranceThreshold: config.defaultMaxPriceIncrease,
      sampleSize: 0,
      confidence: 0.1,
    };
  }

  // Find max accepted and min rejected increases
  const acceptedIncreases = priceDeltas
    .filter((p) => p.accepted && p.delta > 0)
    .map((p) => p.delta);
  const rejectedIncreases = priceDeltas
    .filter((p) => !p.accepted && p.delta > 0)
    .map((p) => p.delta);

  const maxAccepted =
    acceptedIncreases.length > 0 ? Math.max(...acceptedIncreases) : 0;
  const minRejected =
    rejectedIncreases.length > 0 ? Math.min(...rejectedIncreases) : 1;

  // Calculate weighted tolerance threshold
  // If we have clear boundary, use midpoint
  // Otherwise, use weighted average of accepted increases
  let toleranceThreshold: number;

  if (maxAccepted > 0 && minRejected < 1 && minRejected > maxAccepted) {
    // Clear boundary exists
    toleranceThreshold = (maxAccepted + minRejected) / 2;
  } else if (acceptedIncreases.length > 0) {
    // Use weighted average of accepted increases
    const totalWeight = priceDeltas
      .filter((p) => p.accepted && p.delta > 0)
      .reduce((sum, p) => sum + p.weight, 0);
    toleranceThreshold =
      totalWeight > 0
        ? priceDeltas
            .filter((p) => p.accepted && p.delta > 0)
            .reduce((sum, p) => sum + p.delta * p.weight, 0) / totalWeight
        : config.defaultMaxPriceIncrease;
  } else {
    toleranceThreshold = config.defaultMaxPriceIncrease;
  }

  // Calculate confidence based on sample size and consistency
  const confidence = calculateToleranceConfidence(
    priceDeltas.length,
    config.minDecisionsForLearning,
    maxAccepted,
    minRejected
  );

  return {
    maxAcceptedIncrease: maxAccepted,
    maxRejectedIncrease: rejectedIncreases.length > 0 ? Math.max(...rejectedIncreases) : 0,
    toleranceThreshold: Math.min(toleranceThreshold, 0.5), // Cap at 50%
    sampleSize: priceDeltas.length,
    confidence,
  };
}

/**
 * Result of analyzing size tolerance from decisions.
 */
interface SizeToleranceAnalysis {
  /** Maximum accepted size decrease (percentage) */
  maxAcceptedDecrease: number;
  /** Calculated tolerance threshold */
  toleranceThreshold: number;
  /** Sample size */
  sampleSize: number;
  /** Confidence in the calculation */
  confidence: number;
}

/**
 * Analyze size tolerance from decisions.
 *
 * @param decisions - Decisions to analyze
 * @param config - Learning configuration
 * @param referenceDate - Reference date for recency weighting
 * @returns Size tolerance analysis
 */
export function analyzeSizeTolerance(
  decisions: SubstitutionDecision[],
  config: LearningConfig,
  referenceDate: Date = new Date()
): SizeToleranceAnalysis {
  if (decisions.length === 0) {
    return {
      maxAcceptedDecrease: config.defaultMaxSizeDecrease,
      toleranceThreshold: config.defaultMaxSizeDecrease,
      sampleSize: 0,
      confidence: 0.1,
    };
  }

  // Calculate size delta for each decision (requires parsing size strings)
  const sizeDeltas: Array<{
    delta: number; // percentage decrease (positive = smaller)
    accepted: boolean;
    weight: number;
  }> = [];

  for (const decision of decisions) {
    const originalSize = parseSize(decision.originalProduct.size);
    const substituteSize = parseSize(decision.proposedSubstitute.size);

    if (originalSize === null || substituteSize === null || originalSize <= 0) {
      continue;
    }

    // Calculate decrease percentage (positive means smaller substitute)
    const delta = (originalSize - substituteSize) / originalSize;

    // Only consider cases where substitute is smaller
    if (delta <= 0) continue;

    const accepted = decision.decision === 'accepted';
    const weight = calculateRecencyWeight(decision, config, referenceDate);

    sizeDeltas.push({ delta, accepted, weight });
  }

  if (sizeDeltas.length === 0) {
    return {
      maxAcceptedDecrease: config.defaultMaxSizeDecrease,
      toleranceThreshold: config.defaultMaxSizeDecrease,
      sampleSize: 0,
      confidence: 0.1,
    };
  }

  // Find max accepted decrease
  const acceptedDecreases = sizeDeltas
    .filter((s) => s.accepted)
    .map((s) => s.delta);

  const maxAccepted =
    acceptedDecreases.length > 0 ? Math.max(...acceptedDecreases) : 0;

  // Calculate weighted tolerance
  const totalWeight = sizeDeltas.filter((s) => s.accepted).reduce((sum, s) => sum + s.weight, 0);
  const toleranceThreshold =
    totalWeight > 0
      ? sizeDeltas
          .filter((s) => s.accepted)
          .reduce((sum, s) => sum + s.delta * s.weight, 0) / totalWeight
      : config.defaultMaxSizeDecrease;

  // Confidence based on sample size
  const confidence = Math.min(sizeDeltas.length / (config.minDecisionsForLearning * 2), 0.9);

  return {
    maxAcceptedDecrease: maxAccepted,
    toleranceThreshold: Math.min(toleranceThreshold, 0.3), // Cap at 30%
    sampleSize: sizeDeltas.length,
    confidence,
  };
}

/**
 * Analyze brand tolerance from decisions.
 *
 * @param decisions - Decisions to analyze
 * @param config - Learning configuration
 * @returns Brand tolerance level with confidence
 */
export function analyzeBrandTolerance(
  decisions: SubstitutionDecision[],
  config: LearningConfig
): { tolerance: BrandToleranceLevel; confidence: number } {
  if (decisions.length < config.minDecisionsForLearning) {
    return { tolerance: 'flexible', confidence: 0.2 };
  }

  // Separate same-brand and different-brand decisions
  // Note: sameBrandDecisions reserved for future enhanced analysis
  const _sameBrandDecisions = decisions.filter(
    (d) =>
      d.originalProduct.brand &&
      d.proposedSubstitute.brand &&
      d.originalProduct.brand.toLowerCase() === d.proposedSubstitute.brand.toLowerCase()
  );
  void _sameBrandDecisions; // Marked for future use

  const diffBrandDecisions = decisions.filter(
    (d) =>
      d.originalProduct.brand &&
      d.proposedSubstitute.brand &&
      d.originalProduct.brand.toLowerCase() !== d.proposedSubstitute.brand.toLowerCase()
  );

  // Calculate acceptance rates
  const diffBrandAccepted = diffBrandDecisions.filter((d) => d.decision === 'accepted').length;
  const diffBrandTotal = diffBrandDecisions.length;
  const diffBrandAcceptanceRate = diffBrandTotal > 0 ? diffBrandAccepted / diffBrandTotal : 0.5;

  // Determine tolerance level based on different-brand acceptance rate
  let tolerance: BrandToleranceLevel;
  if (diffBrandAcceptanceRate >= 0.7) {
    tolerance = 'any';
  } else if (diffBrandAcceptanceRate >= 0.4) {
    tolerance = 'flexible';
  } else {
    tolerance = 'strict';
  }

  // Confidence based on sample size
  const confidence = calculateToleranceConfidence(
    diffBrandDecisions.length,
    config.minDecisionsForLearning,
    diffBrandAcceptanceRate,
    1 - diffBrandAcceptanceRate
  );

  return { tolerance, confidence };
}

/**
 * Calculate category tolerance from all relevant decisions.
 *
 * @param store - Learning store
 * @param category - Category to calculate tolerance for
 * @param config - Learning configuration
 * @param referenceDate - Reference date for recency weighting
 * @returns Calculated category tolerance
 */
export function calculateCategoryTolerance(
  store: SubstitutionLearningStore,
  category: string,
  config: LearningConfig,
  referenceDate: Date = new Date()
): CategoryTolerance {
  // Get recent decisions for this category
  const recentDecisions = getRecentDecisions(store, config, referenceDate);
  const categoryDecisions = recentDecisions.filter(
    (d) => d.originalProduct.category.toLowerCase() === category.toLowerCase()
  );

  // Analyze each tolerance dimension
  const priceAnalysis = analyzePriceTolerance(categoryDecisions, config, referenceDate);
  const sizeAnalysis = analyzeSizeTolerance(categoryDecisions, config, referenceDate);
  const brandAnalysis = analyzeBrandTolerance(categoryDecisions, config);

  // Overall confidence is the minimum of individual confidences
  const overallConfidence = Math.min(
    priceAnalysis.confidence,
    sizeAnalysis.confidence,
    brandAnalysis.confidence,
    Math.min(categoryDecisions.length / config.minDecisionsForLearning, 1)
  );

  return {
    category,
    brandTolerance: brandAnalysis.tolerance,
    maxPriceIncrease: priceAnalysis.toleranceThreshold,
    maxSizeDecrease: sizeAnalysis.toleranceThreshold,
    confidence: overallConfidence,
    sampleSize: categoryDecisions.length,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Calculate all category tolerances for the store.
 *
 * @param store - Learning store
 * @param config - Learning configuration
 * @param referenceDate - Reference date for calculations
 * @returns Array of category tolerances
 */
export function calculateAllCategoryTolerances(
  store: SubstitutionLearningStore,
  config: LearningConfig,
  referenceDate: Date = new Date()
): CategoryTolerance[] {
  // Get unique categories from decisions
  const categories = new Set<string>();
  for (const decision of store.decisions) {
    categories.add(decision.originalProduct.category.toLowerCase());
  }

  // Calculate tolerance for each category
  const tolerances: CategoryTolerance[] = [];
  for (const category of categories) {
    const tolerance = calculateCategoryTolerance(store, category, config, referenceDate);
    tolerances.push(tolerance);
  }

  return tolerances;
}

// =============================================================================
// Brand Pattern Calculation
// =============================================================================

/**
 * Calculate brand substitution patterns from decisions.
 *
 * @param store - Learning store
 * @param config - Learning configuration
 * @param referenceDate - Reference date for calculations
 * @returns Array of brand patterns
 */
export function calculateBrandPatterns(
  store: SubstitutionLearningStore,
  config: LearningConfig,
  referenceDate: Date = new Date()
): BrandTolerancePattern[] {
  // Get recent decisions
  const recentDecisions = getRecentDecisions(store, config, referenceDate);

  // Get brand pair statistics
  const pairStats = getBrandPairStats(recentDecisions);

  // Convert to BrandTolerancePattern
  const patterns: BrandTolerancePattern[] = [];

  for (const stat of pairStats) {
    const totalDecisions = stat.accepted + stat.rejected;

    // Calculate confidence based on sample size
    const confidence = calculatePatternConfidence(totalDecisions, config.minDecisionsForLearning);

    patterns.push({
      category: stat.category,
      fromBrand: stat.fromBrand,
      toBrand: stat.toBrand,
      acceptedCount: stat.accepted,
      rejectedCount: stat.rejected,
      acceptanceRate: stat.acceptanceRate,
      confidence,
      updatedAt: new Date().toISOString(),
    });
  }

  return patterns;
}

/**
 * Find matching brand pattern for a substitution.
 *
 * @param patterns - Available brand patterns
 * @param category - Product category
 * @param fromBrand - Original brand
 * @param toBrand - Substitute brand
 * @returns Matching pattern or undefined
 */
export function findBrandPattern(
  patterns: BrandTolerancePattern[],
  category: string | undefined,
  fromBrand: string | undefined,
  toBrand: string | undefined
): BrandTolerancePattern | undefined {
  if (!category || !fromBrand || !toBrand) return undefined;

  const normalizedCategory = category.toLowerCase();
  const normalizedFrom = fromBrand.toLowerCase();
  const normalizedTo = toBrand.toLowerCase();

  return patterns.find(
    (p) =>
      p.category.toLowerCase() === normalizedCategory &&
      p.fromBrand.toLowerCase() === normalizedFrom &&
      p.toBrand.toLowerCase() === normalizedTo
  );
}

/**
 * Get the best brand substitutes for a given original brand in a category.
 *
 * @param patterns - Available brand patterns
 * @param category - Product category
 * @param fromBrand - Original brand
 * @param minConfidence - Minimum confidence threshold
 * @returns Sorted list of acceptable substitute brands
 */
export function getBestBrandSubstitutes(
  patterns: BrandTolerancePattern[],
  category: string,
  fromBrand: string,
  minConfidence: number = 0.3
): Array<{ toBrand: string; acceptanceRate: number; confidence: number }> {
  const normalizedCategory = category.toLowerCase();
  const normalizedFrom = fromBrand.toLowerCase();

  const matching = patterns
    .filter(
      (p) =>
        p.category.toLowerCase() === normalizedCategory &&
        p.fromBrand.toLowerCase() === normalizedFrom &&
        p.confidence >= minConfidence
    )
    .map((p) => ({
      toBrand: p.toBrand,
      acceptanceRate: p.acceptanceRate,
      confidence: p.confidence,
    }))
    .sort((a, b) => b.acceptanceRate - a.acceptanceRate);

  return matching;
}

// =============================================================================
// Update Store with Calculated Tolerances
// =============================================================================

/**
 * Update the learning store with freshly calculated tolerances and patterns.
 *
 * @param store - Current store
 * @param config - Learning configuration
 * @param referenceDate - Reference date for calculations
 * @returns New store with updated tolerances and patterns
 */
export function updateStoreLearnings(
  store: SubstitutionLearningStore,
  config: LearningConfig,
  referenceDate: Date = new Date()
): SubstitutionLearningStore {
  const categoryTolerances = calculateAllCategoryTolerances(store, config, referenceDate);
  const brandPatterns = calculateBrandPatterns(store, config, referenceDate);

  return {
    ...store,
    categoryTolerances,
    brandPatterns,
    updatedAt: new Date().toISOString(),
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse a size string to numeric value in base units (g or ml).
 *
 * @param size - Size string (e.g., "500g", "1L", "33cl")
 * @returns Numeric value or null if unparseable
 */
export function parseSize(size: string | undefined): number | null {
  if (!size) return null;

  // Match patterns like "500g", "1.5kg", "33cl", "1L"
  const match = size.match(/(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l|cl)/i);
  if (!match?.[1] || !match[2]) return null;

  let value = parseFloat(match[1].replace(',', '.'));
  const unit = match[2].toLowerCase();

  // Convert to base unit (g or ml)
  switch (unit) {
    case 'kg':
      value *= 1000;
      break;
    case 'l':
      value *= 1000;
      break;
    case 'cl':
      value *= 10;
      break;
    // g and ml are already base units
  }

  return value;
}

/**
 * Calculate confidence for a tolerance value based on sample size and consistency.
 */
function calculateToleranceConfidence(
  sampleSize: number,
  minRequired: number,
  acceptedBoundary: number,
  rejectedBoundary: number
): number {
  // Base confidence from sample size
  let confidence = Math.min(sampleSize / (minRequired * 3), 0.8);

  // Bonus for clear boundary between accepted and rejected
  const boundaryClarity =
    rejectedBoundary > acceptedBoundary
      ? (rejectedBoundary - acceptedBoundary) / Math.max(rejectedBoundary, 0.01)
      : 0;

  confidence += boundaryClarity * 0.2;

  return Math.min(Math.max(confidence, 0.1), 0.95);
}

/**
 * Calculate confidence for a brand pattern based on sample size.
 */
function calculatePatternConfidence(sampleSize: number, minRequired: number): number {
  if (sampleSize < minRequired) {
    return sampleSize / minRequired * 0.5;
  }

  // Confidence grows logarithmically after minimum
  return Math.min(0.5 + Math.log2(sampleSize / minRequired) * 0.15, 0.95);
}
