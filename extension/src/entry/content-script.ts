/**
 * Content Script Entry Point
 *
 * This script runs in the context of Auchan.pt pages and provides
 * direct DOM access for data extraction. It handles messages from
 * the service worker and routes them to the appropriate extractor.
 *
 * IMPORTANT: Content scripts run in an isolated world - they can access
 * the DOM but not the page's JavaScript context.
 *
 * Pattern: Message router → Extractor → Response
 */

import { detectLoginState, isOnLoginPage, isLoginButtonVisible } from '../content-scripts/extractors/login-detector.js';
import { extractOrderHistory, isOnOrderHistoryPage, getOrderCount } from '../content-scripts/extractors/order-history.js';
import { extractCartItems, isOnCartPage, hasCartItems } from '../content-scripts/extractors/cart-scanner.js';
import { extractDeliverySlots, extractAllDaysSlots, isOnSlotsPage } from '../content-scripts/extractors/slot-extractor.js';
import { logger } from '../utils/logger.js';
import { ExtensionPageInteractor } from '../interactor/extension-page-interactor.js';
import {
  POPUP_PATTERNS,
  isDangerousText,
} from '@aisc/shared';

// CSS-compatible modal selectors (no Playwright :has-text() syntax)
const MODAL_SELECTORS = {
  containers: ['.modal', '[role="dialog"]', '.auc-modal', '[aria-modal="true"]'],
  mergeButtonTexts: ['juntar', 'adicionar'],  // Portuguese: "Add to cart"
  confirmButtonTexts: ['encomendar de novo', 'confirmar', 'eliminar'],  // Portuguese: "Reorder"/"Confirm"/"Remove"
  cancelButtonTexts: ['cancelar', 'fechar'],  // Portuguese: "Cancel"/"Close"
  cartRemovalText: 'remover produtos do carrinho',  // Portuguese: "Remove products from cart"
};

import type {
  ExtensionMessage,
  ExtensionResponse,
  CartScanRequest,
  OrderExtractHistoryRequest,
  OrderReorderRequest,
  SlotsExtractRequest,
  LoginCheckRequest,
  PageDetectRequest,
  ERROR_CODES,
} from '../types/messages.js';
import { createSuccessResponse, createErrorResponse } from '../types/messages.js';

/**
 * Message handler - routes incoming messages to appropriate handler
 */
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  const startTime = Date.now();

  // Handle message asynchronously
  handleMessage(message)
    .then((result) => {
      // Add timing information
      const timing = Date.now() - startTime;
      sendResponse({ ...result, timing });
    })
    .catch((error) => {
      logger.error('ContentScript', 'Message handling error', error);
      sendResponse(
        createErrorResponse(
          message.id,
          'UNKNOWN',
          error instanceof Error ? error.message : 'Unknown error',
          { stack: error instanceof Error ? error.stack : undefined }
        )
      );
    });

  // Return true to indicate async response
  return true;
});

/**
 * Route message to appropriate handler based on action
 */
async function handleMessage(message: ExtensionMessage): Promise<ExtensionResponse> {
  logger.info('ContentScript', 'Handling message', { action: message.action, message });

  try {
    switch (message.action) {
      case 'login.check':
        return handleLoginCheck(message as LoginCheckRequest);

      case 'cart.scan':
        return handleCartScan(message as CartScanRequest);

      case 'order.extractHistory':
        return handleOrderExtractHistory(message as OrderExtractHistoryRequest);

      case 'order.reorder':
        return handleOrderReorder(message as OrderReorderRequest);

      case 'slots.extract':
        return handleSlotsExtract(message as SlotsExtractRequest);

      case 'page.detect':
        return handlePageDetect(message as PageDetectRequest);

      default:
        return createErrorResponse(
          message.id,
          'INVALID_REQUEST',
          `Unsupported action: ${message.action}`
        );
    }
  } catch (error) {
    logger.error('ContentScript', 'Handler error', error);
    return createErrorResponse(
      message.id,
      'UNKNOWN',
      error instanceof Error ? error.message : 'Handler execution failed',
      { stack: error instanceof Error ? error.stack : undefined }
    );
  }
}

// ============================================================================
// ACTION HANDLERS
// ============================================================================

/**
 * Handle login.check - Detect login state from current page
 */
function handleLoginCheck(message: LoginCheckRequest): ExtensionResponse {
  try {
    const loginState = detectLoginState();

    return createSuccessResponse(message.id, loginState);
  } catch (error) {
    return createErrorResponse(
      message.id,
      'ELEMENT_NOT_FOUND',
      'Failed to detect login state',
      error
    );
  }
}

