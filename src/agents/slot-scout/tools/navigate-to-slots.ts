/**
 * NavigateToSlotsTool
 *
 * Navigates from cart to delivery slot selection page.
 * Handles checkout flow and stops at slot selection.
 *
 * CRITICAL: Never completes checkout. Always stays on slot selection.
 */

import type { Tool, ToolResult, ToolContext, ToolError } from '../../../types/tool.js';
import type { NavigateToSlotsInput, NavigateToSlotsOutput } from './types.js';
import { createSelectorResolver } from '../../../selectors/resolver.js';

// =============================================================================
// Verified Selectors (from data/selectors/pages)
// =============================================================================

const CART_SELECTORS = {
  checkoutButton: '.checkout-btn.auc-button__rounded--primary',
  checkoutButtonFallback: 'button:has-text("Finalizar compra")',
  unavailableModal: '#confirm-unavailable-products-removal',
  removeUnavailableButton: '.auc-js-cart-remove-unavailable-products',
} as const;

const SLOT_PAGE_SELECTORS = {
  pageContainer: '.auc-book-slot__container',
  dayTabs: '.auc-book-slot__week-days-tabs',
  timeSlot: '.auc-book-slot__slot',
} as const;

/**
 * NavigateToSlotsTool implementation.
 *
 * Flow:
 * 1. Verify we're on cart page or navigate there
 * 2. Click checkout/proceed to delivery
 * 3. Skip/verify address selection
 * 4. Wait for delivery slot page to load
 * 5. Validate we're on slot selection (not completing order)
 *
 * @example
 * const result = await navigateToSlotsTool.execute(
 *   { waitForLoad: true, timeout: 30000 },
 *   context
 * );
 */
