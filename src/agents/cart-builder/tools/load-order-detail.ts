/**
 * Load Order Detail Tool
 *
 * Navigates to an order detail page and extracts complete order information:
 * - Order header (ID, date, product count, total)
 * - Delivery info (type, address, date/time)
 * - All product items (name, quantity, price, URLs)
 * - Cost summary (subtotal, delivery fee, total)
 *
 * Uses Selector Registry for resilient element selection.
 */

import type { Tool, ToolResult, ToolContext, ToolError } from '../../../types/tool.js';
import type {
  LoadOrderDetailInput,
  LoadOrderDetailOutput,
} from './types.js';
import type { OrderDetail, OrderItem, DeliveryInfo, OrderCostSummary } from '../types.js';
import { OrderDetailSchema } from '../types.js';
import { createSelectorResolver } from '../../../selectors/resolver.js';

/**
 * Parse quantity from Auchan format "x2" → 2
 * Always returns at least 1 (positive integer required by schema)
 */
function parseQuantity(text: string): number {
  const match = text.trim().match(/x?(\d+)/i);
  if (!match?.[1]) {
    return 1;
  }
  const parsed = parseInt(match[1], 10);
  // Ensure quantity is always at least 1 (positive)
  return parsed > 0 ? parsed : 1;
}

/**
 * Parse currency from Auchan format "1,39 €" → 1.39
 */
