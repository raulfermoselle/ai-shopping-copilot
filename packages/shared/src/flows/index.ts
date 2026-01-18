/**
 * Flows Module
 *
 * Exports shared business logic flows.
 */

export {
  CartMergeFlow,
  DEFAULT_CART_MERGE_CONFIG,
} from './cart-merge-flow.js';
export type {
  OrderToMerge,
  CartMergeFlowConfig,
  OrderMergeResult,
  CartMergeFlowResult,
} from './cart-merge-flow.js';
