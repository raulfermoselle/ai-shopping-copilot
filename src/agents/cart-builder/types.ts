/**
 * CartBuilder Agent Types
 *
 * Data models for order history, cart items, and diff reporting.
 * Based on Auchan.pt order history research (Sprint-CB-R-001).
 */

import { z } from 'zod';

// =============================================================================
// Order History Types
// =============================================================================

/**
 * Order summary from the order history list page.
 * Contains minimal info visible in the list view.
 */
export const OrderSummarySchema = z.object({
  /** Unique order identifier from Auchan */
  orderId: z.string().min(1),
  /** Order date (from data-date attribute) */
  date: z.coerce.date(),
  /** Number of products in order */
  productCount: z.number().int().positive(),
  /** Total order price in EUR */
  totalPrice: z.number().nonnegative(),
  /** URL to order detail page */
  detailUrl: z.string().url(),
});

export type OrderSummary = z.infer<typeof OrderSummarySchema>;

/**
 * Delivery information from order detail page.
 */
export const DeliveryInfoSchema = z.object({
  /** Delivery type (e.g., "Entrega em Casa") */
  type: z.string(),
  /** Delivery address */
  address: z.string(),
  /** Scheduled delivery date/time window */
  dateTime: z.string(),
});

export type DeliveryInfo = z.infer<typeof DeliveryInfoSchema>;

/**
 * Individual product/item from an order.
 */
export const OrderItemSchema = z.object({
  /** Product ID (extracted from product URL if available) */
  productId: z.string().optional(),
  /** Product name */
  name: z.string().min(1),
  /** URL to product page */
  productUrl: z.string().url().optional(),
  /** Product image URL */
  imageUrl: z.string().url().optional(),
  /** Quantity ordered (parsed from "x2" format) */
  quantity: z.number().int().positive(),
  /** Unit price in EUR */
  unitPrice: z.number().nonnegative(),
  /** Total price (quantity * unitPrice) */
  totalPrice: z.number().nonnegative(),
});

export type OrderItem = z.infer<typeof OrderItemSchema>;

/**
 * Order cost breakdown from summary section.
 */
export const OrderCostSummarySchema = z.object({
  /** Products subtotal */
  subtotal: z.number().nonnegative(),
  /** Delivery fee */
  deliveryFee: z.number().nonnegative(),
  /** Final total */
  total: z.number().nonnegative(),
});

export type OrderCostSummary = z.infer<typeof OrderCostSummarySchema>;

/**
 * Full order detail with all items.
 * Retrieved by navigating to order detail page.
 */
export const OrderDetailSchema = OrderSummarySchema.extend({
  /** All items in the order */
  items: z.array(OrderItemSchema),
  /** Delivery information */
  delivery: DeliveryInfoSchema,
  /** Cost breakdown */
  costSummary: OrderCostSummarySchema,
});

export type OrderDetail = z.infer<typeof OrderDetailSchema>;

// =============================================================================
// Cart Types
// =============================================================================

/**
 * Item currently in the cart.
 * May differ from OrderItem as it reflects live cart state.
 */
export const CartItemSchema = z.object({
  /** Product ID */
  productId: z.string().optional(),
  /** Product name */
  name: z.string().min(1),
  /** Product URL */
  productUrl: z.string().url().optional(),
  /** Quantity in cart */
  quantity: z.number().int().positive(),
  /** Current unit price */
  unitPrice: z.number().nonnegative(),
  /** Whether item is available */
  available: z.boolean(),
  /** Availability note if not available */
  availabilityNote: z.string().optional(),
});

export type CartItem = z.infer<typeof CartItemSchema>;

/**
 * Snapshot of cart state at a point in time.
 */
export const CartSnapshotSchema = z.object({
  /** When this snapshot was taken */
  timestamp: z.coerce.date(),
  /** Items in cart */
  items: z.array(CartItemSchema),
  /** Total number of items */
  itemCount: z.number().int().nonnegative(),
  /** Total price */
  totalPrice: z.number().nonnegative(),
});

export type CartSnapshot = z.infer<typeof CartSnapshotSchema>;

// =============================================================================
// Cart Diff Types
// =============================================================================

/**
 * Item in diff report (added, removed, or unchanged).
 */
export const CartDiffItemSchema = z.object({
  /** Product name */
  name: z.string(),
  /** Quantity */
  quantity: z.number().int().positive(),
  /** Unit price */
  unitPrice: z.number().nonnegative(),
  /** Source order ID(s) this item came from */
  sourceOrders: z.array(z.string()).optional(),
});