export const navigateToSlotsTool: Tool<NavigateToSlotsInput, NavigateToSlotsOutput> = {
  name: 'navigateToSlots',
  description: 'Navigate to delivery slot selection page',

  async execute(
    input: NavigateToSlotsInput,
    context: ToolContext
  ): Promise<ToolResult<NavigateToSlotsOutput>> {
    const start = Date.now();
    const { page, logger, screenshot } = context;
    const { waitForLoad = true, timeout = 30000 } = input;

    // Reserved for future selector registry use
    void createSelectorResolver;
    const screenshots: string[] = [];

    try {
      logger.info('NavigateToSlotsTool starting', { currentUrl: page.url() });

      // Step 1: Ensure we're on cart page
      const currentUrl = page.url();
      if (!currentUrl.includes('carrinho-compras')) {
        logger.info('Not on cart page, navigating to cart first');

        await page.goto('https://www.auchan.pt/pt/carrinho-compras', {
          timeout,
          waitUntil: 'domcontentloaded',
        });

        await page.waitForLoadState('domcontentloaded', { timeout: 5000 });

        const cartScreenshot = await screenshot('navigate-slots-cart-page');
        screenshots.push(cartScreenshot);
      }

      // Step 2: Find and click checkout button using verified selectors
      logger.info('Looking for checkout button on cart page');

      // Try verified selector first, then fallbacks
      const checkoutButtonSelectors = [
        CART_SELECTORS.checkoutButton,
        CART_SELECTORS.checkoutButtonFallback,
        'a:has-text("Finalizar compra")',
        '[data-testid="checkout-button"]',
      ];

      let checkoutButton = null;
      for (const selector of checkoutButtonSelectors) {
        try {
          checkoutButton = await page.waitForSelector(selector, { timeout: 3000 });
          if (checkoutButton) {
            logger.info('Found checkout button', { selector });
            break;
          }
        } catch {
          // Try next selector
        }
      }

      if (!checkoutButton) {
        logger.error('Checkout button not found on cart page');

        const errorScreenshot = await screenshot('navigate-slots-no-checkout-button');
        screenshots.push(errorScreenshot);

        const error: ToolError = {
          message: 'Checkout button not found on cart page',
          code: 'SELECTOR_ERROR',
          recoverable: true,
        };

        return {
          success: false,
          error,
          screenshots,
          duration: Date.now() - start,
        };
      }

      // Click checkout button (use JavaScript click for reliability)
      logger.info('Clicking checkout button');
      await page.locator(CART_SELECTORS.checkoutButton).click({ force: true });

      // Wait for potential modal or navigation
      await page.waitForTimeout(2000);

      // Step 2b: Handle unavailable products modal if it appears
      const modal = page.locator(CART_SELECTORS.unavailableModal);
      const modalVisible = await modal.evaluate((el) => el.classList.contains('show')).catch(() => false);

      if (modalVisible) {
        logger.info('Unavailable products modal appeared - removing unavailable items');

        const modalScreenshot = await screenshot('navigate-slots-unavailable-modal');
        screenshots.push(modalScreenshot);

        // Click confirm to remove unavailable products
        await page.locator(CART_SELECTORS.removeUnavailableButton).click();

        // Wait for removal and navigation
        await page.waitForTimeout(5000);
      }

      // Wait for navigation to complete
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 });

      const afterCheckoutUrl = page.url();
      logger.info('After checkout click', { url: afterCheckoutUrl });

      const afterCheckoutScreenshot = await screenshot('navigate-slots-after-checkout-click');
      screenshots.push(afterCheckoutScreenshot);

      // Step 3: Handle address selection if needed
      // The flow might go: cart → address selection → delivery slots
      // Or: cart → delivery slots (if address already saved)

      // Check if we're on address selection page
      const addressPatterns = [/endereco/i, /address/i, /morada/i];
      const isOnAddressPage = addressPatterns.some((pattern) =>
        pattern.test(afterCheckoutUrl)
      );

      if (isOnAddressPage) {
        logger.info('On address selection page, proceeding to next step');

        // Try to find "Continue" or "Next" button
        const continueSelectors = [
          'button:has-text("Continuar")',
          'button:has-text("Seguinte")',
          'button:has-text("Próximo")',
          '[data-testid="continue-button"]',
          'button[type="submit"]',
        ];

        let continueButton = null;
        for (const selector of continueSelectors) {
          try {
            continueButton = await page.waitForSelector(selector, { timeout: 3000 });
            if (continueButton) {
              logger.info('Found continue button on address page', { selector });
              break;
            }
          } catch {
            // Try next
          }
        }

        if (continueButton) {
          await continueButton.click();
          await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
          await page.waitForTimeout(2000);

          const afterAddressScreenshot = await screenshot(
            'navigate-slots-after-address-continue'
          );
          screenshots.push(afterAddressScreenshot);
        } else {
          logger.warn('Continue button not found on address page, proceeding anyway');
        }
      }

      // Step 4: Verify we're on delivery slot selection page using VERIFIED selectors
      const finalUrl = page.url();
      logger.info('Final URL after navigation', { url: finalUrl });

      // Use verified selectors to confirm we're on the slots page
      const verifiedSlotIndicators = [
        SLOT_PAGE_SELECTORS.pageContainer,
        SLOT_PAGE_SELECTORS.dayTabs,
        SLOT_PAGE_SELECTORS.timeSlot,
      ];

      let slotsAvailable = false;
      for (const selector of verifiedSlotIndicators) {
        try {
          const element = await page.waitForSelector(selector, { timeout: 5000 });
          if (element) {
            logger.info('Found verified slot indicator', { selector });
            slotsAvailable = true;
            break;
          }
        } catch {
          // Try next verified selector
        }
      }

      // If verified selectors don't match, try fallback indicators
      if (!slotsAvailable) {
        const fallbackIndicators = [
          'div[class*="slot"]',
          'div[class*="delivery"]',
          '[data-time]',
        ];

        for (const selector of fallbackIndicators) {
          try {
            const element = await page.waitForSelector(selector, { timeout: 2000 });
            if (element) {
              logger.info('Found fallback slot indicator', { selector });
              slotsAvailable = true;
              break;
            }
          } catch {
            // Continue
          }
        }
      }

      if (!slotsAvailable && waitForLoad) {
        logger.warn('Delivery slot indicators not found within timeout');

        const noSlotsScreenshot = await screenshot('navigate-slots-no-indicators');
        screenshots.push(noSlotsScreenshot);

        // Don't fail completely - might still be able to extract
        // Return success but flag that slots weren't clearly detected
      }

      // Look for minimum order value (often displayed on slot page)
      let minimumOrder: number | undefined;
      try {
        // Try to find minimum order text (e.g., "Encomenda mínima: €50")
        const minOrderText = await page
          .textContent('body', { timeout: 2000 })
          .catch(() => null);

        if (minOrderText) {
          const match = minOrderText.match(/mínima?:?\s*€?\s*(\d+(?:[.,]\d+)?)/i);
          if (match?.[1]) {
            minimumOrder = parseFloat(match[1].replace(',', '.'));
            logger.info('Detected minimum order value', { minimumOrder });
          }
        }
      } catch (err) {
        logger.debug('Could not extract minimum order value', {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      const finalScreenshot = await screenshot('navigate-slots-complete');
      screenshots.push(finalScreenshot);

      logger.info('NavigateToSlotsTool completed', {
        url: finalUrl,
        slotsAvailable,
        minimumOrder,
      });

      return {
        success: true,
        data: {
          success: true,
          url: finalUrl,
          screenshot: finalScreenshot,
          ...(minimumOrder !== undefined && { minimumOrder }),
          slotsAvailable,
        },
        screenshots,
        duration: Date.now() - start,
      };
    } catch (err) {
      logger.error('NavigateToSlotsTool execution failed', {
        error: err instanceof Error ? err.message : String(err),
      });

      const errorScreenshot = await screenshot('navigate-slots-error').catch(() => '');
      if (errorScreenshot) {
        screenshots.push(errorScreenshot);
      }

      const toolError: ToolError = {
        message:
          err instanceof Error ? err.message : 'Unknown error during slot navigation',
        code:
          err instanceof Error && err.message.includes('Timeout')
            ? 'TIMEOUT_ERROR'
            : 'UNKNOWN_ERROR',
        recoverable: true,
      };

      if (err instanceof Error) {
        toolError.cause = err;
      }

      return {
        success: false,
        error: toolError,
        screenshots,
        duration: Date.now() - start,
      };
    }
  },
};
