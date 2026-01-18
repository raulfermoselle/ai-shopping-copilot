/**
 * Playwright Page Interactor
 *
 * Implementation of IPageInteractor for Playwright-based automation.
 * Wraps existing battle-tested patterns from reorder.ts, auto-popup-dismisser.ts,
 * and popup-handler.ts.
 */

import type { Page, Locator } from 'playwright';
import type {
  IPageInteractor,
  ILogger,
  SelectorChain,
  FindResult,
  CartState,
  PopupPattern,
  ReorderModalResult,
  NavigationOptions,
} from '../../packages/shared/src/index.js';
import {
  isDangerousText,
  isDangerousClass,
  isDangerousDataTarget,
  REORDER_MODAL_INDICATORS,
} from '../../packages/shared/src/index.js';

// =============================================================================
// Types
// =============================================================================

interface PlaywrightInteractorOptions {
  /** Screenshots directory */
  screenshotDir?: string;
  /** Default timeout for operations (ms) */
  defaultTimeout?: number;
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * PlaywrightPageInteractor implements IPageInteractor for Playwright automation.
 */
export class PlaywrightPageInteractor implements IPageInteractor {
  private readonly page: Page;
  private readonly logger: ILogger;
  private readonly options: Required<PlaywrightInteractorOptions>;
  private popupObserverAttached = false;

  constructor(page: Page, logger: ILogger, options: PlaywrightInteractorOptions = {}) {
    this.page = page;
    this.logger = logger;
    this.options = {
      screenshotDir: options.screenshotDir ?? './screenshots',
      defaultTimeout: options.defaultTimeout ?? 5000,
    };
  }

  // ===========================================================================
  // Element Finding
  // ===========================================================================

  async findElement(
    chain: SelectorChain,
    options?: { timeout?: number; visible?: boolean }
  ): Promise<FindResult | null> {
    const timeout = options?.timeout ?? this.options.defaultTimeout;
    const requireVisible = options?.visible ?? true;

    // Try primary selector first
    const allSelectors = [chain.primary, ...chain.fallbacks];

    for (let i = 0; i < allSelectors.length; i++) {
      const selector = allSelectors[i]!;
      try {
        const locator = this.page.locator(selector).first();
        const isVisible = await locator
          .isVisible({ timeout: Math.min(timeout, 2000) })
          .catch(() => false);

        if (requireVisible && !isVisible) {
          continue;
        }

        // Check if element exists
        const count = await locator.count();
        if (count > 0) {
          this.logger.debug('PlaywrightInteractor', 'Found element', {
            chainId: chain.id,
            selectorIndex: i,
            selector,
          });

          return {
            elementRef: locator,
            selectorIndex: i,
            matchedSelector: selector,
          };
        }
      } catch {
        // Try next selector
      }
    }

    this.logger.debug('PlaywrightInteractor', 'Element not found', {
      chainId: chain.id,
      triedSelectors: allSelectors.length,
    });

    return null;
  }

  async findAllElements(
    selector: string,
    _options?: { timeout?: number }
  ): Promise<unknown[]> {
    try {
      const locators = await this.page.locator(selector).all();
      return locators;
    } catch {
      return [];
    }
  }

  // ===========================================================================
  // Element Interaction
  // ===========================================================================

  async click(elementRef: unknown, options?: { timeout?: number }): Promise<void> {
    const locator = elementRef as Locator;
    const timeout = options?.timeout ?? this.options.defaultTimeout;
    await locator.click({ timeout });
  }

  async isVisible(elementRef: unknown): Promise<boolean> {
    const locator = elementRef as Locator;
    return locator.isVisible().catch(() => false);
  }

  async getTextContent(elementRef: unknown): Promise<string | null> {
    const locator = elementRef as Locator;
    return locator.textContent().catch(() => null);
  }

  async getAttribute(elementRef: unknown, name: string): Promise<string | null> {
    const locator = elementRef as Locator;
    return locator.getAttribute(name).catch(() => null);
  }

  // ===========================================================================
  // Cart State
  // ===========================================================================

