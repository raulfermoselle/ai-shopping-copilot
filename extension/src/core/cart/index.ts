/**
 * Cart Module
 *
 * Pure business logic for cart operations.
 * All functions are side-effect free and testable without Chrome APIs.
 */

export {
  calculateCartDiff,
  hasChanges,
  requiresUserAttention,
  getItemsNeedingSubstitution,
  calculateAvailabilityPercentage,
  generateDiffSummary,
} from './diff.js';

// Re-export types that callers commonly need
export type { CartDiff, CartItem, CartSummary } from '../../types/cart.js';
export type { OrderItem } from '../../types/orders.js';
