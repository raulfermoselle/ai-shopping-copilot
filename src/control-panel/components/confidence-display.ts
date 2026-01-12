/**
 * Confidence Display Component
 *
 * Data layer for displaying confidence scores on cart items and decisions.
 * Provides utilities to create, format, and aggregate confidence information
 * for the Control Panel UI.
 *
 * Features:
 * - Score-to-level conversion (high/medium/low)
 * - Color coding for visual feedback
 * - Factor breakdown for transparency
 * - Aggregation utilities for summaries
 *
 * This is a data/logic layer - actual rendering will be done by UI components.
 */

import type {
  ConfidenceDisplay,
  ConfidenceFactor,
  ConfidenceLevel,
} from '../types.js';
import {
  createConfidenceDisplay,
  getConfidenceLevel,
  getConfidenceColor,
} from '../types.js';

// =============================================================================
// Common Confidence Factor Definitions
// =============================================================================

/**
 * Standard factor names used across the system.
 */
export const CONFIDENCE_FACTORS = {
  // Cart Building Factors
  PURCHASE_FREQUENCY: 'purchase_frequency',
  RECENCY: 'recency',
  ORDER_CONSISTENCY: 'order_consistency',
  QUANTITY_PATTERN: 'quantity_pattern',

  // Substitution Factors
  BRAND_MATCH: 'brand_match',
  PRICE_SIMILARITY: 'price_similarity',
  CATEGORY_MATCH: 'category_match',
  SIZE_MATCH: 'size_match',
  USER_HISTORY: 'user_history',

  // Stock Pruning Factors
  CADENCE_CONFIDENCE: 'cadence_confidence',
  CONSUMPTION_RATE: 'consumption_rate',
  SEASONAL_PATTERN: 'seasonal_pattern',
  HOUSEHOLD_SIZE: 'household_size',

  // Slot Factors
  PREFERENCE_MATCH: 'preference_match',
  COST_OPTIMIZATION: 'cost_optimization',
  AVAILABILITY: 'availability',
} as const;

/**
 * Human-readable descriptions for confidence factors.
 */
export const FACTOR_DESCRIPTIONS: Record<string, string> = {
  [CONFIDENCE_FACTORS.PURCHASE_FREQUENCY]: 'How often this item is purchased',
  [CONFIDENCE_FACTORS.RECENCY]: 'How recently this item was ordered',
  [CONFIDENCE_FACTORS.ORDER_CONSISTENCY]: 'Consistency across multiple orders',
  [CONFIDENCE_FACTORS.QUANTITY_PATTERN]: 'Typical quantity pattern match',
  [CONFIDENCE_FACTORS.BRAND_MATCH]: 'Brand similarity to original',
  [CONFIDENCE_FACTORS.PRICE_SIMILARITY]: 'Price similarity to original',
  [CONFIDENCE_FACTORS.CATEGORY_MATCH]: 'Category and type match',
  [CONFIDENCE_FACTORS.SIZE_MATCH]: 'Size/weight match',
  [CONFIDENCE_FACTORS.USER_HISTORY]: 'Previous acceptance of similar substitutes',
  [CONFIDENCE_FACTORS.CADENCE_CONFIDENCE]: 'Confidence in purchase cadence estimate',
  [CONFIDENCE_FACTORS.CONSUMPTION_RATE]: 'Known consumption rate',
  [CONFIDENCE_FACTORS.SEASONAL_PATTERN]: 'Seasonal purchase patterns',
  [CONFIDENCE_FACTORS.HOUSEHOLD_SIZE]: 'Household size adjustments',
  [CONFIDENCE_FACTORS.PREFERENCE_MATCH]: 'Match with user preferences',
  [CONFIDENCE_FACTORS.COST_OPTIMIZATION]: 'Cost optimization score',
  [CONFIDENCE_FACTORS.AVAILABILITY]: 'Slot availability score',
};

// =============================================================================
// Confidence Builder
// =============================================================================

/**
 * Builder class for constructing confidence displays with factors.
 */
export class ConfidenceBuilder {
  private score: number = 0;
  private factors: ConfidenceFactor[] = [];
  private baseScore: number = 0.5; // Start at medium confidence

  /**
   * Set the base confidence score.
   */
  setBaseScore(score: number): this {
    this.baseScore = Math.max(0, Math.min(1, score));
    this.recalculateScore();
    return this;
  }

  /**
   * Add a contributing factor to the confidence calculation.
   */
  addFactor(name: string, contribution: number, description?: string): this {
    this.factors.push({
      name,
      contribution: Math.max(-1, Math.min(1, contribution)),
      description: description ?? FACTOR_DESCRIPTIONS[name],
    });
    this.recalculateScore();
    return this;
  }