/**
 * Handle cart.scan - Extract cart items from cart page
 */
function handleCartScan(message: CartScanRequest): ExtensionResponse {
  // Validate we're on cart page
  if (!isOnCartPage()) {
    return createErrorResponse(
      message.id,
      'WRONG_PAGE',
      'Not on cart page. Cannot extract cart items.',
      { currentUrl: window.location.href }
    );
  }

  try {
    const includeOutOfStock = message.payload?.includeOutOfStock ?? true;
    const result = extractCartItems({ includeOutOfStock, verbose: true });

    return createSuccessResponse(message.id, result);
  } catch (error) {
    return createErrorResponse(
      message.id,
      'ELEMENT_NOT_FOUND',
      'Failed to extract cart items',
      error
    );
  }
}

/**
 * Handle order.extractHistory - Extract order history list
 */
function handleOrderExtractHistory(message: OrderExtractHistoryRequest): ExtensionResponse {
  // Validate we're on order history page
  if (!isOnOrderHistoryPage()) {
    return createErrorResponse(
      message.id,
      'WRONG_PAGE',
      'Not on order history page. Cannot extract orders.',
      { currentUrl: window.location.href }
    );
  }

  try {
    const limit = message.payload?.limit;
    const orders = extractOrderHistory({ limit });

    return createSuccessResponse(message.id, { orders });
  } catch (error) {
    return createErrorResponse(
      message.id,
      'ELEMENT_NOT_FOUND',
      'Failed to extract order history',
      error
    );
  }
}

// ============================================================================
// MODAL DETECTION HELPERS
// ============================================================================

/**
 * Simulate a real mouse click with proper events
 * Some frameworks (React, Vue) need proper mouse events, not just .click()
 */
function simulateRealClick(element: HTMLElement): void {
  // Scroll element into view first
  element.scrollIntoView({ behavior: 'instant', block: 'center' });

  // Get element position for mouse event coordinates
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  // Dispatch mousedown, mouseup, then click (full click sequence)
  const mouseDownEvent = new MouseEvent('mousedown', {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
  });

  const mouseUpEvent = new MouseEvent('mouseup', {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
  });

  const clickEvent = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
  });

  element.dispatchEvent(mouseDownEvent);
  element.dispatchEvent(mouseUpEvent);
  element.dispatchEvent(clickEvent);

  // Also call native click as fallback
  element.click();

  logger.info('ContentScript', 'Simulated real click on element', {
    tag: element.tagName,
    className: element.className?.substring(0, 50),
    position: { x, y },
  });
}

/**
 * Check if an element is visible (not hidden by CSS)
 */
function isElementVisible(element: Element): boolean {
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * Find a visible modal in the DOM
 */
function findVisibleModal(): Element | null {
  for (const selector of MODAL_SELECTORS.containers) {
    const modals = document.querySelectorAll(selector);
    for (const modal of modals) {
      if (isElementVisible(modal)) {
        return modal;
      }
    }
  }
  return null;
}

/**
 * Log all potential modal elements in the DOM for debugging
 */
function logPotentialModals(): void {
  // Extended list of modal selectors to check
  const allModalSelectors = [
    '.modal', '[role="dialog"]', '.auc-modal', '[aria-modal="true"]',
    '.modal-dialog', '.modal-content', '.dialog', '.popup', '.overlay',
    '[class*="modal"]', '[class*="dialog"]', '[class*="popup"]',
    '.ReactModal__Content', '.MuiDialog-root', '.ant-modal',
  ];

  const found: Array<{selector: string, count: number, sample: string}> = [];

  for (const selector of allModalSelectors) {
    try {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        const sample = elements[0];
        const isVisible = isElementVisible(sample);
        found.push({
          selector,
          count: elements.length,
          sample: `${sample.tagName}.${sample.className?.toString().substring(0, 50)} visible=${isVisible}`,
        });
      }
    } catch (e) {
      // Invalid selector, skip
    }
  }

  logger.info('ContentScript', 'Potential modal elements in DOM', { found });
}

/**
 * Wait for modal to appear using MutationObserver
 * Returns the modal element when found, or null on timeout
 */
