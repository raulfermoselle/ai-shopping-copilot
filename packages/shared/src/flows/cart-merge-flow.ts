/**
 * Cart Merge Flow
 *
 * Business logic for merging previous orders into the cart.
 * Platform-agnostic - works with both Playwright and Chrome Extension
 * through the IPageInteractor interface.
 *
 * Flow:
 * 1. Sort orders oldest-to-newest
 * 2. For each order:
 *    a. Navigate to order detail page
 *    b. Click reorder button
 *    c. Handle confirmation modal (replace first, merge rest)
 *    d. Verify cart was updated
 * 3. Return summary of merged orders
 */

import type { IPageInteractor, CartState } from '../interactor/types.js';
import {
  POPUP_PATTERNS,
  MODAL_CONTAINER_SELECTORS,
  REORDER_MODAL_MERGE_BUTTON,
  REORDER_MODAL_CONFIRM_BUTTON,
  MODAL_CANCEL_BUTTON,
  ORDER_HEADER_SELECTORS,
  REORDER_BUTTON_SELECTORS,
  CART_PAGE_INDICATORS,
} from '../patterns/index.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Order summary from order history
 */
export interface OrderToMerge {
  /** Order ID */
  orderId: string;
  /** URL to order detail page */
  detailUrl: string;
  /** Order date (for sorting) */
  date: string | Date;
}

/**
 * Configuration for CartMergeFlow
 */
export interface CartMergeFlowConfig {
  /** Maximum retries for popup dismissal before critical actions */
  maxPopupDismissRetries: number;
  /** Timeout for waiting for modal to appear per selector (ms) */
  modalWaitTimeout: number;
  /** Wait time for cart update after reorder (ms) */
  cartUpdateWaitMs: number;
  /** Navigation timeout (ms) */
  navigationTimeoutMs: number;
  /** Whether to verify cart changes after each merge */
  verifyCartChanges: boolean;
  /** Enable debug screenshots */
  debugScreenshots: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_CART_MERGE_CONFIG: CartMergeFlowConfig = {
  maxPopupDismissRetries: 3,
  modalWaitTimeout: 1000,
  cartUpdateWaitMs: 3000,
  navigationTimeoutMs: 30000,
  verifyCartChanges: true,
  debugScreenshots: true,
};

/**
 * Result of merging a single order
 */
export interface OrderMergeResult {
  /** Order ID */
  orderId: string;
  /** Whether the merge succeeded */
  success: boolean;
  /** Estimated items added (if detectable) */
  itemsAdded: number | null;
  /** Cart state before merge */
  cartBefore: CartState;
  /** Cart state after merge */
  cartAfter: CartState;
  /** Error message if failed */
  errorMessage?: string;
  /** Screenshots taken during merge */
  screenshots: string[];
  /** Duration of merge operation (ms) */
  durationMs: number;
}

/**
 * Result of the full cart merge flow
 */
export interface CartMergeFlowResult {
  /** Whether all orders were merged successfully */
  success: boolean;
  /** Results for each order */
  orderResults: OrderMergeResult[];
  /** Total items added across all orders */
  totalItemsAdded: number;
  /** Final cart state */
  finalCartState: CartState;
  /** Total duration (ms) */
  totalDurationMs: number;
  /** Summary message */
  summary: string;
}

// =============================================================================
// Cart Merge Flow
// =============================================================================

/**
 * CartMergeFlow orchestrates merging multiple orders into the cart.
 *
 * This class contains the business logic that was previously duplicated
 * between the Playwright-based CartBuilder and the Chrome Extension orchestrator.
 */
export class CartMergeFlow {
  private readonly interactor: IPageInteractor;
  private readonly config: CartMergeFlowConfig;

  constructor(
    interactor: IPageInteractor,
    config: Partial<CartMergeFlowConfig> = {}
  ) {
    this.interactor = interactor;
    this.config = { ...DEFAULT_CART_MERGE_CONFIG, ...config };
  }

  // ===========================================================================
  // Main Entry Point
  // ===========================================================================

