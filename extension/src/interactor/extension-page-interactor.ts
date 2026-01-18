/**
 * Extension Page Interactor
 *
 * Implementation of IPageInteractor for Chrome Extension content scripts.
 * Uses native DOM APIs since Playwright is not available.
 *
 * Key differences from Playwright:
 * - Uses document.querySelector/querySelectorAll instead of locators
 * - Uses MutationObserver for popup watching
 * - Uses polling for waiting (no Playwright wait methods)
 * - Screenshots are captured via chrome.tabs.captureVisibleTab
 */

import type {
  IPageInteractor,
  ILogger,
  SelectorChain,
  FindResult,
  CartState,
  PopupPattern,
  ReorderModalResult,
  ReorderModalType,
  NavigationOptions,
} from '@aisc/shared';
import {
  isDangerousText,
  isDangerousClass,
  isDangerousDataTarget,
  REORDER_MODAL_INDICATORS,
} from '@aisc/shared';
import { logger as defaultLogger } from '../utils/logger.js';

// =============================================================================
// Types
// =============================================================================

interface ExtensionInteractorOptions {
  /** Default timeout for operations (ms) */
  defaultTimeout?: number;
  /** Polling interval for wait operations (ms) */
  pollInterval?: number;
}

// =============================================================================
// Element Reference
// =============================================================================

/**
 * Wrapper around DOM element for consistent interface
 */
class ElementRef {
  constructor(public readonly element: Element) {}
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * ExtensionPageInteractor implements IPageInteractor for Chrome Extension.
 *
 * This runs in the content script context with access to the page DOM
 * but without Playwright's high-level APIs.
 */
export class ExtensionPageInteractor implements IPageInteractor {
  private readonly extLogger: ILogger;
  private readonly options: Required<ExtensionInteractorOptions>;
  private popupObserver: MutationObserver | null = null;
  private periodicScanInterval: ReturnType<typeof setInterval> | null = null;
  private dismissalCount = 0;

  constructor(
    logger?: ILogger,
    options: ExtensionInteractorOptions = {}
  ) {
    this.extLogger = logger ?? {
      info: (comp, msg, data) => defaultLogger.info(comp, msg, data),
      warn: (comp, msg, data) => defaultLogger.warn(comp, msg, data),
      error: (comp, msg, data) => defaultLogger.error(comp, msg, data),
      debug: (comp, msg, data) => defaultLogger.debug(comp, msg, data),
    };
    this.options = {
      defaultTimeout: options.defaultTimeout ?? 5000,
      pollInterval: options.pollInterval ?? 100,
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
    const startTime = Date.now();

    // Try until timeout
    while (Date.now() - startTime < timeout) {
      const allSelectors = [chain.primary, ...chain.fallbacks];

      for (let i = 0; i < allSelectors.length; i++) {
        const selector = allSelectors[i]!;
        try {
          // Handle Playwright-style :has-text() selectors
          const normalizedSelector = this.normalizeSelector(selector);
          const element = document.querySelector(normalizedSelector);

          if (element) {
            // Check text match if selector had :has-text()
            const textMatch = this.extractTextMatch(selector);
            if (textMatch) {
              const elementText = element.textContent ?? '';
              if (!elementText.includes(textMatch)) {
                continue;
              }
            }

            // Check visibility if required
            if (requireVisible && !this.isElementVisible(element)) {
              continue;
            }

            this.extLogger.debug('ExtensionInteractor', 'Found element', {
              chainId: chain.id,
              selectorIndex: i,
              selector,
            });

            return {
              elementRef: new ElementRef(element),
              selectorIndex: i,
              matchedSelector: selector,
            };
          }
        } catch {
          // Invalid selector, try next
        }
      }

      // Wait before next poll
      await this.sleep(this.options.pollInterval);
    }

    this.extLogger.debug('ExtensionInteractor', 'Element not found', {
      chainId: chain.id,
    });

    return null;
  }

  async findAllElements(
    selector: string,
    _options?: { timeout?: number }
  ): Promise<unknown[]> {
    try {
      const normalizedSelector = this.normalizeSelector(selector);
      const elements = document.querySelectorAll(normalizedSelector);
      return Array.from(elements).map((el) => new ElementRef(el));
    } catch {
      return [];
    }
  }

  /**
   * Normalize Playwright-style selectors to valid CSS.
   * Handles :has-text() and >> text= patterns.
   */
  private normalizeSelector(selector: string): string {
    // Remove :has-text() - we'll handle text matching separately
    let normalized = selector.replace(/:has-text\("[^"]*"\)/g, '');

    // Remove >> text= patterns
    normalized = normalized.replace(/\s*>>\s*text="[^"]*"/g, '');

    return normalized.trim();
  }

  /**
   * Extract text match from Playwright-style selector.
   */
  private extractTextMatch(selector: string): string | null {
    // Match :has-text("...")
    const hasTextMatch = selector.match(/:has-text\("([^"]*)"\)/);
    if (hasTextMatch?.[1]) {
      return hasTextMatch[1];
    }

    // Match >> text="..."
    const textMatch = selector.match(/text="([^"]*)"/);
    if (textMatch?.[1]) {
      return textMatch[1];
    }

    return null;
  }

  // ===========================================================================
  // Element Interaction
  // ===========================================================================

  async click(elementRef: unknown, options?: { timeout?: number }): Promise<void> {
    const ref = elementRef as ElementRef;
    const element = ref.element as HTMLElement;

    // Wait for element to be clickable
    const timeout = options?.timeout ?? this.options.defaultTimeout;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (this.isElementVisible(element) && !this.isElementDisabled(element)) {
        element.click();
        return;
      }
      await this.sleep(this.options.pollInterval);
    }

    throw new Error('Element not clickable within timeout');
  }

