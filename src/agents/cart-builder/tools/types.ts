/**
 * CartBuilder Tool Type Definitions
 *
 * Input/output types for CartBuilder tools.
 * These define the contract for tool implementations in Sprint-CB-I-001.
 */

import { z } from 'zod';
import type { Tool, ToolResult } from '../../../types/tool.js';
import type { OrderSummary, OrderDetail, CartSnapshot, OrderItem } from '../types.js';

// =============================================================================
// LoadOrderHistoryTool
// =============================================================================

/**
 * Input for LoadOrderHistoryTool.
 */
export const LoadOrderHistoryInputSchema = z.object({
  /** Maximum number of orders to load (default: 10) */
  maxOrders: z.number().int().positive().default(10),
  /** Whether to include delivery info */
  includeDeliveryInfo: z.boolean().default(false),
});

export type LoadOrderHistoryInput = z.input<typeof LoadOrderHistoryInputSchema>;

/**
 * Output from LoadOrderHistoryTool.
 */
export interface LoadOrderHistoryOutput {
  /** Orders found in history */
  orders: OrderSummary[];
  /** Total orders available (may be more than loaded) */
  totalAvailable: number;
  /** Whether there are more orders to load */
  hasMore: boolean;
}

/**
 * LoadOrderHistoryTool interface.
 * Navigates to order history and extracts order list.
 */
export type LoadOrderHistoryTool = Tool<LoadOrderHistoryInput, LoadOrderHistoryOutput>;

// =============================================================================
// LoadOrderDetailTool
// =============================================================================

/**
 * Input for LoadOrderDetailTool.
 */
export const LoadOrderDetailInputSchema = z.object({
  /** Order ID to load details for */
  orderId: z.string().min(1),
  /** Order detail URL (from order history) */
  detailUrl: z.string().url(),
  /** Whether to expand all products (click "Ver todos") */
  expandAllProducts: z.boolean().default(true),
});

export type LoadOrderDetailInput = z.input<typeof LoadOrderDetailInputSchema>;

/**
 * Output from LoadOrderDetailTool.
 */
export interface LoadOrderDetailOutput {
  /** Full order detail */
  order: OrderDetail;
  /** Whether all products were loaded */
  allProductsLoaded: boolean;
  /** Screenshot of order detail page */
  screenshot?: string;
}

/**
 * LoadOrderDetailTool interface.
 * Navigates to order detail page and extracts all items.
 */
export type LoadOrderDetailTool = Tool<LoadOrderDetailInput, LoadOrderDetailOutput>;

// =============================================================================
// ReorderTool
// =============================================================================

/**
 * Input for ReorderTool.
 */
export const ReorderInputSchema = z.object({
  /** Order ID to reorder */
  orderId: z.string().min(1),
  /** Order detail URL */
  detailUrl: z.string().url(),
});

export type ReorderInput = z.input<typeof ReorderInputSchema>;

/**
 * Output from ReorderTool.
 */
export interface ReorderOutput {
  /** Whether reorder was successful */
  success: boolean;
  /** Items added to cart */
  itemsAdded: number;
  /** Any items that failed to add */
  failedItems: string[];
  /** Cart total after reorder */
  cartTotal: number;
  /** Screenshot after reorder */
  screenshot?: string;
}

/**
 * ReorderTool interface.
 * Clicks "Encomendar de novo" button to add all order items to cart.
 */
export type ReorderTool = Tool<ReorderInput, ReorderOutput>;

// =============================================================================
// ScanCartTool
// =============================================================================

/**
 * Input for ScanCartTool.
 */
export const ScanCartInputSchema = z.object({
  /** Whether to expand collapsed items */
  expandAll: z.boolean().default(true),
  /** Whether to capture screenshot */
  captureScreenshot: z.boolean().default(true),
});

export type ScanCartInput = z.input<typeof ScanCartInputSchema>;

/**
 * Output from ScanCartTool.
 */
export interface ScanCartOutput {
  /** Current cart snapshot */
  snapshot: CartSnapshot;
  /** Whether cart is empty */
  isEmpty: boolean;
  /** Cart page URL */
  cartUrl: string;
  /** Screenshot of cart */
  screenshot?: string;
}

/**
 * ScanCartTool interface.
 * Extracts current cart contents and state.
 */
export type ScanCartTool = Tool<ScanCartInput, ScanCartOutput>;

// =============================================================================
// NavigateToOrderHistoryTool
// =============================================================================

/**
 * Input for NavigateToOrderHistoryTool.
 */
export const NavigateToOrderHistoryInputSchema = z.object({
  /** Whether to wait for page load */
  waitForLoad: z.boolean().default(true),
  /** Timeout in ms */
  timeout: z.number().positive().default(30000),
});

export type NavigateToOrderHistoryInput = z.input<typeof NavigateToOrderHistoryInputSchema>;

/**
 * Output from NavigateToOrderHistoryTool.
 */
export interface NavigateToOrderHistoryOutput {
  /** Whether navigation succeeded */
  success: boolean;
  /** Final URL after navigation */
  url: string;
  /** Screenshot of order history page */
  screenshot?: string;
}

/**
 * NavigateToOrderHistoryTool interface.
 * Navigates from any page to the order history page.
 */
export type NavigateToOrderHistoryTool = Tool<NavigateToOrderHistoryInput, NavigateToOrderHistoryOutput>;

// =============================================================================
// ExtractOrderItemsTool
// =============================================================================

/**
 * Input for ExtractOrderItemsTool.
 */
export const ExtractOrderItemsInputSchema = z.object({
  /** Expand all products first */
  expandAll: z.boolean().default(true),
});

export type ExtractOrderItemsInput = z.input<typeof ExtractOrderItemsInputSchema>;

/**
 * Output from ExtractOrderItemsTool.
 */
export interface ExtractOrderItemsOutput {
  /** Extracted items */
  items: OrderItem[];
  /** Whether all items were extracted */
  complete: boolean;
  /** Number of items found */
  itemCount: number;
}

/**
 * ExtractOrderItemsTool interface.
 * Extracts all items from current order detail page.
 */
export type ExtractOrderItemsTool = Tool<ExtractOrderItemsInput, ExtractOrderItemsOutput>;

// =============================================================================
// Result Type Aliases
// =============================================================================

export type LoadOrderHistoryResult = ToolResult<LoadOrderHistoryOutput>;
export type LoadOrderDetailResult = ToolResult<LoadOrderDetailOutput>;
export type ReorderResult = ToolResult<ReorderOutput>;
export type ScanCartResult = ToolResult<ScanCartOutput>;
export type NavigateToOrderHistoryResult = ToolResult<NavigateToOrderHistoryOutput>;
export type ExtractOrderItemsResult = ToolResult<ExtractOrderItemsOutput>;
