/**
 * Reasoning Display Component
 *
 * Data layer for displaying decision reasoning on cart items.
 * Provides utilities to create explanations for why items were
 * added, removed, substituted, or modified in the cart.
 *
 * Features:
 * - Explain "why this was added/removed"
 * - Substitution comparison details
 * - Pruning reasoning (cadence-based)
 * - Factor breakdown for each decision
 *
 * This is a data/logic layer - actual rendering will be done by UI components.
 */

import type {
  DecisionReasoning,
  DecisionType,
  SubstitutionDecisionReasoning,
  SubstitutionComparison,
  PruningReasoning,
  ConfidenceDisplay,
} from '../types.js';
import {
  confidenceBuilder,
  confidenceFromCartAnalysis,
  confidenceFromPruningAnalysis,
  confidenceFromSubstitutionScore,
  CONFIDENCE_FACTORS,
} from './confidence-display.js';

// =============================================================================
// Decision Reasoning Builder
// =============================================================================

/**
 * Builder class for constructing decision reasoning explanations.
 */
export class ReasoningBuilder {
  private itemId: string = '';
  private itemName: string = '';
  private decision: DecisionType = 'added';
  private reasoning: string = '';
  private factors: string[] = [];
  private confidence: ConfidenceDisplay | null = null;
  private source: DecisionReasoning['source'] = 'coordinator';
  private timestamp: Date = new Date();

  /**
   * Set the item being explained.
   */
  forItem(itemId: string, itemName: string): this {
    this.itemId = itemId;
    this.itemName = itemName;
    return this;
  }

  /**
   * Set the decision type.
   */
  withDecision(decision: DecisionType): this {
    this.decision = decision;
    return this;
  }

  /**
   * Set the main reasoning explanation.
   */
  withReasoning(reasoning: string): this {
    this.reasoning = reasoning;
    return this;
  }

  /**
   * Add a contributing factor.
   */
  addFactor(factor: string): this {
    this.factors.push(factor);
    return this;
  }

  /**
   * Add multiple contributing factors.
   */
  addFactors(factors: string[]): this {
    this.factors.push(...factors);
    return this;
  }

  /**
   * Set the confidence display.
   */
  withConfidence(confidence: ConfidenceDisplay): this {
    this.confidence = confidence;
    return this;
  }

  /**
   * Set the source of this decision.
   */
  fromSource(source: DecisionReasoning['source']): this {
    this.source = source;
    return this;
  }

  /**
   * Set the timestamp.
   */
  at(timestamp: Date): this {
    this.timestamp = timestamp;
    return this;
  }

  /**
   * Build the final DecisionReasoning object.
   */
  build(): DecisionReasoning {
    if (!this.confidence) {
      // Create a default confidence if not provided
      this.confidence = confidenceBuilder().setBaseScore(0.5).build();
    }

    return {
      itemId: this.itemId,
      itemName: this.itemName,
      decision: this.decision,
      reasoning: this.reasoning,
      factors: this.factors,
      confidence: this.confidence,
      source: this.source,
      timestamp: this.timestamp,
    };
  }
}

/**
 * Create a new reasoning builder.
 */
export function reasoningBuilder(): ReasoningBuilder {
  return new ReasoningBuilder();
}

// =============================================================================
// Pre-built Reasoning Templates
// =============================================================================

/**
 * Create reasoning for an item added from order history.
 */
export function createAddedFromOrderReasoning(
  itemId: string,
  itemName: string,
  sourceOrders: string[],
  orderCount: number,
  appearanceCount: number,
  quantity: number
): DecisionReasoning {
  const frequencyPercent = Math.round((appearanceCount / orderCount) * 100);
  const isFrequent = frequencyPercent >= 80;
  const confidence = confidenceFromCartAnalysis(orderCount, appearanceCount, 0.8);

  return reasoningBuilder()
    .forItem(itemId, itemName)
    .withDecision('added')
    .withReasoning(
      isFrequent
        ? `Added because it appears in ${frequencyPercent}% of your recent orders`
        : `Added from ${sourceOrders.length > 1 ? 'orders' : 'order'} ${sourceOrders.join(', ')}`
    )
    .addFactors([
      `Appears in ${appearanceCount} of ${orderCount} recent orders`,
      `Typical quantity: ${quantity}`,
      sourceOrders.length > 1
        ? `Found in orders: ${sourceOrders.join(', ')}`
        : `From order: ${sourceOrders[0]}`,
    ])
    .withConfidence(confidence)
    .fromSource('cart_builder')
    .build();
}

/**
 * Create reasoning for an item added from favorites.
 */
