/**
 * Cart Scanner Extractor
 *
 * Extracts cart items and summary from Auchan.pt cart page DOM.
 * Runs in content script context with direct DOM access.
 *
 * Uses selectors from data/selectors/pages/cart/v1.json
 *
 * CRITICAL: Uses bulk DOM extraction pattern for performance.
 * No Playwright locators - pure JavaScript DOM traversal.
 */

import type { CartItem, ItemAvailability, CartSummary } from '../../types/cart.js';

/**
 * Result from cart extraction
 */
export interface CartExtractionResult {
  /** Extracted cart items */
  items: CartItem[];
  /** Cart summary with totals */
  summary: CartSummary;
  /** Whether cart is empty */
  isEmpty: boolean;
  /** URL where extraction occurred */
  url: string;
}

/**
 * Options for cart extraction
 */
export interface CartExtractionOptions {
  /** Include out-of-stock items in results (default: true) */
  includeOutOfStock?: boolean;
  /** Verbose logging to console (default: false) */
  verbose?: boolean;
}

/**
 * Extract cart items and summary from cart page
 *
 * This function runs in the content script context and has direct access to the DOM.
 * It extracts all cart items with full CartItem data including availability status.
 *
 * Selector Strategy (from cart/v1.json):
 * - Product list: .auc-cart__product-list
 * - Cart items: .auc-cart__product-cards > div
 * - Product title: .auc-cart__product-title
 * - Quantity: input[name*='quantity']
 * - Price: .auc-cart--price
 * - Unavailable: .auc-unavailable-name
 * - Totals card: .auc-cart__totals-card
 * - Header total: .auc-header-cart-total
 *
 * @param options Extraction options
 * @returns CartExtractionResult with items and summary
 */
export function extractCartItems(
  options: CartExtractionOptions = {}
): CartExtractionResult {
  const { includeOutOfStock = true, verbose = false } = options;
  const url = window.location.href;

  const log = (message: string, ...args: unknown[]) => {
    if (verbose) {
      console.log(`[CartScanner] ${message}`, ...args);
    }
  };

  log('Starting cart extraction');

  // Check if cart is empty
  const emptyIndicator = document.querySelector('.auc-cart--empty');
  if (emptyIndicator) {
    log('Cart is empty');
    return {
      items: [],
      summary: {
        itemCount: 0,
        uniqueProducts: 0,
        subtotal: 0,
        total: 0,
        unavailableCount: 0,
      },
      isEmpty: true,
      url,
    };
  }

  // Extract cart items using bulk DOM extraction
  const items: CartItem[] = [];
  const productCards = Array.from(document.querySelectorAll('.auc-cart__product-cards > div'));

  log(`Found ${productCards.length} product cards`);

  for (let i = 0; i < productCards.length; i++) {
    const card = productCards[i];

    // Extract availability first
    const availability = detectAvailability(card);

    // Skip out-of-stock if not requested
    if (!includeOutOfStock && availability === 'out-of-stock') {
      log('Skipping out-of-stock item');
      continue;
    }

    // Extract product ID from remove button data-pid attribute
    const removeButton = card.querySelector('.auc-cart__remove-product');
    const productId = removeButton?.getAttribute('data-pid') || '';
    const productUuid = removeButton?.getAttribute('data-uuid') || '';

    // Use UUID as item ID, fallback to product ID
    const id = productUuid || productId || `item-${i}`;

    // Extract product link for additional data
    // Note: .auc-cart__product-title can be both the link AND the div inside
    // We need the <a> tag to get the href
    const productLink = card.querySelector('a.auc-cart__product-title') as HTMLAnchorElement | null;
    const productUrl = productLink?.href || '';

    // Extract product name from the link or title div
    const titleElement = card.querySelector('.auc-cart__product-title');
    const name = titleElement?.textContent?.trim() || '';

    // Extract quantity
    const quantityInput = card.querySelector('input[name*="quantity"]') as HTMLInputElement | null;
    const quantity = quantityInput?.value ? parseInt(quantityInput.value, 10) : 1;

    // Extract price (this is the line total: unit price × quantity)
    const priceElement = card.querySelector('.auc-cart--price');
    const priceText = priceElement?.textContent?.trim() || '0 €';
    const lineTotal = parseCurrency(priceText);

    // Calculate unit price from line total
    const price = quantity > 0 ? lineTotal / quantity : 0;

    // Extract price per unit (e.g., €/kg)
    const pricePerUnitElement = card.querySelector('.auc-measures--price-per-unit');
    const pricePerUnitText = pricePerUnitElement?.textContent?.trim();
    const pricePerUnit = pricePerUnitText ? parseCurrency(pricePerUnitText) : undefined;

    // Extract unit from price per unit text (e.g., "5.89 €/Kg" → "Kg")
    const unit = extractUnit(pricePerUnitText);

    // Extract image URL
    const imageElement = card.querySelector('.auc-cart__product-image') as HTMLImageElement | null;
    const imageUrl = imageElement?.src;

    // Extract category and brand from product URL if available
    const category = extractCategoryFromUrl(productUrl);
    const brand = extractBrandFromProductName(name);

    const item: CartItem = {
      id,
      productId,
      name,
      price,
      quantity,
      availability,
      imageUrl,
      category,
      brand,
      unit,
      pricePerUnit,
    };

    items.push(item);
    log(`Extracted item: ${name} (${availability})`);
  }

  // Extract cart summary
  const summary = extractCartSummary(items);

  log('Extraction complete', {
    itemCount: items.length,
    unavailableCount: summary.unavailableCount,
    total: summary.total,
  });

  return {
    items,
    summary,
    isEmpty: items.length === 0,
    url,
  };
}

