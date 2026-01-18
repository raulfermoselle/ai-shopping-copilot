/**
 * Popup Patterns
 *
 * Centralized definitions of popup patterns for Auchan.pt.
 * These patterns are used by both Playwright and Extension implementations
 * to detect and dismiss blocking popups.
 *
 * IMPORTANT: The reorder modal (with "Juntar"/"Eliminar" buttons) must NOT be dismissed.
 * We need to interact with it to merge orders into the cart.
 */

import type { PopupPattern, DangerousButtonPattern } from '../interactor/types.js';

// =============================================================================
// Popup Patterns
// =============================================================================

/**
 * Known popup patterns with their dismiss strategies.
 *
 * IMPORTANT: Patterns with `skipIfReorderModal: true` will be skipped when
 * the reorder modal is visible to avoid interfering with the merge flow.
 *
 * Priority guide:
 * - 100: Cart removal cancel (HIGHEST - keeps items in cart)
 * - 90-95: Subscription popups
 * - 80: Cookie consent
 * - 70: Modal close buttons
 */
export const POPUP_PATTERNS: PopupPattern[] = [
  // Cart removal confirmation - "Cancelar" button (HIGHEST PRIORITY - keeps items in cart)
  // Only match if this is NOT the reorder modal (check for absence of Juntar button)
  {
    name: 'cart-removal-cancel',
    selector: 'button',
    textMatch: 'Cancelar',
    priority: 100,
    skipIfReorderModal: true,
    description: 'Cart removal confirmation - click "Cancelar" to keep items',
  },

  // Notification subscription popup - "Não" button next to "Subscrever"
  // This popup asks "Subscreva as nossas notificações..." with Não/Subscrever buttons
  {
    name: 'notification-subscription-nao',
    selector: 'button, a, span[role="button"], div[role="button"]',
    textMatch: 'Não',
    priority: 95,
    skipIfReorderModal: true,
    description: 'Notification subscription popup - click "Não"',
  },

  // Subscription popup - "Não" link/button with exact match
  // CRITICAL: Must use exactMatch: true to avoid matching text on other modals
  {
    name: 'subscription-nao-exact',
    selector: 'a, button, [role="button"]',
    textMatch: 'Não',
    exactMatch: true,
    priority: 90,
    skipIfReorderModal: true,
    description: 'Subscription popup - click "Não" (exact match)',
  },

  // Cookie consent - safe to dismiss anytime
  {
    name: 'cookie-consent',
    selector: '#onetrust-accept-btn-handler',
    priority: 80,
    description: 'OneTrust cookie consent banner',
  },

  // Modal close buttons - SKIP if reorder modal is showing
  // IMPORTANT: Only match specific aria-label patterns
  {
    name: 'modal-close-aria',
    selector: '[aria-label="Close"], [aria-label="Fechar"]',
    priority: 70,
    skipIfReorderModal: true,
    description: 'Generic modal close button (aria-label)',
  },

  // REMOVED: promo-banner-close - too risky, could close important modals
  // REMOVED: Generic dismiss pattern - was too risky
];

// =============================================================================
// Dangerous Button Patterns
// =============================================================================

/**
 * DANGEROUS BUTTON PATTERNS - Never click these!
 * These could trigger destructive actions like clearing the cart.
 */
export const DANGEROUS_BUTTON_PATTERNS: DangerousButtonPattern[] = [
  // "Remove all" button text variations
  { textPattern: 'Remover todos' },
  { textPattern: 'Remover todos os produtos' },
  { textPattern: 'Eliminar tudo' },

  // Confirm button on removal modal
  { textPattern: 'Confirmar' },

  // Class patterns
  { classPattern: 'auc-cart__remove-all' },

  // Data target patterns
  { dataTargetPattern: 'remove-all-products' },
  { dataTargetPattern: 'remove-all' },
];

/**
 * Check if text matches any dangerous button pattern
 *
 * @param text - Text content to check
 * @returns Whether text matches a dangerous pattern
 */
export function isDangerousText(text: string): boolean {
  const normalizedText = text.trim();
  return DANGEROUS_BUTTON_PATTERNS.some(
    (pattern) => pattern.textPattern && normalizedText.includes(pattern.textPattern)
  );
}

/**
 * Check if a class name matches any dangerous button pattern
 *
 * @param className - Class name to check
 * @returns Whether class matches a dangerous pattern
 */
export function isDangerousClass(className: string): boolean {
  return DANGEROUS_BUTTON_PATTERNS.some(
    (pattern) => pattern.classPattern && className.includes(pattern.classPattern)
  );
}

/**
 * Check if a data-target matches any dangerous button pattern
 *
 * @param dataTarget - Data target value to check
 * @returns Whether data target matches a dangerous pattern
 */
export function isDangerousDataTarget(dataTarget: string): boolean {
  return DANGEROUS_BUTTON_PATTERNS.some(
    (pattern) =>
      pattern.dataTargetPattern && dataTarget.includes(pattern.dataTargetPattern)
  );
}

// =============================================================================
// Popup Observer Configuration
// =============================================================================

/**
 * Configuration for the auto-popup observer
 */
export interface PopupObserverConfig {
  /** Debounce time for DOM mutation handling (ms) */
  mutationDebounceMs: number;
  /** Interval for periodic popup scanning (ms) */
  periodicScanIntervalMs: number;
  /** Whether to log dismissals */
  verbose: boolean;
}

/**
 * Default popup observer configuration
 */
export const DEFAULT_POPUP_OBSERVER_CONFIG: PopupObserverConfig = {
  mutationDebounceMs: 50,
  periodicScanIntervalMs: 500,
  verbose: false,
};
