/**
 * Popup Handler Utility
 *
 * Handles common popups that appear on Auchan.pt:
 * - Subscription/notification popup ("Subscreva as nossas notificações")
 * - Cookie consent (already handled in login)
 * - Other promotional modals
 *
 * Call this after navigation or when popups might block interaction.
 */

import type { Page } from 'playwright';

/**
 * Known popup dismiss strategies
 *
 * CRITICAL: Reorder modals (with "Juntar"/"Eliminar" buttons) should NOT be dismissed.
 * Only dismiss actual blocking popups like subscription prompts, cookie banners, etc.
 */
const POPUP_DISMISS_STRATEGIES = [
  // Cart removal confirmation popup - "Cancelar" button (CRITICAL: Click to KEEP items)
  // This modal asks "Tem a certeza de que pretende remover todos os produtos do carrinho?"
  // We MUST click Cancelar to keep the cart items
  {
    name: 'cart-removal-cancel',
    selector: 'button:has-text("Cancelar")',
    description: 'Cart removal confirmation - click "Cancelar" to keep items',
    priority: 10, // Highest priority - handle first
    // Only match if this is the cart removal modal (not the reorder modal which has Juntar)
    validateContext: async (page: Page) => {
      // Check for cart removal modal text
      const hasRemovalText = await page.locator('text="Remover produtos do carrinho"').count() > 0;
      const hasRemovalQuestion = await page.locator('text="remover todos os produtos"').count() > 0;
      // Ensure this is NOT the reorder modal (which has Juntar button)
      const hasJuntarButton = await page.locator('button:has-text("Juntar")').count() > 0;
      return (hasRemovalText || hasRemovalQuestion) && !hasJuntarButton;
    },
  },
  // Subscription popup - "Não" link/text (NOT a button element)
  {
    name: 'subscription-popup-nao',
    selector: 'a:has-text("Não"), button:has-text("Não"), [role="button"]:has-text("Não")',
    description: 'Subscription popup - click "Não" link',
    priority: 9, // High priority - before generic close
  },
  // Subscription popup - close X button
  // IMPORTANT: Only close modals that are NOT the reorder modal
  // The reorder modal has "Encomendar de novo" title and "Juntar"/"Eliminar" buttons
  {
    name: 'subscription-popup-close',
    selector: '[role="dialog"] button.close, .modal button[aria-label="Close"], .modal .close, button:has-text("×")',
    description: 'Modal close button',
    priority: 8,
    // Don't close if this is the reorder modal (has Juntar button)
    validateContext: async (page: Page) => {
      const isReorderModal = await page.locator('button:has-text("Juntar")').count() > 0;
      return !isReorderModal; // Only dismiss if NOT reorder modal
    },
  },
  // REMOVED: Generic dismiss pattern was too risky - could match cart removal buttons
  // Only use specific, known-safe patterns above
];

/**
 * Options for popup dismissal
 */
export interface DismissPopupsOptions {
  /** Timeout for finding popup elements (ms) */
  timeout?: number;
  /** Whether to log actions */
  verbose?: boolean;
  /** Logger function */
  logger?: {
    info: (msg: string, ctx?: Record<string, unknown>) => void;
    warn: (msg: string, ctx?: Record<string, unknown>) => void;
    debug: (msg: string, ctx?: Record<string, unknown>) => void;
  };
}

/**
 * DANGEROUS BUTTON PATTERNS - Never click these!
 * These could trigger destructive actions like clearing the cart.
 */
const DANGEROUS_BUTTON_PATTERNS = [
  'Remover todos',  // "Remove all" button text (substring)
  'Remover todos os produtos',  // Full button text on cart page
  'Eliminar tudo',  // Alternative "Delete all" text
  'auc-cart__remove-all',  // Remove all button class
  'Confirmar',  // Confirm button on removal modal - NEVER click this!
];

/**
 * Check if an element is a dangerous button that should never be clicked.
 */
async function isDangerousButton(element: import('playwright').Locator): Promise<boolean> {
  try {
    // Check text content
    const text = await element.textContent().catch(() => null);
    if (text) {
      for (const pattern of DANGEROUS_BUTTON_PATTERNS) {
        if (text.includes(pattern)) {
          return true;
        }
      }
    }

    // Check class attribute
    const className = await element.getAttribute('class').catch(() => null);
    if (className) {
      for (const pattern of DANGEROUS_BUTTON_PATTERNS) {
        if (className.includes(pattern)) {
          return true;
        }
      }
    }

    // Check if it has data-toggle="modal" targeting remove-all modal
    const dataTarget = await element.getAttribute('data-target').catch(() => null);
    if (dataTarget && dataTarget.includes('remove-all')) {
      return true;
    }

    return false;
  } catch {
    return false;  // On error, assume not dangerous (don't block legitimate clicks)
  }
}