  /**
   * Execute the cart merge flow for multiple orders.
   *
   * Orders are sorted oldest-to-newest. The first order uses 'replace' mode
   * (clears cart), subsequent orders use 'merge' mode (adds to cart).
   *
   * @param orders - Orders to merge
   * @returns Flow result with per-order results
   */
  async execute(orders: OrderToMerge[]): Promise<CartMergeFlowResult> {
    const startTime = Date.now();
    const logger = this.interactor.getLogger();

    logger.info('CartMergeFlow', 'Starting cart merge flow', {
      orderCount: orders.length,
    });

    // Sort orders oldest-to-newest
    const sortedOrders = this.sortOrdersByDate(orders);

    // Attach popup observer for automatic dismissal
    await this.interactor.attachPopupObserver(POPUP_PATTERNS);

    const orderResults: OrderMergeResult[] = [];
    let totalItemsAdded = 0;

    try {
      for (let i = 0; i < sortedOrders.length; i++) {
        const order = sortedOrders[i]!;
        const mode = i === 0 ? 'replace' : 'merge';

        logger.info('CartMergeFlow', `Processing order ${i + 1}/${sortedOrders.length}`, {
          orderId: order.orderId,
          mode,
        });

        const result = await this.mergeOrder(order, mode);
        orderResults.push(result);

        if (result.success && result.itemsAdded !== null) {
          totalItemsAdded += result.itemsAdded;
        }

        if (!result.success) {
          logger.warn('CartMergeFlow', 'Order merge failed', {
            orderId: order.orderId,
            error: result.errorMessage,
          });
          // Continue with next order - don't fail entire flow
        }
      }

      // Get final cart state
      const finalCartState = await this.interactor.getCartState();

      const totalDuration = Date.now() - startTime;
      const successCount = orderResults.filter((r) => r.success).length;
      const failCount = orderResults.length - successCount;

      const summary =
        failCount === 0
          ? `Successfully merged ${successCount} orders (${totalItemsAdded} items added)`
          : `Merged ${successCount}/${orderResults.length} orders (${failCount} failed)`;

      logger.info('CartMergeFlow', 'Cart merge flow complete', {
        successCount,
        failCount,
        totalItemsAdded,
        durationMs: totalDuration,
      });

      return {
        success: failCount === 0,
        orderResults,
        totalItemsAdded,
        finalCartState,
        totalDurationMs: totalDuration,
        summary,
      };
    } finally {
      // Clean up popup observer
      await this.interactor.detachPopupObserver();
    }
  }

  // ===========================================================================
  // Single Order Merge
  // ===========================================================================

