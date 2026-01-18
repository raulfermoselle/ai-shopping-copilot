/**
 * @aisc/shared
 *
 * Shared business logic for AI Shopping Copilot.
 * Used by both Playwright-based main codebase and Chrome Extension.
 */

// Interactor interface and types
export type {
  IPageInteractor,
  ILogger,
  SelectorChain,
  FindResult,
  CartState,
  PopupPattern,
  DangerousButtonPattern,
  ReorderModalType,
  ReorderModalResult,
  NavigationOptions,
} from './interactor/index.js';

// Patterns
export {
  POPUP_PATTERNS,
  DANGEROUS_BUTTON_PATTERNS,
  DEFAULT_POPUP_OBSERVER_CONFIG,
  isDangerousText,
  isDangerousClass,
  isDangerousDataTarget,
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
} from './patterns/index.js';
export type { PopupObserverConfig } from './patterns/index.js';

// Flows
export {
  CartMergeFlow,
  DEFAULT_CART_MERGE_CONFIG,
} from './flows/index.js';
export type {
  OrderToMerge,
  CartMergeFlowConfig,
  OrderMergeResult,
  CartMergeFlowResult,
} from './flows/index.js';