/**
 * Attempt to dismiss any blocking popups on the page.
 *
 * @param page - Playwright page
 * @param options - Dismissal options
 * @returns Number of popups dismissed
 */
export async function dismissPopups(
  page: Page,
  options: DismissPopupsOptions = {}
): Promise<number> {
  const { timeout = 2000, verbose = false, logger } = options;
  let dismissed = 0;

  // Sort strategies by priority (highest first)
  const sortedStrategies = [...POPUP_DISMISS_STRATEGIES].sort((a, b) => {
    const priorityA = 'priority' in a ? (a.priority as number) : 0;
    const priorityB = 'priority' in b ? (b.priority as number) : 0;
    return priorityB - priorityA;
  });

  for (const strategy of sortedStrategies) {
    try {
      // If strategy has context validation, check if we should use it
      if ('validateContext' in strategy && typeof strategy.validateContext === 'function') {
        const shouldDismiss = await (strategy.validateContext as (page: Page) => Promise<boolean>)(page);
        if (!shouldDismiss) {
          if (verbose && logger) {
            logger.debug(`Skipping popup strategy ${strategy.name} - context validation failed`);
          }
          continue;
        }
      }

      // Check ALL matching elements (not just first) in case multiple popups have same buttons
      const elements = await page.locator(strategy.selector).all();

      for (const element of elements) {
        const isVisible = await element.isVisible({ timeout }).catch(() => false);

        if (isVisible) {
          // CRITICAL SAFETY CHECK: Never click dangerous buttons
          if (await isDangerousButton(element)) {
            if (verbose && logger) {
              logger.warn(`BLOCKED: Refusing to click dangerous button`, {
                strategy: strategy.name,
                reason: 'Element matches dangerous button pattern',
              });
            }
            continue;  // Skip this element
          }

          if (verbose && logger) {
            logger.info(`Dismissing popup: ${strategy.description}`, { strategy: strategy.name });
          }

          // Try to click, but don't fail if element becomes stale
          try {
            await element.click({ timeout: 1000 });
            dismissed++;

            // Wait a moment for the popup to close
            await page.waitForTimeout(500);

            if (verbose && logger) {
              logger.debug(`Popup dismissed: ${strategy.name}`);
            }
          } catch (clickErr) {
            if (verbose && logger) {
              logger.debug(`Click failed for ${strategy.name}`, {
                error: clickErr instanceof Error ? clickErr.message : String(clickErr),
              });
            }
          }
        }
      }
    } catch (err) {
      // Strategy didn't work, try next
      if (verbose && logger) {
        logger.debug(`Popup strategy failed: ${strategy.name}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return dismissed;
}

/**
 * Wait for any popup to appear and dismiss it.
 * Useful after navigation when popups might load asynchronously.
 *
 * @param page - Playwright page
 * @param waitMs - How long to wait for popup to appear
 * @param options - Dismissal options
 */
export async function waitAndDismissPopups(
  page: Page,
  waitMs: number = 2000,
  options: DismissPopupsOptions = {}
): Promise<number> {
  // Wait a moment for any popups to appear
  await page.waitForTimeout(waitMs);
  return dismissPopups(page, options);
}

/**
 * Dismiss the subscription notification popup specifically.
 * This popup asks users to subscribe to promotional notifications.
 *
 * @param page - Playwright page
 * @param options - Options
 * @returns Whether the popup was found and dismissed
 */
export async function dismissSubscriptionPopup(
  page: Page,
  options: DismissPopupsOptions = {}
): Promise<boolean> {
  const { timeout = 3000, logger } = options;

  try {
    // Look for the "Não" button which dismisses the subscription popup
    const naoButton = page.locator('button:has-text("Não")').first();
    const isVisible = await naoButton.isVisible({ timeout }).catch(() => false);

    if (isVisible) {
      if (logger) {
        logger.info('Dismissing subscription notification popup');
      }

      await naoButton.click({ timeout: 2000 });
      await page.waitForTimeout(500);

      if (logger) {
        logger.debug('Subscription popup dismissed');
      }

      return true;
    }

    // Try close button as fallback
    const closeButton = page
      .locator('[role="dialog"] button:has-text("×"), .modal .close')
      .first();
    const closeVisible = await closeButton.isVisible({ timeout: 1000 }).catch(() => false);

    if (closeVisible) {
      if (logger) {
        logger.info('Dismissing popup via close button');
      }

      await closeButton.click({ timeout: 2000 });
      await page.waitForTimeout(500);
      return true;
    }

    return false;
  } catch {
    return false;
  }
}
