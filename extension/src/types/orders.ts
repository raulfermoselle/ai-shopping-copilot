/**
 * Order Types
 *
 * Types for order history and order details.
 */

import type { CartItem } from './cart.js';

/**
 * Order summary from order history list
 */
export interface OrderSummary {
  /** Order ID (display number, e.g., "002915480") */
  orderId: string;
  /** Detail page URL with UUID (e.g., "/pt/detalhes-encomenda?orderID=...") */
  detailUrl?: string;
  /** Order date */
  date: string;
  /** Order date as timestamp */
  timestamp: number;
  /** Order total */
  total: number;
  /** Number of items */
  itemCount: number;
  /** Order status */
  status: OrderStatus;
  /** Delivery address summary */
  deliveryAddress?: string;
  /** Delivery date (if delivered) */
  deliveryDate?: string;
}

/**
 * Order status
 */
export type OrderStatus =
  | 'pending'       // Order placed, not yet processed
  | 'processing'    // Being prepared
  | 'ready'         // Ready for delivery/pickup
  | 'delivering'    // Out for delivery
  | 'delivered'     // Successfully delivered
  | 'cancelled'     // Order cancelled
  | 'unknown';      // Could not determine

/**
 * Detailed order with items
 */
export interface OrderDetail {
  /** Order summary info */
  summary: OrderSummary;
  /** Items in the order */
  items: OrderItem[];
  /** Subtotal before fees */
  subtotal: number;
  /** Delivery fee paid */
  deliveryFee: number;
  /** Any discounts applied */
  discounts: number;
  /** Final total */
  total: number;
  /** Payment method used */
  paymentMethod?: string;
  /** Delivery slot used */
  deliverySlot?: {
    date: string;
    timeStart: string;
    timeEnd: string;
  };
}

/**
 * Item within an order
 */
export interface OrderItem {
  /** Product ID */
  productId: string;
  /** Product name */
  name: string;
  /** Unit price at time of order */
  unitPrice: number;
  /** Quantity ordered */
  quantity: number;
  /** Total for this line */
  lineTotal: number;
  /** Whether item was substituted */
  wasSubstituted?: boolean;
  /** Original item (if substituted) */
  originalItem?: {
    productId: string;
    name: string;
  };
  /** Product image */
  imageUrl?: string;
  /** Category */
  category?: string;
}

/**
 * Order selection for reorder
 */
export interface OrderSelection {
  /** Selected order ID */
  orderId: string;
  /** Order summary */
  summary: OrderSummary;
  /** Selection reason */
  reason: 'user-selected' | 'most-recent' | 'most-frequent';
}

/**
 * Reorder modal options
 */
export type ReorderMode =
  | 'replace'  // Replace current cart with order items
  | 'add';     // Add order items to existing cart
