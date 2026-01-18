/**
 * Cart Diff Logic
 *
 * Pure functions for calculating differences between an original order
 * and the current cart state. Used to identify what changed when
 * rebuilding a cart from order history.
 *
 * All functions are:
 * - Pure (no side effects)
 * - Deterministic (same inputs = same outputs)
 * - Testable in isolation
 */

import type { CartItem, CartDiff, ItemAvailability } from '../../types/cart.js';
import type { OrderItem } from '../../types/orders.js';

/**
 * Result of comparing an order item with its cart counterpart
 */
interface ItemComparison {
  productId: string;
  inOriginal: boolean;
  inCart: boolean;
  originalItem?: OrderItem;
  cartItem?: CartItem;
  quantityChanged: boolean;
  priceChanged: boolean;
  isUnavailable: boolean;
}

/**
 * Creates an empty CartDiff object
 * Useful for edge cases like empty inputs
 */
function createEmptyDiff(): CartDiff {
  return {
    added: [],
    removed: [],
    quantityChanged: [],
    priceChanged: [],
    nowUnavailable: [],
    summary: {
      addedCount: 0,
      removedCount: 0,
      quantityChangedCount: 0,
      priceChangedCount: 0,
      unavailableCount: 0,
      priceDifference: 0,
    },
  };
}

/**
 * Converts an OrderItem to a CartItem representation
 * Used for representing removed items in the diff
 *
 * @param orderItem - Original order item
 * @returns CartItem representation with unavailable status
 */
function orderItemToCartItem(orderItem: OrderItem): CartItem {
  return {
    id: `removed-${orderItem.productId}`,
    productId: orderItem.productId,
    name: orderItem.name,
    price: orderItem.unitPrice,
    quantity: orderItem.quantity,
    availability: 'unknown' as ItemAvailability,
    imageUrl: orderItem.imageUrl,
    category: orderItem.category,
    fromOriginalOrder: true,
    originalQuantity: orderItem.quantity,
  };
}

/**
 * Checks if an item is considered unavailable based on availability status
 * or quantity being zero
 *
 * @param item - Cart item to check
 * @returns true if item is unavailable
 */
function isItemUnavailable(item: CartItem): boolean {
  return item.availability === 'out-of-stock' || item.quantity === 0;
}

/**
 * Compares prices with a tolerance for floating point comparison
 * Prices are considered equal if within 0.001 (sub-cent precision)
 *
 * @param price1 - First price
 * @param price2 - Second price
 * @returns true if prices are effectively different
 */
function pricesAreDifferent(price1: number, price2: number): boolean {
  const PRICE_TOLERANCE = 0.001;
  return Math.abs(price1 - price2) > PRICE_TOLERANCE;
}

/**
 * Compares an order item with its cart counterpart
 *
 * @param productId - Product ID to compare
 * @param originalMap - Map of original order items by productId
 * @param cartMap - Map of current cart items by productId
 * @returns Comparison result
 */
function compareItem(
  productId: string,
  originalMap: Map<string, OrderItem>,
  cartMap: Map<string, CartItem>
): ItemComparison {
  const originalItem = originalMap.get(productId);
  const cartItem = cartMap.get(productId);

  const inOriginal = originalItem !== undefined;
  const inCart = cartItem !== undefined;

  // Determine if quantity changed (both must exist)
  const quantityChanged =
    inOriginal && inCart && originalItem.quantity !== cartItem.quantity;

  // Determine if price changed (both must exist)
  const priceChanged =
    inOriginal && inCart && pricesAreDifferent(originalItem.unitPrice, cartItem.price);

  // Check if item is now unavailable
  const isUnavailable = inCart && isItemUnavailable(cartItem);

  return {
    productId,
    inOriginal,
    inCart,
    originalItem,
    cartItem,
    quantityChanged,
    priceChanged,
    isUnavailable,
  };
}

/**
 * Calculates the total price of an order
 *
 * @param items - Order items
 * @returns Total price
 */
function calculateOrderTotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.lineTotal, 0);
}

/**
 * Calculates the total price of a cart
 *
 * @param items - Cart items
 * @returns Total price
 */
function calculateCartTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

/**
 * Calculates the comprehensive difference between an original order
 * and the current cart state.
 *
 * This is a pure function - given the same inputs, it always produces
 * the same outputs with no side effects.
 *
 * @param originalOrder - Items from the original order
 * @param currentCart - Current cart items
 * @returns CartDiff object with all changes identified
 *
 * @example
 * ```typescript
 * const diff = calculateCartDiff(orderItems, cartItems);
 * if (diff.summary.unavailableCount > 0) {
 *   // Trigger substitution flow
 * }
 * if (diff.summary.priceDifference > 0) {
 *   // Alert user to price increase
 * }
 * ```
 */
