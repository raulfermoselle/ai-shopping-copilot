/**
 * StockPruner Agent Implementation
 *
 * Analyzes cart items against purchase history to suggest items
 * that likely don't need to be reordered yet. This is a heuristics-
 * heavy worker with minimal browser interaction.
 *
 * Key responsibilities:
 * - Detect product categories from names
 * - Calculate restock cadences from purchase history
 * - Estimate days until restock needed
 * - Generate pruning recommendations with confidence scores
 * - Provide human-readable explanations for all decisions
 *
 * The agent NEVER removes items - it only suggests. The user
 * reviews and approves all changes.
 */

import type { AgentContext, AgentResult } from '../../types/agent.js';
import type { CartSnapshot } from '../cart-builder/types.js';
import {
  StockPrunerConfigSchema,
  type StockPrunerConfig,
  type StockPruneReport,
  type PurchaseRecord,
  type UserOverride,
  type PruneDecision,
  type RecommendedPrune,
  type UncertainItem,
} from './types.js';
import {
  processCartItems,
  summarizeDecisions,
  type CartItemForPruning,
} from './heuristics.js';

// =============================================================================
// StockPruner Result Types
// =============================================================================

/**
 * Successful StockPruner result data.
 */
export interface StockPrunerResultData {
  /** Full pruning report */
  report: StockPruneReport;
  /** High-confidence items to remove */
  recommendedRemovals: RecommendedPrune[];
  /** Items with uncertain status (need user review) */
  uncertainItems: UncertainItem[];
  /** Items to keep in cart */
  keepItems: PruneDecision[];
}

/**
 * StockPruner agent result.
 */
export interface StockPrunerResult extends AgentResult {
  data?: StockPrunerResultData;
}

// =============================================================================
// StockPruner Input Types
// =============================================================================

/**
 * Input for StockPruner.run() method.
 */
export interface StockPrunerRunInput {
  /** Cart snapshot to analyze */
  cart: CartSnapshot;
  /** Purchase history records */
  purchaseHistory: PurchaseRecord[];
  /** User overrides for specific products */
  userOverrides?: Record<string, UserOverride>;
  /** Reference date for timing calculations (defaults to now) */
  referenceDate?: Date;
}

// =============================================================================
// StockPruner Agent
// =============================================================================

/**
 * StockPruner Agent
 *
 * Analyzes shopping cart against purchase history to identify items
 * that may not need to be reordered yet. Uses pure heuristic functions
 * for all decision logic.
 *
 * @example
 * ```typescript
 * const pruner = new StockPruner({ conservativeMode: true });
 * const result = await pruner.run(context, {
 *   cart: cartSnapshot,
 *   purchaseHistory: history,
 * });
 *
 * if (result.success) {
 *   console.log('Suggested removals:', result.data.recommendedRemovals);
 * }
 * ```
 */
export class StockPruner {
  private readonly config: StockPrunerConfig;

  constructor(config: Partial<StockPrunerConfig> = {}) {
    this.config = StockPrunerConfigSchema.parse(config);
  }

