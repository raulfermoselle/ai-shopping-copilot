/**
 * Reorder Tool
 *
 * Clicks the "Encomendar de novo" (Order Again) button on an order detail page
 * to add all items from a previous order to the current cart.
 *
 * Handles:
 * - Navigation to order detail page (if URL provided)
 * - Button detection and clicking
 * - Wait for cart update
 * - Error detection (unavailable items, timeout)
 *
 * Uses Selector Registry for resilient element selection.
 */

import type { Tool, ToolResult, ToolContext } from '../../../types/tool.js';
import type { ReorderInput, ReorderOutput } from './types.js';
import { createSelectorResolver } from '../../../selectors/resolver.js';

/**
 * Maximum wait time for cart update after reorder (ms)
 */
const CART_UPDATE_WAIT = 3000;

/**
 * Reorder Tool
 *
 * Adds all items from a previous order to cart by clicking the reorder button.
 */
export const reorderTool: Tool<ReorderInput, ReorderOutput> = {
  name: 'reorder',
  description: 'Click "Encomendar de novo" button to add all order items to cart',

  async execute(input, context): Promise<ToolResult<ReorderOutput>> {
    const start = Date.now();
    const resolver = createSelectorResolver();
    const screenshots: string[] = [];

    try {
      context.logger.info('Starting reorder', {
        orderId: input.orderId,
        detailUrl: input.detailUrl,
      });

      // Navigate to order detail page if needed
      const currentUrl = context.page.url();
      if (!currentUrl.includes(input.orderId)) {
        context.logger.debug('Navigating to order detail page', { url: input.detailUrl });
        await context.page.goto(input.detailUrl, {
          timeout: context.config.navigationTimeout,
          waitUntil: 'domcontentloaded',
        });

        // Wait for page to be ready
        const orderHeaderResult = await resolver.tryResolve(
          context.page,
          'order-detail',
          'orderHeader',
          { timeout: 10000 }
        );

        if (!orderHeaderResult) {
          throw new Error('Order detail page did not load - order header not found');
        }
      } else {
        context.logger.debug('Already on order detail page');
      }

      // Find reorder button
      context.logger.debug('Looking for reorder button');
      const reorderButtonResult = await resolver.tryResolve(
        context.page,
        'order-detail',
        'reorderButton',
        { timeout: 5000 }
      );

      if (!reorderButtonResult) {
        // Capture screenshot before failing
        const screenshot = await context.screenshot(`reorder-button-not-found-${input.orderId}`);
        screenshots.push(screenshot);

        throw new Error('Reorder button not found on page');
      }

      if (reorderButtonResult.usedFallback) {
        context.logger.warn('Used fallback selector for reorder button', {
          fallbackIndex: reorderButtonResult.fallbackIndex,
        });
      }

      // Capture screenshot before clicking
      const beforeScreenshot = await context.screenshot(`reorder-before-${input.orderId}`);
      screenshots.push(beforeScreenshot);

      // Click the reorder button
      context.logger.info('Clicking reorder button');
      await reorderButtonResult.element.click();

      // Wait for cart update
      context.logger.debug('Waiting for cart to update', { waitMs: CART_UPDATE_WAIT });
      await context.page.waitForTimeout(CART_UPDATE_WAIT);

      // Try to detect cart update indicators
      // This could be:
      // 1. Cart counter update
      // 2. Toast notification
      // 3. Page redirect to cart
      // 4. Loading spinner disappearing
      const updatedUrl = context.page.url();
      const redirectedToCart = updatedUrl.includes('/carrinho') || updatedUrl.includes('/cart');

      if (redirectedToCart) {
        context.logger.info('Redirected to cart page after reorder');
      }

      // Try to detect any error messages or unavailable item notifications
      const errorMessages = await detectErrorMessages(context);
      const failedItems = errorMessages.length > 0 ? errorMessages : [];

      if (failedItems.length > 0) {
        context.logger.warn('Some items may have failed to add', {
          failedItemsCount: failedItems.length,
          messages: failedItems,
        });
      }

      // Try to get cart item count from cart indicator if visible
      const itemsAdded = await estimateItemsAdded(context);

      // Try to get cart total if visible
      const cartTotal = await estimateCartTotal(context);

      // Capture screenshot after reorder
      const afterScreenshot = await context.screenshot(`reorder-after-${input.orderId}`);
      screenshots.push(afterScreenshot);

      context.logger.info('Reorder completed', {
        orderId: input.orderId,
        itemsAdded,
        failedItemsCount: failedItems.length,
        cartTotal,
      });

      return {
        success: true,
        data: {
          success: true,
          itemsAdded,
          failedItems,
          cartTotal,
          screenshot: afterScreenshot,
        },
        screenshots,
        duration: Date.now() - start,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      context.logger.error('Reorder failed', { error: errorMessage });

      // Capture error screenshot
      try {
        const screenshot = await context.screenshot(`reorder-error-${input.orderId}`);
        screenshots.push(screenshot);
      } catch {
        // Screenshot failed, continue
      }

      const toolError: import('../../../types/tool.js').ToolError = {
        message: errorMessage,
        code: errorMessage.includes('timeout') ? 'TIMEOUT_ERROR' : 'SELECTOR_ERROR',
        recoverable: errorMessage.includes('timeout'),
      };

      if (err instanceof Error) {
        toolError.cause = err;
      }

      return {
        success: false,
        error: toolError,
        screenshots,
        duration: Date.now() - start,
      };
    }
  },
};

/**
 * Detect error messages on the page after reorder attempt
 */
async function detectErrorMessages(context: ToolContext): Promise<string[]> {
  const errorMessages: string[] = [];

  // Common error selectors
  const errorSelectors = [
    '.error-message',
    '.alert-danger',
    '.toast-error',
    '[role="alert"]',
    '.notification-error',
    '.auc-notification--error',
  ];

  for (const selector of errorSelectors) {
    try {
      const elements = await context.page.locator(selector).all();
      for (const element of elements) {
        const isVisible = await element.isVisible().catch(() => false);
        if (isVisible) {
          const text = await element.textContent();
          if (text?.trim()) {
            errorMessages.push(text.trim());
          }
        }
      }
    } catch {
      // Selector not found, continue
    }
  }

  return errorMessages;
}

/**
 * Try to estimate how many items were added based on cart indicator
 */
async function estimateItemsAdded(context: ToolContext): Promise<number> {
  // Try common cart counter selectors
  const cartCounterSelectors = [
    '.cart-counter',
    '.cart-quantity',
    '.auc-header-cart__count',
    '[data-testid="cart-count"]',
    '.badge.cart-badge',
  ];

  for (const selector of cartCounterSelectors) {
    try {
      const element = context.page.locator(selector).first();
      const isVisible = await element.isVisible({ timeout: 1000 }).catch(() => false);

      if (isVisible) {
        const text = await element.textContent();
        if (text) {
          const count = parseInt(text.trim(), 10);
          if (!isNaN(count)) {
            context.logger.debug('Detected cart item count', { count, selector });
            return count;
          }
        }
      }
    } catch {
      // Try next selector
    }
  }

  // Could not detect count
  return 0;
}

/**
 * Try to estimate cart total price if visible
 */
async function estimateCartTotal(context: ToolContext): Promise<number> {
  // Try common cart total selectors
  const cartTotalSelectors = [
    '.cart-total',
    '.cart-price',
    '.auc-header-cart__total',
    '[data-testid="cart-total"]',
    '.cart-summary-total',
  ];

  for (const selector of cartTotalSelectors) {
    try {
      const element = context.page.locator(selector).first();
      const isVisible = await element.isVisible({ timeout: 1000 }).catch(() => false);

      if (isVisible) {
        const text = await element.textContent();
        if (text) {
          // Parse currency "1,39 €" → 1.39
          const cleaned = text.replace(/\s/g, '').replace('€', '').replace(',', '.');
          const price = parseFloat(cleaned);
          if (!isNaN(price)) {
            context.logger.debug('Detected cart total', { total: price, selector });
            return price;
          }
        }
      }
    } catch {
      // Try next selector
    }
  }

  // Could not detect total
  return 0;
}
