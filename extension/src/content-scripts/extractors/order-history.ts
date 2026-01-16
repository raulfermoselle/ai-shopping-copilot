/**
 * Order History Extractor
 *
 * Extracts order summaries from the order history list page DOM.
 * Runs in content script context with direct DOM access.
 *
 * Uses selectors from data/selectors/pages/order-history/v1.json
 */

import type { OrderSummary, OrderStatus } from '../../types/orders.js';

/**
 * Extract order history from the current page DOM
 *
 * This function runs in the content script context and has direct access to the DOM.
 * Must be called when on the order history page (https://www.auchan.pt/pt/historico-encomendas).
 *
 * Selector Strategy (from order-history/v1.json):
 * - Order cards: .auc-orders__order-card
 * - Order ID: .auc-orders__order-number span:nth-child(2)
 * - Date: .auc-orders__order-date [data-date] attribute
 * - Product count: .auc-orders__order-products
 * - Total price: .auc-orders__order-price
 *
 * Uses BULK EXTRACTION pattern: Single querySelectorAll, iterate in JavaScript.
 * This avoids multiple browser round-trips and completes in <100ms.
 *
 * @param options - Optional configuration
 * @param options.limit - Maximum number of orders to extract (default: all)
 * @returns Array of OrderSummary objects
 */
export function extractOrderHistory(options?: { limit?: number }): OrderSummary[] {
  const orders: OrderSummary[] = [];

  // Use bulk extraction - single querySelectorAll call
  // Primary selector from order-history/v1.json
  const orderCards = document.querySelectorAll('.auc-orders__order-card');

  // If primary selector fails, try fallback
  const cards = orderCards.length > 0
    ? orderCards
    : document.querySelectorAll('.card.auc-card');

  for (let i = 0; i < cards.length; i++) {
    // Respect limit if provided
    if (options?.limit && orders.length >= options.limit) {
      break;
    }

    const card = cards[i];

    try {
      // Extract order ID (numeric part only, e.g., "002915480")
      const orderIdElement = card.querySelector('.auc-orders__order-number span:nth-child(2)');
      const orderId = orderIdElement?.textContent?.trim() || '';

      if (!orderId) {
        // Skip cards without order ID
        continue;
      }

      // Extract date and timestamp
      // Prefer data-date attribute on date container (ISO timestamp)
      const dateContainer = card.querySelector('.auc-orders__order-date [data-date]')
                         || card.querySelector('.auc-run--day[data-date]');

      let date = '';
      let timestamp = 0;

      if (dateContainer) {
        const dataDate = dateContainer.getAttribute('data-date');
        if (dataDate) {
          // data-date contains ISO timestamp (e.g., "2026-01-10T00:00:00Z")
          date = dataDate;
          timestamp = new Date(dataDate).getTime();
        }
      }

      // Fallback: Parse from day/month display
      if (!date) {
        const dayElement = card.querySelector('.auc-run--day');
        const monthElement = card.querySelector('.auc-run--monthd');
        const day = dayElement?.textContent?.trim() || '';
        const month = monthElement?.textContent?.trim() || '';

        if (day && month) {
          // Convert Portuguese month abbreviation to number
          const monthMap: Record<string, string> = {
            jan: '01', fev: '02', mar: '03', abr: '04',
            mai: '05', jun: '06', jul: '07', ago: '08',
            set: '09', out: '10', nov: '11', dez: '12',
          };
          const monthNum = monthMap[month.toLowerCase()] || '01';
          const currentYear = new Date().getFullYear();
          date = `${currentYear}-${monthNum}-${day.padStart(2, '0')}T00:00:00Z`;
          timestamp = new Date(date).getTime();
        }
      }

      // Extract product count (e.g., "38 Produtos" -> 38)
      const productCountElement = card.querySelector('.auc-orders__order-products');
      const productCountText = productCountElement?.textContent?.trim() || '0';
      const itemCount = parseInt(productCountText.match(/\d+/)?.[0] || '0', 10);

      // Extract total price (e.g., "162,51 €" -> 162.51)
      const totalPriceElement = card.querySelector('.auc-orders__order-price');
      const totalPriceText = totalPriceElement?.textContent?.trim() || '0';
      const total = parsePrice(totalPriceText);

      // Detect order status (Auchan doesn't display status in list, assume "delivered")
      // In the future, this could be extracted from a status badge if added
      const status: OrderStatus = detectOrderStatus(card);

      // Extract delivery date (if available in the card)
      const deliveryDate = extractDeliveryDate(card);

      // Build OrderSummary object
      orders.push({
        orderId,
        date,
        timestamp,
        total,
        itemCount,
        status,
        deliveryDate,
      });
    } catch (error) {
      // Skip malformed cards but log to console for debugging
      console.warn(`[OrderHistory] Failed to parse order card:`, error);
    }
  }

  return orders;
}