  /**
   * Merge a single order into the cart.
   *
   * @param order - Order to merge
   * @param mode - 'replace' clears cart first, 'merge' adds to existing cart
   */
  private async mergeOrder(
    order: OrderToMerge,
    mode: 'replace' | 'merge'
  ): Promise<OrderMergeResult> {
    const startTime = Date.now();
    const logger = this.interactor.getLogger();
    const screenshots: string[] = [];

    try {
      // Step 1: Navigate to order detail page
      logger.debug('CartMergeFlow', 'Navigating to order detail', {
        url: order.detailUrl,
      });

      const currentUrl = await this.interactor.getCurrentUrl();
      if (!currentUrl.includes(order.orderId)) {
        await this.interactor.navigateTo(order.detailUrl, {
          timeout: this.config.navigationTimeoutMs,
        });

        // Wait for order header to confirm page loaded
        const headerResult = await this.interactor.findElement(
          ORDER_HEADER_SELECTORS,
          { timeout: 10000, visible: true }
        );

        if (!headerResult) {
          throw new Error('Order detail page did not load - header not found');
        }
      }

      // Step 2: Dismiss any blocking popups
      await this.ensureNoBlockingPopups('before reorder click');

      // Step 3: Get cart state BEFORE reorder
      const cartBefore = await this.interactor.getCartState();
      logger.info('CartMergeFlow', 'Cart state before merge', {
        itemCount: cartBefore.itemCount,
        totalCents: cartBefore.totalCents,
      });

      // Step 4: Find and click reorder button
      const reorderButton = await this.interactor.findElement(
        REORDER_BUTTON_SELECTORS,
        { timeout: 5000, visible: true }
      );

      if (!reorderButton) {
        if (this.config.debugScreenshots) {
          screenshots.push(await this.interactor.screenshot(`reorder-button-not-found-${order.orderId}`));
        }
        throw new Error('Reorder button not found on page');
      }

      if (this.config.debugScreenshots) {
        screenshots.push(await this.interactor.screenshot(`reorder-before-${order.orderId}`));
      }

      // Click reorder button
      logger.info('CartMergeFlow', 'Clicking reorder button');
      try {
        await this.interactor.click(reorderButton.elementRef, { timeout: 5000 });
      } catch (clickError) {
        // Retry after popup dismissal
        logger.warn('CartMergeFlow', 'First click failed, retrying', {
          error: clickError instanceof Error ? clickError.message : String(clickError),
        });
        await this.ensureNoBlockingPopups('reorder button retry');
        await this.interactor.click(reorderButton.elementRef, { timeout: 5000 });
      }

      // Step 5: Wait for popup dismissal and modal to appear
      logger.debug('CartMergeFlow', 'Waiting for modal');
      await this.interactor.waitForTimeout(1500);

      // Step 6: Handle reorder modal
      const modalHandled = await this.handleReorderModal(mode, order.orderId, screenshots);

      if (!modalHandled) {
        logger.error('CartMergeFlow', 'Modal not detected - retrying');
        if (this.config.debugScreenshots) {
          screenshots.push(await this.interactor.screenshot(`reorder-no-modal-${order.orderId}`));
        }

        // Retry: dismiss popups and click again
        await this.ensureNoBlockingPopups('modal retry');
        const retryButton = await this.interactor.findElement(
          REORDER_BUTTON_SELECTORS,
          { timeout: 3000, visible: true }
        );

        if (retryButton) {
          await this.interactor.click(retryButton.elementRef, { timeout: 5000 });
          await this.interactor.waitForTimeout(1500);
          const retryModalHandled = await this.handleReorderModal(mode, order.orderId, screenshots);

          if (!retryModalHandled) {
            throw new Error('Reorder modal did not appear after multiple attempts');
          }
        } else {
          throw new Error('Reorder button not found on retry');
        }
      }

      // Step 7: Wait for cart update
      logger.debug('CartMergeFlow', 'Waiting for cart update');
      await this.interactor.waitForTimeout(this.config.cartUpdateWaitMs);

      // Step 8: Get cart state AFTER reorder
      const cartAfter = await this.interactor.getCartState();
      logger.info('CartMergeFlow', 'Cart state after merge', {
        itemCount: cartAfter.itemCount,
        totalCents: cartAfter.totalCents,
      });

      // Step 9: Verify cart changed
      const verification = this.verifyCartChange(cartBefore, cartAfter, mode);

      if (this.config.verifyCartChanges && !verification.changed) {
        logger.warn('CartMergeFlow', 'Cart change verification failed', {
          method: verification.method,
          cartBefore,
          cartAfter,
        });
      }

      if (this.config.debugScreenshots) {
        screenshots.push(await this.interactor.screenshot(`reorder-after-${order.orderId}`));
      }

      // Check if we redirected to cart (indicates success)
      const currentUrlAfter = await this.interactor.getCurrentUrl();
      const redirectedToCart = CART_PAGE_INDICATORS.urlPatterns.some((p) =>
        p.test(currentUrlAfter)
      );

      if (redirectedToCart) {
        logger.info('CartMergeFlow', 'Redirected to cart page after reorder');
      }

      // Calculate items added
      let itemsAdded: number | null = null;
      if (cartBefore.itemCount !== null && cartAfter.itemCount !== null) {
        itemsAdded =
          mode === 'replace' ? cartAfter.itemCount : cartAfter.itemCount - cartBefore.itemCount;
      }

      return {
        orderId: order.orderId,
        success: verification.changed || redirectedToCart,
        itemsAdded,
        cartBefore,
        cartAfter,
        screenshots,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error('CartMergeFlow', 'Order merge failed', {
        orderId: order.orderId,
        error: errorMessage,
      });

      if (this.config.debugScreenshots) {
        try {
          screenshots.push(await this.interactor.screenshot(`reorder-error-${order.orderId}`));
        } catch {
          // Ignore screenshot errors
        }
      }

      return {
        orderId: order.orderId,
        success: false,
        itemsAdded: null,
        cartBefore: { itemCount: null, totalCents: null, capturedAt: Date.now() },
        cartAfter: { itemCount: null, totalCents: null, capturedAt: Date.now() },
        errorMessage,
        screenshots,
        durationMs: Date.now() - startTime,
      };
    }
  }

  // ===========================================================================
  // Modal Handling
  // ===========================================================================

  /**
   * Handle the reorder confirmation modal.
   *
   * @param mode - 'replace' or 'merge'
   * @param orderId - For screenshot naming
   * @param screenshots - Array to append screenshots to
   * @returns Whether modal was successfully handled
   */
  private async handleReorderModal(
    mode: 'replace' | 'merge',
    orderId: string,
    screenshots: string[]
  ): Promise<boolean> {
    const logger = this.interactor.getLogger();

    try {
      // Wait for modal to appear
      let modalFound = false;
      const modalResult = await this.interactor.findElement(MODAL_CONTAINER_SELECTORS, {
        timeout: this.config.modalWaitTimeout,
        visible: true,
      });

      if (modalResult) {
        modalFound = true;
        logger.debug('CartMergeFlow', 'Modal found', {
          selector: modalResult.matchedSelector,
        });
      } else {
        logger.warn('CartMergeFlow', 'Modal not found with any selector');
        await this.interactor.waitForTimeout(1000);
      }

      if (this.config.debugScreenshots) {
        screenshots.push(await this.interactor.screenshot(`reorder-modal-${orderId}`));
      }

      // Dismiss any overlaying popups
      await this.ensureNoBlockingPopups('modal button click');

      // Check what type of modal we have
      const modalInfo = await this.interactor.isReorderModalVisible();

      // Handle cart removal modal - click Cancel to preserve cart
      if (modalInfo.type === 'removal') {
        logger.warn('CartMergeFlow', 'Cart removal modal detected - clicking Cancel');
        const cancelButton = await this.interactor.findElement(MODAL_CANCEL_BUTTON, {
          timeout: 2000,
          visible: true,
        });
        if (cancelButton) {
          await this.interactor.click(cancelButton.elementRef);
          logger.info('CartMergeFlow', 'Cart removal modal dismissed');
          return false; // Need to retry
        }
      }

      // Click appropriate button based on mode
      if (mode === 'merge') {
        // Click merge button ("Juntar")
        logger.info('CartMergeFlow', 'Clicking merge button');
        const mergeButton = await this.interactor.findElement(REORDER_MODAL_MERGE_BUTTON, {
          timeout: 3000,
          visible: true,
        });

        if (mergeButton) {
          await this.interactor.click(mergeButton.elementRef);
          logger.info('CartMergeFlow', 'Merge button clicked');
          return true;
        }

        logger.warn('CartMergeFlow', 'Merge button not found, trying confirm button');
      }

      // Click confirm reorder button ("Encomendar de novo")
      logger.info('CartMergeFlow', 'Clicking confirm reorder button');
      const confirmButton = await this.interactor.findElement(REORDER_MODAL_CONFIRM_BUTTON, {
        timeout: 3000,
        visible: true,
      });

      if (confirmButton) {
        await this.interactor.click(confirmButton.elementRef);
        logger.info('CartMergeFlow', 'Confirm button clicked');
        return true;
      }

      logger.warn('CartMergeFlow', 'No modal button found');
      return modalFound; // If modal was found but no button, might still succeed
    } catch (err) {
      logger.warn('CartMergeFlow', 'Error handling modal', {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  /**
   * Ensure no popups are blocking the page before a critical action.
   */
  private async ensureNoBlockingPopups(action: string): Promise<void> {
    const logger = this.interactor.getLogger();
    logger.debug('CartMergeFlow', 'Ensuring no blocking popups', { action });

    for (let attempt = 1; attempt <= this.config.maxPopupDismissRetries; attempt++) {
      const dismissed = await this.interactor.dismissPopups(POPUP_PATTERNS);

      if (dismissed === 0) {
        logger.debug('CartMergeFlow', 'No popups to dismiss', { attempt });
        break;
      }

      logger.info('CartMergeFlow', 'Dismissed popups', {
        dismissed,
        attempt,
        action,
      });

      await this.interactor.waitForTimeout(500);
    }
  }

  /**
   * Sort orders by date (oldest first).
   */
  private sortOrdersByDate(orders: OrderToMerge[]): OrderToMerge[] {
    return [...orders].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateA - dateB;
    });
  }

  /**
   * Verify that the cart actually changed after a reorder.
   */
  private verifyCartChange(
    before: CartState,
    after: CartState,
    mode: 'replace' | 'merge'
  ): { changed: boolean; method: string } {
    // Try count comparison first
    if (before.itemCount !== null && after.itemCount !== null) {
      if (mode === 'replace') {
        // Cart should have items
        return { changed: after.itemCount > 0, method: 'count-replace' };
      } else {
        // Cart should have more items
        return { changed: after.itemCount > before.itemCount, method: 'count-merge' };
      }
    }

    // Fallback to total comparison
    if (before.totalCents !== null && after.totalCents !== null) {
      if (mode === 'replace') {
        return { changed: after.totalCents > 0, method: 'total-replace' };
      } else {
        return { changed: after.totalCents > before.totalCents, method: 'total-merge' };
      }
    }

    // If we have any cart state now, assume success
    if (after.totalCents !== null && after.totalCents > 0) {
      return { changed: true, method: 'total-exists' };
    }

    // Can't verify - assume success if we couldn't detect state
    if (
      before.itemCount === null &&
      after.itemCount === null &&
      before.totalCents === null &&
      after.totalCents === null
    ) {
      return { changed: true, method: 'assumed' };
    }

    return { changed: false, method: 'none' };
  }
}
