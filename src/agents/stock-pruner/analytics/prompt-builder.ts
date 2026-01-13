/**
 * Rich Batch Prompt Builder
 *
 * Builds comprehensive LLM prompts with full cart context,
 * rich analytics, and bundle detection for holistic reasoning.
 */

import type {
  ProductAnalytics,
  AnalyticsSummary,
  DetectedBundle,
  CoPurchaseRelation,
} from './types.js';
import type { PruneDecision } from '../types.js';
import { normalizeProductName } from './engine.js';

/**
 * Item with analytics for prompt building.
 */
interface ItemWithAnalytics {
  productName: string;
  analytics: ProductAnalytics | undefined;
  heuristicDecision: PruneDecision;
}

/**
 * Format interval stats for display.
 */
function formatIntervalStats(analytics: ProductAnalytics): string {
  const { intervalStats } = analytics;

  if (intervalStats.purchaseCount < 2) {
    return `First-time or single purchase (${intervalStats.purchaseCount} record)`;
  }

  const parts: string[] = [];

  // Mean and standard deviation
  parts.push(`μ=${intervalStats.meanDays} days`);
  if (intervalStats.stdDevDays > 0) {
    parts.push(`σ=${intervalStats.stdDevDays} days`);
  }

  // Coefficient of variation interpretation
  if (intervalStats.coefficientOfVariation < 0.3) {
    parts.push('(very consistent)');
  } else if (intervalStats.coefficientOfVariation < 0.5) {
    parts.push('(consistent)');
  } else if (intervalStats.coefficientOfVariation < 0.8) {
    parts.push('(variable)');
  } else {
    parts.push('(highly variable)');
  }

  return parts.join(', ');
}

/**
 * Format current position relative to purchase pattern.
 */
function formatCurrentPosition(analytics: ProductAnalytics): string {
  const { daysSinceLastPurchase, intervalStats, trend, isOverdue, isEarly } = analytics;

  const parts: string[] = [];

  // Days since last purchase
  parts.push(`${daysSinceLastPurchase} days since last purchase`);

  // Z-score interpretation
  if (intervalStats.stdDevDays > 0 && intervalStats.purchaseCount >= 3) {
    const zScore = trend.recentIntervalZScore;
    if (zScore < -1.5) {
      parts.push(`(${Math.abs(zScore).toFixed(1)}σ early)`);
    } else if (zScore < -0.5) {
      parts.push('(slightly early)');
    } else if (zScore > 1.5) {
      parts.push(`(${zScore.toFixed(1)}σ overdue)`);
    } else if (zScore > 0.5) {
      parts.push('(slightly overdue)');
    } else {
      parts.push('(on schedule)');
    }
  } else if (isOverdue) {
    parts.push('(overdue)');
  } else if (isEarly) {
    parts.push('(early)');
  }

  return parts.join(' ');
}

/**
 * Format trend analysis.
 */
function formatTrend(analytics: ProductAnalytics): string | undefined {
  const { trend } = analytics;

  if (trend.trendReliability < 0.3) {
    return undefined; // Not reliable enough to report
  }

  const parts: string[] = [];

  // Velocity trend
  if (trend.velocityTrend === 'accelerating') {
    parts.push('Trend: buying more frequently lately');
  } else if (trend.velocityTrend === 'decelerating') {
    parts.push('Trend: buying less frequently lately');
  }

  // Recent vs historical delta
  if (Math.abs(trend.recentVsHistoricalDelta) > 0.2) {
    const pct = Math.abs(trend.recentVsHistoricalDelta * 100).toFixed(0);
    if (trend.recentVsHistoricalDelta < 0) {
      parts.push(`Recent purchases ${pct}% faster than historical`);
    } else {
      parts.push(`Recent purchases ${pct}% slower than historical`);
    }
  }

  return parts.length > 0 ? parts.join('. ') : undefined;
}

/**
 * Format quantity patterns.
 */
function formatQuantityPattern(analytics: ProductAnalytics): string | undefined {
  const { quantityStats } = analytics;

  if (quantityStats.meanQuantity === quantityStats.modeQuantity &&
      quantityStats.stdDevQuantity < 0.5) {
    return `Always buys ${quantityStats.modeQuantity} unit(s)`;
  }

  if (quantityStats.stdDevQuantity > 1) {
    return `Quantity varies: typically ${quantityStats.modeQuantity}, avg ${quantityStats.meanQuantity.toFixed(1)}`;
  }

  return undefined;
}

/**
 * Format co-purchase relations.
 */
