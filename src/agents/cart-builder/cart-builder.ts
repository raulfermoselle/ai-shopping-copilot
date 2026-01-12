/**
 * CartBuilder Agent Implementation
 *
 * Builds the shopping cart by:
 * - Loading previous orders from Auchan.pt order history
 * - Using "Encomendar de novo" for bulk cart loading
 * - Applying learned preferences to filter/adjust items (Phase 3)
 * - Computing cart diff for review
 *
 * Key insight from research (Sprint-CB-R-001):
 * The "Encomendar de novo" button adds an entire order to cart instantly,
 * eliminating the need to add items individually.
 *
 * Phase 3 Addition (Sprint-CB-I-002):
 * Preference learning integration - the agent can now use learned preferences
 * to auto-exclude items with strong rejection signals and suggest quantity
 * adjustments based on user history.
 */

import type { AgentContext, AgentResult } from '../../types/agent.js';
import type { ToolContext, ToolConfig } from '../../types/tool.js';
import type {
  CartBuilderConfig,
  CartDiffReport,
  OrderSummary,
  OrderDetail,
  CartSnapshot,
  CartDiff,
  CartItem,
} from './types.js';
import { CartBuilderConfigSchema } from './types.js';

// Import CartBuilder tools
// Note: loadOrderDetailTool is available in tools/index.js for components needing item-level data
import {
  navigateToOrderHistoryTool,
  loadOrderHistoryTool,
  reorderTool,
  scanCartTool,
} from './tools/index.js';

// Import preference learning (Phase 3)
import type {
  PreferenceStore,
  PreferenceLearningConfig,
  CartPreferenceCheckResult,
} from './learning/index.js';
import {
  checkCartPreferences,
  createDefaultConfig as createDefaultLearningConfig,
} from './learning/index.js';

// =============================================================================
// CartBuilder Result Types
// =============================================================================

/**
 * Successful CartBuilder result data.
 */
export interface CartBuilderResultData {
  /** Orders loaded from history */
  ordersLoaded: OrderSummary[];
  /** Order details retrieved (if needed) */
  orderDetails: OrderDetail[];
  /** Cart state before loading orders */
  cartBefore: CartSnapshot;
  /** Cart state after loading orders */
  cartAfter: CartSnapshot;
  /** Diff between cart states */
  diff: CartDiff;
  /** Full diff report for Coordinator */
  report: CartDiffReport;
  /** Preference check result (Phase 3) - optional */
  preferenceCheck?: CartPreferenceCheckResult;
}

/**
 * CartBuilder agent result.
 */
export interface CartBuilderResult extends AgentResult {
  data?: CartBuilderResultData;
}

// =============================================================================
// CartBuilder Agent
// =============================================================================

/**
 * CartBuilder Agent
 *
 * Responsible for:
 * 1. Navigating to order history
 * 2. Loading specified orders
 * 3. Using reorder functionality to populate cart
 * 4. Checking learned preferences (Phase 3)
 * 5. Computing and reporting cart diff
 *
 * Uses the Selector Registry for all page interactions.
 */
export class CartBuilder {
  private readonly config: CartBuilderConfig;
  private readonly screenshotDir: string;
  private screenshots: string[] = [];

  // Phase 3: Preference learning support
  private preferenceStore: PreferenceStore | null = null;
  private learningConfig: PreferenceLearningConfig;

  constructor(config: Partial<CartBuilderConfig> = {}) {
    this.config = CartBuilderConfigSchema.parse(config);
    this.screenshotDir = 'screenshots';
    this.learningConfig = createDefaultLearningConfig();
  }

  /**
   * Set preference store for preference-aware cart building.
   * Call this before run() to enable preference checking.
   *
   * @param store - Preference store for the household
   * @param config - Optional learning configuration override
   */
  setPreferenceStore(store: PreferenceStore, config?: Partial<PreferenceLearningConfig>): void {
    this.preferenceStore = store;
    if (config) {
      this.learningConfig = { ...this.learningConfig, ...config };
    }
  }