function waitForModal(timeout: number = 5000): Promise<Element | null> {
  return new Promise((resolve) => {
    const startTime = Date.now();

    // Log what modals exist before waiting
    logger.info('ContentScript', 'Modal state before waiting');
    logPotentialModals();

    // Check if modal already visible
    const existingModal = findVisibleModal();
    if (existingModal) {
      logger.info('ContentScript', 'Modal already visible', {
        tag: existingModal.tagName,
        className: existingModal.className,
      });
      resolve(existingModal);
      return;
    }

    const observer = new MutationObserver((mutations) => {
      const modal = findVisibleModal();
      if (modal) {
        observer.disconnect();
        logger.info('ContentScript', 'Modal appeared via MutationObserver', {
          tag: modal.tagName,
          className: modal.className,
        });
        resolve(modal);
      } else if (Date.now() - startTime > timeout) {
        observer.disconnect();
        logger.warn('ContentScript', 'Modal wait timed out');
        resolve(null);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'aria-hidden', 'hidden', 'open'],
    });

    // Timeout fallback with diagnostic logging
    setTimeout(() => {
      observer.disconnect();
      const modal = findVisibleModal();
      if (modal) {
        resolve(modal);
      } else {
        logger.warn('ContentScript', 'Modal wait timeout reached');
        // Log what exists after timeout for debugging
        logger.info('ContentScript', 'Modal state after timeout');
        logPotentialModals();
        resolve(null);
      }
    }, timeout);
  });
}

/**
 * Find a visible button within a container by its text content
 * @param container - The element to search within
 * @param textOptions - Array of text strings to match (case-insensitive)
 */
function findButtonByText(container: Element, textOptions: string[]): HTMLButtonElement | null {
  const buttons = container.querySelectorAll('button, a.btn, a.button, [role="button"]');
  for (const button of buttons) {
    const text = (button.textContent?.trim().toLowerCase() || '');
    if (!isElementVisible(button)) continue;

    for (const option of textOptions) {
      if (text.includes(option.toLowerCase())) {
        logger.info('ContentScript', 'Found button by text', {
          searchedFor: option,
          foundText: button.textContent?.trim()
        });
        return button as HTMLButtonElement;
      }
    }
  }
  return null;
}

/**
 * Handle order.reorder - Click reorder button for an order
 *
 * This function:
 * 1. Finds the order card by orderId
 * 2. Clicks the "Repetir encomenda" button
 * 3. Waits for modal to appear using MutationObserver
 * 4. Clicks the appropriate modal button based on mode
 */
