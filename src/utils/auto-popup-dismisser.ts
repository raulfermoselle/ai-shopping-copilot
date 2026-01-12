/**
 * Auto Popup Dismisser
 *
 * Attaches a MutationObserver to the page that automatically dismisses
 * known popup patterns AS SOON AS they appear in the DOM.
 *
 * This solves the problem of popups appearing at unpredictable times:
 * - Subscription prompts
 * - Cart removal confirmations
 * - Cookie consent banners
 * - Promotional overlays
 *
 * The observer watches for DOM changes and clicks dismiss buttons
 * immediately when they become visible.
 */

import type { Page } from 'playwright';
import type { Logger } from './logger.js';

/**
 * Known popup patterns with their dismiss strategies
 *
 * IMPORTANT: The reorder modal (with "Juntar"/"Eliminar" buttons) must NOT be dismissed.
 * We need to interact with it to merge orders into the cart.
 */
const POPUP_PATTERNS = [
  // Cart removal confirmation - "Cancelar" button (HIGHEST PRIORITY - keeps items in cart)
  // Only match if this is NOT the reorder modal (check for absence of Juntar button)
  { selector: 'button:has-text("Cancelar")', priority: 100, name: 'cart-removal-cancel', skipIfReorderModal: true },

  // Subscription popup - "Não" link/button
  { selector: 'a:has-text("Não"), button:has-text("Não"), [role="button"]:has-text("Não")', priority: 90, name: 'subscription-nao' },

  // Cookie consent
  { selector: '#onetrust-accept-btn-handler, button:has-text("Aceitar")', priority: 80, name: 'cookie-consent' },

  // Modal close buttons - SKIP if reorder modal is showing
  { selector: '.modal-close, [aria-label="Close"], [aria-label="Fechar"], button:has-text("×")', priority: 70, name: 'modal-close', skipIfReorderModal: true },

  // Generic dismiss buttons - SKIP if reorder modal is showing
  { selector: '.notification-close, .popup-dismiss, [data-dismiss="modal"]', priority: 60, name: 'generic-dismiss', skipIfReorderModal: true },
];

/**
 * Attach a MutationObserver that automatically dismisses popups.
 *
 * The observer:
 * 1. Watches for DOM changes (new elements, visibility changes)
 * 2. Checks against known popup patterns
 * 3. Clicks dismiss buttons immediately when they appear
 * 4. Handles cascading popups (multiple popups appearing in sequence)
 *
 * @param page - Playwright page
 * @param logger - Logger for tracking dismissals
 */
export async function attachPopupObserver(page: Page, logger: Logger): Promise<void> {
  logger.info('Attaching auto-popup dismisser');

  // Serialize patterns to avoid transpilation issues with evaluate
  const patternsJSON = JSON.stringify(POPUP_PATTERNS);

  // Execute as a string to avoid transpiler mangling
  await page.evaluate(`
    (function(patternsStr) {
      var patterns = JSON.parse(patternsStr);

      if (window.__popupObserver) {
        console.log('[AutoPopup] Observer already attached');
        return;
      }

      var dismissalCount = 0;

      function isReorderModalVisible() {
        // The reorder modal has a "Juntar" button - if visible, don't dismiss other modals
        var juntarButtons = document.querySelectorAll('button');
        for (var i = 0; i < juntarButtons.length; i++) {
          if (juntarButtons[i].textContent && juntarButtons[i].textContent.indexOf('Juntar') >= 0) {
            var styles = window.getComputedStyle(juntarButtons[i]);
            if (styles.display !== 'none' && styles.visibility !== 'hidden' && juntarButtons[i].offsetParent !== null) {
              return true;
            }
          }
        }
        return false;
      }

      function checkAndDismissPopups() {
        var sortedPatterns = patterns.slice().sort(function(a, b) {
          return b.priority - a.priority;
        });

        // Check if reorder modal is showing - if so, skip certain patterns
        var reorderModalVisible = isReorderModalVisible();
        if (reorderModalVisible) {
          console.log('[AutoPopup] Reorder modal detected - skipping protected patterns');
        }

        for (var i = 0; i < sortedPatterns.length; i++) {
          var pattern = sortedPatterns[i];

          // Skip patterns that shouldn't run when reorder modal is visible
          if (reorderModalVisible && pattern.skipIfReorderModal) {
            continue;
          }

          try {
            var selectors = pattern.selector.split(',').map(function(s) {
              return s.trim();
            });

            for (var j = 0; j < selectors.length; j++) {
              var selector = selectors[j];
              var elements = document.querySelectorAll(selector);

              for (var k = 0; k < elements.length; k++) {
                var element = elements[k];
                if (element.offsetParent !== null) {
                  var styles = window.getComputedStyle(element);
                  var isVisible = styles.display !== 'none' && styles.visibility !== 'hidden';

                  if (isVisible) {
                    dismissalCount++;
                    console.log('[AutoPopup #' + dismissalCount + '] Dismissing: ' + pattern.name + ' (selector: ' + selector + ')');
                    element.click();
                    element.setAttribute('data-popup-dismissed', 'true');
                  }
                }
              }
            }
          } catch (err) {
            console.warn('[AutoPopup] Error checking pattern ' + pattern.name + ':', err);
          }
        }
      }

      var observer = new MutationObserver(function(mutations) {
        var shouldCheck = false;

        for (var i = 0; i < mutations.length; i++) {
          var mutation = mutations[i];
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            shouldCheck = true;
            break;
          }
          if (mutation.type === 'attributes' && (mutation.attributeName === 'style' || mutation.attributeName === 'class')) {
            shouldCheck = true;
            break;
          }
        }

        if (shouldCheck) {
          setTimeout(checkAndDismissPopups, 100);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'aria-hidden', 'data-visible']
      });

      window.__popupObserver = observer;
      window.__popupDismissalCount = 0;

      checkAndDismissPopups();

      console.log('[AutoPopup] Observer attached and monitoring');
    })(${JSON.stringify(patternsJSON)})
  `);

  logger.info('Auto-popup dismisser attached successfully');
}

/**
 * Detach the popup observer and stop monitoring.
 *
 * @param page - Playwright page
 */
export async function detachPopupObserver(page: Page): Promise<void> {
  await page.evaluate(`
    (function() {
      if (window.__popupObserver) {
        window.__popupObserver.disconnect();
        delete window.__popupObserver;
        var count = window.__popupDismissalCount || 0;
        console.log('[AutoPopup] Observer detached. Total dismissals: ' + count);
      }
    })()
  `);
}

/**
 * Get the current dismissal count from the observer.
 *
 * @param page - Playwright page
 * @returns Number of popups dismissed
 */
export async function getPopupDismissalCount(page: Page): Promise<number> {
  const count = await page.evaluate(`
    (function() {
      return window.__popupDismissalCount || 0;
    })()
  `);
  return count as number;
}
