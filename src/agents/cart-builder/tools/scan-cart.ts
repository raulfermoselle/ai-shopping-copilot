/**
 * Scan Cart Tool
 *
 * Extracts current cart state from Auchan.pt cart page:
 * - Detects empty cart state
 * - Extracts all cart items with name, quantity, price, availability
 * - Captures cart totals (subtotal, delivery, total)
 * - Returns CartSnapshot for diff analysis
 *
 * Uses Selector Registry for resilient element selection.
 * NOTE: Many cart item selectors are NOT YET VERIFIED - based on Auchan patterns.
 */

import type { Tool, ToolResult, ToolError } from '../../../types/tool.js';
import type { ScanCartInput, ScanCartOutput } from './types.js';
import type { CartSnapshot, CartItem } from '../types.js';
import { createSelectorResolver } from '../../../selectors/resolver.js';
import { dismissPopups } from '../../../utils/popup-handler.js';

/**
 * Default cart URL
 */
const CART_URL = 'https://www.auchan.pt/pt/carrinho-compras';

/**
 * Parse currency from Auchan format "1,39 €" → 1.39
 */
function parseCurrency(text: string): number {
  // Remove whitespace, replace comma with dot, remove € symbol
  const cleaned = text.replace(/\s/g, '').replace('€', '').replace(',', '.');
  const value = parseFloat(cleaned);
  return isNaN(value) ? 0 : value;
}

/**
 * Extract product ID from Auchan product URL
 * URL format: https://www.auchan.pt/pt/produtos/ID or similar
 */
function extractProductId(url: string): string | undefined {
  const match = url.match(/\/produtos\/([a-zA-Z0-9-]+)/);
  return match?.[1];
}

/**
 * Parse quantity from input value or text
 */
function parseQuantity(value: string | null): number {
  if (!value) return 1;
  const qty = parseInt(value.trim(), 10);
  return isNaN(qty) || qty < 1 ? 1 : qty;
}

/**
 * Scan Cart Tool
 *
 * Extracts current cart state as a CartSnapshot.
 */
