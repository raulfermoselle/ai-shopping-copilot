/**
 * Add To Cart Tool
 *
 * Adds a product to the Auchan.pt shopping cart:
 * - Searches for product by name or navigates by product ID
 * - Finds the add-to-cart button on the product tile
 * - Clicks to add product to cart
 * - Handles products sold by weight (requires quantity input)
 *
 * This tool MODIFIES cart state. Use with caution.
 * SAFETY: This tool only adds items - it NEVER places orders.
 */

import type { Tool, ToolResult, ToolError } from '../../../types/tool.js';
import { z } from 'zod';
import { dismissSubscriptionPopup } from '../../../utils/popup-handler.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Input schema for AddToCartTool
 */
export const AddToCartInputSchema = z.object({
  /** Product ID (data-pid from Auchan) */
  productId: z.string().optional(),
  /** Product name for searching */
  productName: z.string(),
  /** Quantity to add (default: 1) */
  quantity: z.number().int().positive().default(1),
  /** For products sold by weight: weight in grams */
  weightGrams: z.number().positive().optional(),
  /** Whether to search for product if not found by ID */
  searchIfNotFound: z.boolean().default(true),
  /** Timeout in ms */
  timeout: z.number().int().positive().default(30000),
});

export type AddToCartInput = z.input<typeof AddToCartInputSchema>;

/**
 * Output from AddToCartTool
 */
export interface AddToCartOutput {
  /** Whether product was added to cart */
  added: boolean;
  /** Product ID that was added */
  productId?: string;
  /** Product name */
  productName: string;
  /** Quantity added */
  quantityAdded: number;
  /** Reason for failure if not added */
  failureReason?: string;
  /** Whether product requires weight input */
  requiresWeight?: boolean;
  /** Screenshot after action */
  screenshot?: string;
}

export type AddToCartResult = ToolResult<AddToCartOutput>;

// =============================================================================
// Constants
// =============================================================================

const SEARCH_URL_TEMPLATE = 'https://www.auchan.pt/pt/pesquisa?q=';

// =============================================================================
// Tool Implementation
// =============================================================================

/**
 * Add To Cart Tool
 *
 * Adds a product to the Auchan shopping cart from search results.
 */