  async getCartState(): Promise<CartState> {
    const itemCount = await this.getCartCount();
    const totalCents = await this.getCartTotal();

    return {
      itemCount,
      totalCents,
      capturedAt: Date.now(),
    };
  }

  private async getCartCount(): Promise<number | null> {
    const cartCountSelectors = [
      '.auc-header-cart__count',
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
    ];

    for (const selector of cartCountSelectors) {
      try {
        const element = this.page.locator(selector).first();
        const isVisible = await element.isVisible({ timeout: 1500 }).catch(() => false);

        if (isVisible) {
          // First try data attribute
          const dataCount = await element.getAttribute('data-cart-count').catch(() => null);
          if (dataCount) {
            const count = parseInt(dataCount, 10);
            if (!isNaN(count)) {
              return count;
            }
          }

          // Then try text content
          const text = await element.textContent();
          if (text) {
            const match = text.trim().match(/^(\d+)/);
            if (match?.[1]) {
              return parseInt(match[1], 10);
            }
          }
        }
      } catch {
        // Try next selector
      }
    }

    return null;
  }

  private async getCartTotal(): Promise<number | null> {
    const cartTotalSelectors = [
      '.auc-cart-value.auc-header-cart-total',
      '.auc-header-cart-total',
      '.auc-cart-value__total .auc-cart-value',
      '.auc-cart-value',
      '[class*="cart"][class*="total"]',
      '[class*="cart"][class*="value"]',
    ];

    for (const selector of cartTotalSelectors) {
      try {
        const element = this.page.locator(selector).first();
        const isVisible = await element.isVisible({ timeout: 2000 }).catch(() => false);

        if (isVisible) {
          const text = await element.textContent();
          if (text) {
            // Parse euro value like "0,93 €" or "162,51 €" to cents
            const cleanText = text.replace(/[^\d,\.]/g, '').replace(',', '.');
            const value = parseFloat(cleanText);
            if (!isNaN(value)) {
              return Math.round(value * 100);
            }
          }
        }
      } catch {
        // Try next selector
      }
    }

    return null;
  }

  // ===========================================================================
  // Popup Handling
  // ===========================================================================

  async dismissPopups(patterns: PopupPattern[]): Promise<number> {
    let dismissed = 0;

    // Sort by priority (highest first)
    const sortedPatterns = [...patterns].sort((a, b) => b.priority - a.priority);

    // Check if reorder modal is visible
    const modalInfo = await this.isReorderModalVisible();
    const reorderModalVisible = modalInfo.found && modalInfo.type !== 'none';

    for (const pattern of sortedPatterns) {
      // Skip patterns that shouldn't run when reorder modal is visible
      if (reorderModalVisible && pattern.skipIfReorderModal) {
        continue;
      }

      try {
        const selectors = pattern.selector.split(',').map((s) => s.trim());

        for (const selector of selectors) {
          const elements = await this.page.locator(selector).all();

          for (const element of elements) {
            const isVisible = await element.isVisible({ timeout: 1000 }).catch(() => false);
            if (!isVisible) continue;

            // Text matching
            if (pattern.textMatch) {
              const text = (await element.textContent())?.trim() ?? '';
              if (pattern.exactMatch) {
                if (text !== pattern.textMatch) continue;
              } else {
                if (!text.includes(pattern.textMatch)) continue;
              }
            }

            // Safety check: don't click dangerous buttons
            if (await this.isDangerousElement(element)) {
              this.logger.warn('PlaywrightInteractor', 'BLOCKED: dangerous button', {
                pattern: pattern.name,
              });
              continue;
            }

            // Click to dismiss
            try {
              await element.click({ timeout: 1000 });
              dismissed++;
              this.logger.info('PlaywrightInteractor', 'Dismissed popup', {
                pattern: pattern.name,
              });
              await this.page.waitForTimeout(500);
            } catch {
              // Click failed, continue
            }
          }
        }
      } catch {
        // Pattern failed, try next
      }
    }

    return dismissed;
  }

  private async isDangerousElement(element: Locator): Promise<boolean> {
    try {
      const text = (await element.textContent()) ?? '';
      if (isDangerousText(text)) return true;

      const className = (await element.getAttribute('class')) ?? '';
      if (isDangerousClass(className)) return true;

      const dataTarget = (await element.getAttribute('data-target')) ?? '';
      if (dataTarget && isDangerousDataTarget(dataTarget)) return true;

      return false;
    } catch {
      return false;
    }
  }