  /**
   * Run the StockPruner agent.
   *
   * Analyzes cart items against purchase history and generates
   * pruning recommendations. This is a pure computation - no
   * browser interaction required.
   *
   * @param context - Agent execution context
   * @param input - Cart and purchase history to analyze
   * @returns StockPruner result with pruning recommendations
   */
  async run(context: AgentContext, input: StockPrunerRunInput): Promise<StockPrunerResult> {
    const { logger, sessionId } = context;
    const logs: string[] = [];
    const referenceDate = input.referenceDate ?? new Date();

    // Yield to event loop - keeps interface consistent with other agents
    // that perform async operations (browser automation)
    await Promise.resolve();

    try {
      logger.info('StockPruner starting', {
        cartItemCount: input.cart.itemCount,
        historyRecordCount: input.purchaseHistory.length,
        config: this.config,
      });
      logs.push('StockPruner started');

      // Convert cart items to pruning format
      const cartItems = this.convertCartItems(input.cart);
      logs.push(`Converted ${cartItems.length} cart items for analysis`);

      // Convert user overrides to Map for lookup
      const userOverrides = new Map<string, UserOverride>();
      if (input.userOverrides) {
        for (const [key, override] of Object.entries(input.userOverrides)) {
          userOverrides.set(key, override);
        }
      }
      logs.push(`Loaded ${userOverrides.size} user overrides`);

      // Process all cart items
      const decisions = processCartItems(
        cartItems,
        input.purchaseHistory,
        this.config,
        userOverrides,
        referenceDate
      );
      logs.push(`Generated ${decisions.length} pruning decisions`);

      // Calculate summary statistics
      const summary = summarizeDecisions(decisions);
      logs.push(
        `Summary: ${summary.suggestedForPruning} to prune, ${summary.keepInCart} to keep`
      );

      // Categorize decisions
      const { recommendedRemovals, uncertainItems, keepItems } =
        this.categorizeDecisions(decisions);
      logs.push(
        `Categorized: ${recommendedRemovals.length} high-confidence, ` +
          `${uncertainItems.length} uncertain, ${keepItems.length} keep`
      );

      // Generate report
      const report = this.generateReport(
        sessionId,
        decisions,
        recommendedRemovals,
        uncertainItems,
        input.purchaseHistory,
        summary
      );

      logger.info('StockPruner completed successfully', {
        totalItems: summary.totalItems,
        suggestedPrunes: summary.suggestedForPruning,
        averageConfidence: summary.averageConfidence.toFixed(2),
      });

      return {
        success: true,
        data: {
          report,
          recommendedRemovals,
          uncertainItems,
          keepItems,
        },
        logs,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('StockPruner failed', { error: err.message });
      logs.push(`Error: ${err.message}`);

      return {
        success: false,
        error: err,
        logs,
      };
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Convert CartSnapshot items to CartItemForPruning format.
   */
  private convertCartItems(cart: CartSnapshot): CartItemForPruning[] {
    return cart.items.map((item) => ({
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    }));
  }

  /**
   * Categorize decisions into recommended removals, uncertain, and keep.
   */
  private categorizeDecisions(decisions: PruneDecision[]): {
    recommendedRemovals: RecommendedPrune[];
    uncertainItems: UncertainItem[];
    keepItems: PruneDecision[];
  } {
    const recommendedRemovals: RecommendedPrune[] = [];
    const uncertainItems: UncertainItem[] = [];
    const keepItems: PruneDecision[] = [];

    for (const decision of decisions) {
      if (decision.prune && decision.confidence >= this.config.minPruneConfidence) {
        // High-confidence prune recommendation
        recommendedRemovals.push({
          productName: decision.productName,
          productId: decision.productId,
          confidence: decision.confidence,
          reason: decision.reason,
          daysSinceLastPurchase: decision.context.daysSinceLastPurchase ?? 0,
        });
      } else if (decision.confidence < 0.6 || (decision.prune && decision.confidence < this.config.minPruneConfidence)) {
        // Low confidence - needs user review
        uncertainItems.push({
          productName: decision.productName,
          productId: decision.productId,
          confidence: decision.confidence,
          reason: decision.reason,
        });
      } else {
        // Confident keep
        keepItems.push(decision);
      }
    }

    return { recommendedRemovals, uncertainItems, keepItems };
  }

  /**
   * Generate the complete pruning report.
   */
  private generateReport(
    sessionId: string,
    decisions: PruneDecision[],
    recommendedPrunes: RecommendedPrune[],
    uncertainItems: UncertainItem[],
    purchaseHistory: PurchaseRecord[],
    summary: ReturnType<typeof summarizeDecisions>
  ): StockPruneReport {
    // Analyze purchase history metadata
    const historyDates = purchaseHistory.map((r) => new Date(r.purchaseDate).getTime());
    const oldestDate = historyDates.length > 0 ? Math.min(...historyDates) : Date.now();
    const daysBack = Math.ceil((Date.now() - oldestDate) / (1000 * 60 * 60 * 24));

    // Count unique orders
    const uniqueOrders = new Set(purchaseHistory.map((r) => r.orderId));

    // Count unique products
    const uniqueProducts = new Set(
      purchaseHistory.map((r) => r.productId ?? r.productName)
    );

    // Generate warnings
    const warnings: string[] = [];

    if (purchaseHistory.length === 0) {
      warnings.push('No purchase history available. All decisions based on category defaults.');
    } else if (purchaseHistory.length < 10) {
      warnings.push('Limited purchase history. Confidence may be lower than usual.');
    }

    if (daysBack < 30) {
      warnings.push('Purchase history covers less than 30 days. Cadence estimates may be unreliable.');
    }

    if (summary.lowConfidenceDecisions > summary.totalItems * 0.3) {
      warnings.push(
        `${summary.lowConfidenceDecisions} items have low confidence decisions. Review recommended.`
      );
    }

    return {
      timestamp: new Date(),
      sessionId,
      itemsAnalyzed: decisions.length,
      itemsSuggestedForPruning: summary.suggestedForPruning,
      decisions,
      recommendedPrunes,
      uncertainItems,
      historyAnalyzed: {
        daysBackAnalyzed: daysBack,
        ordersAnalyzed: uniqueOrders.size,
        uniqueItemsPurchased: uniqueProducts.size,
      },
      overallConfidence: summary.averageConfidence,
      warnings,
      screenshots: [], // StockPruner doesn't take screenshots
    };
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a StockPruner instance with configuration.
 */
export function createStockPruner(config?: Partial<StockPrunerConfig>): StockPruner {
  return new StockPruner(config);
}

/**
 * Create a conservative StockPruner that only suggests high-confidence prunes.
 */
export function createConservativeStockPruner(): StockPruner {
  return new StockPruner({
    conservativeMode: true,
    minPruneConfidence: 0.8,
    pruneThreshold: 0.5, // Only prune if less than 50% through cycle
  });
}

/**
 * Create an aggressive StockPruner that suggests more prunes.
 */
export function createAggressiveStockPruner(): StockPruner {
  return new StockPruner({
    conservativeMode: false,
    minPruneConfidence: 0.6,
    pruneThreshold: 0.7, // Prune if less than 70% through cycle
  });
}
