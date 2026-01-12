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
import { dismissPopups } from '../../../utils/popup-handler.js';

/**
 * Maximum wait time for cart update after reorder (ms)
 */
const CART_UPDATE_WAIT = 3000;

/**
 * Maximum wait time for modal to appear (ms)
 */
const MODAL_WAIT_TIMEOUT = 5000;

/**
 * Maximum retries for popup dismissal before critical actions
 */
const MAX_POPUP_DISMISS_RETRIES = 3;

/**
 * Get the current cart total value from the header cart indicator.
 * Returns the cart total in cents to avoid floating point issues.
 */
async function getCartTotal(context: ToolContext): Promise<number | null> {
  const cartTotalSelectors = [
    '.auc-cart-value.auc-header-cart-total',
    '.auc-header-cart-total',
    '.auc-cart-value__total .auc-cart-value',
    '.auc-cart-value',
    '[class*="cart"][class*="total"]',
    '[class*="cart"][class*="value"]',
  ];

  for (const selector of cartTotalSelectors) {
    try {
      const element = context.page.locator(selector).first();
      const isVisible = await element.isVisible({ timeout: 2000 }).catch(() => false);

      if (isVisible) {
        const text = await element.textContent();
        if (text) {
          // Parse euro value like "0,93 €" or "162,51 €" to cents
          const cleanText = text.replace(/[^\d,\.]/g, '').replace(',', '.');
          const value = parseFloat(cleanText);
          if (!isNaN(value)) {
            const cents = Math.round(value * 100);
            context.logger.debug('Got cart total', { value, cents, selector, rawText: text });
            return cents;
          }
        }
      }
    } catch {
      // Try next selector
    }
  }

  context.logger.debug('Could not get cart total from any selector');
  return null;
}

/**
 * Get the current cart item count from the header cart indicator.
 * This is used to verify cart changes before/after reorder.
 * Falls back to cart total comparison if count element not found.
 */
async function getCartCount(context: ToolContext): Promise<number | null> {
  const cartCountSelectors = [
    '.auc-header-cart__count',
    '[data-testid="cart-count"]',
    '.cart-counter',
    '.cart-quantity',
    '.badge.cart-badge',
    // Auchan-specific: cart icon with number in badge
    '.auc-header__minicart .auc-badge',
    '.auc-header-actions__cart .auc-badge',
    '.minicart-quantity:not(.d-none)',
    '[class*="cart"] [class*="badge"]',
    '[class*="cart"] [class*="count"]',
    // Try getting count from data attribute
    '[data-cart-count]',
  ];

  for (const selector of cartCountSelectors) {
    try {
      const element = context.page.locator(selector).first();
      const isVisible = await element.isVisible({ timeout: 1500 }).catch(() => false);

      if (isVisible) {
        // First try data attribute
        const dataCount = await element.getAttribute('data-cart-count').catch(() => null);
        if (dataCount) {
          const count = parseInt(dataCount, 10);
          if (!isNaN(count)) {
            context.logger.debug('Got cart count from data attribute', { count, selector });
            return count;
          }
        }

        // Then try text content
        const text = await element.textContent();
        if (text) {
          // Extract just the number from text (handle "1 item" or just "1")
          const match = text.trim().match(/^(\d+)/);
          if (match && match[1]) {
            const count = parseInt(match[1], 10);
            context.logger.debug('Got cart count from text', { count, selector });
            return count;
          }
        }
      }
    } catch {
      // Try next selector
    }
  }

  context.logger.debug('Could not get cart count from any selector');
  return null;
}

/**
 * Ensure no popups are blocking the page before a critical action.
 * Retries multiple times to handle popups that may appear after dismissal.
 */
async function ensureNoBlockingPopups(
  context: ToolContext,
  actionDescription: string
): Promise<void> {
  context.logger.debug('Ensuring no blocking popups', { action: actionDescription });

  for (let attempt = 1; attempt <= MAX_POPUP_DISMISS_RETRIES; attempt++) {
    const dismissed = await dismissPopups(context.page, {
      timeout: 2000,
      verbose: true,
      logger: context.logger,
    });

    if (dismissed === 0) {
      context.logger.debug('No popups to dismiss', { attempt });
      break;
    }

    context.logger.info('Dismissed popups before action', {
      dismissed,
      attempt,
      action: actionDescription,
    });

    // Wait a moment for any additional popups to appear
    await context.page.waitForTimeout(500);
  }
}

