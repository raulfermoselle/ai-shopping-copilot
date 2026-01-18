/**
 * Cart Types
 *
 * Types for cart items, products, and cart operations.
 */

/**
 * Cart item from the shopping cart
 */
export interface CartItem {
  /** Unique item ID in cart */
  id: string;
  /** Product ID (SKU) */
  productId: string;
  /** Product name */
  name: string;
  /** Current unit price */
  price: number;
  /** Quantity in cart */
  quantity: number;
  /** Availability status */
  availability: ItemAvailability;
  /** Product image URL */
  imageUrl?: string;
  /** Product category */
  category?: string;
  /** Brand name */
  brand?: string;
  /** Unit (kg, l, unit, etc.) */
  unit?: string;
  /** Price per unit (e.g., €/kg) */
  pricePerUnit?: number;
  /** Whether item was in original order */
  fromOriginalOrder?: boolean;
  /** Original quantity (if changed) */
  originalQuantity?: number;
}

/**
 * Item availability status
 */
export type ItemAvailability =
  | 'available'        // In stock
  | 'low-stock'        // Limited availability
  | 'out-of-stock'     // Not available
  | 'unknown';         // Could not determine

/**
 * Product information from search or product page
 */
export interface ProductInfo {
  /** Product ID (SKU) */
  productId: string;
  /** Product name */
  name: string;
  /** Current price */
  price: number;
  /** Availability */
  availability: ItemAvailability;
  /** Product URL */
  url?: string;
  /** Image URL */
  imageUrl?: string;
  /** Category path */
  categoryPath?: string[];
  /** Brand */
  brand?: string;
  /** Unit */
  unit?: string;
  /** Price per unit */
  pricePerUnit?: number;
  /** Average rating (1-5) */
  rating?: number;
  /** Number of reviews */
  reviewCount?: number;
  /** Whether product is on promotion */
  onPromotion?: boolean;
  /** Original price (if on promotion) */
  originalPrice?: number;
}

/**
 * Cart summary
 */
export interface CartSummary {
  /** Total number of items */
  itemCount: number;
  /** Total number of unique products */
  uniqueProducts: number;
  /** Subtotal before delivery */
  subtotal: number;
  /** Estimated delivery fee */
  deliveryFee?: number;
  /** Total including delivery */
  total: number;
  /** Number of unavailable items */
  unavailableCount: number;
}

/**
 * Cart diff between original order and current cart
 */
export interface CartDiff {
  /** Items added (not in original) */
  added: CartItem[];
  /** Items removed (in original but not cart) */
  removed: CartItem[];
  /** Items with changed quantity */
  quantityChanged: Array<{
    item: CartItem;
    originalQuantity: number;
    newQuantity: number;
  }>;
  /** Items with price change */
  priceChanged: Array<{
    item: CartItem;
    originalPrice: number;
    newPrice: number;
  }>;
  /** Items now unavailable */
  nowUnavailable: CartItem[];
  /** Summary of changes */
  summary: {
    addedCount: number;
    removedCount: number;
    quantityChangedCount: number;
    priceChangedCount: number;
    unavailableCount: number;
    priceDifference: number;
  };
}

/**
 * Substitution proposal for unavailable item
 */
export interface SubstitutionProposal {
  /** Original unavailable item */
  originalItem: CartItem;
  /** Proposed substitute */
  substitute: ProductInfo;
  /** Similarity score (0-1) */
  score: number;
  /** Scoring breakdown */
  scoreBreakdown: {
    priceScore: number;
    brandScore: number;
    categoryScore: number;
    ratingScore: number;
  };
  /** Reason for recommendation */
  reason: string;
  /** LLM-generated explanation (if available) */
  llmExplanation?: string;
  /** User action */
  userAction?: 'accept' | 'reject' | 'pending';
}