function formatCoPurchases(
  relations: CoPurchaseRelation[],
  cartProductNames: Set<string>,
): string | undefined {
  if (relations.length === 0) return undefined;

  // Check which co-purchased items are in the cart
  const inCart: string[] = [];
  const notInCart: string[] = [];

  for (const rel of relations.slice(0, 3)) {
    const normalized = normalizeProductName(rel.productName);
    if (cartProductNames.has(normalized)) {
      inCart.push(rel.productName);
    } else {
      notInCart.push(rel.productName);
    }
  }

  const parts: string[] = [];

  if (inCart.length > 0) {
    parts.push(`Often bought with (in cart): ${inCart.join(', ')}`);
  }

  return parts.length > 0 ? parts.join('. ') : undefined;
}

/**
 * Format a bundle for display.
 */
function formatBundle(bundle: DetectedBundle): string {
  const strength =
    bundle.strength > 0.7 ? 'strong' : bundle.strength > 0.4 ? 'moderate' : 'weak';
  return `**${bundle.name}** (${strength} association): ${bundle.products.join(', ')}`;
}

/**
 * Build the system prompt for holistic cart analysis.
 */
export function buildAnalyticsSystemPrompt(): string {
  return `You are an AI assistant analyzing a grocery shopping cart to identify items that may not be needed.

## Your Role
Analyze the ENTIRE cart holistically to suggest items for removal based on:
1. **Statistical patterns**: Purchase frequency, consistency, current position relative to typical interval
2. **Bundle relationships**: Items often bought together should generally stay together
3. **Trend analysis**: Is the household buying more/less of this item lately?
4. **Seasonality**: Is this a seasonal purchase?

## Decision Guidelines

### PRUNE (suggest removal) when:
- Item is significantly early (>1.5σ before typical restock time)
- High confidence analytics show clear overstock
- Item is NOT part of a detected bundle, or entire bundle can be pruned

### KEEP when:
- Item is on schedule or overdue
- Item is part of a bundle where other items are being kept
- Analytics confidence is low (limited purchase history)
- Item could be high-consequence (baby, pet, medication)
- Uncertain about the pattern

### CRITICAL: Be Conservative
- When in doubt, KEEP the item
- A false positive (removing something needed) is worse than keeping something unneeded
- Users review all decisions, so suggest removal only with clear evidence

## Output Format
For each item under review, call the make_prune_decision tool with your analysis.
Consider the full cart context, not just individual items.`;
}

/**
 * Build a rich batch prompt with full cart context and analytics.
 */