/**
 * Parse price string to number
 *
 * Handles Portuguese currency format:
 * - "162,51 €" -> 162.51
 * - "€ 162,51" -> 162.51
 * - "1.234,56 €" -> 1234.56 (thousands separator)
 *
 * @param text - Price string from DOM
 * @returns Numeric price value
 */
function parsePrice(text: string | undefined): number {
  if (!text) {
    return 0;
  }

  // Remove currency symbol and whitespace
  let cleaned = text.replace(/[€\s]/g, '');

  // Handle Portuguese number format:
  // - Thousands separator is "." (dot)
  // - Decimal separator is "," (comma)
  // Example: "1.234,56" -> "1234.56"

  // Remove thousands separators (dots)
  cleaned = cleaned.replace(/\./g, '');

  // Replace decimal comma with dot
  cleaned = cleaned.replace(',', '.');

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Detect order status from card content
 *
 * Currently, Auchan.pt order history list doesn't show status badges.
 * We assume all visible orders are "delivered" unless we find evidence otherwise.
 *
 * @param card - Order card element
 * @returns OrderStatus
 */
function detectOrderStatus(card: Element): OrderStatus {
  // Check for status indicators (badges, classes, text)
  const statusBadge = card.querySelector('.status-badge, .order-status, [class*="status"]');

  if (statusBadge) {
    const statusText = statusBadge.textContent?.toLowerCase().trim() || '';

    // Map Portuguese status text to OrderStatus enum
    if (statusText.includes('pendente') || statusText.includes('pending')) {
      return 'pending';
    }
    if (statusText.includes('processando') || statusText.includes('processing') || statusText.includes('a preparar')) {
      return 'processing';
    }
    if (statusText.includes('pronta') || statusText.includes('ready')) {
      return 'ready';
    }
    if (statusText.includes('entrega') || statusText.includes('delivering') || statusText.includes('a caminho')) {
      return 'delivering';
    }
    if (statusText.includes('entregue') || statusText.includes('delivered') || statusText.includes('concluída')) {
      return 'delivered';
    }
    if (statusText.includes('cancelad') || statusText.includes('cancelled')) {
      return 'cancelled';
    }
  }

  // Default: assume delivered if no status found
  return 'delivered';
}

/**
 * Extract delivery date from order card
 *
 * The order history list may show delivery date if available.
 * This is different from the order date (order placed date).
 *
 * @param card - Order card element
 * @returns Delivery date string or undefined
 */
function extractDeliveryDate(card: Element): string | undefined {
  // Look for delivery date indicator
  const deliveryDateElement = card.querySelector('.delivery-date, [class*="delivery"]');

  if (deliveryDateElement) {
    const dateAttr = deliveryDateElement.getAttribute('data-delivery-date');
    if (dateAttr) {
      return dateAttr;
    }

    // Parse from text if no attribute
    const text = deliveryDateElement.textContent?.trim() || '';
    // This would require date parsing logic, which we'll skip for now
    // Return text as-is if it looks like a date
    if (text && /\d{1,2}/.test(text)) {
      return text;
    }
  }

  return undefined;
}

/**
 * Check if the current page is the order history page
 *
 * Useful for determining if we can call extractOrderHistory().
 *
 * @returns true if on order history page
 */
export function isOnOrderHistoryPage(): boolean {
  const url = window.location.href;
  return url.includes('/pt/historico-encomendas') || url.includes('/pt/order-history');
}

/**
 * Get total number of orders visible on the page
 *
 * This can be used to check if there are orders before extracting.
 *
 * @returns Number of order cards found
 */
export function getOrderCount(): number {
  const orderCards = document.querySelectorAll('.auc-orders__order-card');
  return orderCards.length;
}
