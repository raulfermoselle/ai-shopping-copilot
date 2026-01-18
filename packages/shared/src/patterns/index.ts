/**
 * Patterns Module
 *
 * Exports all pattern definitions for Auchan.pt automation.
 */

export {
  POPUP_PATTERNS,
  DANGEROUS_BUTTON_PATTERNS,
  DEFAULT_POPUP_OBSERVER_CONFIG,
  isDangerousText,
  isDangerousClass,
  isDangerousDataTarget,
} from './popups.js';
export type { PopupObserverConfig } from './popups.js';

export {
  CART_COUNT_SELECTORS,
  CART_TOTAL_SELECTORS,
  MODAL_CONTAINER_SELECTORS,
  REORDER_MODAL_MERGE_BUTTON,
  REORDER_MODAL_CONFIRM_BUTTON,
  MODAL_CANCEL_BUTTON,
  ORDER_HEADER_SELECTORS,
  REORDER_BUTTON_SELECTORS,
  ERROR_MESSAGE_SELECTORS,
  REORDER_MODAL_INDICATORS,
  CART_PAGE_INDICATORS,
} from './selectors.js';