  /**
   * Clear preference store (disable preference checking).
   */
  clearPreferenceStore(): void {
    this.preferenceStore = null;
  }

  /**
   * Create a ToolContext from AgentContext for tool execution.
   */
  private createToolContext(context: AgentContext): ToolContext {
    const { page, logger } = context;

    const toolConfig: ToolConfig = {
      navigationTimeout: 30000,
      elementTimeout: 10000,
      screenshotDir: this.screenshotDir,
    };

    return {
      page,
      logger,
      screenshot: async (name: string): Promise<string> => {
        const timestamp = Date.now();
        const filename = `${name}-${timestamp}.png`;
        const filepath = `${this.screenshotDir}/${filename}`;
        await page.screenshot({ path: filepath });
        this.screenshots.push(filepath);
        return filepath;
      },
      config: toolConfig,
    };
  }

  /**
   * Run the CartBuilder agent.
   *
   * @param context - Agent execution context
   * @returns CartBuilder result with diff report
   */
  async run(context: AgentContext): Promise<CartBuilderResult> {
    const { logger, sessionId } = context;
    const logs: string[] = [];
    const toolContext = this.createToolContext(context);

    // Reset screenshots for this run
    this.screenshots = [];

    try {
      logger.info('CartBuilder starting', { config: this.config });
      logs.push('CartBuilder started');

      // Step 1: Capture initial cart state
      const cartBefore = await this.captureCartSnapshot(toolContext);
      logs.push(`Initial cart: ${cartBefore.itemCount} items, €${cartBefore.totalPrice.toFixed(2)}`);

      // Step 2: Navigate to order history
      await this.navigateToOrderHistory(toolContext);
      logs.push('Navigated to order history');

      // Step 3: Load order list
      const orders = await this.loadOrderList(toolContext);
      logs.push(`Found ${orders.length} orders in history`);

      // Step 4: Select orders to load based on strategy
      const selectedOrders = this.selectOrders(orders);
      logs.push(`Selected ${selectedOrders.length} orders to load`);

      // Step 5: Load orders into cart using reorder button
      const { orderDetails, successCount, failureCount } = await this.reorderSelectedOrders(
        toolContext,
        selectedOrders
      );
      logs.push(`Reordered ${successCount}/${selectedOrders.length} orders (${failureCount} failed)`);

      // CRITICAL: Verify at least one order was successfully reordered
      if (successCount === 0 && selectedOrders.length > 0) {
        throw new Error(
          `All ${selectedOrders.length} reorder attempts failed. Cart may be empty.`
        );
      }

      // Step 6: Capture final cart state
      const cartAfter = await this.captureCartSnapshot(toolContext);
      logs.push(`Final cart: ${cartAfter.itemCount} items, €${cartAfter.totalPrice.toFixed(2)}`);

      // CRITICAL: Verify cart is not empty after reordering
      if (cartAfter.itemCount === 0 && successCount > 0) {
        logger.error('Cart is empty despite successful reorder attempts', {
          successCount,
          failureCount,
          cartBeforeCount: cartBefore.itemCount,
          cartAfterCount: cartAfter.itemCount,
        });
        throw new Error(
          `Cart is empty after ${successCount} "successful" reorders. Something went wrong with cart state.`
        );
      }

      // Step 7: Compute diff
      const diff = this.computeDiff(cartBefore, cartAfter);
      logs.push(`Diff: +${diff.summary.addedCount} -${diff.summary.removedCount} ~${diff.summary.changedCount}`);

      // Step 7.5 (Phase 3): Check preferences against cart items
      let preferenceCheck: CartPreferenceCheckResult | undefined;
      if (this.preferenceStore) {
        preferenceCheck = this.checkPreferences(cartAfter, sessionId);
        logger.info('Preference check completed', {
          itemsWithPreferences: preferenceCheck.itemsWithPreferences,
          excludedItems: preferenceCheck.excludedItems.length,
          quantityAdjustments: preferenceCheck.quantityAdjustments.length,
          averageConfidence: preferenceCheck.averageConfidence.toFixed(2),
        });
        logs.push(
          `Preferences: ${preferenceCheck.itemsWithPreferences}/${cartAfter.itemCount} items with history, ` +
            `${preferenceCheck.excludedItems.length} suggested exclusions, ` +
            `${preferenceCheck.quantityAdjustments.length} quantity adjustments`
        );
      }

      // Step 8: Generate report (include screenshots and preference check)
      const report = this.generateReport(
        sessionId,
        selectedOrders,
        cartBefore,
        cartAfter,
        diff,
        this.screenshots,
        preferenceCheck
      );

      logger.info('CartBuilder completed successfully', { diff: diff.summary });

      // Build result data, conditionally including preferenceCheck
      const resultData: CartBuilderResultData = {
        ordersLoaded: selectedOrders,
        orderDetails,
        cartBefore,
        cartAfter,
        diff,
        report,
      };

      // Only add preferenceCheck if it exists (for exactOptionalPropertyTypes compatibility)
      if (preferenceCheck) {
        resultData.preferenceCheck = preferenceCheck;
      }

      return {
        success: true,
        data: resultData,
        logs,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('CartBuilder failed', { error: err.message });
      logs.push(`Error: ${err.message}`);

      return {
        success: false,
        error: err,
        logs,
      };
    }
  }

  // ===========================================================================
  // Private Methods - Tool integrations
  // ===========================================================================

  /**
   * Capture current cart snapshot using ScanCartTool.
   */
  private async captureCartSnapshot(toolContext: ToolContext): Promise<CartSnapshot> {
    const result = await scanCartTool.execute(
      { expandAll: true, captureScreenshot: true },
      toolContext
    );

    if (!result.success || !result.data) {
      throw new Error(result.error?.message ?? 'Failed to scan cart');
    }

    return result.data.snapshot;
  }

  /**
   * Navigate to order history page using NavigateToOrderHistoryTool.
   */
  private async navigateToOrderHistory(toolContext: ToolContext): Promise<void> {
    const result = await navigateToOrderHistoryTool.execute(
      { waitForLoad: true, timeout: 30000 },
      toolContext
    );

    if (!result.success) {
      throw new Error(result.error?.message ?? 'Failed to navigate to order history');
    }
  }

  /**
   * Load order list from history page using LoadOrderHistoryTool.
   */
  private async loadOrderList(toolContext: ToolContext): Promise<OrderSummary[]> {
    const result = await loadOrderHistoryTool.execute(
      { maxOrders: this.config.maxOrdersToLoad, includeDeliveryInfo: false },
      toolContext
    );

    if (!result.success || !result.data) {
      throw new Error(result.error?.message ?? 'Failed to load order history');
    }

    return result.data.orders;
  }

  /**
   * Select orders to load based on merge strategy.
   */
  private selectOrders(orders: OrderSummary[]): OrderSummary[] {
    const { maxOrdersToLoad, mergeStrategy } = this.config;

    switch (mergeStrategy) {
      case 'latest':
        // Take most recent orders
        return orders.slice(0, maxOrdersToLoad);

      case 'combined':
        // Take specified number of most recent orders
        return orders.slice(0, maxOrdersToLoad);

      case 'most-frequent':
        // For now, same as latest - frequency analysis in Phase 3
        return orders.slice(0, maxOrdersToLoad);

      default:
        return orders.slice(0, maxOrdersToLoad);
    }
  }

  /**
   * Load selected orders into cart using reorder button.
   * Uses LoadOrderDetailTool and ReorderTool.
   *
   * Processes orders from oldest to newest:
   * - First order uses 'replace' mode (replaces cart contents)
   * - Subsequent orders use 'merge' mode (adds to existing cart)
   *
   * User flow: oldest order first → replace cart, then merge remaining orders
   *
   * @returns Object with orderDetails, successCount, and failureCount
   */
  private async reorderSelectedOrders(
    toolContext: ToolContext,
    orders: OrderSummary[]
  ): Promise<{ orderDetails: OrderDetail[]; successCount: number; failureCount: number }> {
    const orderDetails: OrderDetail[] = [];
    let successCount = 0;
    let failureCount = 0;

    // Process orders from oldest to newest (reverse order)
    // First order replaces cart, subsequent orders merge
    const ordersToProcess = [...orders].reverse();

    for (let i = 0; i < ordersToProcess.length; i++) {
      const order = ordersToProcess[i];
      if (!order) continue;

      const isFirstOrder = i === 0;
      const mergeMode = isFirstOrder ? 'replace' : 'merge';

      toolContext.logger.info('Processing order for reorder', {
        orderId: order.orderId,
        orderIndex: i + 1,
        totalOrders: ordersToProcess.length,
        mergeMode,
      });

      // Note: loadOrderDetailTool is available in toolkit for item-level analysis
      // but not needed during reorder flow - reorderTool handles navigation

      // Click reorder button with appropriate merge mode
      const reorderResult = await reorderTool.execute(
        {
          orderId: order.orderId,
          detailUrl: order.detailUrl,
          mergeMode,
        },
        toolContext
      );

      if (!reorderResult.success) {
        failureCount++;
        toolContext.logger.error('REORDER FAILED', {
          orderId: order.orderId,
          error: reorderResult.error?.message,
          errorCode: reorderResult.error?.code,
          orderIndex: i + 1,
          totalOrders: ordersToProcess.length,
        });
        // Continue to try other orders, but track the failure
      } else {
        successCount++;
        toolContext.logger.info('Order reordered successfully', {
          orderId: order.orderId,
          itemsAdded: reorderResult.data?.itemsAdded,
          mergeMode,
          orderIndex: i + 1,
          totalOrders: ordersToProcess.length,
        });
      }
    }

    toolContext.logger.info('Reorder batch completed', {
      totalOrders: ordersToProcess.length,
      successCount,
      failureCount,
    });

    return { orderDetails, successCount, failureCount };
  }

  /**
   * Compute diff between two cart snapshots.
   * Uses productId as primary key, falls back to name if productId not available.
   */
  private computeDiff(before: CartSnapshot, after: CartSnapshot): CartDiff {
    // Helper to get comparison key - prefer productId, fallback to name
    const getKey = (item: CartItem): string => item.productId ?? item.name;

    // Create maps for efficient lookup
    const beforeMap = new Map(before.items.map((item) => [getKey(item), item]));
    const afterMap = new Map(after.items.map((item) => [getKey(item), item]));

    const added: CartDiff['added'] = [];
    const removed: CartDiff['removed'] = [];
    const quantityChanged: CartDiff['quantityChanged'] = [];
    const unchanged: CartDiff['unchanged'] = [];

    // Find added and changed items
    for (const [key, afterItem] of afterMap) {
      const beforeItem = beforeMap.get(key);

      if (!beforeItem) {
        // Item was added
        added.push({
          name: afterItem.name,
          quantity: afterItem.quantity,
          unitPrice: afterItem.unitPrice,
        });
      } else if (beforeItem.quantity !== afterItem.quantity) {
        // Quantity changed
        quantityChanged.push({
          name: afterItem.name,
          previousQuantity: beforeItem.quantity,
          newQuantity: afterItem.quantity,
          unitPrice: afterItem.unitPrice,
        });
      } else {
        // Unchanged
        unchanged.push({
          name: afterItem.name,
          quantity: afterItem.quantity,
          unitPrice: afterItem.unitPrice,
        });
      }
    }

    // Find removed items
    for (const [key, beforeItem] of beforeMap) {
      if (!afterMap.has(key)) {
        removed.push({
          name: beforeItem.name,
          quantity: beforeItem.quantity,
          unitPrice: beforeItem.unitPrice,
        });
      }
    }

    const priceDifference = after.totalPrice - before.totalPrice;

    return {
      added,
      removed,
      quantityChanged,
      unchanged,
      summary: {
        addedCount: added.length,
        removedCount: removed.length,
        changedCount: quantityChanged.length,
        unchangedCount: unchanged.length,
        totalItems: after.itemCount,
        priceDifference,
        newTotalPrice: after.totalPrice,
      },
    };
  }

  /**
   * Check preferences against cart items.
   * Pure function that computes preference-based recommendations.
   *
   * @param cart - Current cart snapshot
   * @param sessionId - Session identifier
   * @returns Preference check result with recommendations
   */
  private checkPreferences(cart: CartSnapshot, sessionId: string): CartPreferenceCheckResult {
    if (!this.preferenceStore) {
      // Return empty result if no preference store
      return {
        sessionId,
        timestamp: new Date(),
        itemChecks: [],
        excludedItems: [],
        quantityAdjustments: [],
        itemsWithPreferences: 0,
        itemsWithoutPreferences: cart.itemCount,
        averageConfidence: 0,
      };
    }

    // Convert cart items to the format expected by preference scorer
    const itemsForCheck = cart.items.map((item) => ({
      productId: item.productId ?? item.name, // Fallback to name if no productId
      productName: item.name,
      quantity: item.quantity,
    }));

    return checkCartPreferences(
      itemsForCheck,
      this.preferenceStore,
      sessionId,
      this.learningConfig
    );
  }

  /**
   * Generate complete diff report for Coordinator.
   * Includes preference-based recommendations if available.
   */
  private generateReport(
    sessionId: string,
    ordersAnalyzed: OrderSummary[],
    cartBefore: CartSnapshot,
    cartAfter: CartSnapshot,
    diff: CartDiff,
    screenshots: string[] = [],
    preferenceCheck?: CartPreferenceCheckResult
  ): CartDiffReport {
    // Calculate confidence based on extraction success and preference data
    const hasWarnings = diff.summary.removedCount > 0;
    let confidence = hasWarnings ? 0.9 : 1.0;

    // Adjust confidence if we have preference data
    if (preferenceCheck && preferenceCheck.itemsWithPreferences > 0) {
      // Boost confidence if preferences align with cart
      const preferenceConfidence = preferenceCheck.averageConfidence;
      confidence = confidence * 0.7 + preferenceConfidence * 0.3;
    }

    // Build warnings including preference-based suggestions
    const warnings: CartDiffReport['warnings'] = [];

    if (preferenceCheck) {
      // Add warnings for items suggested for exclusion
      for (const productId of preferenceCheck.excludedItems) {
        const itemCheck = preferenceCheck.itemChecks.find((c) => c.productId === productId);
        if (itemCheck) {
          warnings.push({
            type: 'quantity_adjusted',
            message: `"${itemCheck.productName}" is typically removed by user (${itemCheck.reason})`,
            itemName: itemCheck.productName,
          });
        }
      }

      // Add warnings for quantity adjustments
      for (const adj of preferenceCheck.quantityAdjustments) {
        warnings.push({
          type: 'quantity_adjusted',
          message: `"${adj.productName}" quantity suggestion: ${adj.originalQuantity} -> ${adj.recommendedQuantity} based on history`,
          itemName: adj.productName,
        });
      }
    }

    return {
      timestamp: new Date(),
      sessionId,
      ordersAnalyzed: ordersAnalyzed.map((o) => o.orderId),
      cart: {
        before: cartBefore,
        after: cartAfter,
      },
      diff,
      confidence,
      warnings,
      screenshots,
    };
  }
}

/**
 * Create a CartBuilder instance with configuration.
 */
export function createCartBuilder(config?: Partial<CartBuilderConfig>): CartBuilder {
  return new CartBuilder(config);
}