export function buildRichBatchPrompt(
  itemsToReview: ItemWithAnalytics[],
  itemsToKeep: ItemWithAnalytics[],
  analyticsSummary: AnalyticsSummary,
): string {
  const lines: string[] = [];
  const cartProductNames = new Set<string>();

  // Build set of all cart product names for co-purchase checking
  for (const item of [...itemsToReview, ...itemsToKeep]) {
    cartProductNames.add(normalizeProductName(item.productName));
  }

  // Header
  lines.push(`# Cart Analysis Request`);
  lines.push(``);
  lines.push(`Total items in cart: ${analyticsSummary.cartStats.totalItems}`);
  lines.push(`Items with purchase history: ${analyticsSummary.cartStats.itemsWithHistory}`);
  lines.push(`Items to review: ${itemsToReview.length}`);
  lines.push(`Items already decided to keep: ${itemsToKeep.length}`);
  lines.push(``);

  // Detected bundles
  if (analyticsSummary.detectedBundles.length > 0) {
    lines.push(`## Detected Bundles`);
    lines.push(`These items appear to be purchased together frequently:`);
    lines.push(``);
    for (const bundle of analyticsSummary.detectedBundles) {
      lines.push(`- ${formatBundle(bundle)}`);
    }
    lines.push(``);
    lines.push(`Consider bundle context when making decisions - removing one item from a bundle may not make sense.`);
    lines.push(``);
  }

  // Items to review (need LLM decision)
  lines.push(`## Items Requiring Your Analysis (${itemsToReview.length} items)`);
  lines.push(``);
  lines.push(`For EACH item below, call make_prune_decision with your analysis.`);
  lines.push(``);

  for (let i = 0; i < itemsToReview.length; i++) {
    const item = itemsToReview[i]!;
    const analytics = item.analytics;
    const heuristic = item.heuristicDecision;

    lines.push(`### ${i + 1}. ${item.productName}`);
    lines.push(``);

    if (analytics) {
      // Rich analytics available
      lines.push(`**Purchase Pattern:** ${formatIntervalStats(analytics)}`);
      lines.push(`**Current Position:** ${formatCurrentPosition(analytics)}`);
      lines.push(`**Data Points:** ${analytics.intervalStats.purchaseCount} purchases (confidence: ${(analytics.analyticsConfidence * 100).toFixed(0)}%)`);

      const trend = formatTrend(analytics);
      if (trend) {
        lines.push(`**Trend:** ${trend}`);
      }

      const quantity = formatQuantityPattern(analytics);
      if (quantity) {
        lines.push(`**Quantity:** ${quantity}`);
      }

      const coPurchases = formatCoPurchases(analytics.frequentlyBoughtWith, cartProductNames);
      if (coPurchases) {
        lines.push(`**Relationships:** ${coPurchases}`);
      }

      if (analytics.seasonality.seasonalityScore > 0.6) {
        const peakInfo = analytics.seasonality.isCurrentlyPeakSeason ? ' (currently peak season)' : '';
        lines.push(`**Seasonality:** Score ${(analytics.seasonality.seasonalityScore * 100).toFixed(0)}%${peakInfo}`);
      }
    } else {
      // No analytics - limited info
      lines.push(`**Purchase Pattern:** No purchase history available`);
      if (heuristic.context.daysSinceLastPurchase !== undefined) {
        lines.push(`**Days since last purchase:** ${heuristic.context.daysSinceLastPurchase}`);
      }
    }

    // Heuristic decision
    lines.push(``);
    lines.push(`**Heuristic Analysis:**`);
    lines.push(`- Decision: ${heuristic.prune ? 'PRUNE' : 'KEEP'}`);
    lines.push(`- Confidence: ${(heuristic.confidence * 100).toFixed(0)}%`);
    lines.push(`- Reason: ${heuristic.reason}`);
    lines.push(``);
  }

  // Context: Items already decided to keep
  if (itemsToKeep.length > 0) {
    lines.push(`## Context: Items Already Decided to Keep (${itemsToKeep.length} items)`);
    lines.push(``);
    lines.push(`These items have been decided to keep based on high-confidence heuristics.`);
    lines.push(`Consider their presence when evaluating bundle relationships.`);
    lines.push(``);

    // Group by rough category for readability
    const keepItems = itemsToKeep.map((item) => {
      const analytics = item.analytics;
      if (analytics && analytics.daysSinceLastPurchase > analytics.intervalStats.meanDays) {
        return `${item.productName} (overdue)`;
      }
      return item.productName;
    });

    // Show in a compact format
    const chunkSize = 3;
    for (let i = 0; i < keepItems.length; i += chunkSize) {
      const chunk = keepItems.slice(i, i + chunkSize);
      lines.push(`- ${chunk.join(', ')}`);
    }
    lines.push(``);
  }

  // Final instruction
  lines.push(`## Your Task`);
  lines.push(``);
  lines.push(`Call make_prune_decision for each of the ${itemsToReview.length} items in the "Items Requiring Your Analysis" section.`);
  lines.push(``);
  lines.push(`Consider:`);
  lines.push(`1. The statistical evidence (z-scores, trends)`);
  lines.push(`2. Bundle relationships (keep items that go together)`);
  lines.push(`3. Overall cart coherence`);
  lines.push(`4. Be conservative - when uncertain, recommend KEEP`);

  return lines.join('\n');
}

/**
 * Prepare items for prompt building.
 */
export function prepareItemsForPrompt(
  decisions: PruneDecision[],
  analyticsSummary: AnalyticsSummary,
  uncertaintyThreshold: number,
): { itemsToReview: ItemWithAnalytics[]; itemsToKeep: ItemWithAnalytics[] } {
  const itemsToReview: ItemWithAnalytics[] = [];
  const itemsToKeep: ItemWithAnalytics[] = [];

  for (const decision of decisions) {
    const normalized = normalizeProductName(decision.productName);
    const analytics = analyticsSummary.products.get(normalized);

    const item: ItemWithAnalytics = {
      productName: decision.productName,
      analytics,
      heuristicDecision: decision,
    };

    // Items with low confidence or high-consequence need review
    if (decision.confidence < uncertaintyThreshold) {
      itemsToReview.push(item);
    } else if (!decision.prune) {
      // High confidence KEEP decisions go to context
      itemsToKeep.push(item);
    } else {
      // High confidence PRUNE decisions also need review (LLM validates)
      itemsToReview.push(item);
    }
  }

  return { itemsToReview, itemsToKeep };
}
