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
  // Primary checkout button (may be disabled until cart is valid)
  checkoutButton: '.checkout-btn.auc-button__rounded--primary',
  checkoutButtonJs: '.auc-js-confirm-cart',
  checkoutButtonFallback: 'button:has-text("Finalizar compra")',
  // Modal for unavailable products
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

      // Scroll to top of page to see main cart area
      await page.evaluate('window.scrollTo(0, 0)');
      await page.waitForTimeout(1000);

      // Step 2: Check for cart validation state and handle unavailable products
      logger.info('Checking cart validation state');

      // Check if cart has validation errors (unavailable products)
      const validationState = await page.evaluate(`
        (function() {
          const input = document.querySelector('input[name="auc-js-cart-validation"]');
          if (input && input.value) {
            try {
              return JSON.parse(input.value);
            } catch (e) {
              return null;
            }
          }
          return null;
        })()
      `) as { error?: boolean; message?: string } | null;

      if (validationState && validationState.error) {
        logger.info('Cart has validation error, handling unavailable products', {
          message: validationState.message ?? 'Unknown validation error',
        });

        // First, find unavailable items on the cart page
        const unavailableItems = await page.evaluate(`
          (function() {
            // Look for items with unavailable indicators
            const items = [];
            // Check for items with strike-through price or unavailable class
            const unavailableRows = document.querySelectorAll('.auc-cart__item--unavailable, [class*="unavailable"], [class*="not-available"]');
            for (const row of unavailableRows) {
              const nameEl = row.querySelector('.auc-cart__item-name, .product-name, [class*="product-name"]');
              const removeBtn = row.querySelector('.auc-cart__item-remove, .remove-product, [class*="remove"]');
              items.push({
                name: nameEl ? nameEl.textContent.trim().substring(0, 50) : 'Unknown',
                hasRemoveBtn: !!removeBtn,
              });
            }
            // Also check for items with qty=0 or out-of-stock message
            const outOfStockItems = document.querySelectorAll('.out-of-stock, .no-stock, .product-out-of-stock');
            for (const item of outOfStockItems) {
              const parent = item.closest('.auc-cart__item, .line-item, .product-card');
              if (parent) {
                const nameEl = parent.querySelector('.auc-cart__item-name, .product-name, [class*="product-name"]');
                items.push({
                  name: nameEl ? nameEl.textContent.trim().substring(0, 50) : 'Unknown',
                  outOfStock: true,
                });
              }
            }
            // Check the remove unavailable button exists
            const removeAllBtn = document.querySelector('.auc-js-cart-remove-unavailable-products');
            return {
              items,
              hasRemoveAllButton: !!removeAllBtn,
              removeAllUrl: removeAllBtn ? removeAllBtn.getAttribute('data-url') : null,
            };
          })()
        `) as { items: Array<{ name: string }>; hasRemoveAllButton: boolean; removeAllUrl: string | null };

        // The button exists but might be hidden in a collapsed section or at the top of the page
        // First, scroll to top to see the unavailable products warning
        await page.evaluate('window.scrollTo(0, 0)');
        await page.waitForTimeout(1000);

        // Try to make the remove button visible by clicking on any "unavailable" warning banner
        // Reserved for future debugging - warning banner detection
        void await page.evaluate(`
          (function() {
            // Look for any warning/alert about unavailable products
            const alerts = document.querySelectorAll('.alert, .warning, [class*="alert"], [class*="warning"], [class*="unavailable"]');
            for (const alert of alerts) {
              const text = alert.textContent || '';
              if (text.includes('indisponí') || text.includes('unavailable')) {
                return {
                  found: true,
                  text: text.substring(0, 100),
                  tagName: alert.tagName,
                  classList: Array.from(alert.classList).join(' '),
                };
              }
            }
            return { found: false };
          })()
        `);

        // Take a screenshot to see what the page looks like
        const unavailableScreenshot = await screenshot('navigate-slots-unavailable-state');
        screenshots.push(unavailableScreenshot);

        // Try clicking the remove unavailable button - scroll it into view first
        if (unavailableItems.hasRemoveAllButton) {
          logger.info('Attempting to click remove unavailable products button');
          try {
            // Scroll the button into view first
            await page.evaluate(`
              (function() {
                const btn = document.querySelector('.auc-js-cart-remove-unavailable-products');
                if (btn) {
                  btn.scrollIntoView({ behavior: 'instant', block: 'center' });
                }
              })()
            `);
            await page.waitForTimeout(500);

            // Try clicking with JavaScript directly
            void await page.evaluate(`
              (function() {
                const btn = document.querySelector('.auc-js-cart-remove-unavailable-products');
                if (btn) {
                  btn.click();
                  return { clicked: true };
                }
                return { clicked: false };
              })()
            `);

            await page.waitForTimeout(5000);
            await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});

            const urlAfterClick = page.url();

            // Check if we've already navigated to slots page!
            if (urlAfterClick.includes('escolher-horario') || urlAfterClick.includes('delivery') || urlAfterClick.includes('slot')) {
              logger.info('Successfully navigated to slots page via remove button click');

              const directNavScreenshot = await screenshot('navigate-slots-direct-success');
              screenshots.push(directNavScreenshot);

              // We're already on the slots page, return success immediately
              return {
                success: true,
                data: {
                  success: true,
                  url: urlAfterClick,
                  screenshot: directNavScreenshot,
                  slotsAvailable: true,
                },
                screenshots,
                duration: Date.now() - start,
              };
            }
          } catch (e) {
          }
        }

        // Check if modal appeared (use valid CSS selectors, not jQuery)
        const modalVisible = await page.evaluate(`
          (function() {
            const modal = document.querySelector('#confirm-unavailable-products-removal');
            if (!modal) return { exists: false };
            const isVisible = modal.classList.contains('show') ||
                             window.getComputedStyle(modal).display !== 'none';
            // Use valid CSS selectors
            const confirmBtn = modal.querySelector('.auc-js-cart-remove-unavailable-products') ||
                              modal.querySelector('.btn-primary') ||
                              modal.querySelector('button[type="submit"]');
            return {
              exists: true,
              isVisible,
              hasConfirmBtn: !!confirmBtn,
            };
          })()
        `) as { exists: boolean; isVisible?: boolean; hasConfirmBtn?: boolean };


        if (modalVisible.isVisible) {
          logger.info('Modal is visible, clicking confirm');
          try {
            // Use JavaScript click to ensure it works
            await page.evaluate(`
              (function() {
                const modal = document.querySelector('#confirm-unavailable-products-removal');
                if (modal) {
                  const btn = modal.querySelector('.auc-js-cart-remove-unavailable-products') ||
                             modal.querySelector('.btn-primary') ||
                             modal.querySelector('button[type="submit"]');
                  if (btn) btn.click();
                }
              })()
            `);
            await page.waitForTimeout(5000);

            // Check if we navigated to slots after modal confirm
            const urlAfterModal = page.url();
            if (urlAfterModal.includes('escolher-horario') || urlAfterModal.includes('delivery') || urlAfterModal.includes('slot')) {
              logger.info('Successfully navigated to slots page via modal confirm');

              const modalNavScreenshot = await screenshot('navigate-slots-modal-success');
              screenshots.push(modalNavScreenshot);

              return {
                success: true,
                data: {
                  success: true,
                  url: urlAfterModal,
                  screenshot: modalNavScreenshot,
                  slotsAvailable: true,
                },
                screenshots,
                duration: Date.now() - start,
              };
            }
          } catch (e) {
          }
        }

        // Only reload cart if we're still on cart page
        const currentUrl = page.url();
        if (currentUrl.includes('carrinho')) {
          // Reload cart page to get fresh state after removal attempts
          await page.goto('https://www.auchan.pt/pt/carrinho-compras', {
            timeout: 15000,
            waitUntil: 'domcontentloaded',
          });
          await page.waitForTimeout(3000);

          const afterRemovalScreenshot = await screenshot('navigate-slots-after-removal');
          screenshots.push(afterRemovalScreenshot);

          // Check validation state again
          const validationStateAfter = await page.evaluate(`
            (function() {
              const input = document.querySelector('input[name="auc-js-cart-validation"]');
              if (input && input.value) {
                try {
                  return JSON.parse(input.value);
                } catch (e) {
                  return null;
                }
              }
              return null;
            })()
          `) as { error?: boolean; message?: string } | null;


          if (validationStateAfter && validationStateAfter.error) {
            logger.warn('Cart still has validation errors after removal attempt', {
              message: validationStateAfter.message,
            });
          } else {
            logger.info('Cart validation errors cleared');
          }
        }
      }

      // Step 3: Find and click checkout button
      logger.info('Looking for checkout button on cart page');

      const checkoutButtonSelectors = [
        CART_SELECTORS.checkoutButton,
        CART_SELECTORS.checkoutButtonJs,
        CART_SELECTORS.checkoutButtonFallback,
        'a:has-text("Finalizar compra")',
      ];

      let checkoutButton = null;
      let foundSelector: string | null = null;
      for (const selector of checkoutButtonSelectors) {
        try {
          checkoutButton = await page.waitForSelector(selector, { timeout: 3000 });
          if (checkoutButton) {
            foundSelector = selector;
            logger.info('Found checkout button', { selector });
            break;
          }
        } catch {
          // Try next selector
        }
      }

      if (!checkoutButton || !foundSelector) {
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

      // Check if button is still disabled and get more details
      const buttonDetails = await page.evaluate(`
        (function() {
          const btn = document.querySelector('.auc-js-confirm-cart');
          if (!btn) return { found: false };
          return {
            found: true,
            tagName: btn.tagName,
            isDisabled: btn.classList.contains('disabled'),
            hasDisabledAttr: btn.hasAttribute('disabled'),
            href: btn.getAttribute('href'),
            dataUrl: btn.getAttribute('data-url'),
            dataUrlValidation: btn.getAttribute('data-url-validation'),
            classList: Array.from(btn.classList).join(' '),
            innerText: btn.innerText.substring(0, 50),
          };
        })()
      `) as { found: boolean; tagName?: string; isDisabled?: boolean; href?: string; dataUrl?: string; dataUrlValidation?: string; classList?: string; innerText?: string };

      logger.info('Checkout button details', buttonDetails);

      if (buttonDetails.isDisabled) {
        logger.warn('Checkout button is still disabled after attempting to remove unavailable items');
        // Try clicking anyway - the page JS might handle validation
      }

      // Click checkout button
      logger.info('Clicking checkout button', { selector: foundSelector });

      try {
        await page.locator(foundSelector).click({ force: true, timeout: 5000 });
      } catch {
        logger.info('Playwright click failed, trying JavaScript click');
        await page.evaluate(`document.querySelector('.auc-js-confirm-cart')?.click()`);
      }

      // Wait for navigation or modal
      await page.waitForTimeout(3000);
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});

      // Step 4: Handle unavailable products modal if it appears after checkout click
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

      // Step 5: Handle address selection if needed
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

      // Step 6: Verify we're on delivery slot selection page using VERIFIED selectors
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