export function createAddedFromFavoritesReasoning(
  itemId: string,
  itemName: string,
  lastOrderedDaysAgo: number | null
): DecisionReasoning {
  const confidence = confidenceBuilder()
    .setBaseScore(0.6)
    .addFactor(CONFIDENCE_FACTORS.USER_HISTORY, 0.2, 'Marked as favorite')
    .build();

  const factors = ['Item is marked as a favorite'];
  if (lastOrderedDaysAgo !== null) {
    factors.push(`Last ordered ${lastOrderedDaysAgo} days ago`);
  }

  return reasoningBuilder()
    .forItem(itemId, itemName)
    .withDecision('added')
    .withReasoning('Added because it is in your favorites list')
    .addFactors(factors)
    .withConfidence(confidence)
    .fromSource('cart_builder')
    .build();
}

/**
 * Create reasoning for an item suggested for removal (pruning).
 */
export function createPruningReasoning(
  itemId: string,
  itemName: string,
  pruning: PruningReasoning
): DecisionReasoning {
  const confidence = confidenceFromPruningAnalysis(
    pruning.daysSinceLastPurchase,
    pruning.typicalCadenceDays,
    3 // Assume 3 purchases for now
  );

  return reasoningBuilder()
    .forItem(itemId, itemName)
    .withDecision('removed')
    .withReasoning(pruning.reason)
    .addFactors([
      `Purchased ${pruning.daysSinceLastPurchase} days ago`,
      `Typical restock cadence: ${pruning.typicalCadenceDays} days`,
      pruning.estimatedDaysUntilNeeded > 0
        ? `Estimated ${pruning.estimatedDaysUntilNeeded} days until needed`
        : 'Likely still in stock at home',
    ])
    .withConfidence(confidence)
    .fromSource('stock_pruner')
    .build();
}

/**
 * Create reasoning for an item that was substituted.
 */
export function createSubstitutionReasoning(
  itemId: string,
  originalName: string,
  substituteName: string,
  comparison: SubstitutionComparison
): SubstitutionDecisionReasoning {
  const confidence = confidenceFromSubstitutionScore(
    comparison.similarityScore,
    Math.abs(comparison.priceDifference),
    comparison.originalName.split(' ')[0] === comparison.substituteName.split(' ')[0] // Simple brand check
  );

  const priceDiffText =
    comparison.priceDifference === 0
      ? 'Same price'
      : comparison.priceDifference > 0
        ? `+${comparison.priceDifference.toFixed(2)} more expensive`
        : `${Math.abs(comparison.priceDifference).toFixed(2)} cheaper`;

  return {
    itemId,
    itemName: substituteName,
    decision: 'substituted',
    reasoning: `Original item "${originalName}" is unavailable. Suggested "${substituteName}" as substitute.`,
    factors: [
      `${Math.round(comparison.similarityScore * 100)}% similarity match`,
      priceDiffText,
      comparison.selectionReason,
      ...comparison.differences.slice(0, 2),
    ],
    confidence,
    source: 'substitution',
    timestamp: new Date(),
    comparison,
  };
}

/**
 * Create reasoning for a quantity change.
 */
export function createQuantityChangeReasoning(
  itemId: string,
  itemName: string,
  previousQuantity: number,
  newQuantity: number,
  reason: 'merged' | 'adjusted' | 'stock_level' | 'user_pattern'
): DecisionReasoning {
  const reasonTexts: Record<string, string> = {
    merged: `Quantity updated from ${previousQuantity} to ${newQuantity} after merging multiple orders`,
    adjusted: `Quantity adjusted from ${previousQuantity} to ${newQuantity} based on typical order patterns`,
    stock_level: `Quantity reduced from ${previousQuantity} to ${newQuantity} due to limited stock`,
    user_pattern: `Quantity set to ${newQuantity} based on your usual purchase pattern`,
  };

  const confidence = confidenceBuilder()
    .setBaseScore(0.7)
    .addFactor(CONFIDENCE_FACTORS.QUANTITY_PATTERN, 0.15, 'Based on order history')
    .build();

  const reasonText = reasonTexts[reason] ?? `Quantity changed from ${previousQuantity} to ${newQuantity}`;
  return reasoningBuilder()
    .forItem(itemId, itemName)
    .withDecision('quantity_changed')
    .withReasoning(reasonText)
    .addFactors([
      `Previous quantity: ${previousQuantity}`,
      `New quantity: ${newQuantity}`,
      `Change reason: ${reason.replace('_', ' ')}`,
    ])
    .withConfidence(confidence)
    .fromSource('cart_builder')
    .build();
}

/**
 * Create reasoning for an item kept unchanged.
 */