export function calculateCartDiff(
  originalOrder: OrderItem[],
  currentCart: CartItem[]
): CartDiff {
  // Handle edge case: both empty
  if (originalOrder.length === 0 && currentCart.length === 0) {
    return createEmptyDiff();
  }

  // Build maps for O(1) lookup
  const originalMap = new Map<string, OrderItem>(
    originalOrder.map((item) => [item.productId, item])
  );
  const cartMap = new Map<string, CartItem>(
    currentCart.map((item) => [item.productId, item])
  );

  // Collect all unique product IDs from both sources
  const allProductIds = new Set<string>([
    ...Array.from(originalMap.keys()),
    ...Array.from(cartMap.keys()),
  ]);

  // Initialize diff arrays
  const added: CartItem[] = [];
  const removed: CartItem[] = [];
  const quantityChanged: CartDiff['quantityChanged'] = [];
  const priceChanged: CartDiff['priceChanged'] = [];
  const nowUnavailable: CartItem[] = [];

  // Compare each product
  for (const productId of Array.from(allProductIds)) {
    const comparison = compareItem(productId, originalMap, cartMap);

    // Item added (in cart but not in original)
    if (!comparison.inOriginal && comparison.inCart && comparison.cartItem) {
      added.push(comparison.cartItem);
      continue;
    }

    // Item removed (in original but not in cart)
    if (comparison.inOriginal && !comparison.inCart && comparison.originalItem) {
      removed.push(orderItemToCartItem(comparison.originalItem));
      continue;
    }

    // Item exists in both - check for changes
    if (comparison.inOriginal && comparison.inCart) {
      const { originalItem, cartItem } = comparison;

      // Check unavailability first (takes precedence)
      if (comparison.isUnavailable && cartItem) {
        nowUnavailable.push(cartItem);
        // Still track price/quantity changes for unavailable items
      }

      // Track quantity changes
      if (comparison.quantityChanged && cartItem && originalItem) {
        quantityChanged.push({
          item: cartItem,
          originalQuantity: originalItem.quantity,
          newQuantity: cartItem.quantity,
        });
      }

      // Track price changes
      if (comparison.priceChanged && cartItem && originalItem) {
        priceChanged.push({
          item: cartItem,
          originalPrice: originalItem.unitPrice,
          newPrice: cartItem.price,
        });
      }
    }
  }

  // Calculate price difference
  const originalTotal = calculateOrderTotal(originalOrder);
  const cartTotal = calculateCartTotal(currentCart);
  const priceDifference = cartTotal - originalTotal;

  return {
    added,
    removed,
    quantityChanged,
    priceChanged,
    nowUnavailable,
    summary: {
      addedCount: added.length,
      removedCount: removed.length,
      quantityChangedCount: quantityChanged.length,
      priceChangedCount: priceChanged.length,
      unavailableCount: nowUnavailable.length,
      priceDifference: Math.round(priceDifference * 100) / 100, // Round to cents
    },
  };
}

/**
 * Checks if the cart has any significant changes from the original order
 *
 * @param diff - CartDiff to evaluate
 * @returns true if there are any changes
 */
export function hasChanges(diff: CartDiff): boolean {
  return (
    diff.summary.addedCount > 0 ||
    diff.summary.removedCount > 0 ||
    diff.summary.quantityChangedCount > 0 ||
    diff.summary.priceChangedCount > 0 ||
    diff.summary.unavailableCount > 0
  );
}

/**
 * Checks if the cart requires user attention due to critical changes
 * Critical changes are: unavailable items, removals, or significant price increases
 *
 * @param diff - CartDiff to evaluate
 * @param priceThreshold - Price increase threshold to flag (default: 5.00)
 * @returns true if user attention is required
 */
export function requiresUserAttention(
  diff: CartDiff,
  priceThreshold: number = 5.0
): boolean {
  return (
    diff.summary.unavailableCount > 0 ||
    diff.summary.removedCount > 0 ||
    diff.summary.priceDifference > priceThreshold
  );
}

/**
 * Filters the diff to only include items that need substitution
 * (unavailable items from the original order)
 *
 * @param diff - CartDiff to filter
 * @returns Array of unavailable items that need substitutes
 */
export function getItemsNeedingSubstitution(diff: CartDiff): CartItem[] {
  return diff.nowUnavailable.filter((item) => item.fromOriginalOrder !== false);
}

/**
 * Calculates the percentage of original order items that are available
 *
 * @param originalOrder - Original order items
 * @param diff - Calculated cart diff
 * @returns Availability percentage (0-100)
 */
export function calculateAvailabilityPercentage(
  originalOrder: OrderItem[],
  diff: CartDiff
): number {
  if (originalOrder.length === 0) {
    return 100;
  }

  const unavailableFromOriginal = diff.nowUnavailable.filter(
    (item) => item.fromOriginalOrder
  ).length;
  const availableCount = originalOrder.length - unavailableFromOriginal - diff.summary.removedCount;

  return Math.round((availableCount / originalOrder.length) * 100);
}

/**
 * Generates a human-readable summary of the cart diff
 *
 * @param diff - CartDiff to summarize
 * @returns Summary string for display
 */
export function generateDiffSummary(diff: CartDiff): string {
  const parts: string[] = [];

  if (diff.summary.addedCount > 0) {
    parts.push(`${diff.summary.addedCount} item(s) added`);
  }
  if (diff.summary.removedCount > 0) {
    parts.push(`${diff.summary.removedCount} item(s) removed`);
  }
  if (diff.summary.quantityChangedCount > 0) {
    parts.push(`${diff.summary.quantityChangedCount} quantity change(s)`);
  }
  if (diff.summary.priceChangedCount > 0) {
    parts.push(`${diff.summary.priceChangedCount} price change(s)`);
  }
  if (diff.summary.unavailableCount > 0) {
    parts.push(`${diff.summary.unavailableCount} unavailable`);
  }

  if (parts.length === 0) {
    return 'No changes detected';
  }

  const pricePart =
    diff.summary.priceDifference !== 0
      ? ` (${diff.summary.priceDifference > 0 ? '+' : ''}${diff.summary.priceDifference.toFixed(2)} total)`
      : '';

  return parts.join(', ') + pricePart;
}