  /**
   * Add a positive factor.
   */
  addPositiveFactor(name: string, strength: number, description?: string): this {
    return this.addFactor(name, Math.abs(strength), description);
  }

  /**
   * Add a negative factor.
   */
  addNegativeFactor(name: string, strength: number, description?: string): this {
    return this.addFactor(name, -Math.abs(strength), description);
  }

  /**
   * Build the final ConfidenceDisplay.
   */
  build(): ConfidenceDisplay {
    return createConfidenceDisplay(this.score, this.factors);
  }

  /**
   * Recalculate the overall score from base and factors.
   */
  private recalculateScore(): void {
    if (this.factors.length === 0) {
      this.score = this.baseScore;
      return;
    }

    // Calculate weighted contribution from factors
    const totalContribution = this.factors.reduce((sum, f) => sum + f.contribution, 0);
    const avgContribution = totalContribution / this.factors.length;

    // Combine base score with factor contributions
    this.score = Math.max(0, Math.min(1, this.baseScore + avgContribution * 0.3));
  }
}

/**
 * Create a new confidence builder.
 */
export function confidenceBuilder(): ConfidenceBuilder {
  return new ConfidenceBuilder();
}

// =============================================================================
// Confidence Formatting Utilities
// =============================================================================

/**
 * Format confidence score as percentage string.
 */
