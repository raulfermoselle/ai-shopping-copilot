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

      // Step 2: Find and click checkout button
      logger.info('Looking for checkout button on cart page');

      // Try to find checkout button using cart selectors
      // NOTE: If checkout selector doesn't exist, we'll need to discover it
      // For now, try common patterns
      const checkoutButtonSelectors = [
        'button:has-text("Finalizar compra")',
        'a:has-text("Finalizar compra")',
        '[data-testid="checkout-button"]',
        '.checkout-button',
        'button[type="submit"]:has-text("Finalizar")',
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

      // Click checkout button
      logger.info('Clicking checkout button');
      await checkoutButton.click();

      // Wait for navigation
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
      await page.waitForTimeout(2000); // Allow for any redirects/animations

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

      // Step 4: Verify we're on delivery slot selection page
      const finalUrl = page.url();
      logger.info('Final URL after navigation', { url: finalUrl });

      // Look for slot-related elements to confirm we're on the right page
      // Common patterns: calendar, time slots, delivery options
      const slotIndicators = [
        'div[class*="slot"]',
        'div[class*="delivery"]',
        'div[class*="horario"]',
        'div[class*="calendar"]',
        '[data-testid*="slot"]',
        'button:has-text("Entrega")',
      ];

      let slotsAvailable = false;
      for (const selector of slotIndicators) {
        try {
          const element = await page.waitForSelector(selector, { timeout: 3000 });
          if (element) {
            logger.info('Found slot indicator', { selector });
            slotsAvailable = true;
            break;
          }
        } catch {
          // Try next
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
          if (match && match[1]) {
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