  async isReorderModalVisible(): Promise<ReorderModalResult> {
    // Check for cart removal modal
    const hasRemovalText =
      (await this.page
        .locator(`text="${REORDER_MODAL_INDICATORS.cartRemovalText}"`)
        .count()) > 0;
    if (hasRemovalText) {
      return { type: 'removal', found: true };
    }

    // Check for merge modal (has Juntar button)
    for (const buttonText of REORDER_MODAL_INDICATORS.mergeButtons) {
      const button = this.page.locator(`button:has-text("${buttonText}")`).first();
      const isVisible = await button.isVisible({ timeout: 500 }).catch(() => false);
      if (isVisible) {
        return { type: 'merge', found: true };
      }
    }

    // Check for replace modal (Encomendar de novo in modal context)
    const modalContainers = ['.modal', '[role="dialog"]', '.auc-modal'];
    for (const container of modalContainers) {
      const confirmBtn = this.page
        .locator(`${container} button:has-text("Encomendar de novo")`)
        .first();
      const isVisible = await confirmBtn.isVisible({ timeout: 500 }).catch(() => false);
      if (isVisible) {
        return { type: 'replace', found: true };
      }
    }

    return { type: 'none', found: false };
  }

  async attachPopupObserver(patterns: PopupPattern[]): Promise<void> {
    if (this.popupObserverAttached) {
      this.logger.debug('PlaywrightInteractor', 'Popup observer already attached');
      return;
    }

    const patternsJSON = JSON.stringify(patterns);

    await this.page.evaluate(`
      (function(patternsStr) {
        var patterns = JSON.parse(patternsStr);

        if (window.__popupObserver) {
          console.log('[AutoPopup] Observer already attached');
          return;
        }

        var dismissalCount = 0;

        var dangerousPatterns = [
          'Remover todos',
          'Remover todos os produtos',
          'Eliminar tudo',
          'auc-cart__remove-all',
          'remove-all-products',
          'Confirmar'
        ];

        function isDangerousElement(element) {
          var text = element.textContent || '';
          for (var i = 0; i < dangerousPatterns.length; i++) {
            if (text.indexOf(dangerousPatterns[i]) >= 0) return true;
          }
          var className = element.className || '';
          if (typeof className === 'string') {
            for (var i = 0; i < dangerousPatterns.length; i++) {
              if (className.indexOf(dangerousPatterns[i]) >= 0) return true;
            }
          }
          var dataTarget = element.getAttribute('data-target');
          if (dataTarget) {
            for (var i = 0; i < dangerousPatterns.length; i++) {
              if (dataTarget.indexOf(dangerousPatterns[i]) >= 0) return true;
            }
          }
          return false;
        }

        function isReorderModalVisible() {
          var buttons = document.querySelectorAll('button');
          for (var i = 0; i < buttons.length; i++) {
            var buttonText = buttons[i].textContent || '';
            if (buttonText.indexOf('Juntar') >= 0 || buttonText.indexOf('Eliminar') >= 0) {
              var styles = window.getComputedStyle(buttons[i]);
              if (styles.display !== 'none' && styles.visibility !== 'hidden' && buttons[i].offsetParent !== null) {
                return true;
              }
            }
            if (buttonText.indexOf('Encomendar de novo') >= 0) {
              var styles = window.getComputedStyle(buttons[i]);
              if (styles.display !== 'none' && styles.visibility !== 'hidden' && buttons[i].offsetParent !== null) {
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

          var reorderModalVisible = isReorderModalVisible();
          if (reorderModalVisible) {
            console.log('[AutoPopup] Reorder modal detected - skipping protected patterns');
          }

          for (var i = 0; i < sortedPatterns.length; i++) {
            var pattern = sortedPatterns[i];
            if (reorderModalVisible && pattern.skipIfReorderModal) continue;

            try {
              var selectors = pattern.selector.split(',').map(function(s) { return s.trim(); });
              for (var j = 0; j < selectors.length; j++) {
                var elements = document.querySelectorAll(selectors[j]);
                for (var k = 0; k < elements.length; k++) {
                  var element = elements[k];
                  if (pattern.textMatch) {
                    var elementText = (element.textContent || '').trim();
                    if (pattern.exactMatch) {
                      if (elementText !== pattern.textMatch) continue;
                    } else {
                      if (elementText.indexOf(pattern.textMatch) < 0) continue;
                    }
                  }
                  if (element.offsetParent !== null) {
                    var styles = window.getComputedStyle(element);
                    var isVisible = styles.display !== 'none' && styles.visibility !== 'hidden';
                    if (isVisible) {
                      if (isDangerousElement(element)) {
                        console.warn('[AutoPopup] BLOCKED: Refusing to click dangerous element');
                        continue;
                      }
                      dismissalCount++;
                      console.log('[AutoPopup #' + dismissalCount + '] Dismissing: ' + pattern.name);
                      element.click();
                      element.setAttribute('data-popup-dismissed', 'true');
                      setTimeout(checkAndDismissPopups, 200);
                    }
                  }
                }
              }
            } catch (err) {
              console.warn('[AutoPopup] Error checking pattern:', err);
            }
          }
        }

        var observer = new MutationObserver(function(mutations) {
          var shouldCheck = false;
          for (var i = 0; i < mutations.length; i++) {
            if (mutations[i].type === 'childList' && mutations[i].addedNodes.length > 0) {
              shouldCheck = true;
              break;
            }
            if (mutations[i].type === 'attributes') {
              shouldCheck = true;
              break;
            }
          }
          if (shouldCheck) setTimeout(checkAndDismissPopups, 50);
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['style', 'class', 'aria-hidden', 'data-visible']
        });

        window.__popupObserver = observer;
        window.__popupDismissalCount = 0;

        var periodicScanInterval = setInterval(function() {
          checkAndDismissPopups();
        }, 500);
        window.__popupPeriodicScan = periodicScanInterval;

        checkAndDismissPopups();
        console.log('[AutoPopup] Observer attached');
      })(${JSON.stringify(patternsJSON)})
    `);

    this.popupObserverAttached = true;
    this.logger.info('PlaywrightInteractor', 'Popup observer attached');
  }

