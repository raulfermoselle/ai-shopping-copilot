/**
 * Selector Patterns
 *
 * Centralized selector chains for Auchan.pt cart operations.
 * These selectors are used by both Playwright and Extension implementations.
 *
 * DESIGN: Each chain has a primary selector and multiple fallbacks.
 * Try selectors in order until one matches.
 */

import type { SelectorChain } from '../interactor/types.js';

// =============================================================================
// Cart State Selectors
// =============================================================================

/**
 * Selectors for cart item count in header
 */
export const CART_COUNT_SELECTORS: SelectorChain = {
  id: 'cart-count',
  primary: '.auc-header-cart__count',
  fallbacks: [
    '[data-testid="cart-count"]',
    '.cart-counter',
    '.cart-quantity',
    '.badge.cart-badge',
    '.auc-header__minicart .auc-badge',
    '.auc-header-actions__cart .auc-badge',
    '.minicart-quantity:not(.d-none)',
    '[class*="cart"] [class*="badge"]',
    '[class*="cart"] [class*="count"]',
    '[data-cart-count]',
  ],
  description: 'Cart item count badge in header',
};

/**
 * Selectors for cart total value in header
 */
export const CART_TOTAL_SELECTORS: SelectorChain = {
  id: 'cart-total',
  primary: '.auc-cart-value.auc-header-cart-total',
  fallbacks: [
    '.auc-header-cart-total',
    '.auc-cart-value__total .auc-cart-value',
    '.auc-cart-value',
    '[class*="cart"][class*="total"]',
    '[class*="cart"][class*="value"]',
  ],
  description: 'Cart total value in header',
};

// =============================================================================
// Modal Selectors
// =============================================================================

/**
 * Selectors for detecting any visible modal
 */
export const MODAL_CONTAINER_SELECTORS: SelectorChain = {
  id: 'modal-container',
  primary: '.auc-modal[data-visible="true"]',
  fallbacks: [
    '.modal.show',
    '[role="dialog"][aria-modal="true"]',
    '.auc-modal--visible',
    '.auc-modal.auc-modal--active',
    '.auc-modal[style*="display: block"]',
    '.modal[style*="display: block"]',
    '[role="dialog"]',
  ],
  description: 'Visible modal container',
};

/**
 * Selectors for merge button in reorder modal ("Juntar")
 */
export const REORDER_MODAL_MERGE_BUTTON: SelectorChain = {
  id: 'reorder-modal-merge',
  primary: '.modal button.btn-success:has-text("Juntar")',
  fallbacks: [
    'button:has-text("Juntar")',
    '.modal button:has-text("Juntar")',
    '[role="dialog"] button:has-text("Juntar")',
    '.modal button.auc-btn--primary:has-text("Juntar")',
    'button >> text="Juntar"',
  ],
  description: 'Merge button in reorder modal',
};

/**
 * Selectors for confirm reorder button in modal ("Encomendar de novo")
 * CRITICAL: Only match buttons INSIDE modal containers to avoid main page buttons
 */
export const REORDER_MODAL_CONFIRM_BUTTON: SelectorChain = {
  id: 'reorder-modal-confirm',
  primary: '.modal button:has-text("Encomendar de novo")',
  fallbacks: [
    '[role="dialog"] button:has-text("Encomendar de novo")',
    '.auc-modal button:has-text("Encomendar de novo")',
    '[aria-modal="true"] button:has-text("Encomendar de novo")',
    // Do NOT include generic 'button:has-text("Encomendar de novo")' - matches main page!
    // Do NOT include "Confirmar" - could trigger cart removal!
  ],
  description: 'Confirm reorder button in modal',
};

/**
 * Selectors for cancel button in modals
 */
export const MODAL_CANCEL_BUTTON: SelectorChain = {
  id: 'modal-cancel',
  primary: '.modal button:has-text("Cancelar")',
  fallbacks: [
    '[role="dialog"] button:has-text("Cancelar")',
    '.auc-modal button:has-text("Cancelar")',
    'button:has-text("Cancelar")',
  ],
  description: 'Cancel button in modal',
};

// =============================================================================
// Order Detail Page Selectors
// =============================================================================

/**
 * Selectors for order header on detail page
 */
export const ORDER_HEADER_SELECTORS: SelectorChain = {
  id: 'order-header',
  primary: '.order-detail-header',
  fallbacks: [
    '.order-header',
    '[data-testid="order-header"]',
    '.auc-order-detail__header',
    'h1:has-text("Encomenda")',
  ],
  description: 'Order detail page header',
};

/**
 * Selectors for reorder button on order detail page
 */
export const REORDER_BUTTON_SELECTORS: SelectorChain = {
  id: 'reorder-button',
  primary: 'button:has-text("Encomendar de novo")',
  fallbacks: [
    '[data-testid="reorder-button"]',
    '.order-detail-reorder',
    '.auc-btn:has-text("Encomendar de novo")',
    'a:has-text("Encomendar de novo")',
  ],
  description: 'Reorder button on order detail page',
};

// =============================================================================
// Error Detection Selectors
// =============================================================================

/**
 * Selectors for error messages on page
 */
export const ERROR_MESSAGE_SELECTORS: SelectorChain = {
  id: 'error-messages',
  primary: '.error-message',
  fallbacks: [
    '.alert-danger',
    '.toast-error',
    '[role="alert"]',
    '.notification-error',
    '.auc-notification--error',
  ],
  description: 'Error notification elements',
};

// =============================================================================
// Reorder Modal Detection
// =============================================================================

/**
 * Text patterns that indicate the reorder modal is visible
 */
export const REORDER_MODAL_INDICATORS = {
  /** Buttons that only appear in the merge modal */
  mergeButtons: ['Juntar', 'Eliminar'],
  /** Text that indicates cart removal modal (NOT reorder) */
  cartRemovalText: 'Remover produtos do carrinho',
  /** Modal title patterns */
  modalTitles: ['Encomendar de novo', 'Neste momento tem produtos'],
};

// =============================================================================
// Cart Page Selectors
// =============================================================================

/**
 * Selectors for detecting cart page
 */
export const CART_PAGE_INDICATORS = {
  /** URL patterns that indicate cart page */
  urlPatterns: [/\/carrinho/, /\/cart/],
  /** Selectors for cart page container */
  containerSelectors: ['.cart-container', '.auc-cart', '[data-testid="cart-page"]'],
};