export const addToCartTool: Tool<AddToCartInput, AddToCartOutput> = {
  name: 'addToCart',
  description: 'Add a product to the Auchan.pt shopping cart',

  async execute(input, context): Promise<ToolResult<AddToCartOutput>> {
    const start = Date.now();
    const screenshots: string[] = [];

    try {
      context.logger.info('Adding product to cart', {
        productId: input.productId,
        productName: input.productName,
        quantity: input.quantity,
      });

      // Build search query from product name (first 4 words)
      const searchQuery = input.productName.split(' ').slice(0, 4).join(' ');
      const searchUrl = `${SEARCH_URL_TEMPLATE}${encodeURIComponent(searchQuery)}`;

      // Navigate to search page
      context.logger.debug('Navigating to search page', { url: searchUrl });
      await context.page.goto(searchUrl, {
        timeout: input.timeout || context.config.navigationTimeout,
        waitUntil: 'domcontentloaded',
      });

      // Wait for content to load
      await context.page.waitForTimeout(2000);

      // Dismiss any popups
      await dismissSubscriptionPopup(context.page, { logger: context.logger });

      // Wait for product grid
      try {
        await context.page.waitForSelector('.product-grid, .product-tile[data-pid]', {
          timeout: 10000,
          state: 'visible',
        });
      } catch {
        context.logger.warn('Product grid not found');
      }

      await context.page.waitForTimeout(1000);

      // Use JavaScript to find product and click add-to-cart
      // Using string template to run in browser context (avoids TypeScript DOM type errors)
      const productId = input.productId || '';
      const productName = input.productName;
      const quantity = input.quantity ?? 1;

      const result = await context.page.evaluate(`
        (function() {
          var productId = ${JSON.stringify(productId)};
          var productName = ${JSON.stringify(productName)};
          var quantity = ${quantity};

          // Helper to find product tile
          function findProductTile() {
            // Try by product ID first
            if (productId) {
              var tile = document.querySelector('.product-tile[data-pid="' + productId + '"]');
              if (tile) return tile;
            }

            // Fallback: find by name match
            var tiles = document.querySelectorAll('.product-tile[data-pid]');
            var searchTerms = productName.toLowerCase().split(' ').slice(0, 3);

            for (var i = 0; i < tiles.length; i++) {
              var tile = tiles[i];
              var nameEl = tile.querySelector('.auc-product-tile__name');
              var tileName = (nameEl && nameEl.textContent) ? nameEl.textContent.toLowerCase() : '';

              // Check if tile name contains search terms
              var matchCount = 0;
              for (var j = 0; j < searchTerms.length; j++) {
                if (tileName.indexOf(searchTerms[j]) !== -1) matchCount++;
              }
              if (matchCount >= 2) {
                return tile;
              }
            }

            return null;
          }

          var tile = findProductTile();
          if (!tile) {
            return {
              success: false,
              reason: 'Product not found in search results',
              productId: null,
              requiresWeight: false
            };
          }

          var foundPid = tile.getAttribute('data-pid') || '';

          // Check if product is unavailable
          var unavailableSelectors = [
            '.auc-product-tile__unavailable',
            '[class*="indisponivel"]',
            '[class*="unavailable"]',
            '[class*="out-of-stock"]'
          ];

          for (var k = 0; k < unavailableSelectors.length; k++) {
            var el = tile.querySelector(unavailableSelectors[k]);
            if (el) {
              var text = (el.textContent || '').toLowerCase();
              if (text.indexOf('indisponível') !== -1 ||
                  text.indexOf('esgotado') !== -1 ||
                  text.indexOf('unavailable') !== -1) {
                return {
                  success: false,
                  reason: 'Product is unavailable online',
                  productId: foundPid,
                  requiresWeight: false
                };
              }
            }
          }

          // Check if product requires weight input (sold by kg)
          var priceEl = tile.querySelector('.auc-product-tile__prices');
          var priceText = priceEl ? priceEl.textContent || '' : '';
          var requiresWeight = priceText.indexOf('/Kg') !== -1 || priceText.indexOf('/kg') !== -1;

          if (requiresWeight) {
            // For products sold by weight, we need to input quantity
            var quantityInput = tile.querySelector('input[name="quantity"], input.quantity-select');
            if (quantityInput) {
              quantityInput.value = String(quantity);
              quantityInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }

          // Find the add-to-cart button
          // It's typically a red circular button with a cart/bag icon
          var buttons = tile.querySelectorAll('button');
          var cartButton = null;

          for (var m = 0; m < buttons.length; m++) {
            var btn = buttons[m];

            // Skip disabled buttons
            if (btn.disabled) continue;

            var classes = btn.className || '';
            var text = (btn.textContent || '').toLowerCase();
            var ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();

            // Skip "Validar" notes button
            if (text.indexOf('validar') !== -1 || classes.indexOf('confirm-notes') !== -1) continue;

            // Look for add-to-cart button characteristics
            var isCartButton =
              classes.indexOf('auc-button__rounded--primary') !== -1 ||
              classes.indexOf('add-to-cart') !== -1 ||
              ariaLabel.indexOf('carrinho') !== -1 ||
              ariaLabel.indexOf('adicionar') !== -1;

            // Check visibility
            var rect = btn.getBoundingClientRect();
            var isVisible = rect.width > 0 && rect.height > 0;

            if (isCartButton && isVisible) {
              cartButton = btn;
              break;
            }
          }

          // If no cart button found, try the quantity plus button
          if (!cartButton) {
            var plusBtn = tile.querySelector('.quantity-plus, [class*="plus"], button[aria-label*="aumentar"]');
            if (plusBtn && !plusBtn.disabled) {
              cartButton = plusBtn;
            }
          }

          if (!cartButton) {
            return {
              success: false,
              reason: 'Add to cart button not found',
              productId: foundPid,
              requiresWeight: requiresWeight
            };
          }

          // Click the button
          cartButton.click();

          return {
            success: true,
            reason: 'Product added to cart',
            productId: foundPid,
            requiresWeight: requiresWeight
          };
        })()
      `) as { success: boolean; reason: string; productId: string | null; requiresWeight: boolean };

      // Wait for cart update
      await context.page.waitForTimeout(2000);

      // Close any modal that might appear
      try {
        const modalClose = context.page.locator(
          '.modal button.close, .modal [aria-label="Close"], .auc-modal__close, [class*="modal"] button[class*="close"]'
        ).first();
        if (await modalClose.isVisible({ timeout: 1000 }).catch(() => false)) {
          await modalClose.click().catch(() => {});
          await context.page.waitForTimeout(500);
        }
      } catch {
        // No modal to close
      }

      // Capture screenshot
      if (context.screenshot) {
        const screenshotPath = await context.screenshot(
          `add-to-cart-${result.productId || 'unknown'}`
        );
        screenshots.push(screenshotPath);
      }

      const duration = Date.now() - start;
      context.logger.info('Add to cart completed', {
        success: result.success,
        productId: result.productId,
        reason: result.reason,
        duration,
      });

      if (result.success) {
        const successData: AddToCartOutput = {
          added: true,
          productName: input.productName,
          quantityAdded: quantity,
        };
        if (result.productId) successData.productId = result.productId;
        if (result.requiresWeight) successData.requiresWeight = result.requiresWeight;
        if (screenshots[0]) successData.screenshot = screenshots[0];

        return {
          success: true,
          duration,
          data: successData,
        };
      } else {
        const failData: AddToCartOutput = {
          added: false,
          productName: input.productName,
          quantityAdded: 0,
          failureReason: result.reason,
        };
        if (result.productId) failData.productId = result.productId;
        if (result.requiresWeight) failData.requiresWeight = result.requiresWeight;
        if (screenshots[0]) failData.screenshot = screenshots[0];

        return {
          success: true, // Tool executed successfully, but product wasn't added
          duration,
          data: failData,
        };
      }
    } catch (error) {
      const duration = Date.now() - start;
      const errorMessage = error instanceof Error ? error.message : String(error);

      context.logger.error('Add to cart failed', {
        error: errorMessage,
        productName: input.productName,
        duration,
      });

      const toolError: ToolError = {
        code: 'SELECTOR_ERROR',
        message: `Failed to add product to cart: ${errorMessage}`,
        recoverable: true,
      };

      return {
        success: false,
        duration,
        error: toolError,
      };
    }
  },
};

export default addToCartTool;
