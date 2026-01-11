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

      // Get all order elements
      // The page structure is: <a href="...order-detail..."><div class="order-card">...</div></a>
      // So we need to select the links (which wrap the cards) to get the href
      const orderLinkSelector = resolver.resolve('order-history', 'orderLink');
      const orderCardSelector = resolver.resolve('order-history', 'orderCard');

      if (!orderLinkSelector && !orderCardSelector) {
        logger.error('Neither order link nor order card selector found in registry');

        const error: ToolError = {
          message: 'Order card/link selector not registered',
          code: 'SELECTOR_ERROR',
          recoverable: false,
        };

        return {
          success: false,
          error,
          duration: Date.now() - start,
        };
      }

      // Try the link selector first (since links wrap cards on Auchan.pt)
      let orderElements = orderLinkSelector ? await page.$$(orderLinkSelector) : [];
      let usingLinks = true;

      if (orderElements.length === 0 && orderCardSelector) {
        // Fallback to card selector
        logger.debug('No links found, falling back to card selector');
        orderElements = await page.$$(orderCardSelector);
        usingLinks = false;
      }

      const totalAvailable = orderElements.length;
      logger.debug('Found order elements', { count: totalAvailable, usingLinks });

      logger.info('Found order elements', { count: totalAvailable, usingLinks });

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
      const elementsToProcess = orderElements.slice(0, maxOrders);
      const orders: OrderSummary[] = [];
      const warnings: string[] = [];

      // Extract data from each order element (link or card)
      for (let i = 0; i < elementsToProcess.length; i++) {
        const element = elementsToProcess[i];
        if (!element) continue;

        try {
          logger.info(`Processing order element ${i + 1}/${elementsToProcess.length}`);

          // Extract order link (for detail URL)
          // When usingLinks=true, the element IS the <a> tag
          // When usingLinks=false, the element is the card div and we need to find the link
          let detailUrl: string | null = null;

          // If we selected links, get the href directly from the element
          if (usingLinks) {
            detailUrl = await element.getAttribute('href');
            if (detailUrl) {
              logger.debug(`Order element ${i + 1}: Got href from link element`, { href: detailUrl });
            }
          }

          // If not using links or href not found, try various strategies
          if (!detailUrl) {
            // Strategy 1: Check if the element itself has an href
            const elementHref = await element.getAttribute('href');
            if (elementHref) {
              logger.debug(`Order element ${i + 1}: Found href on element itself`, { href: elementHref });
              detailUrl = elementHref;
            }
          }

          // Strategy 2: Look for a link inside the element
          if (!detailUrl) {
            const linkSelector = orderLinkSelector || 'a[href*="detalhes-encomenda"]';
            const linkElement = await element.$(linkSelector);
            if (linkElement) {
              detailUrl = await linkElement.getAttribute('href');
              logger.debug(`Order element ${i + 1}: Found href via nested link`, { href: detailUrl });
            }
          }

          // Strategy 3: Try to find any <a> with orderID in href
          if (!detailUrl) {
            const anyLink = await element.$('a[href*="orderID"]');
            if (anyLink) {
              detailUrl = await anyLink.getAttribute('href');
              logger.debug(`Order element ${i + 1}: Found href via orderID pattern`, { href: detailUrl });
            }
          }

          // Strategy 4: Just get the first <a> tag
          if (!detailUrl) {
            const firstLink = await element.$('a');
            if (firstLink) {
              const href = await firstLink.getAttribute('href');
              if (href && (href.includes('detalhes') || href.includes('order'))) {
                detailUrl = href;
                logger.debug(`Order element ${i + 1}: Found href via first link fallback`, { href: detailUrl });
              }
            }
          }

          if (!detailUrl) {
            // Last resort: log the element HTML to understand structure
            const elementHtml = await element.evaluate((el) => el.outerHTML.substring(0, 500));
            logger.warn(`Order element ${i + 1}: No detail URL found, skipping`, { elementHtmlPreview: elementHtml });
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
            ? await element.$(orderDateDaySelector)
            : null;
          const dateAttr = dateElement
            ? await dateElement.getAttribute('data-date')
            : null;

          if (!dateAttr) {
            logger.warn(`Order ${i + 1}: No date found, skipping`);
            warnings.push(`Order ${i + 1}: Missing date`);
            continue;
          }

          const orderDate = new Date(dateAttr);
          if (isNaN(orderDate.getTime())) {
            logger.warn(`Order ${i + 1}: Invalid date format: ${dateAttr}`);
            warnings.push(`Order ${i + 1}: Invalid date`);
            continue;
          }

          // Extract order number/ID
          const orderNumberSelector = resolver.resolve('order-history', 'orderNumber');
          const numberElement = orderNumberSelector
            ? await element.$(orderNumberSelector)
            : null;
          const orderNumberText = numberElement
            ? await numberElement.textContent()
            : null;
          const orderId = orderNumberText
            ? parseOrderId(orderNumberText)
            : null;

          if (!orderId) {
            logger.warn(`Order ${i + 1}: No order ID found, skipping`);
            warnings.push(`Order ${i + 1}: Missing order ID`);
            continue;
          }

          // Extract product count
          const productCountSelector = resolver.resolve('order-history', 'orderProductCount');
          const countElement = productCountSelector
            ? await element.$(productCountSelector)
            : null;
          const countText = countElement
            ? await countElement.textContent()
            : null;
          const productCount = countText
            ? parseProductCount(countText)
            : null;

          if (productCount === null) {
            logger.warn(`Order ${i + 1}: Failed to parse product count: ${countText}`);
            warnings.push(`Order ${i + 1}: Invalid product count`);
            continue;
          }

          // Extract total price
          const priceSelector = resolver.resolve('order-history', 'orderTotalPrice');
          const priceElement = priceSelector
            ? await element.$(priceSelector)
            : null;
          const priceText = priceElement
            ? await priceElement.textContent()
            : null;
          const totalPrice = priceText
            ? parseCurrency(priceText)
            : null;

          if (totalPrice === null) {
            logger.warn(`Order ${i + 1}: Failed to parse price: ${priceText}`);
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
            logger.warn(`Order ${i + 1}: Schema validation failed`, {
              errors: validated.error.errors,
            });
            warnings.push(`Order ${i + 1}: Schema validation failed`);
            continue;
          }

          orders.push(validated.data);
          logger.info(`Order ${i + 1}: Successfully extracted`, {
            orderId,
            date: orderDate.toISOString(),
            productCount,
            totalPrice,
          });
        } catch (err) {
          logger.error(`Order ${i + 1}: Extraction failed`, {
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