export type CartDiffItem = z.infer<typeof CartDiffItemSchema>;

/**
 * Item with quantity change.
 */
export const CartDiffQuantityChangeSchema = z.object({
  /** Product name */
  name: z.string(),
  /** Previous quantity */
  previousQuantity: z.number().int().nonnegative(),
  /** New quantity */
  newQuantity: z.number().int().positive(),
  /** Unit price */
  unitPrice: z.number().nonnegative(),
  /** Reason for change (if known) */
  reason: z.string().optional(),
});

export type CartDiffQuantityChange = z.infer<typeof CartDiffQuantityChangeSchema>;

/**
 * Summary statistics for cart diff.
 */
export const CartDiffSummarySchema = z.object({
  /** Number of items added */
  addedCount: z.number().int().nonnegative(),
  /** Number of items removed */
  removedCount: z.number().int().nonnegative(),
  /** Number of items with quantity changes */
  changedCount: z.number().int().nonnegative(),
  /** Number of unchanged items */
  unchangedCount: z.number().int().nonnegative(),
  /** Total items in new cart */
  totalItems: z.number().int().nonnegative(),
  /** Price difference (positive = more expensive) */
  priceDifference: z.number(),
  /** New total price */
  newTotalPrice: z.number().nonnegative(),
});

export type CartDiffSummary = z.infer<typeof CartDiffSummarySchema>;

/**
 * Complete cart diff between before and after states.
 */
export const CartDiffSchema = z.object({
  /** Items added to cart */
  added: z.array(CartDiffItemSchema),
  /** Items removed from cart */
  removed: z.array(CartDiffItemSchema),
  /** Items with quantity changes */
  quantityChanged: z.array(CartDiffQuantityChangeSchema),
  /** Items unchanged */
  unchanged: z.array(CartDiffItemSchema),
  /** Summary statistics */
  summary: CartDiffSummarySchema,
});

export type CartDiff = z.infer<typeof CartDiffSchema>;

// =============================================================================
// CartBuilder Output Types
// =============================================================================

/**
 * Warning generated during cart building.
 */
export const CartBuilderWarningSchema = z.object({
  /** Warning type */
  type: z.enum([
    'item_unavailable',
    'price_changed',
    'quantity_adjusted',
    'order_load_partial',
    'reorder_failed',
  ]),
  /** Warning message */
  message: z.string(),
  /** Related item name (if applicable) */
  itemName: z.string().optional(),
  /** Related order ID (if applicable) */
  orderId: z.string().optional(),
});

export type CartBuilderWarning = z.infer<typeof CartBuilderWarningSchema>;

/**
 * Complete cart diff report for Coordinator consumption.
 */
export const CartDiffReportSchema = z.object({
  /** When report was generated */
  timestamp: z.coerce.date(),
  /** Session identifier */
  sessionId: z.string(),
  /** Orders that were analyzed */
  ordersAnalyzed: z.array(z.string()),
  /** Cart state before and after */
  cart: z.object({
    before: CartSnapshotSchema,
    after: CartSnapshotSchema,
  }),
  /** Diff between cart states */
  diff: CartDiffSchema,
  /** Confidence score (0-1) in the cart state */
  confidence: z.number().min(0).max(1),
  /** Any warnings generated */
  warnings: z.array(CartBuilderWarningSchema),
  /** Screenshots captured during process */
  screenshots: z.array(z.string()),
});

export type CartDiffReport = z.infer<typeof CartDiffReportSchema>;

// =============================================================================
// CartBuilder Config Types
// =============================================================================

/**
 * Strategy for merging multiple orders into cart.
 */
export const MergeStrategySchema = z.enum([
  /** Use items from the most recent order only */
  'latest',
  /** Combine items from all orders, sum quantities */
  'combined',
  /** Use most frequently ordered items across orders */
  'most-frequent',
]);

export type MergeStrategy = z.infer<typeof MergeStrategySchema>;

/**
 * CartBuilder configuration.
 */
export const CartBuilderConfigSchema = z.object({
  /** Maximum number of orders to load from history */
  maxOrdersToLoad: z.number().int().positive().default(3),
  /** Whether to include favorites in cart building */
  includeFavorites: z.boolean().default(false),
  /** Strategy for merging multiple orders */
  mergeStrategy: MergeStrategySchema.default('latest'),
  /** Whether to clear existing cart before loading */
  clearExistingCart: z.boolean().default(false),
});

export type CartBuilderConfig = z.infer<typeof CartBuilderConfigSchema>;
