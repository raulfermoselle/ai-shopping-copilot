/**
 * LoadOrderHistoryTool
 *
 * Extracts order list from the Auchan.pt order history page.
 * Parses order cards to extract ID, date, product count, price, and detail URL.
 */

import type { Tool, ToolResult, ToolContext, ToolError } from '../../../types/tool.js';
import type { LoadOrderHistoryInput, LoadOrderHistoryOutput } from './types.js';
import type { OrderSummary } from '../types.js';
import { OrderSummarySchema } from '../types.js';
import { createSelectorResolver } from '../../../selectors/resolver.js';

/**
 * Parse integer from text like "38 Produtos" → 38
 */
function parseProductCount(text: string): number | null {
  const match = text.match(/(\d+)/);
  return match?.[1] ? parseInt(match[1], 10) : null;
}

/**
 * Parse currency from text like "162,51 €" → 162.51
 */
function parseCurrency(text: string): number | null {
  // Remove € symbol and extra spaces
  const cleaned = text.replace(/[€\s]/g, '');
  // Replace comma with dot for decimal
  const normalized = cleaned.replace(',', '.');
  const value = parseFloat(normalized);
  return isNaN(value) ? null : value;
}

/**
 * Parse order ID from text like "Encomenda 002915480" → "002915480"
 */
function parseOrderId(text: string): string | null {
  // Try to extract numeric order ID
  const match = text.match(/(\d+)/);
  return match?.[1] ? match[1] : null;
}

/**
 * LoadOrderHistoryTool implementation.
 *
 * Assumes the browser is already on the order history page.
 * Extracts order data from order cards using the Selector Registry.
 *
 * @example
 * const result = await loadOrderHistoryTool.execute(
 *   { maxOrders: 10, includeDeliveryInfo: false },
 *   context
 * );
 */
