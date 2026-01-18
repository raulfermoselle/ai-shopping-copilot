/**
 * DOM Extractor Port
 *
 * Abstracts DOM extraction operations performed by content scripts.
 * This port is called by core logic and routed to content scripts via messaging.
 */

import type { CartItem, ProductInfo } from '../types/cart.js';
import type { OrderSummary, OrderDetail } from '../types/orders.js';
import type { DeliverySlot } from '../types/slots.js';

/**
 * Extraction result wrapper
 */
export interface ExtractionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  /** Time taken for extraction in ms */
  timing?: number;
}

/**
 * Page detection result
 */
export interface PageInfo {
  /** Detected page type */
  pageType: AuchanPageType | 'unknown';
  /** Current URL */
  url: string;
  /** Whether user is logged in */
  isLoggedIn: boolean;
  /** Logged-in user name (if available) */
  userName?: string;
}

/**
 * Auchan.pt page types
 */
export type AuchanPageType =
  | 'home'
  | 'login'
  | 'order-history'
  | 'order-detail'
  | 'cart'
  | 'search'
  | 'product'
  | 'delivery-slots'
  | 'checkout';

/**
 * IDOMExtractorPort - Interface for DOM extraction operations
 *
 * These operations are implemented by content scripts and called
 * through the messaging adapter. The port abstraction allows:
 * - Type-safe extraction requests from core logic
 * - Testing without actual DOM
 * - Clear interface for content script implementation
 */
export interface IDOMExtractorPort {
  /**
   * Detect current page type and login state
   * @returns Page information
   */
  detectPage(): Promise<ExtractionResult<PageInfo>>;

  /**
   * Extract cart items from cart page
   * @param options - Extraction options
   * @returns Array of cart items
   */
  extractCartItems(options?: {
    includeOutOfStock?: boolean;
  }): Promise<ExtractionResult<CartItem[]>>;

  /**
   * Extract order history list
   * @param options - Extraction options
   * @returns Array of order summaries
   */
  extractOrderHistory(options?: {
    limit?: number;
  }): Promise<ExtractionResult<OrderSummary[]>>;

  /**
   * Extract order detail items
   * @param orderId - Order ID to extract
   * @returns Order detail with items
   */
  extractOrderDetail(
    orderId: string
  ): Promise<ExtractionResult<OrderDetail>>;

  /**
   * Extract search results
   * @param query - Search query (for validation)
   * @returns Array of products found
   */
  extractSearchResults(
    query: string
  ): Promise<ExtractionResult<ProductInfo[]>>;

  /**
   * Extract product information from product page
   * @returns Product details
   */
  extractProductInfo(): Promise<ExtractionResult<ProductInfo>>;

  /**
   * Extract delivery slots
   * @returns Array of available slots
   */
  extractDeliverySlots(): Promise<ExtractionResult<DeliverySlot[]>>;

  /**
   * Click "Reorder" button on an order
   * @param orderId - Order ID to reorder
   * @param mode - Merge mode (replace or add)
   * @returns Success status
   */
  clickReorder(
    orderId: string,
    mode: 'replace' | 'add'
  ): Promise<ExtractionResult<{ clicked: boolean }>>;

  /**
   * Add product to cart
   * @param productId - Product ID to add
   * @param quantity - Quantity to add
   * @returns Success status
   */
  addToCart(
    productId: string,
    quantity: number
  ): Promise<ExtractionResult<{ added: boolean }>>;

  /**
   * Update item quantity in cart
   * @param itemId - Cart item ID
   * @param quantity - New quantity (0 removes)
   * @returns Success status
   */
  updateCartQuantity(
    itemId: string,
    quantity: number
  ): Promise<ExtractionResult<{ updated: boolean }>>;

  /**
   * Wait for page to be ready for extraction
   * @param pageType - Expected page type
   * @param timeoutMs - Maximum wait time
   * @returns Whether page is ready
   */
  waitForPageReady(
    pageType: AuchanPageType,
    timeoutMs?: number
  ): Promise<ExtractionResult<{ ready: boolean }>>;
}

/**
 * Selector keys used by extractors
 *
 * These map to the selector registry in data/selectors/
 */
export const EXTRACTOR_SELECTORS = {
  // Login detection
  LOGIN_USER_NAME: 'header.userName',
  LOGIN_BUTTON: 'header.loginButton',

  // Cart page
  CART_ITEMS: 'cart.items',
  CART_ITEM_NAME: 'cart.itemName',
  CART_ITEM_PRICE: 'cart.itemPrice',
  CART_ITEM_QUANTITY: 'cart.itemQuantity',
  CART_TOTAL: 'cart.total',

  // Order history
  ORDER_CARDS: 'orders.cards',
  ORDER_ID: 'orders.orderId',
  ORDER_DATE: 'orders.date',
  ORDER_TOTAL: 'orders.total',

  // Search results
  SEARCH_RESULTS: 'search.results',
  PRODUCT_NAME: 'search.productName',
  PRODUCT_PRICE: 'search.productPrice',
  PRODUCT_AVAILABILITY: 'search.availability',

  // Delivery slots
  SLOT_DAYS: 'slots.days',
  SLOT_TIMES: 'slots.times',
  SLOT_PRICE: 'slots.price',
  SLOT_AVAILABLE: 'slots.available',
} as const;
