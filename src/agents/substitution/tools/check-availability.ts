/**
 * Check Availability Tool
 *
 * Checks product availability on Auchan.pt:
 * - Checks cart page for availability indicators
 * - Can check product page directly if URL provided
 * - Returns detailed availability status
 *
 * IMPORTANT: This is a read-only tool. It never modifies cart state or places orders.
 */

import type { Tool, ToolResult, ToolError } from '../../../types/tool.js';
import type { CheckAvailabilityInput, CheckAvailabilityOutput } from './types.js';
import type { AvailabilityResult, AvailabilityStatus } from '../types.js';
import { createSelectorResolver } from '../../../selectors/resolver.js';
import { dismissSubscriptionPopup } from '../../../utils/popup-handler.js';

/**
 * Parse availability status from page indicators
 */
function parseAvailabilityStatus(
  hasUnavailableIndicator: boolean,
  hasLowStockIndicator: boolean,
  availabilityText?: string
): AvailabilityStatus {
  if (hasUnavailableIndicator) {
    // Check if discontinued vs just out of stock
    if (availabilityText?.toLowerCase().includes('descontinuado')) {
      return 'discontinued';
    }
    return 'out_of_stock';
  }

  if (hasLowStockIndicator) {
    return 'low_stock';
  }

  return 'available';
}

/**
 * Extract quantity available from text if present
 */
function parseQuantityAvailable(text?: string): number | undefined {
  if (!text) return undefined;

  // Common patterns: "Apenas 3 disponíveis", "3 em stock"
  const match = text.match(/(\d+)\s*(disponíve|em stock|unidade)/i);
  if (match?.[1]) {
    return parseInt(match[1], 10);
  }

  return undefined;
}

/**
 * Check Availability Tool
 *
 * Checks if a product is available on Auchan.pt.
 */
