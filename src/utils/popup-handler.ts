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
 */
const POPUP_DISMISS_STRATEGIES = [
  // Subscription popup - "Não" button
  {
    name: 'subscription-popup-nao',
    selector: 'button:has-text("Não")',
    description: 'Subscription popup - click "Não" button',
  },
  // Subscription popup - close X button
  {
    name: 'subscription-popup-close',
    selector: '.modal button[aria-label="Close"], .modal .close, [role="dialog"] button:has-text("×")',
    description: 'Modal close button',
  },
  // Generic modal backdrop click (risky - might dismiss wanted modals)
  // Not included by default
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
    debug: (msg: string, ctx?: Record<string, unknown>) => void;
  };
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

  for (const strategy of POPUP_DISMISS_STRATEGIES) {
    try {
      const element = page.locator(strategy.selector).first();
      const isVisible = await element.isVisible({ timeout }).catch(() => false);

      if (isVisible) {
        if (verbose && logger) {
          logger.info(`Dismissing popup: ${strategy.description}`);
        }

        await element.click({ timeout: 1000 });
        dismissed++;

        // Wait a moment for the popup to close
        await page.waitForTimeout(500);

        if (verbose && logger) {
          logger.debug(`Popup dismissed: ${strategy.name}`);
        }
      }
    } catch {
      // Strategy didn't work, try next
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