async function handleOrderReorder(message: OrderReorderRequest): Promise<ExtensionResponse> {
  const { orderId, mode } = message.payload;

  // Validate we're on order history or order detail page
  const url = window.location.href;
  const urlChecks = {
    isOnOrderHistoryPage: isOnOrderHistoryPage(),
    hasDetalhesEncomenda: url.includes('detalhes-encomenda'),
    hasOrderID: url.includes('orderID='),
    hasEncomenda: url.includes('/encomenda/'),
    hasOrder: url.includes('/order/'),
    hasHistorico: url.includes('/historico'),
  };
  const isOrderPage = Object.values(urlChecks).some(v => v);

  logger.info('ContentScript', 'URL check for order.reorder', { url, urlChecks, isOrderPage });

  if (!isOrderPage) {
    return createErrorResponse(
      message.id,
      'WRONG_PAGE',
      'Not on order page. Cannot reorder.',
      { currentUrl: url }
    );
  }

  try {
    // First, try to find a reorder button anywhere on the page (for order detail pages)
    // Note: button:has-text() is Playwright syntax, not valid CSS - removed
    let reorderButton = document.querySelector(
      '.auc-orders__reorder-button, ' +
      '[data-testid="reorder-button"], ' +
      'button[class*="reorder"], ' +
      'a[class*="reorder"], ' +
      '[class*="repeat-order"]'
    ) as HTMLButtonElement | null;

    logger.info('ContentScript', 'CSS selector search result', {
      found: !!reorderButton,
      selector: reorderButton?.className || null,
    });

    // Also try finding by button text
    if (!reorderButton) {
      const buttons = Array.from(document.querySelectorAll('button, a.btn, a.button, a[class*="btn"]'));
      const buttonTexts = buttons.slice(0, 20).map(btn => ({
        tag: btn.tagName,
        text: btn.textContent?.trim().substring(0, 50),
        className: btn.className?.substring(0, 50),
      }));
      logger.info('ContentScript', 'Scanning buttons for reorder text', {
        totalButtons: buttons.length,
        sampleButtons: buttonTexts,
      });

      reorderButton = buttons.find(btn => {
        const text = btn.textContent?.toLowerCase() || '';
        return text.includes('repetir') || text.includes('reorder') || text.includes('voltar a encomendar');
      }) as HTMLButtonElement | null;

      if (reorderButton) {
        logger.info('ContentScript', 'Found reorder button by text', {
          text: reorderButton.textContent?.trim(),
          className: reorderButton.className,
        });
      }
    }

    // If on order history list, find specific order card
    if (!reorderButton && isOnOrderHistoryPage()) {
      const orderCards = Array.from(document.querySelectorAll('.auc-orders__order-card'));
      let targetCard: Element | null = null;

      for (const card of orderCards) {
        const orderIdElement = card.querySelector('.auc-orders__order-number span:nth-child(2)');
        const cardOrderId = orderIdElement?.textContent?.trim();

        if (cardOrderId === orderId) {
          targetCard = card;
          break;
        }
      }

      if (targetCard) {
        reorderButton = targetCard.querySelector('.auc-orders__reorder-button') as HTMLButtonElement | null;

        // If no reorder button on card, click to expand/navigate to details
        if (!reorderButton) {
          logger.info('ContentScript', 'Reorder button not visible, clicking order to expand', { orderId });

          const orderLink = targetCard.querySelector('a, .auc-orders__order-header, .auc-orders__order-number') as HTMLElement | null;
          if (orderLink) {
            orderLink.click();

            return createSuccessResponse(message.id, {
              orderId,
              mode,
              clicked: false,
              expanded: true,
              message: 'Clicked order to expand. Reorder button should appear.',
            });
          }
        }
      }
    }

    if (!reorderButton) {
      logger.info('ContentScript', 'Reorder button not found', { orderId, url: window.location.href });
      return createErrorResponse(
        message.id,
        'ELEMENT_NOT_FOUND',
        `Reorder button not found for order ${orderId}`,
        { orderId, url: window.location.href }
      );
    }

    logger.info('ContentScript', 'Found reorder button, clicking', { orderId });

    // Click the reorder button using both methods for maximum compatibility
    // Some React/Vue sites need proper mouse events, not just .click()
    simulateRealClick(reorderButton);

    // CRITICAL: Wait for modal to appear using MutationObserver
    logger.info('ContentScript', 'Waiting for reorder modal...');
    const modal = await waitForModal(5000);

    if (!modal) {
      logger.warn('ContentScript', 'Modal did not appear after clicking reorder');
      return createSuccessResponse(message.id, {
        orderId,
        mode,
        clicked: true,
        modalHandled: false,
        message: 'Reorder clicked but no modal appeared',
      });
    }

    logger.info('ContentScript', 'Modal appeared, handling...');

    // Handle modal based on mode
    const modalResult = await handleModalWithinContainer(modal, mode);

    return createSuccessResponse(message.id, {
      orderId,
      mode,
      clicked: true,
      modalHandled: modalResult.handled,
      buttonClicked: modalResult.buttonClicked,
    });

  } catch (error) {
    // Properly serialize error for logging
    logger.error('ContentScript', 'Error in handleOrderReorder', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return createErrorResponse(
      message.id,
      'UNKNOWN',
      error instanceof Error ? error.message : 'Failed to click reorder button',
      { stack: error instanceof Error ? error.stack : undefined }
    );
  }
}

/**
 * Result from modal handling
 */
interface ModalHandleResult {
  handled: boolean;
  buttonClicked: string | null;
}

/**
 * Handle the reorder modal within a given container element
 *
 * Auchan shows a modal with two options depending on cart state:
 * - If cart has items: "Juntar" (merge) or "Eliminar" (replace)
 * - If cart empty: "Encomendar de novo" (reorder) confirmation
 *
 * This version searches within the modal container using CSS-only selectors.
 *
 * @param modal - The modal element to search within
 * @param mode - 'replace' or 'merge'
 */
async function handleModalWithinContainer(
  modal: Element,
  mode: 'replace' | 'merge'
): Promise<ModalHandleResult> {
  // First, dismiss any blocking popups (subscription prompts, etc.)
  const interactor = new ExtensionPageInteractor();
  try {
    const dismissed = await interactor.dismissPopups(POPUP_PATTERNS);
    if (dismissed > 0) {
      logger.info('ContentScript', `Dismissed ${dismissed} popups before modal handling`);
      await new Promise(r => setTimeout(r, 500));
    }
  } catch (e) {
    // Popup dismissal failure is non-critical, continue
    logger.warn('ContentScript', 'Popup dismissal failed, continuing', {
      error: e instanceof Error ? e.message : String(e)
    });
  }

  // Check for cart removal warning first - this is a safety check
  const modalText = modal.textContent?.toLowerCase() || '';
  if (modalText.includes(MODAL_SELECTORS.cartRemovalText)) {
    logger.warn('ContentScript', 'Cart removal modal detected - clicking Cancel');
    const cancelBtn = findButtonByText(modal, MODAL_SELECTORS.cancelButtonTexts);
    if (cancelBtn) {
      const btnText = cancelBtn.textContent?.trim() || '';
      if (!isDangerousText(btnText)) {
        cancelBtn.click();
        logger.info('ContentScript', 'Cart removal modal dismissed via Cancel');
        return { handled: true, buttonClicked: 'cancel' };
      }
    }
    logger.warn('ContentScript', 'Could not find cancel button for cart removal modal');
    return { handled: false, buttonClicked: null };
  }

  // Handle based on mode
  if (mode === 'merge') {
    const mergeBtn = findButtonByText(modal, MODAL_SELECTORS.mergeButtonTexts);
    if (mergeBtn) {
      const btnText = mergeBtn.textContent?.trim() || '';
      if (!isDangerousText(btnText)) {
        logger.info('ContentScript', 'Clicking merge button', { text: btnText });
        mergeBtn.click();
        return { handled: true, buttonClicked: 'merge' };
      } else {
        logger.warn('ContentScript', 'BLOCKED: dangerous button detected', { text: btnText });
      }
    } else {
      logger.warn('ContentScript', 'Merge button not found, trying confirm button');
    }
  }

  // Replace mode or merge button not found - try confirm button
  const confirmBtn = findButtonByText(modal, MODAL_SELECTORS.confirmButtonTexts);
  if (confirmBtn) {
    const btnText = confirmBtn.textContent?.trim() || '';
    if (!isDangerousText(btnText)) {
      logger.info('ContentScript', 'Clicking confirm button', { text: btnText });
      confirmBtn.click();
      return { handled: true, buttonClicked: 'confirm' };
    } else {
      logger.warn('ContentScript', 'BLOCKED: dangerous button detected', { text: btnText });
    }
  }

  logger.warn('ContentScript', 'No appropriate button found in modal', {
    mode,
    modalTextPreview: modalText.substring(0, 200),
  });
  return { handled: false, buttonClicked: null };
}

/**
 * Handle slots.extract - Extract delivery slots
 */
function handleSlotsExtract(message: SlotsExtractRequest): ExtensionResponse {
  // Validate we're on slots page
  if (!isOnSlotsPage()) {
    return createErrorResponse(
      message.id,
      'WRONG_PAGE',
      'Not on delivery slots page. Cannot extract slots.',
      { currentUrl: window.location.href }
    );
  }

  try {
    // Extract slots from currently visible day
    // (extractAllDaysSlots requires async tab clicking, handled by service worker)
    const result = extractDeliverySlots();

    return createSuccessResponse(message.id, result);
  } catch (error) {
    return createErrorResponse(
      message.id,
      'ELEMENT_NOT_FOUND',
      'Failed to extract delivery slots',
      error
    );
  }
}

/**
 * Handle page.detect - Detect current page type and state
 */
function handlePageDetect(message: PageDetectRequest): ExtensionResponse {
  try {
    const url = window.location.href;
    const loginState = detectLoginState();

    // Detect page type
    let pageType = 'unknown';

    if (isOnLoginPage()) {
      pageType = 'login';
    } else if (isOnOrderHistoryPage()) {
      pageType = 'order-history';
    } else if (isOnCartPage()) {
      pageType = 'cart';
    } else if (isOnSlotsPage()) {
      pageType = 'slots';
    } else if (url.includes('/pt/pesquisa') || url.includes('/pt/search')) {
      pageType = 'search';
    } else if (url.includes('/pt/p/')) {
      pageType = 'product';
    } else if (url === 'https://www.auchan.pt/pt' || url === 'https://www.auchan.pt/') {
      pageType = 'home';
    }

    return createSuccessResponse(message.id, {
      pageType,
      url,
      isLoggedIn: loginState.isLoggedIn,
      userName: loginState.userName,
    });
  } catch (error) {
    return createErrorResponse(
      message.id,
      'UNKNOWN',
      'Failed to detect page type',
      error
    );
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Signal to service worker that content script is ready
 */
function notifyReady(): void {
  chrome.runtime.sendMessage({
    action: 'page.ready',
    payload: {
      url: window.location.href,
      timestamp: Date.now(),
    },
  }).catch((error) => {
    // Service worker might not be ready yet, this is okay
    logger.info('ContentScript', 'Could not notify service worker (may not be ready)', error);
  });
}

// Notify service worker when content script loads
notifyReady();

logger.info('ContentScript', 'Loaded', { url: window.location.href });