function parseCurrency(text: string): number {
  const cleaned = text.replace(/\s/g, '').replace('€', '').replace(',', '.');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Extract product ID from Auchan product URL
 * URL format: https://www.auchan.pt/pt/[category]/[product-name]/p/[productId]
 */
function extractProductId(url: string): string | undefined {
  const match = url.match(/\/p\/([^/?]+)/);
  return match?.[1];
}

/**
 * Load Order Detail Tool
 *
 * Navigates to order detail page and extracts all order information.
 */
export const loadOrderDetailTool: Tool<LoadOrderDetailInput, LoadOrderDetailOutput> = {
  name: 'loadOrderDetail',
  description: 'Load full order details from order detail page including all items, delivery info, and cost summary',

  async execute(input, context): Promise<ToolResult<LoadOrderDetailOutput>> {
    const start = Date.now();
    const resolver = createSelectorResolver();
    const screenshots: string[] = [];

    try {
      context.logger.info('Loading order detail', {
        orderId: input.orderId,
        detailUrl: input.detailUrl,
        expandAllProducts: input.expandAllProducts,
      });

      // Navigate to order detail page
      context.logger.debug('Navigating to order detail page', { url: input.detailUrl });
      await context.page.goto(input.detailUrl, {
        timeout: context.config.navigationTimeout,
        waitUntil: 'domcontentloaded',
      });

      // Wait for order header to be visible (page loaded)
      const orderHeaderResult = await resolver.tryResolve(
        context.page,
        'order-detail',
        'orderHeader',
        { timeout: 10000 }
      );

      if (!orderHeaderResult) {
        throw new Error('Order detail page did not load - order header not found');
      }

      if (orderHeaderResult.usedFallback) {
        context.logger.warn('Used fallback selector for orderHeader', {
          fallbackIndex: orderHeaderResult.fallbackIndex,
        });
      }

      // Expand all products if requested
      let allProductsLoaded = true;
      if (input.expandAllProducts) {
        context.logger.debug('Checking for "Ver todos" button');
        const viewAllResult = await resolver.tryResolve(
          context.page,
          'order-detail',
          'viewAllButton',
          { timeout: 2000 }
        ).catch(() => null);

        if (viewAllResult) {
          context.logger.info('Clicking "Ver todos" to expand all products');
          await viewAllResult.element.click();
          // Wait for products to load
          await context.page.waitForTimeout(1500);
        } else {
          context.logger.debug('No "Ver todos" button found - products already expanded or not paginated');
        }
      } else {
        // If not expanding, we may not have all products
        const viewAllExists = await resolver.tryResolve(
          context.page,
          'order-detail',
          'viewAllButton',
          { timeout: 1000 }
        ).catch(() => null);
        allProductsLoaded = !viewAllExists;
      }

      // Extract order header information
      context.logger.debug('Extracting order header');
      const orderDate = await extractOrderDate(context, resolver);
      const productCount = await extractProductCount(context, resolver);
      const totalPrice = await extractTotalPrice(context, resolver);

      // Extract delivery information
      context.logger.debug('Extracting delivery info');
      const delivery = await extractDeliveryInfo(context, resolver);

      // Extract all product items
      context.logger.debug('Extracting product items');
      const items = await extractProductItems(context, resolver);

      // Extract cost summary
      context.logger.debug('Extracting cost summary');
      const costSummary = await extractCostSummary(context, resolver);

      // Build complete order detail
      const order: OrderDetail = {
        orderId: input.orderId,
        date: orderDate,
        productCount,
        totalPrice,
        detailUrl: input.detailUrl,
        items,
        delivery,
        costSummary,
      };

      // Validate with Zod schema
      const validated = OrderDetailSchema.parse(order);

      // Capture screenshot
      const screenshot = await context.screenshot(`order-detail-${input.orderId}`);
      screenshots.push(screenshot);

      context.logger.info('Order detail loaded successfully', {
        orderId: input.orderId,
        itemCount: items.length,
        allProductsLoaded,
      });

      return {
        success: true,
        data: {
          order: validated,
          allProductsLoaded,
          screenshot,
        },
        screenshots,
        duration: Date.now() - start,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      context.logger.error('Failed to load order detail', { error: errorMessage });

      // Capture error screenshot
      try {
        const screenshot = await context.screenshot(`order-detail-error-${input.orderId}`);
        screenshots.push(screenshot);
      } catch {
        // Screenshot failed, continue
      }

      const toolError: ToolError = {
        message: errorMessage,
        code: 'SELECTOR_ERROR',
        recoverable: false,
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
 * Extract order date from order detail page
 */
async function extractOrderDate(
  context: ToolContext,
  resolver: ReturnType<typeof createSelectorResolver>
): Promise<Date> {
  const dateResult = await resolver.tryResolve(context.page, 'order-detail', 'orderDate', {
    timeout: 5000,
  });

  if (!dateResult) {
    throw new Error('Order date element not found');
  }

  // Try to get data-date attribute first (ISO timestamp)
  const dataDate = await dateResult.element.getAttribute('data-date');
  if (dataDate) {
    return new Date(dataDate);
  }

  // Fallback to text content
  const dateText = await dateResult.element.textContent();
  if (!dateText) {
    throw new Error('Order date text is empty');
  }

  return new Date(dateText.trim());
}

/**
 * Extract product count from order header
 */
async function extractProductCount(
  context: ToolContext,
  resolver: ReturnType<typeof createSelectorResolver>
): Promise<number> {
  const countResult = await resolver.tryResolve(
    context.page,
    'order-detail',
    'orderProductCount',
    { timeout: 5000 }
  );

  if (!countResult) {
    throw new Error('Product count element not found');
  }

  const countText = await countResult.element.textContent();
  if (!countText) {
    throw new Error('Product count text is empty');
  }

  // Parse "38 Produtos" → 38
  const match = countText.match(/(\d+)/);
  if (!match?.[1]) {
    throw new Error(`Could not parse product count from: ${countText}`);
  }

  return parseInt(match[1], 10);
}

/**
 * Extract total price from order header
 */
async function extractTotalPrice(
  context: ToolContext,
  resolver: ReturnType<typeof createSelectorResolver>
): Promise<number> {
  const priceResult = await resolver.tryResolve(
    context.page,
    'order-detail',
    'orderTotalPrice',
    { timeout: 5000 }
  );

  if (!priceResult) {
    throw new Error('Total price element not found');
  }

  const priceText = await priceResult.element.textContent();
  if (!priceText) {
    throw new Error('Total price text is empty');
  }

  return parseCurrency(priceText);
}

/**
 * Extract delivery information
 */
async function extractDeliveryInfo(
  context: ToolContext,
  resolver: ReturnType<typeof createSelectorResolver>
): Promise<DeliveryInfo> {
  // Delivery type
  const typeResult = await resolver.tryResolve(context.page, 'order-detail', 'deliveryType', {
    timeout: 5000,
  });
  const type = typeResult ? ((await typeResult.element.textContent()) ?? '').trim() : '';

  // Delivery address
  const addressResult = await resolver.tryResolve(
    context.page,
    'order-detail',
    'deliveryAddress',
    { timeout: 5000 }
  );
  const address = addressResult ? ((await addressResult.element.textContent()) ?? '').trim() : '';

  // Delivery date/time
  const dateTimeResult = await resolver.tryResolve(
    context.page,
    'order-detail',
    'deliveryDateTime',
    { timeout: 5000 }
  );
  const dateTime = dateTimeResult
    ? ((await dateTimeResult.element.textContent()) ?? '').trim()
    : '';

  return {
    type,
    address,
    dateTime,
  };
}

/**
 * Extract all product items from the order
 */
async function extractProductItems(
  context: ToolContext,
  resolver: ReturnType<typeof createSelectorResolver>
): Promise<OrderItem[]> {
  // Find all product cards
  const productCardSelector = resolver.resolve('order-detail', 'productCard');
  if (!productCardSelector) {
    throw new Error('Product card selector not found in registry');
  }

  const productCards = await context.page.locator(productCardSelector).all();
  context.logger.debug(`Found ${productCards.length} product cards`);

  const items: OrderItem[] = [];

  for (const card of productCards) {
    try {
      // Product name and URL
      const productNameLinkSelector = resolver.resolve('order-detail', 'productNameLink');
      const productNameLink = productNameLinkSelector
        ? card.locator(productNameLinkSelector).first()
        : null;

      const name = productNameLink ? ((await productNameLink.textContent()) ?? '').trim() : '';
      const productUrl = productNameLink ? await productNameLink.getAttribute('href') : null;

      // Product ID from URL
      const productId = productUrl ? extractProductId(productUrl) : undefined;

      // Product image
      const productImageSelector = resolver.resolve('order-detail', 'productImage');
      const productImage = productImageSelector
        ? card.locator(productImageSelector).first()
        : null;
      const imageUrl = productImage ? await productImage.getAttribute('src') : null;

      // Quantity
      const productQuantitySelector = resolver.resolve('order-detail', 'productQuantity');
      const productQuantityElement = productQuantitySelector
        ? card.locator(productQuantitySelector).first()
        : null;
      const quantityText = productQuantityElement
        ? await productQuantityElement.textContent()
        : null;
      const quantity = quantityText ? parseQuantity(quantityText) : 1;

      // Price
      const productPriceSelector = resolver.resolve('order-detail', 'productPrice');
      const productPriceElement = productPriceSelector
        ? card.locator(productPriceSelector).first()
        : null;
      const priceText = productPriceElement ? await productPriceElement.textContent() : null;
      const unitPrice = priceText ? parseCurrency(priceText) : 0;

      // Calculate total
      const totalPrice = quantity * unitPrice;

      // Convert empty strings to undefined and ensure URLs are absolute
      // Zod url() validation requires full URLs with protocol
      let cleanProductUrl: string | undefined = undefined;
      if (productUrl && productUrl.length > 0) {
        cleanProductUrl = productUrl.startsWith('http')
          ? productUrl
          : `https://www.auchan.pt${productUrl.startsWith('/') ? '' : '/'}${productUrl}`;
      }

      let cleanImageUrl: string | undefined = undefined;
      if (imageUrl && imageUrl.length > 0) {
        cleanImageUrl = imageUrl.startsWith('http')
          ? imageUrl
          : `https://www.auchan.pt${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
      }

      items.push({
        productId: productId && productId.length > 0 ? productId : undefined,
        name: name || 'Unknown Product',
        productUrl: cleanProductUrl,
        imageUrl: cleanImageUrl,
        quantity,
        unitPrice,
        totalPrice,
      });
    } catch (err) {
      context.logger.warn('Failed to extract product item', {
        error: err instanceof Error ? err.message : String(err),
      });
      // Continue to next product
    }
  }

  return items;
}

/**
 * Extract order cost summary
 */
async function extractCostSummary(
  context: ToolContext,
  resolver: ReturnType<typeof createSelectorResolver>
): Promise<OrderCostSummary> {
  // Subtotal
  const subtotalResult = await resolver.tryResolve(
    context.page,
    'order-detail',
    'summaryProductsTotal',
    { timeout: 5000 }
  );
  const subtotalText = subtotalResult ? await subtotalResult.element.textContent() : null;
  const subtotal = subtotalText ? parseCurrency(subtotalText) : 0;

  // Delivery fee
  const deliveryFeeResult = await resolver.tryResolve(
    context.page,
    'order-detail',
    'summaryDeliveryFee',
    { timeout: 5000 }
  );
  const deliveryFeeText = deliveryFeeResult
    ? await deliveryFeeResult.element.textContent()
    : null;
  const deliveryFee = deliveryFeeText ? parseCurrency(deliveryFeeText) : 0;

  // Total
  const totalResult = await resolver.tryResolve(context.page, 'order-detail', 'summaryTotal', {
    timeout: 5000,
  });
  const totalText = totalResult ? await totalResult.element.textContent() : null;
  const total = totalText ? parseCurrency(totalText) : 0;

  return {
    subtotal,
    deliveryFee,
    total,
  };
}