export const checkAvailabilityTool: Tool<CheckAvailabilityInput, CheckAvailabilityOutput> = {
  name: 'checkAvailability',
  description: 'Check if a product is available on Auchan.pt cart or product page',

  async execute(input, context): Promise<ToolResult<CheckAvailabilityOutput>> {
    const start = Date.now();
    const resolver = createSelectorResolver();
    const screenshots: string[] = [];

    try {
      context.logger.info('Checking product availability', {
        productName: input.productName,
        productId: input.productId,
        hasUrl: !!input.productUrl,
      });

      let checkMethod: 'cart' | 'product-page' | 'search' = 'cart';
      let availabilityStatus: AvailabilityStatus = 'unknown';
      let quantityAvailable: number | undefined;
      let availabilityNote: string | undefined;
      let productUrl = input.productUrl;

      // Dismiss any popups
      await dismissSubscriptionPopup(context.page, { logger: context.logger });

      // Strategy 1: Check on cart page if we're already there
      const currentUrl = context.page.url();
      if (currentUrl.includes('carrinho-compras') || currentUrl.includes('/cart')) {
        context.logger.debug('Checking availability on cart page');
        checkMethod = 'cart';

        // Find the product in cart by name
        const cartItems = await context.page.locator(
          resolver.buildCompositeSelector('cart', 'cartItem') || '.auc-cart__product, .cart-item'
        ).all();

        for (const item of cartItems) {
          try {
            // Get product name
            const nameElement = await item.locator(
              resolver.buildCompositeSelector('cart', 'productName') || '.auc-cart__product-name, .product-name, a[href*="/produtos/"]'
            ).first();
            const name = (await nameElement.textContent())?.trim() || '';

            // Check if this is our product (case-insensitive partial match)
            const isMatch = name.toLowerCase().includes(input.productName.toLowerCase()) ||
              input.productName.toLowerCase().includes(name.toLowerCase());

            if (!isMatch) continue;

            context.logger.debug('Found matching product in cart', { name });

            // Check for unavailable indicator
            const unavailableElement = await item.locator(
              resolver.buildCompositeSelector('cart', 'productUnavailableIndicator') ||
              '.unavailable, .out-of-stock, [class*="unavailable"], [class*="esgotado"]'
            ).first();
            const hasUnavailable = await unavailableElement.isVisible().catch(() => false);

            // Check for low stock indicator
            const lowStockElement = await item.locator(
              '.low-stock, [class*="low-stock"], [class*="poucas-unidades"]'
            ).first();
            const hasLowStock = await lowStockElement.isVisible().catch(() => false);

            // Get availability text if present
            const availTextElement = await item.locator(
              resolver.buildCompositeSelector('cart', 'productAvailability') ||
              '.availability, .product-availability, [class*="availability"]'
            ).first();
            availabilityNote = (await availTextElement.textContent().catch(() => undefined))?.trim();

            // Get product URL if not provided
            if (!productUrl) {
              const linkElement = await item.locator('a[href*="/produtos/"]').first();
              const href = await linkElement.getAttribute('href').catch(() => null);
              if (href) {
                productUrl = href.startsWith('http') ? href : `https://www.auchan.pt${href}`;
              }
            }

            availabilityStatus = parseAvailabilityStatus(hasUnavailable, hasLowStock, availabilityNote);
            quantityAvailable = parseQuantityAvailable(availabilityNote);
            break;
          } catch {
            // Continue checking other items
          }
        }
      }

      // Strategy 2: Check product page directly if URL provided
      if (availabilityStatus === 'unknown' && input.productUrl) {
        context.logger.debug('Checking availability on product page', { url: input.productUrl });
        checkMethod = 'product-page';

        await context.page.goto(input.productUrl, {
          timeout: input.timeout || context.config.navigationTimeout,
          waitUntil: 'domcontentloaded',
        });
        await context.page.waitForTimeout(1500);

        // Dismiss any popups
        await dismissSubscriptionPopup(context.page, { logger: context.logger });

        // Check for out of stock indicator on product page
        // Common patterns for Auchan product pages
        const outOfStockSelectors = [
          '.auc-product--unavailable',
          '.product-unavailable',
          '[class*="esgotado"]',
          '[class*="out-of-stock"]',
          'button[disabled]:has-text("Esgotado")',
          '.add-to-cart[disabled]',
        ].join(', ');

        const unavailableElement = await context.page.locator(outOfStockSelectors).first();
        const hasUnavailable = await unavailableElement.isVisible().catch(() => false);

        // Check for low stock
        const lowStockSelectors = [
          '[class*="low-stock"]',
          '[class*="poucas-unidades"]',
          ':has-text("Últimas unidades")',
        ].join(', ');

        const lowStockElement = await context.page.locator(lowStockSelectors).first();
        const hasLowStock = await lowStockElement.isVisible().catch(() => false);

        // Get availability text
        const availSelectors = [
          '.product-availability',
          '.availability-message',
          '[class*="availability"]',
          '[class*="stock"]',
        ].join(', ');

        const availTextElement = await context.page.locator(availSelectors).first();
        availabilityNote = (await availTextElement.textContent().catch(() => undefined))?.trim();

        availabilityStatus = parseAvailabilityStatus(hasUnavailable, hasLowStock, availabilityNote);
        quantityAvailable = parseQuantityAvailable(availabilityNote);
      }

      // Capture screenshot
      let screenshotPath: string | undefined;
      try {
        screenshotPath = await context.screenshot(`availability-check-${input.productName.slice(0, 20).replace(/\s/g, '-')}`);
        screenshots.push(screenshotPath);
      } catch {
        // Screenshot failed, continue
      }

      // Build result
      const availability: AvailabilityResult = {
        productId: input.productId || '',
        productName: input.productName,
        productUrl,
        status: availabilityStatus,
        quantityAvailable,
        checkedAt: new Date(),
        note: availabilityNote,
      };

      context.logger.info('Availability check completed', {
        productName: input.productName,
        status: availabilityStatus,
        checkMethod,
      });

      return {
        success: true,
        data: {
          availability,
          checkMethod,
          ...(screenshotPath && { screenshot: screenshotPath }),
        },
        screenshots,
        duration: Date.now() - start,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      context.logger.error('Availability check failed', {
        productName: input.productName,
        error: errorMessage,
      });

      // Capture error screenshot
      try {
        const screenshot = await context.screenshot('availability-check-error');
        screenshots.push(screenshot);
      } catch {
        // Screenshot failed, continue
      }

      const toolError: ToolError = {
        message: errorMessage,
        code: errorMessage.includes('timeout') ? 'TIMEOUT_ERROR' : 'SELECTOR_ERROR',
        recoverable: true,
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
