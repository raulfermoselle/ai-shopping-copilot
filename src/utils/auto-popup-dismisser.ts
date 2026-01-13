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
 *
 * NOTE: Selectors must be valid CSS (no Playwright :has-text pseudo-selector).
 * Text matching is done in JavaScript after element selection.
 */
const POPUP_PATTERNS = [
  // Cart removal confirmation - "Cancelar" button (HIGHEST PRIORITY - keeps items in cart)
  // Only match if this is NOT the reorder modal (check for absence of Juntar button)
  { selector: 'button', textMatch: 'Cancelar', priority: 100, name: 'cart-removal-cancel', skipIfReorderModal: true },

  // Notification subscription popup - "Não" button next to "Subscrever"
  // This popup asks "Subscreva as nossas notificações..." with Não/Subscrever buttons
  // Uses substring match since button text might have whitespace
  { selector: 'button, a, span[role="button"], div[role="button"]', textMatch: 'Não', priority: 95, name: 'notification-subscription-nao', skipIfReorderModal: true },

  // Subscription popup - "Não" link/button (appears after clicking reorder)
  // CRITICAL: Must use exactMatch: true to avoid matching text on other modals
  // CRITICAL: Must skipIfReorderModal to avoid interfering with merge/replace modal
  { selector: 'a, button, [role="button"]', textMatch: 'Não', exactMatch: true, priority: 90, name: 'subscription-nao', skipIfReorderModal: true },

  // Cookie consent - safe to dismiss anytime
  { selector: '#onetrust-accept-btn-handler', priority: 80, name: 'cookie-consent' },

  // Modal close buttons - SKIP if reorder modal is showing
  // IMPORTANT: Only match specific aria-label patterns, avoid generic class selectors
  { selector: '[aria-label="Close"], [aria-label="Fechar"]', priority: 70, name: 'modal-close', skipIfReorderModal: true },

  // REMOVED: promo-banner-close - too risky, could close important modals
  // REMOVED: Generic dismiss pattern - was too risky
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

      // DANGEROUS BUTTON PATTERNS - Never click these!
      var dangerousPatterns = [
        'Remover todos',      // "Remove all" button text (substring match)
        'Remover todos os produtos',  // Full button text on cart page
        'Eliminar tudo',      // Alternative "Delete all" text
        'auc-cart__remove-all', // Remove all button class
        'remove-all-products', // Modal target ID
        'Confirmar'           // Confirm button on removal modal - NEVER click!
      ];

      function isDangerousElement(element) {
        // Check text content
        var text = element.textContent || '';
        for (var i = 0; i < dangerousPatterns.length; i++) {
          if (text.indexOf(dangerousPatterns[i]) >= 0) {
            return true;
          }
        }

        // Check class attribute
        var className = element.className || '';
        if (typeof className === 'string') {
          for (var i = 0; i < dangerousPatterns.length; i++) {
            if (className.indexOf(dangerousPatterns[i]) >= 0) {
              return true;
            }
          }
        }

        // Check data-target attribute (Bootstrap modal trigger)
        var dataTarget = element.getAttribute('data-target');
        if (dataTarget) {
          for (var i = 0; i < dangerousPatterns.length; i++) {
            if (dataTarget.indexOf(dangerousPatterns[i]) >= 0) {
              return true;
            }
          }
        }

        // Check data-toggle attribute (might trigger modal)
        var dataToggle = element.getAttribute('data-toggle');
        if (dataToggle === 'modal') {
          // Check if the modal target is dangerous
          var target = element.getAttribute('data-target');
          if (target && target.indexOf('remove') >= 0) {
            return true;
          }
        }

        return false;
      }

      function isReorderModalVisible() {
        // The reorder modal has two modes:
        // 1. Merge mode (cart has items): Shows "Juntar" and "Eliminar" buttons
        // 2. Replace mode (cart empty): Shows "Encomendar de novo" button in a modal
        //
        // Check for any of these indicators to detect the reorder modal
        var buttons = document.querySelectorAll('button');
        for (var i = 0; i < buttons.length; i++) {
          var buttonText = buttons[i].textContent || '';

          // Check for merge mode buttons (Juntar or Eliminar)
          if (buttonText.indexOf('Juntar') >= 0 || buttonText.indexOf('Eliminar') >= 0) {
            var styles = window.getComputedStyle(buttons[i]);
            if (styles.display !== 'none' && styles.visibility !== 'hidden' && buttons[i].offsetParent !== null) {
              return true;
            }
          }

          // Check for replace mode: "Encomendar de novo" button in a modal context
          // (must be inside a modal/dialog, not the main page button)
          if (buttonText.indexOf('Encomendar de novo') >= 0) {
            var styles = window.getComputedStyle(buttons[i]);
            if (styles.display !== 'none' && styles.visibility !== 'hidden' && buttons[i].offsetParent !== null) {
              // Check if this button is inside a modal (look for modal ancestors)
              var element = buttons[i];
              while (element && element !== document.body) {
                var className = element.className || '';
                var role = element.getAttribute('role') || '';
                if (typeof className === 'string' && (className.indexOf('modal') >= 0 || role === 'dialog')) {
                  return true;
                }
                element = element.parentElement;
              }
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

                // Text matching: if pattern has textMatch, verify element contains that text
                if (pattern.textMatch) {
                  var elementText = (element.textContent || '').trim();
                  if (pattern.exactMatch) {
                    // Exact match: text must equal textMatch exactly
                    if (elementText !== pattern.textMatch) continue;
                  } else {
                    // Substring match: text must contain textMatch
                    if (elementText.indexOf(pattern.textMatch) < 0) continue;
                  }
                }

                if (element.offsetParent !== null) {
                  var styles = window.getComputedStyle(element);
                  var isVisible = styles.display !== 'none' && styles.visibility !== 'hidden';

                  if (isVisible) {
                    // CRITICAL SAFETY CHECK: Never click dangerous buttons
                    if (isDangerousElement(element)) {
                      console.warn('[AutoPopup] BLOCKED: Refusing to click dangerous element (pattern: ' + pattern.name + ')');
                      continue;
                    }

                    dismissalCount++;
                    console.log('[AutoPopup #' + dismissalCount + '] Dismissing: ' + pattern.name + ' (text: ' + (element.textContent || '').trim().substring(0, 30) + ')');
                    element.click();
                    element.setAttribute('data-popup-dismissed', 'true');
                    // Schedule cascading check for popups that appear after this one is dismissed
                    setTimeout(checkAndDismissPopups, 200);
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
          setTimeout(checkAndDismissPopups, 50);  // Fast response - 50ms debounce
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

      // PERIODIC SCANNER: Fallback in case MutationObserver misses popups
      // Runs every 500ms to catch any popups that appeared without triggering mutations
      var periodicScanInterval = setInterval(function() {
        checkAndDismissPopups();
      }, 500);
      window.__popupPeriodicScan = periodicScanInterval;

      checkAndDismissPopups();

      console.log('[AutoPopup] Observer attached with periodic scanner (500ms fallback)');
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
      // Clear periodic scanner
      if (window.__popupPeriodicScan) {
        clearInterval(window.__popupPeriodicScan);
        delete window.__popupPeriodicScan;
      }
      // Disconnect MutationObserver
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