export function createKeptReasoning(
  itemId: string,
  itemName: string,
  reason: 'already_in_cart' | 'frequently_ordered' | 'user_preference'
): DecisionReasoning {
  const reasonTexts: Record<string, string> = {
    already_in_cart: 'Item was already in your cart and remains unchanged',
    frequently_ordered: 'Item is frequently ordered and kept at its usual quantity',
    user_preference: 'Item matches your preferences and is kept as-is',
  };

  const confidence = confidenceBuilder()
    .setBaseScore(0.85)
    .addFactor(CONFIDENCE_FACTORS.ORDER_CONSISTENCY, 0.1, 'Consistent with history')
    .build();

  const reasonText = reasonTexts[reason] ?? 'Item kept in cart';
  return reasoningBuilder()
    .forItem(itemId, itemName)
    .withDecision('kept')
    .withReasoning(reasonText)
    .addFactors([`Reason: ${reason.replace(/_/g, ' ')}`])
    .withConfidence(confidence)
    .fromSource('coordinator')
    .build();
}

// =============================================================================
// Reasoning Formatting Utilities
// =============================================================================

/**
 * Decision type display labels.
 */
export const DECISION_LABELS: Record<DecisionType, string> = {
  added: 'Added',
  removed: 'Suggested for Removal',
  substituted: 'Substituted',
  quantity_changed: 'Quantity Changed',
  kept: 'Kept',
};

/**
 * Decision type icons (for UI rendering).
 */
export const DECISION_ICONS: Record<DecisionType, string> = {
  added: '+',
  removed: '-',
  substituted: '~',
  quantity_changed: '#',
  kept: '=',
};

/**
 * Get display label for a decision type.
 */
export function getDecisionLabel(decision: DecisionType): string {
  return DECISION_LABELS[decision];
}

/**
 * Get icon for a decision type.
 */
export function getDecisionIcon(decision: DecisionType): string {
  return DECISION_ICONS[decision];
}

/**
 * Format reasoning for CLI display.
 */
export function formatReasoningCLI(reasoning: DecisionReasoning): string {
  const icon = getDecisionIcon(reasoning.decision);
  const lines = [
    `[${icon}] ${reasoning.itemName}`,
    `    ${reasoning.reasoning}`,
  ];

  if (reasoning.factors.length > 0) {
    lines.push('    Factors:');
    reasoning.factors.forEach((factor) => {
      lines.push(`      - ${factor}`);
    });
  }

  return lines.join('\n');
}

/**
 * Format reasoning as a short summary.
 */
export function formatReasoningSummary(reasoning: DecisionReasoning): string {
  const label = getDecisionLabel(reasoning.decision);
  return `${label}: ${reasoning.reasoning}`;
}

// =============================================================================
// Reasoning Aggregation
// =============================================================================

/**
 * Summary of decisions by type.
 */
export interface DecisionSummary {
  total: number;
  byType: Record<DecisionType, number>;
  bySource: Record<DecisionReasoning['source'], number>;
  byConfidenceLevel: {
    high: number;
    medium: number;
    low: number;
  };
  averageConfidence: number;
}

/**
 * Calculate summary statistics for a collection of decisions.
 */
export function summarizeDecisions(decisions: DecisionReasoning[]): DecisionSummary {
  const byType: Record<DecisionType, number> = {
    added: 0,
    removed: 0,
    substituted: 0,
    quantity_changed: 0,
    kept: 0,
  };

  const bySource: Record<DecisionReasoning['source'], number> = {
    cart_builder: 0,
    substitution: 0,
    stock_pruner: 0,
    coordinator: 0,
    user: 0,
  };

  const byConfidenceLevel = {
    high: 0,
    medium: 0,
    low: 0,
  };

  let totalConfidence = 0;

  for (const decision of decisions) {
    byType[decision.decision]++;
    bySource[decision.source]++;
    byConfidenceLevel[decision.confidence.level]++;
    totalConfidence += decision.confidence.score;
  }

  return {
    total: decisions.length,
    byType,
    bySource,
    byConfidenceLevel,
    averageConfidence: decisions.length > 0 ? totalConfidence / decisions.length : 0,
  };
}

/**
 * Group decisions by item ID.
 */
export function groupDecisionsByItem(
  decisions: DecisionReasoning[]
): Map<string, DecisionReasoning[]> {
  const grouped = new Map<string, DecisionReasoning[]>();

  for (const decision of decisions) {
    const existing = grouped.get(decision.itemId) ?? [];
    existing.push(decision);
    grouped.set(decision.itemId, existing);
  }

  return grouped;
}

/**
 * Get decisions that need user attention (low confidence or complex changes).
 */
export function getDecisionsNeedingReview(decisions: DecisionReasoning[]): DecisionReasoning[] {
  return decisions.filter(
    (d) =>
      d.confidence.level === 'low' ||
      d.decision === 'substituted' ||
      d.decision === 'removed'
  );
}

// =============================================================================
// Re-exports
// =============================================================================

export type {
  DecisionReasoning,
  DecisionType,
  SubstitutionDecisionReasoning,
  SubstitutionComparison,
  PruningReasoning,
};