/**
 * Detect item availability from DOM indicators
 *
 * Checks for Auchan's unavailability classes:
 * - .auc-unavailable-name (applied to product title)
 * - .auc-unavailable-image (applied to image wrapper)
 * - .auc-unavailable-text (contains "Produto indisponível")
 *
 * @param card Product card element
 * @returns ItemAvailability status
 */
function detectAvailability(card: Element): ItemAvailability {
  // Check for unavailable indicators
  const unavailableName = card.querySelector('.auc-unavailable-name');
  const unavailableImage = card.querySelector('.auc-unavailable-image');
  const unavailableText = card.querySelector('.auc-unavailable-text');

  if (unavailableName || unavailableImage || unavailableText) {
    return 'out-of-stock';
  }

  // Check for low stock indicator (if Auchan adds it in the future)
  const lowStockIndicator = card.querySelector('.low-stock, [data-stock="low"]');
  if (lowStockIndicator) {
    return 'low-stock';
  }

  // Default to available
  return 'available';
}

/**
 * Extract cart summary from DOM
 *
 * Extracts totals from cart totals card and header.
 * Falls back to calculating from items if totals not found.
 *
 * @param items Extracted cart items
 * @returns CartSummary with totals
 */
function extractCartSummary(items: CartItem[]): CartSummary {
  // Calculate from items
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const uniqueProducts = items.length;
  const unavailableCount = items.filter((item) => item.availability === 'out-of-stock').length;

  // Calculate subtotal from available items
  const subtotal = items.reduce((sum, item) => {
    if (item.availability === 'out-of-stock') {
      return sum; // Don't include unavailable items in subtotal
    }
    return sum + item.price * item.quantity;
  }, 0);

  // Try to extract total from header (most reliable)
  let total = 0;
  const headerTotal = document.querySelector('.auc-header-cart-total');
  if (headerTotal) {
    const headerTotalText = headerTotal.textContent?.trim() || '';
    total = parseCurrency(headerTotalText);
  }

  // Fallback: Try to extract from totals card
  if (total === 0) {
    const totalsCard = document.querySelector('.auc-cart__totals-card');
    if (totalsCard) {
      // Look for total amount (usually in second section)
      const totalElements = totalsCard.querySelectorAll('[class*="total"]');
      for (const element of totalElements) {
        const text = element.textContent?.trim() || '';
        if (text.includes('€')) {
          const amount = parseCurrency(text);
          if (amount > total) {
            total = amount; // Take the highest value (likely the grand total)
          }
        }
      }
    }
  }

  // Fallback: Use subtotal if no total found
  if (total === 0) {
    total = subtotal;
  }

  // Try to extract delivery fee (total - subtotal)
  let deliveryFee: number | undefined;
  if (total > subtotal) {
    deliveryFee = total - subtotal;
  }

  return {
    itemCount,
    uniqueProducts,
    subtotal,
    deliveryFee,
    total,
    unavailableCount,
  };
}