export function formatConfidencePercent(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/**
 * Format confidence with level label.
 */
export function formatConfidenceWithLabel(confidence: ConfidenceDisplay): string {
  const percent = formatConfidencePercent(confidence.score);
  const levelLabel = confidence.level.charAt(0).toUpperCase() + confidence.level.slice(1);
  return `${percent} (${levelLabel})`;
}

/**
 * Get CSS class names for confidence level styling.
 */
export function getConfidenceClasses(level: ConfidenceLevel): {
  container: string;
  text: string;
  bar: string;
} {
  const colorClass = `confidence-${level}`;
  return {
    container: `confidence-display ${colorClass}`,
    text: `confidence-text ${colorClass}`,
    bar: `confidence-bar ${colorClass}`,
  };
}

/**
 * Get ANSI color code for CLI display.
 */
export function getConfidenceAnsiColor(level: ConfidenceLevel): string {
  switch (level) {
    case 'high':
      return '\x1b[32m'; // Green
    case 'medium':
      return '\x1b[33m'; // Yellow
    case 'low':
      return '\x1b[31m'; // Red
  }
}

/**
 * Format confidence for CLI display with colors.
 */
export function formatConfidenceCLI(confidence: ConfidenceDisplay): string {
  const color = getConfidenceAnsiColor(confidence.level);
  const reset = '\x1b[0m';
  const percent = formatConfidencePercent(confidence.score);
  return `${color}${percent}${reset}`;
}

// =============================================================================
// Confidence Aggregation
// =============================================================================

/**
 * Statistics for a collection of confidence scores.
 */
export interface ConfidenceStats {
  count: number;
  average: number;
  min: number;
  max: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  distribution: {
    high: number; // Percentage
    medium: number;
    low: number;
  };
}

/**
 * Calculate statistics for a collection of confidence displays.
 */
export function calculateConfidenceStats(confidences: ConfidenceDisplay[]): ConfidenceStats {
  if (confidences.length === 0) {
    return {
      count: 0,
      average: 0,
      min: 0,
      max: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      distribution: { high: 0, medium: 0, low: 0 },
    };
  }

  const scores = confidences.map((c) => c.score);
  const levels = confidences.map((c) => c.level);

  const highCount = levels.filter((l) => l === 'high').length;
  const mediumCount = levels.filter((l) => l === 'medium').length;
  const lowCount = levels.filter((l) => l === 'low').length;

  return {
    count: confidences.length,
    average: scores.reduce((a, b) => a + b, 0) / scores.length,
    min: Math.min(...scores),
    max: Math.max(...scores),
    highCount,
    mediumCount,
    lowCount,
    distribution: {
      high: (highCount / confidences.length) * 100,
      medium: (mediumCount / confidences.length) * 100,
      low: (lowCount / confidences.length) * 100,
    },
  };
}

/**
 * Aggregate multiple confidence displays into a single overall confidence.
 */
export function aggregateConfidences(
  confidences: ConfidenceDisplay[],
  weights?: number[]
): ConfidenceDisplay {
  if (confidences.length === 0) {
    return createConfidenceDisplay(0, []);
  }

  const effectiveWeights = weights ?? confidences.map(() => 1);
  const totalWeight = effectiveWeights.reduce((a, b) => a + b, 0);

  let weightedSum = 0;
  const allFactors: ConfidenceFactor[] = [];

  confidences.forEach((conf, i) => {
    const weight = (effectiveWeights[i] ?? 1) / totalWeight;
    weightedSum += conf.score * weight;

    // Collect unique factors with weighted contributions
    conf.factors.forEach((factor) => {
      const existingFactor = allFactors.find((f) => f.name === factor.name);
      if (existingFactor) {
        existingFactor.contribution += factor.contribution * weight;
      } else {
        allFactors.push({
          ...factor,
          contribution: factor.contribution * weight,
        });
      }
    });
  });

  return createConfidenceDisplay(weightedSum, allFactors);
}

// =============================================================================
// Confidence from Worker Results
// =============================================================================

/**
 * Create confidence display from a substitution score.
 */
export function confidenceFromSubstitutionScore(
  similarityScore: number,
  priceDelta: number,
  brandMatch: boolean
): ConfidenceDisplay {
  return confidenceBuilder()
    .setBaseScore(similarityScore)
    .addFactor(
      CONFIDENCE_FACTORS.CATEGORY_MATCH,
      similarityScore > 0.7 ? 0.2 : similarityScore > 0.5 ? 0.1 : -0.1,
      'Category and product type similarity'
    )
    .addFactor(
      CONFIDENCE_FACTORS.PRICE_SIMILARITY,
      priceDelta === 0 ? 0.15 : priceDelta < 0.5 ? 0.05 : -0.1,
      `Price difference: ${priceDelta > 0 ? '+' : ''}${priceDelta.toFixed(2)}`
    )
    .addFactor(
      CONFIDENCE_FACTORS.BRAND_MATCH,
      brandMatch ? 0.15 : 0,
      brandMatch ? 'Same brand' : 'Different brand'
    )
    .build();
}

/**
 * Create confidence display from pruning analysis.
 */
export function confidenceFromPruningAnalysis(
  daysSincePurchase: number,
  typicalCadence: number,
  purchaseCount: number
): ConfidenceDisplay {
  const cadenceRatio = daysSincePurchase / typicalCadence;
  const baseScore = purchaseCount >= 3 ? 0.7 : purchaseCount >= 2 ? 0.5 : 0.3;

  return confidenceBuilder()
    .setBaseScore(baseScore)
    .addFactor(
      CONFIDENCE_FACTORS.CADENCE_CONFIDENCE,
      purchaseCount >= 5 ? 0.2 : purchaseCount >= 3 ? 0.1 : -0.1,
      `Based on ${purchaseCount} previous purchases`
    )
    .addFactor(
      CONFIDENCE_FACTORS.RECENCY,
      cadenceRatio < 0.3 ? 0.2 : cadenceRatio < 0.5 ? 0.1 : cadenceRatio > 1 ? -0.15 : 0,
      `${daysSincePurchase} days since last purchase (typical: ${typicalCadence} days)`
    )
    .build();
}

/**
 * Create confidence display from cart building analysis.
 */
export function confidenceFromCartAnalysis(
  orderCount: number,
  appearanceCount: number,
  quantityConsistency: number
): ConfidenceDisplay {
  const frequencyRatio = appearanceCount / orderCount;
  const baseScore = frequencyRatio >= 0.8 ? 0.85 : frequencyRatio >= 0.5 ? 0.7 : 0.5;

  return confidenceBuilder()
    .setBaseScore(baseScore)
    .addFactor(
      CONFIDENCE_FACTORS.PURCHASE_FREQUENCY,
      frequencyRatio >= 0.8 ? 0.2 : frequencyRatio >= 0.5 ? 0.1 : -0.05,
      `Appears in ${Math.round(frequencyRatio * 100)}% of orders`
    )
    .addFactor(
      CONFIDENCE_FACTORS.ORDER_CONSISTENCY,
      orderCount >= 3 ? 0.1 : -0.1,
      `Based on ${orderCount} orders`
    )
    .addFactor(
      CONFIDENCE_FACTORS.QUANTITY_PATTERN,
      quantityConsistency > 0.8 ? 0.1 : quantityConsistency > 0.5 ? 0.05 : -0.05,
      `Quantity consistency: ${Math.round(quantityConsistency * 100)}%`
    )
    .build();
}

// =============================================================================
// Re-exports from types
// =============================================================================

export {
  createConfidenceDisplay,
  getConfidenceLevel,
  getConfidenceColor,
};

export type {
  ConfidenceDisplay,
  ConfidenceFactor,
  ConfidenceLevel,
};