  async detachPopupObserver(): Promise<void> {
    if (!this.popupObserverAttached) return;

    await this.page.evaluate(`
      (function() {
        if (window.__popupPeriodicScan) {
          clearInterval(window.__popupPeriodicScan);
          delete window.__popupPeriodicScan;
        }
        if (window.__popupObserver) {
          window.__popupObserver.disconnect();
          delete window.__popupObserver;
          console.log('[AutoPopup] Observer detached');
        }
      })()
    `);

    this.popupObserverAttached = false;
    this.logger.info('PlaywrightInteractor', 'Popup observer detached');
  }

  // ===========================================================================
  // Navigation
  // ===========================================================================

  async getCurrentUrl(): Promise<string> {
    return this.page.url();
  }

  async navigateTo(url: string, options?: NavigationOptions): Promise<void> {
    await this.page.goto(url, {
      timeout: options?.timeout ?? this.options.defaultTimeout,
      waitUntil: 'domcontentloaded',
    });
  }

  async waitForTimeout(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  async waitForNavigation(options?: NavigationOptions): Promise<void> {
    if (options?.urlPattern) {
      await this.page.waitForURL(options.urlPattern, {
        timeout: options.timeout ?? this.options.defaultTimeout,
      });
    } else {
      await this.page.waitForLoadState('domcontentloaded', {
        timeout: options?.timeout ?? this.options.defaultTimeout,
      });
    }
  }

  // ===========================================================================
  // Screenshots
  // ===========================================================================

  async screenshot(name: string): Promise<string> {
    const timestamp = Date.now();
    const path = `${this.options.screenshotDir}/${name}-${timestamp}.png`;
    await this.page.screenshot({ path, fullPage: false });
    return path;
  }

  // ===========================================================================
  // Logging
  // ===========================================================================

  getLogger(): ILogger {
    return this.logger;
  }
}