/**
 * Reorder Tool
 *
 * Adds all items from a previous order to cart by clicking the reorder button.
 * Handles the confirmation modal that appears asking to replace or merge cart.
 */
export const reorderTool: Tool<ReorderInput, ReorderOutput> = {
  name: 'reorder',
  description: 'Click "Encomendar de novo" button to add all order items to cart',

  async execute(input, context): Promise<ToolResult<ReorderOutput>> {
    const start = Date.now();
    const resolver = createSelectorResolver();
    const screenshots: string[] = [];
    const mergeMode = input.mergeMode ?? 'replace';

    try {
      context.logger.info('Starting reorder', {
        orderId: input.orderId,
        detailUrl: input.detailUrl,
        mergeMode,
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

      // CRITICAL: Dismiss any blocking popups before attempting reorder
      await ensureNoBlockingPopups(context, 'reorder button click');

      // Get cart count and total BEFORE reorder to verify change later
      const cartCountBefore = await getCartCount(context);
      const cartTotalBefore = await getCartTotal(context);
      context.logger.info('Cart state before reorder', { cartCountBefore, cartTotalBefore });

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

      // Verify reorder button is actually clickable (not obscured)
      const isButtonVisible = await reorderButtonResult.element.isVisible();
      const isButtonEnabled = await reorderButtonResult.element.isEnabled();

      if (!isButtonVisible || !isButtonEnabled) {
        context.logger.error('Reorder button not clickable', {
          visible: isButtonVisible,
          enabled: isButtonEnabled,
        });

        // Maybe a popup appeared - try to dismiss it again
        await ensureNoBlockingPopups(context, 'reorder button recovery');
      }

      // Capture screenshot before clicking
      const beforeScreenshot = await context.screenshot(`reorder-before-${input.orderId}`);
      screenshots.push(beforeScreenshot);

      // Click the reorder button with explicit wait and force option
      context.logger.info('Clicking reorder button');
      try {
        await reorderButtonResult.element.click({ timeout: 5000 });
      } catch (clickError) {
        // If click failed, try dismissing popups and retry
        context.logger.warn('First click attempt failed, retrying after popup dismissal', {
          error: clickError instanceof Error ? clickError.message : String(clickError),
        });
        await ensureNoBlockingPopups(context, 'reorder button retry');
        await reorderButtonResult.element.click({ timeout: 5000 });
      }

      // Handle the confirmation modal
      context.logger.debug('Waiting for reorder confirmation modal');
      const modalHandled = await handleReorderModal(context, resolver, mergeMode, screenshots, input.orderId);

      if (!modalHandled) {
        // Modal not found - this is a CRITICAL issue
        // The reorder button should trigger a modal, if it didn't appear
        // then the click likely didn't register
        context.logger.error('Modal not detected - reorder may not have triggered');

        // Take a diagnostic screenshot
        const diagnosticScreenshot = await context.screenshot(`reorder-no-modal-${input.orderId}`);
        screenshots.push(diagnosticScreenshot);

        // Try clicking reorder button again after dismissing any popups
        context.logger.info('Retrying reorder button click');
        await ensureNoBlockingPopups(context, 'reorder retry after modal failure');

        // Find the button again (it may have been re-rendered)
        const retryButtonResult = await resolver.tryResolve(
          context.page,
          'order-detail',
          'reorderButton',
          { timeout: 3000 }
        );

        if (retryButtonResult) {
          await retryButtonResult.element.click({ timeout: 5000 });
          // Try modal handling again
          const retryModalHandled = await handleReorderModal(
            context,
            resolver,
            mergeMode,
            screenshots,
            input.orderId
          );

          if (!retryModalHandled) {
            throw new Error(
              'Reorder modal did not appear after multiple attempts - reorder button click may be blocked'
            );
          }
        }
      }

      // Wait for cart update
      context.logger.debug('Waiting for cart to update', { waitMs: CART_UPDATE_WAIT });
      await context.page.waitForTimeout(CART_UPDATE_WAIT);

      // CRITICAL: Verify cart actually changed using count or total
      const cartCountAfter = await getCartCount(context);
      const cartTotalAfter = await getCartTotal(context);
      context.logger.info('Cart state after reorder', {
        cartCountBefore,
        cartCountAfter,
        cartTotalBefore,
        cartTotalAfter,
      });

      // Determine if cart was successfully modified
      let cartChanged = false;
      let itemsDelta = 0;
      let verificationMethod = 'none';

      // First try using cart count
      if (cartCountBefore !== null && cartCountAfter !== null) {
        itemsDelta = cartCountAfter - cartCountBefore;
        verificationMethod = 'count';

        if (mergeMode === 'replace') {
          // For replace mode, cart should have items (even if count decreased)
          cartChanged = cartCountAfter > 0;
        } else {
          // For merge mode, cart count should have increased
          cartChanged = itemsDelta > 0;
        }

        if (!cartChanged) {
          context.logger.warn('Cart count did not change as expected', {
            cartCountBefore,
            cartCountAfter,
            itemsDelta,
            mergeMode,
          });
        }
      }

      // Fallback to cart total if count verification failed or unavailable
      if (!cartChanged && cartTotalBefore !== null && cartTotalAfter !== null) {
        const totalDelta = cartTotalAfter - cartTotalBefore;
        verificationMethod = 'total';

        if (mergeMode === 'replace') {
          // For replace mode, cart should have value
          cartChanged = cartTotalAfter > 0;
        } else {
          // For merge mode, cart total should have increased
          cartChanged = totalDelta > 0;
        }

        if (cartChanged) {
          context.logger.info('Cart change verified via total comparison', {
            cartTotalBefore,
            cartTotalAfter,
            totalDelta,
            mergeMode,
          });
        }
      }

      // Last fallback: if cart has value and we couldn't get before/after, assume success
      if (!cartChanged && cartTotalAfter !== null && cartTotalAfter > 0) {
        cartChanged = true;
        verificationMethod = 'total-exists';
        context.logger.info('Cart change assumed via non-zero total', { cartTotalAfter });
      }

      if (!cartChanged) {
        context.logger.warn('Could not verify cart change', {
          cartCountBefore,
          cartCountAfter,
          cartTotalBefore,
          cartTotalAfter,
          verificationMethod,
        });
      }

      // Try to detect cart update indicators
      const updatedUrl = context.page.url();
      const redirectedToCart = updatedUrl.includes('/carrinho') || updatedUrl.includes('/cart');

      if (redirectedToCart) {
        context.logger.info('Redirected to cart page after reorder');
        // If redirected to cart, assume success
        cartChanged = true;
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

      // Capture screenshot after reorder
      const afterScreenshot = await context.screenshot(`reorder-after-${input.orderId}`);
      screenshots.push(afterScreenshot);

      // CRITICAL: If cart didn't change and we couldn't detect a redirect, fail loudly
      if (!cartChanged && !redirectedToCart) {
        context.logger.error('REORDER VERIFICATION FAILED: Cart was not modified', {
          orderId: input.orderId,
          cartCountBefore,
          cartCountAfter,
          cartTotalBefore,
          cartTotalAfter,
          mergeMode,
          verificationMethod,
          failedItems,
        });

        const verificationError: import('../../../types/tool.js').ToolError = {
          message: `Reorder did not modify cart (count: ${cartCountBefore}→${cartCountAfter}, total: ${cartTotalBefore}→${cartTotalAfter})`,
          code: 'VALIDATION_ERROR',
          recoverable: true, // Could retry
        };

        return {
          success: false,
          error: verificationError,
          screenshots,
          duration: Date.now() - start,
        };
      }

      // Estimate items added
      const itemsAdded = cartCountAfter ?? itemsDelta;

      // Try to get cart total if visible
      const cartTotal = await estimateCartTotal(context);

      context.logger.info('Reorder completed successfully', {
        orderId: input.orderId,
        cartCountBefore,
        cartCountAfter,
        cartTotalBefore,
        cartTotalAfter,
        itemsAdded,
        failedItemsCount: failedItems.length,
        cartTotal,
        cartChanged,
        verificationMethod,
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
 * Handle the reorder confirmation modal.
 *
 * After clicking the reorder button, a modal appears asking whether to:
 * - Replace cart contents (click 'Encomendar de novo' in modal)
 * - Merge with existing cart (click 'Juntar' button)
 *
 * @param context - Tool context
 * @param resolver - Selector resolver
 * @param mergeMode - 'replace' to click confirm reorder, 'merge' to click merge
 * @param screenshots - Array to append screenshots to
 * @param orderId - Order ID for screenshot naming
 * @returns Whether the modal was successfully handled
 */
async function handleReorderModal(
  context: ToolContext,
  resolver: ReturnType<typeof createSelectorResolver>,
  mergeMode: 'replace' | 'merge',
  screenshots: string[],
  orderId: string
): Promise<boolean> {
  try {
    // Wait for modal to appear
    context.logger.debug('Waiting for modal to appear', { timeout: MODAL_WAIT_TIMEOUT });

    // Try to find the modal using multiple strategies
    const modalSelectors = [
      '.auc-modal[data-visible="true"]',
      '.modal.show',
      '[role="dialog"][aria-modal="true"]',
      '.auc-modal--visible',
      '.auc-modal:visible',
      '[class*="modal"]:visible',
    ];

    let modalFound = false;
    for (const selector of modalSelectors) {
      try {
        await context.page.waitForSelector(selector, { timeout: MODAL_WAIT_TIMEOUT, state: 'visible' });
        modalFound = true;
        context.logger.debug('Modal found with selector', { selector });
        break;
      } catch {
        // Try next selector
      }
    }

    if (!modalFound) {
      context.logger.warn('Modal not found with any selector, trying generic approach');
      // Give it a moment and check if any dialog appeared
      await context.page.waitForTimeout(1000);
    }

    // Capture screenshot of modal
    const modalScreenshot = await context.screenshot(`reorder-modal-${orderId}`);
    screenshots.push(modalScreenshot);

    // CRITICAL: Dismiss any subscription/promotional popups that might overlay the modal
    await ensureNoBlockingPopups(context, 'modal button click');

    // Click the appropriate button based on merge mode
    if (mergeMode === 'merge') {
      // Click merge button ('Juntar')
      context.logger.info('Clicking merge button in modal');
      const mergeButtonResult = await resolver.tryResolve(
        context.page,
        'order-detail',
        'reorderModalMergeButton',
        { timeout: 3000 }
      );

      if (mergeButtonResult) {
        await mergeButtonResult.element.click();
        context.logger.info('Merge button clicked');
        return true;
      }

      // Fallback: try multiple selectors for the merge button
      // The modal says "Neste momento tem produtos no seu carrinho" with buttons "Eliminar" and "Juntar"
      const mergeButtonSelectors = [
        'button:has-text("Juntar")',
        '.modal button:has-text("Juntar")',
        '[role="dialog"] button:has-text("Juntar")',
        // Green button (primary action to merge)
        '.modal .btn-success:has-text("Juntar")',
        '.modal button.auc-btn--primary:has-text("Juntar")',
        // Any button with "Juntar" exact text
        'button >> text="Juntar"',
      ];

      for (const selector of mergeButtonSelectors) {
        try {
          const btn = context.page.locator(selector).first();
          if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
            await btn.click();
            context.logger.info('Merge button clicked (fallback)', { selector });
            return true;
          }
        } catch {
          // Try next selector
        }
      }

      context.logger.warn('Merge button not found, trying confirm button instead');
    }

    // Click confirm reorder button ('Encomendar de novo')
    context.logger.info('Clicking confirm reorder button in modal');
    const confirmButtonResult = await resolver.tryResolve(
      context.page,
      'order-detail',
      'reorderModalConfirmButton',
      { timeout: 3000 }
    );

    if (confirmButtonResult) {
      await confirmButtonResult.element.click();
      context.logger.info('Confirm reorder button clicked');
      return true;
    }

    // CRITICAL: Check if we're on the cart removal modal - if so, click Cancel NOT Confirm
    // The cart removal modal says "Remover produtos do carrinho" and clicking "Confirmar" would DELETE the cart
    const cartRemovalModalText = await context.page.locator('text="Remover produtos do carrinho"').count();
    if (cartRemovalModalText > 0) {
      context.logger.warn('Cart removal modal detected - clicking Cancel to preserve cart');
      const cancelButton = context.page.locator('button:has-text("Cancelar")').first();
      if (await cancelButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await cancelButton.click();
        context.logger.info('Cart removal modal dismissed via Cancel');
        // Return false to indicate we need to retry the reorder
        return false;
      }
    }

    // Fallback: try direct text searches
    // CRITICAL: DO NOT include "Confirmar" here as it might be the cart removal confirmation!
    const confirmButtonSelectors = [
      'button:has-text("Encomendar de novo")',
      // Skip "Confirmar" - too dangerous, could trigger cart removal
      '.modal button.btn-primary:has-text("Encomendar")',
      // Skip generic selectors that might match wrong buttons
    ];

    for (const selector of confirmButtonSelectors) {
      try {
        const btn = context.page.locator(selector).first();
        if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await btn.click();
          context.logger.info('Confirm button clicked (fallback)', { selector });
          return true;
        }
      } catch {
        // Try next selector
      }
    }

    context.logger.warn('Could not find any modal button to click');
    return false;
  } catch (err) {
    context.logger.warn('Error handling modal', {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

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