export const scanCartTool: Tool<ScanCartInput, ScanCartOutput> = {
  name: 'scanCart',
  description: 'Extract current cart contents and state from Auchan.pt cart page',

  async execute(input, context): Promise<ToolResult<ScanCartOutput>> {
    const start = Date.now();
    const resolver = createSelectorResolver();
    const screenshots: string[] = [];

    try {
      context.logger.info('Starting cart scan', {
        expandAll: input.expandAll,
        captureScreenshot: input.captureScreenshot,
      });

      // Step 1: Navigate to cart if not already there
      const currentUrl = context.page.url();
      if (!currentUrl.includes('carrinho-compras') && !currentUrl.includes('/cart')) {
        context.logger.debug('Navigating to cart page', { url: CART_URL });
        await context.page.goto(CART_URL, {
          timeout: context.config.navigationTimeout,
          waitUntil: 'domcontentloaded',
        });
        await context.page.waitForTimeout(2000);
      } else {
        context.logger.debug('Already on cart page');
      }

      // CRITICAL: Aggressively dismiss ALL blocking popups
      // Cart page often has multiple popups overlapping (subscription + cart removal confirmation)
      context.logger.info('Dismissing all blocking popups on cart page');
      let totalDismissed = 0;

      // Run popup dismissal up to 3 times to handle cascading popups
      for (let attempt = 1; attempt <= 3; attempt++) {
        const dismissed = await dismissPopups(context.page, {
          timeout: 2000,
          verbose: true,
          logger: context.logger,
        });
        totalDismissed += dismissed;

        if (dismissed === 0) {
          context.logger.debug('No more popups found', { attempt, totalDismissed });
          break;
        }

        context.logger.info(`Dismissed ${dismissed} popup(s) on attempt ${attempt}`, {
          attempt,
          totalDismissed,
        });

        // Wait for any new popups to appear after dismissing previous ones
        await context.page.waitForTimeout(1000);
      }

      if (totalDismissed > 0) {
        context.logger.info(`Total popups dismissed on cart page: ${totalDismissed}`);
      }

      const finalUrl = context.page.url();
      context.logger.debug('Cart page loaded', { url: finalUrl });

      // Step 2: Check if cart is empty
      const emptyIndicatorResult = await resolver.tryResolve(
        context.page,
        'cart',
        'emptyCartIndicator',
        { timeout: 3000 }
      );

      if (emptyIndicatorResult) {
        context.logger.info('Cart is empty');

        // Capture screenshot if requested
        let screenshotPath: string | undefined;
        if (input.captureScreenshot) {
          screenshotPath = await context.screenshot('cart-empty');
          screenshots.push(screenshotPath);
        }

        const emptySnapshot: CartSnapshot = {
          timestamp: new Date(),
          items: [],
          itemCount: 0,
          totalPrice: 0,
        };

        const outputData: ScanCartOutput = {
          snapshot: emptySnapshot,
          isEmpty: true,
          cartUrl: finalUrl,
        };

        if (screenshotPath) {
          outputData.screenshot = screenshotPath;
        }

        return {
          success: true,
          data: outputData,
          screenshots,
          duration: Date.now() - start,
        };
      }

      context.logger.debug('Cart has items, extracting...');

      // Step 3: Expand all items if requested
      if (input.expandAll) {
        context.logger.debug('Checking for expandable sections');
        // Look for common "show more" buttons
        const expandButtons = await context.page.locator('button:has-text("Ver todos"), button:has-text("Mostrar")').all();
        for (const button of expandButtons) {
          const isVisible = await button.isVisible().catch(() => false);
          if (isVisible) {
            context.logger.debug('Clicking expand button');
            await button.click();
            await context.page.waitForTimeout(1000);
          }
        }
      }

      // Step 4: Extract cart items
      const items: CartItem[] = [];

      // CRITICAL: Scope cart items to ONLY items inside cart list container
      // Do NOT match product recommendations at bottom of page
      // Strategy: Find the cart container FIRST, then get items within it
      // This prevents matching the 574 product recommendations that share similar classes

      // Try to find the main cart container using multiple strategies
      const cartContainerSelectors = [
        '.auc-cart__list',
        '.auc-cart-list',
        '[data-testid="cart-items"]',
        '.cart-items-container',
        'main .cart-list',
        // Fallback: get the first section that has cart products
        'section:has(.auc-cart__product)',
      ];

      let cartContainer = null;
      for (const containerSelector of cartContainerSelectors) {
        const container = context.page.locator(containerSelector).first();
        const exists = await container.count().catch(() => 0);
        if (exists > 0) {
          cartContainer = container;
          context.logger.debug('Found cart container', { selector: containerSelector });
          break;
        }
      }

      if (!cartContainer) {
        context.logger.warn('Cart container not found, using fallback document-wide selector');
        cartContainer = context.page.locator('body');
      }

      // Now find items WITHIN the cart container
      // Use the Auchan-specific product class
      const itemElements = await cartContainer.locator('.auc-cart__product').all();

      context.logger.info('Found cart items', { count: itemElements.length });

      for (let i = 0; i < itemElements.length; i++) {
        const itemElement = itemElements[i];
        if (!itemElement) continue;

        try {
          // Extract product name
          const nameElement = await itemElement.locator(
            resolver.buildCompositeSelector('cart', 'productName') || '.auc-cart__product-name, .product-name'
          ).first();
          const name = (await nameElement.textContent())?.trim() || `Unknown Product ${i + 1}`;

          // Extract product URL
          let productUrl: string | undefined;
          try {
            const linkElement = await itemElement.locator(
              resolver.buildCompositeSelector('cart', 'productLink') || 'a[href*="/produtos/"]'
            ).first();
            productUrl = (await linkElement.getAttribute('href')) || undefined;
          } catch {
            productUrl = undefined;
          }
          const fullProductUrl = productUrl && !productUrl.startsWith('http')
            ? `https://www.auchan.pt${productUrl}`
            : productUrl;
          const productId = fullProductUrl ? extractProductId(fullProductUrl) : undefined;

          // Extract quantity
          let quantityValue: string | null = null;
          try {
            const quantityInput = await itemElement.locator(
              resolver.buildCompositeSelector('cart', 'productQuantityInput') || 'input[type="number"]'
            ).first();
            quantityValue = await quantityInput.getAttribute('value');
          } catch {
            quantityValue = null;
          }
          const quantity = parseQuantity(quantityValue);

          // Extract unit price
          let priceText: string | null = null;
          try {
            const priceElement = await itemElement.locator(
              resolver.buildCompositeSelector('cart', 'productUnitPrice') || '.auc-cart__product-price, .product-price'
            ).first();
            priceText = await priceElement.textContent();
          } catch {
            priceText = null;
          }
          const unitPrice = priceText ? parseCurrency(priceText) : 0;

          // Check availability
          let available = true;
          try {
            const unavailableElement = await itemElement.locator(
              resolver.buildCompositeSelector('cart', 'productUnavailableIndicator') || '.unavailable, .out-of-stock'
            ).first();
            available = !(await unavailableElement.isVisible().catch(() => false));
          } catch {
            available = true;
          }

          // Extract availability note if unavailable
          let availabilityNote: string | undefined;
          if (!available) {
            try {
              const availabilityElement = await itemElement.locator(
                resolver.buildCompositeSelector('cart', 'productAvailability') || '.product-availability, .availability'
              ).first();
              availabilityNote = (await availabilityElement.textContent())?.trim();
            } catch {
              availabilityNote = undefined;
            }
          }

          const cartItem: CartItem = {
            productId,
            name,
            productUrl: fullProductUrl,
            quantity,
            unitPrice,
            available,
            availabilityNote,
          };

          items.push(cartItem);
          context.logger.debug('Extracted cart item', {
            name,
            quantity,
            unitPrice,
            available,
          });
        } catch (err) {
          context.logger.warn('Failed to extract cart item', {
            index: i,
            error: err instanceof Error ? err.message : String(err),
          });
          // Continue with other items
        }
      }

      // Step 5: Extract cart totals
      let totalPrice = 0;

      // Try to get cart total
      try {
        const totalElement = await context.page.locator(
          resolver.buildCompositeSelector('cart', 'cartTotal') || '.auc-cart__total, .cart-total'
        ).first();
        const totalText = await totalElement.textContent();
        if (totalText) {
          totalPrice = parseCurrency(totalText);
          context.logger.debug('Extracted cart total from page', { total: totalPrice });
        }
      } catch {
        // Total element not found, will calculate from items
      }

      // Fallback: calculate from items if total not found
      if (totalPrice === 0 && items.length > 0) {
        totalPrice = items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
        context.logger.debug('Calculated cart total from items', { total: totalPrice });
      }

      // Step 6: Build snapshot
      const snapshot: CartSnapshot = {
        timestamp: new Date(),
        items,
        itemCount: items.length,
        totalPrice,
      };

      // Step 7: Capture screenshot if requested
      let screenshotPath: string | undefined;
      if (input.captureScreenshot) {
        screenshotPath = await context.screenshot('cart-scan');
        screenshots.push(screenshotPath);
      }

      context.logger.info('Cart scan completed', {
        itemCount: items.length,
        totalPrice,
        unavailableItems: items.filter(i => !i.available).length,
      });

      const finalOutputData: ScanCartOutput = {
        snapshot,
        isEmpty: items.length === 0,
        cartUrl: finalUrl,
      };

      if (screenshotPath) {
        finalOutputData.screenshot = screenshotPath;
      }

      return {
        success: true,
        data: finalOutputData,
        screenshots,
        duration: Date.now() - start,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      context.logger.error('Cart scan failed', { error: errorMessage });

      // Capture error screenshot
      try {
        const screenshot = await context.screenshot('cart-scan-error');
        screenshots.push(screenshot);
      } catch {
        // Screenshot failed, continue
      }

      const toolError: ToolError = {
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