export const loadOrderHistoryTool: Tool<LoadOrderHistoryInput, LoadOrderHistoryOutput> = {
  name: 'loadOrderHistory',
  description: 'Extract order list from Auchan order history page',

  async execute(
    input: LoadOrderHistoryInput,
    context: ToolContext
  ): Promise<ToolResult<LoadOrderHistoryOutput>> {
    const start = Date.now();
    const { page, logger, screenshot } = context;
    const { maxOrders = 10 } = input;

    const resolver = createSelectorResolver();
    const screenshots: string[] = [];

    try {
      logger.info('Starting order history extraction', { maxOrders });

      // Verify we're on the order history page
      const currentUrl = page.url();
      if (!currentUrl.includes('historico-encomendas')) {
        logger.error('Not on order history page', { url: currentUrl });

        const error: ToolError = {
          message: `Expected to be on order history page, but URL is: ${currentUrl}`,
          code: 'VALIDATION_ERROR',
          recoverable: false,
        };

        return {
          success: false,
          error,
          duration: Date.now() - start,
        };
      }

      // Wait for order list container
      logger.info('Waiting for order list container');
      const containerResult = await resolver.tryResolve(
        page,
        'order-history',
        'orderListContainer',
        { timeout: 10000 }
      );

      if (!containerResult) {
        logger.error('Order list container not found');

        const screenshotPath = await screenshot('order-history-no-container');
        screenshots.push(screenshotPath);

        const error: ToolError = {
          message: 'Order list container not found on page',
          code: 'SELECTOR_ERROR',
          recoverable: false,
        };

        return {
          success: false,
          error,
          screenshots,
          duration: Date.now() - start,
        };
      }

      if (containerResult.usedFallback) {
        logger.warn('Container found using fallback selector', {
          fallbackIndex: containerResult.fallbackIndex,
        });
      }

      // Get all order card elements
      const orderCardSelector = resolver.resolve('order-history', 'orderCard');
      if (!orderCardSelector) {
        logger.error('Order card selector not found in registry');

        const error: ToolError = {
          message: 'Order card selector not registered',
          code: 'SELECTOR_ERROR',
          recoverable: false,
        };

        return {
          success: false,
          error,
          duration: Date.now() - start,
        };
      }

      const orderCards = await page.$$(orderCardSelector);
      const totalAvailable = orderCards.length;

      logger.info('Found order cards', { count: totalAvailable });

      if (totalAvailable === 0) {
        logger.info('No orders found in history (empty list)');

        const screenshotPath = await screenshot('order-history-empty');
        screenshots.push(screenshotPath);

        return {
          success: true,
          data: {
            orders: [],
            totalAvailable: 0,
            hasMore: false,
          },
          screenshots,
          duration: Date.now() - start,
        };
      }

      // Limit to maxOrders
      const cardsToProcess = orderCards.slice(0, maxOrders);
      const orders: OrderSummary[] = [];
      const warnings: string[] = [];

      // Extract data from each order card
      for (let i = 0; i < cardsToProcess.length; i++) {
        const card = cardsToProcess[i];
        if (!card) continue;

        try {
          logger.info(`Processing order card ${i + 1}/${cardsToProcess.length}`);

          // Extract order link (for detail URL)
          const orderLinkSelector = resolver.resolve('order-history', 'orderLink');
          const linkElement = orderLinkSelector
            ? await card.$(orderLinkSelector)
            : null;
          const detailUrl = linkElement
            ? await linkElement.getAttribute('href')
            : null;

          if (!detailUrl) {
            logger.warn(`Order card ${i + 1}: No detail URL found, skipping`);
            warnings.push(`Order ${i + 1}: Missing detail URL`);
            continue;
          }

          // Make URL absolute if needed
          const absoluteUrl = detailUrl.startsWith('http')
            ? detailUrl
            : `https://www.auchan.pt${detailUrl}`;

          // Extract order date (from data-date attribute)
          const orderDateDaySelector = resolver.resolve('order-history', 'orderDateDay');
          const dateElement = orderDateDaySelector
            ? await card.$(orderDateDaySelector)
            : null;
          const dateAttr = dateElement
            ? await dateElement.getAttribute('data-date')
            : null;

          if (!dateAttr) {
            logger.warn(`Order card ${i + 1}: No date found, skipping`);
            warnings.push(`Order ${i + 1}: Missing date`);
            continue;
          }

          const orderDate = new Date(dateAttr);
          if (isNaN(orderDate.getTime())) {
            logger.warn(`Order card ${i + 1}: Invalid date format: ${dateAttr}`);
            warnings.push(`Order ${i + 1}: Invalid date`);
            continue;
          }

          // Extract order number/ID
          const orderNumberSelector = resolver.resolve('order-history', 'orderNumber');
          const numberElement = orderNumberSelector
            ? await card.$(orderNumberSelector)
            : null;
          const orderNumberText = numberElement
            ? await numberElement.textContent()
            : null;
          const orderId = orderNumberText
            ? parseOrderId(orderNumberText)
            : null;

          if (!orderId) {
            logger.warn(`Order card ${i + 1}: No order ID found, skipping`);
            warnings.push(`Order ${i + 1}: Missing order ID`);
            continue;
          }

          // Extract product count
          const productCountSelector = resolver.resolve('order-history', 'orderProductCount');
          const countElement = productCountSelector
            ? await card.$(productCountSelector)
            : null;
          const countText = countElement
            ? await countElement.textContent()
            : null;
          const productCount = countText
            ? parseProductCount(countText)
            : null;

          if (productCount === null) {
            logger.warn(`Order card ${i + 1}: Failed to parse product count: ${countText}`);
            warnings.push(`Order ${i + 1}: Invalid product count`);
            continue;
          }

          // Extract total price
          const priceSelector = resolver.resolve('order-history', 'orderTotalPrice');
          const priceElement = priceSelector
            ? await card.$(priceSelector)
            : null;
          const priceText = priceElement
            ? await priceElement.textContent()
            : null;
          const totalPrice = priceText
            ? parseCurrency(priceText)
            : null;

          if (totalPrice === null) {
            logger.warn(`Order card ${i + 1}: Failed to parse price: ${priceText}`);
            warnings.push(`Order ${i + 1}: Invalid price`);
            continue;
          }

          // Validate with schema
          const orderSummary: OrderSummary = {
            orderId,
            date: orderDate,
            productCount,
            totalPrice,
            detailUrl: absoluteUrl,
          };

          const validated = OrderSummarySchema.safeParse(orderSummary);
          if (!validated.success) {
            logger.warn(`Order card ${i + 1}: Schema validation failed`, {
              errors: validated.error.errors,
            });
            warnings.push(`Order ${i + 1}: Schema validation failed`);
            continue;
          }

          orders.push(validated.data);
          logger.info(`Order card ${i + 1}: Successfully extracted`, {
            orderId,
            date: orderDate.toISOString(),
            productCount,
            totalPrice,
          });
        } catch (err) {
          logger.error(`Order card ${i + 1}: Extraction failed`, {
            error: err instanceof Error ? err.message : String(err),
          });
          warnings.push(`Order ${i + 1}: Extraction error`);
        }
      }

      // Capture final screenshot
      const screenshotPath = await screenshot('order-history-extracted');
      screenshots.push(screenshotPath);

      if (warnings.length > 0) {
        logger.warn('Order extraction completed with warnings', {
          warningCount: warnings.length,
          warnings,
        });
      }

      logger.info('Order history extraction complete', {
        extracted: orders.length,
        totalAvailable,
        hasMore: totalAvailable > maxOrders,
      });

      return {
        success: true,
        data: {
          orders,
          totalAvailable,
          hasMore: totalAvailable > maxOrders,
        },
        screenshots,
        duration: Date.now() - start,
      };
    } catch (err) {
      logger.error('LoadOrderHistoryTool execution failed', {
        error: err instanceof Error ? err.message : String(err),
      });

      const screenshotPath = await screenshot('order-history-extraction-error').catch(() => '');
      if (screenshotPath) {
        screenshots.push(screenshotPath);
      }

      const error: ToolError = {
        message: err instanceof Error ? err.message : 'Unknown error during order extraction',
        code: 'UNKNOWN_ERROR',
        recoverable: false,
        ...(err instanceof Error && { cause: err }),
      };

      return {
        success: false,
        error,
        screenshots,
        duration: Date.now() - start,
      };
    }
  },
};