  async isVisible(elementRef: unknown): Promise<boolean> {
    const ref = elementRef as ElementRef;
    return this.isElementVisible(ref.element);
  }

  async getTextContent(elementRef: unknown): Promise<string | null> {
    const ref = elementRef as ElementRef;
    return ref.element.textContent;
  }

  async getAttribute(elementRef: unknown, name: string): Promise<string | null> {
    const ref = elementRef as ElementRef;
    return ref.element.getAttribute(name);
  }

  private isElementVisible(element: Element): boolean {
    if (!element.isConnected) return false;

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }

    // Check if element is in viewport
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return false;
    }

    return true;
  }

  private isElementDisabled(element: Element): boolean {
    if (element instanceof HTMLButtonElement) {
      return element.disabled;
    }
    if (element.hasAttribute('disabled')) {
      return true;
    }
    return false;
  }

  // ===========================================================================
  // Cart State
  // ===========================================================================

  async getCartState(): Promise<CartState> {
    const itemCount = this.getCartCount();
    const totalCents = this.getCartTotal();

    return {
      itemCount,
      totalCents,
      capturedAt: Date.now(),
    };
  }

  private getCartCount(): number | null {
    const cartCountSelectors = [
      '.auc-header-cart__count',
      '[data-testid="cart-count"]',
      '.cart-counter',
      '.cart-quantity',
      '.badge.cart-badge',
      '.auc-header__minicart .auc-badge',
      '.auc-header-actions__cart .auc-badge',
      '.minicart-quantity:not(.d-none)',
      '[class*="cart"][class*="badge"]',
      '[class*="cart"][class*="count"]',
      '[data-cart-count]',
    ];

    for (const selector of cartCountSelectors) {
      try {
        const element = document.querySelector(selector);
        if (element && this.isElementVisible(element)) {
          // Try data attribute first
          const dataCount = element.getAttribute('data-cart-count');
          if (dataCount) {
            const count = parseInt(dataCount, 10);
            if (!isNaN(count)) return count;
          }

          // Try text content
          const text = element.textContent?.trim() ?? '';
          const match = text.match(/^(\d+)/);
          if (match?.[1]) {
            return parseInt(match[1], 10);
          }
        }
      } catch {
        // Try next selector
      }
    }

    return null;
  }

  private getCartTotal(): number | null {
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
        const element = document.querySelector(selector);
        if (element && this.isElementVisible(element)) {
          const text = element.textContent ?? '';
          // Parse euro value like "0,93 €" or "162,51 €" to cents
          const cleanText = text.replace(/[^\d,\.]/g, '').replace(',', '.');
          const value = parseFloat(cleanText);
          if (!isNaN(value)) {
            return Math.round(value * 100);
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
          const normalizedSelector = this.normalizeSelector(selector);
          const elements = document.querySelectorAll(normalizedSelector);

          for (const element of elements) {
            if (!this.isElementVisible(element)) continue;

            // Text matching
            if (pattern.textMatch) {
              const text = element.textContent?.trim() ?? '';
              if (pattern.exactMatch) {
                if (text !== pattern.textMatch) continue;
              } else {
                if (!text.includes(pattern.textMatch)) continue;
              }
            }

            // Safety check: don't click dangerous buttons
            if (this.isDangerousElement(element)) {
              this.extLogger.warn('ExtensionInteractor', 'BLOCKED: dangerous button', {
                pattern: pattern.name,
              });
              continue;
            }

            // Click to dismiss
            try {
              (element as HTMLElement).click();
              dismissed++;
              this.extLogger.info('ExtensionInteractor', 'Dismissed popup', {
                pattern: pattern.name,
              });
              await this.sleep(500);
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

  private isDangerousElement(element: Element): boolean {
    const text = element.textContent ?? '';
    if (isDangerousText(text)) return true;

    const className = element.getAttribute('class') ?? '';
    if (isDangerousClass(className)) return true;

    const dataTarget = element.getAttribute('data-target') ?? '';
    if (dataTarget && isDangerousDataTarget(dataTarget)) return true;

    return false;
  }

  async isReorderModalVisible(): Promise<ReorderModalResult> {
    // Check for cart removal modal
    const removalText = document.querySelector(
      `*:has-text("${REORDER_MODAL_INDICATORS.cartRemovalText}")`
    );
    // Fallback: search text content
    if (document.body.textContent?.includes(REORDER_MODAL_INDICATORS.cartRemovalText)) {
      // Make sure it's in a visible modal
      const modals = document.querySelectorAll('.modal, [role="dialog"], .auc-modal');
      for (const modal of modals) {
        if (this.isElementVisible(modal)) {
          if (modal.textContent?.includes(REORDER_MODAL_INDICATORS.cartRemovalText)) {
            return { type: 'removal', found: true };
          }
        }
      }
    }

    // Check for merge modal (has Juntar or Eliminar button)
    const buttons = document.querySelectorAll('button');
    for (const button of buttons) {
      const text = button.textContent ?? '';
      for (const indicator of REORDER_MODAL_INDICATORS.mergeButtons) {
        if (text.includes(indicator) && this.isElementVisible(button)) {
          return { type: 'merge', found: true };
        }
      }
    }

    // Check for replace modal (Encomendar de novo in modal)
    const modalContainers = document.querySelectorAll('.modal, [role="dialog"], .auc-modal');
    for (const modal of modalContainers) {
      if (!this.isElementVisible(modal)) continue;

      const confirmBtn = modal.querySelector('button');
      if (confirmBtn) {
        const btnText = confirmBtn.textContent ?? '';
        if (btnText.includes('Encomendar de novo')) {
          return { type: 'replace', found: true };
        }
      }
    }

    return { type: 'none', found: false };
  }

  async attachPopupObserver(patterns: PopupPattern[]): Promise<void> {
    if (this.popupObserver) {
      this.extLogger.debug('ExtensionInteractor', 'Popup observer already attached');
      return;
    }

    const checkAndDismiss = () => {
      this.dismissPopups(patterns).then((count) => {
        this.dismissalCount += count;
      });
    };

    // MutationObserver for DOM changes
    this.popupObserver = new MutationObserver((mutations) => {
      let shouldCheck = false;

      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          shouldCheck = true;
          break;
        }
        if (mutation.type === 'attributes') {
          shouldCheck = true;
          break;
        }
      }

      if (shouldCheck) {
        setTimeout(checkAndDismiss, 50);
      }
    });

    this.popupObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'aria-hidden', 'data-visible'],
    });

    // Periodic scanner as fallback
    this.periodicScanInterval = setInterval(checkAndDismiss, 500);

    // Initial check
    checkAndDismiss();

    this.extLogger.info('ExtensionInteractor', 'Popup observer attached');
  }

  async detachPopupObserver(): Promise<void> {
    if (this.periodicScanInterval) {
      clearInterval(this.periodicScanInterval);
      this.periodicScanInterval = null;
    }

    if (this.popupObserver) {
      this.popupObserver.disconnect();
      this.popupObserver = null;
    }

    this.extLogger.info('ExtensionInteractor', 'Popup observer detached', {
      totalDismissals: this.dismissalCount,
    });
  }

  // ===========================================================================
  // Navigation
  // ===========================================================================

  async getCurrentUrl(): Promise<string> {
    return window.location.href;
  }

  async navigateTo(url: string, options?: NavigationOptions): Promise<void> {
    // Content scripts can't navigate directly - send message to service worker
    // For now, just set location and wait
    window.location.href = url;

    // Wait for navigation
    const timeout = options?.timeout ?? this.options.defaultTimeout;
    await this.waitForNavigation({ timeout });
  }

  async waitForTimeout(ms: number): Promise<void> {
    await this.sleep(ms);
  }

  async waitForNavigation(options?: NavigationOptions): Promise<void> {
    const timeout = options?.timeout ?? this.options.defaultTimeout;
    const urlPattern = options?.urlPattern;
    const startTime = Date.now();

    // Poll for URL change or load state
    while (Date.now() - startTime < timeout) {
      if (urlPattern) {
        if (urlPattern.test(window.location.href)) {
          return;
        }
      } else {
        // Just wait for document to be ready
        if (document.readyState === 'complete') {
          return;
        }
      }
      await this.sleep(this.options.pollInterval);
    }

    if (urlPattern) {
      throw new Error(`Navigation timeout: URL did not match pattern within ${timeout}ms`);
    }
  }

  // ===========================================================================
  // Screenshots
  // ===========================================================================

  async screenshot(name: string): Promise<string> {
    // Content scripts can't take screenshots directly
    // Would need to message the service worker to use chrome.tabs.captureVisibleTab
    // For now, return placeholder
    this.extLogger.debug('ExtensionInteractor', 'Screenshot requested (not implemented in content script)', {
      name,
    });
    return `screenshot:${name}:${Date.now()}`;
  }

  // ===========================================================================
  // Logging
  // ===========================================================================

  getLogger(): ILogger {
    return this.extLogger;
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
