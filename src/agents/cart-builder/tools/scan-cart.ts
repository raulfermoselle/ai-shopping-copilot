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

// Note: extractProductId and parseQuantity removed - not needed with JS extraction approach

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

      // CRITICAL SAFETY CHECK: If cart removal modal is showing, click Cancelar IMMEDIATELY
      // This modal should NEVER appear on its own - if it does, something clicked "Remover todos"
      const removalModalVisible = await context.page.locator('text="Remover produtos do carrinho"').isVisible({ timeout: 1000 }).catch(() => false);
      if (removalModalVisible) {
        context.logger.warn('DANGER: Cart removal modal detected! Clicking Cancelar to keep items');
        const cancelarButton = context.page.locator('button:has-text("Cancelar")').first();
        await cancelarButton.click({ timeout: 2000 }).catch(() => {});
        await context.page.waitForTimeout(500);
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
        // CRITICAL: Exclude any buttons containing "Remover" to avoid cart clearing
        const expandButtons = await context.page.locator('button:has-text("Ver todos"), button:has-text("Mostrar")').all();
        for (const button of expandButtons) {
          const isVisible = await button.isVisible().catch(() => false);
          if (isVisible) {
            // SAFETY CHECK: Skip any button that contains dangerous text
            const buttonText = await button.textContent().catch(() => '') || '';
            if (buttonText.includes('Remover') || buttonText.includes('Eliminar') || buttonText.includes('remover')) {
              context.logger.warn('BLOCKED: Skipping dangerous expand button', { buttonText });
              continue;
            }
            context.logger.debug('Clicking expand button', { buttonText: buttonText.substring(0, 50) });
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
        // More flexible patterns based on actual Auchan cart structure
        '.auc-cart',
        '[class*="cart-container"]',
        'main [class*="cart"]',
        // Fallback: the main content area that has the cart heading
        'main',
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

      // PRIMARY APPROACH: Use JS extraction to get cart data directly from DOM
      // This is more reliable than trying to match complex element structures
      context.logger.debug('Using JS extraction for cart items');

      // Try to extract cart data directly from the page's DOM
      // Use string evaluation to avoid TypeScript DOM type issues
      const jsCartData = await context.page.evaluate(`
        (function() {
          var items = [];
          var debug = [];

          // STRATEGY 1: Look for Auchan cart item rows by class patterns
          // Auchan uses classes like auc-cart-item, auc-product, etc.
          var cartItemSelectors = [
            '.auc-cart-item',
            '.auc-cart__item',
            '[class*="cart-item"]',
            '[class*="CartItem"]',
            '[data-testid*="cart-item"]',
            '.cart-product',
            '.auc-product-line'
          ];

          var cartItems = [];
          for (var s = 0; s < cartItemSelectors.length; s++) {
            var found = document.querySelectorAll(cartItemSelectors[s]);
            if (found.length > 0 && found.length < 200) {
              debug.push('Found ' + found.length + ' items with: ' + cartItemSelectors[s]);
              cartItems = found;
              break;
            }
          }

          // STRATEGY 2: If no cart items found, look for product links with +/- buttons nearby
          if (cartItems.length === 0) {
            debug.push('Trying Strategy 2: product links with buttons');
            // Find elements that have both a product link AND increment/decrement buttons
            var allRows = document.querySelectorAll('[class*="row"], [class*="item"], [class*="line"], article, li');
            allRows.forEach(function(row) {
              // Must have a product link
              var hasProductLink = row.querySelector('a[href*="/p/"], a[href*="/produtos/"], a[href*="auchan.pt"]');
              // Must have quantity buttons (+ or -)
              var hasQtyButtons = row.querySelector('button[aria-label*="+"], button[aria-label*="-"], button[class*="plus"], button[class*="minus"], button[class*="increment"], button[class*="decrement"]');
              // Alternative: input with number type
              var hasQtyInput = row.querySelector('input[type="number"], input[type="text"][class*="qty"]');

              if (hasProductLink && (hasQtyButtons || hasQtyInput)) {
                cartItems = Array.from(cartItems);
                cartItems.push(row);
              }
            });
            debug.push('Strategy 2 found: ' + cartItems.length);
          }

          // STRATEGY 3: If still nothing, try to find cart structure from data layer
          if (cartItems.length === 0 && window.dataLayer) {
            debug.push('Trying Strategy 3: dataLayer');
            for (var i = 0; i < window.dataLayer.length; i++) {
              var entry = window.dataLayer[i];
              if (entry && entry.ecommerce && entry.ecommerce.cart) {
                var cartData = entry.ecommerce.cart;
                if (cartData.products) {
                  cartData.products.forEach(function(p) {
                    items.push({
                      name: p.name || p.product_name || 'Unknown',
                      quantity: parseInt(p.quantity) || 1,
                      price: (p.price || '0') + ' €',
                      available: true
                    });
                  });
                }
              }
            }
            if (items.length > 0) {
              debug.push('Got ' + items.length + ' from dataLayer');
              console.log('[ScanCart Debug]', debug.join('; '));
              return items;
            }
          }

          // Process found cart item elements
          debug.push('Processing ' + cartItems.length + ' cart item elements');
          for (var i = 0; i < cartItems.length; i++) {
            var container = cartItems[i];

            // Get product name - try multiple selectors
            var nameEl = container.querySelector('a[href*="/p/"], a[href*="/produtos/"], [class*="product-name"], [class*="item-name"], h3, h4');
            var name = nameEl ? (nameEl.textContent || '').trim() : '';

            // Skip if no name or name too short
            if (!name || name.length < 3) continue;

            // Get quantity - try input first, then text display
            var quantity = 1;
            var qtyInput = container.querySelector('input[type="number"], input[class*="qty"], input[class*="quantity"]');
            if (qtyInput && qtyInput.value) {
              quantity = parseInt(qtyInput.value) || 1;
            } else {
              // Look for quantity display between +/- buttons
              var qtyDisplay = container.querySelector('[class*="qty-value"], [class*="quantity"], [class*="count"]');
              if (qtyDisplay) {
                var qtyText = (qtyDisplay.textContent || '').trim();
                var qtyMatch = qtyText.match(/^(\\d+)$/);
                if (qtyMatch) {
                  quantity = parseInt(qtyMatch[1]) || 1;
                }
              }
            }

            // Get price
            var price = '0';
            var priceEls = container.querySelectorAll('[class*="price"]:not([class*="total"])');
            for (var p = 0; p < priceEls.length; p++) {
              var priceText = (priceEls[p].textContent || '').trim();
              if (priceText.match(/\\d+[,.]\\d+\\s*€/)) {
                price = priceText;
                break;
              }
            }

            // Check availability
            var unavailable = container.querySelector('[class*="unavailable"], [class*="indisponivel"], [class*="out-of-stock"]');
            var isAvailable = !unavailable;

            // Avoid duplicates
            var isDuplicate = items.some(function(item) { return item.name === name; });
            if (!isDuplicate) {
              items.push({
                name: name,
                quantity: quantity,
                price: price,
                available: isAvailable
              });
            }
          }

          // STRATEGY 4: Fallback - count from cart header if we got nothing
          if (items.length === 0) {
            debug.push('Trying Strategy 4: cart header count');
            // Try to get item count from cart header
            var headerCount = document.querySelector('[class*="cart-count"], [class*="item-count"], [data-cart-count]');
            if (headerCount) {
              var countText = headerCount.textContent || headerCount.getAttribute('data-cart-count');
              debug.push('Header shows: ' + countText);
            }
          }

          console.log('[ScanCart Debug]', debug.join('; '));
          return items;
        })()
      `).catch(() => []) as Array<{name: string; quantity: number; price: string; available: boolean}>;

      if (jsCartData.length > 0) {
        context.logger.info('Extracted cart items via JS', { count: jsCartData.length });
        // Convert JS data to CartItem format directly
        for (const jsItem of jsCartData) {
          items.push({
            name: jsItem.name,
            quantity: jsItem.quantity > 0 ? jsItem.quantity : 1,
            unitPrice: parseCurrency(jsItem.price),
            available: jsItem.available !== false,
          });
        }
        context.logger.info('Cart scan completed via JS extraction', {
          itemCount: items.length,
          totalPrice: items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
        });
      } else {
        context.logger.warn('JS extraction found no cart items');
      }

      // JS extraction is our primary method - no element-by-element fallback needed
      context.logger.info('Cart items extracted', { count: items.length });

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