/**
 * Parse currency from Auchan format "1,39 €" or "162,51 €" → number
 *
 * Handles:
 * - Spaces around value
 * - Comma as decimal separator
 * - € symbol
 *
 * @param text Currency text to parse
 * @returns Parsed number value
 */
function parseCurrency(text: string): number {
  // Remove whitespace, replace comma with dot, remove € symbol
  const cleaned = text.replace(/\s/g, '').replace('€', '').replace(',', '.');
  const value = parseFloat(cleaned);
  return isNaN(value) ? 0 : value;
}

/**
 * Extract unit from price per unit text
 *
 * Examples:
 * - "5.89 €/Kg" → "Kg"
 * - "2.99 €/L" → "L"
 * - "0.50 €/un" → "un"
 *
 * @param text Price per unit text
 * @returns Unit string or undefined
 */
function extractUnit(text: string | undefined): string | undefined {
  if (!text) return undefined;

  const match = text.match(/€\/([\w]+)/i);
  return match ? match[1] : undefined;
}

/**
 * Extract category from product URL
 *
 * Auchan product URLs follow pattern:
 * https://www.auchan.pt/pt/{category}/{subcategory}/p/{product-id}
 *
 * Example:
 * https://www.auchan.pt/pt/alimentacao/lacticinios-e-ovos/p/123456
 * → "lacticinios-e-ovos"
 *
 * @param url Product URL
 * @returns Category name or undefined
 */
function extractCategoryFromUrl(url: string): string | undefined {
  if (!url) return undefined;

  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);

    // Look for pattern: /pt/{category}/{subcategory}/p/{id}
    // We want the subcategory (more specific)
    const pIndex = pathParts.indexOf('p');
    if (pIndex > 1) {
      return pathParts[pIndex - 1]; // Return subcategory before /p/
    }

    // Fallback: return last path segment before /p/
    if (pIndex > 0) {
      return pathParts[pIndex - 1];
    }
  } catch {
    // Invalid URL, ignore
  }

  return undefined;
}

/**
 * Extract brand from product name
 *
 * Simple heuristic: capitalize first word if it looks like a brand.
 * This is a best-effort extraction; proper brand data should come from product API.
 *
 * Examples:
 * - "Mimosa Leite Magro 1L" → "Mimosa"
 * - "ADEGA MAYOR Vinho Tinto" → "ADEGA MAYOR"
 *
 * @param name Product name
 * @returns Brand name or undefined
 */
function extractBrandFromProductName(name: string): string | undefined {
  if (!name) return undefined;

  const words = name.trim().split(/\s+/);
  if (words.length === 0) return undefined;

  // If first word is all caps or capitalized, likely a brand
  const firstWord = words[0];
  if (firstWord.length > 2 && /^[A-Z]/.test(firstWord)) {
    return firstWord;
  }

  return undefined;
}

/**
 * Check if user is on cart page
 *
 * @returns true if on Auchan cart page
 */
export function isOnCartPage(): boolean {
  const url = window.location.href;
  return url.includes('carrinho-compras') || url.includes('/cart');
}

/**
 * Check if cart has items
 *
 * Quick check without full extraction.
 * Useful for determining if extraction is needed.
 *
 * @returns true if cart has items (not empty)
 */
export function hasCartItems(): boolean {
  // Check for empty cart indicator
  const emptyIndicator = document.querySelector('.auc-cart--empty');
  if (emptyIndicator) return false;

  // Check for product cards
  const productCards = document.querySelectorAll('.auc-cart__product-cards > div');
  return productCards.length > 0;
}
