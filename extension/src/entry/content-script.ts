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

/**
 * Handle order.reorder - Click reorder button for an order
 *
 * This function:
 * 1. Finds the order card by orderId
 * 2. Clicks the "Repetir encomenda" button
 * 3. Handles the modal that appears (replace vs add to cart)
 * 4. Clicks the appropriate modal button based on mode
 */
function handleOrderReorder(message: OrderReorderRequest): ExtensionResponse {
  const { orderId, mode } = message.payload;

  // Validate we're on order history page
  if (!isOnOrderHistoryPage()) {
    return createErrorResponse(
      message.id,
      'WRONG_PAGE',
      'Not on order history page. Cannot reorder.',
      { currentUrl: window.location.href }
    );
  }

  try {
    // Find order card with matching orderId
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

    if (!targetCard) {
      return createErrorResponse(
        message.id,
        'ELEMENT_NOT_FOUND',
        `Order ${orderId} not found on page`,
        { orderId }
      );
    }

    // Find and click the reorder button
    const reorderButton = targetCard.querySelector('.auc-orders__reorder-button') as HTMLButtonElement | null;

    if (!reorderButton) {
      return createErrorResponse(
        message.id,
        'ELEMENT_NOT_FOUND',
        `Reorder button not found for order ${orderId}`,
        { orderId }
      );
    }

    // Click the button
    reorderButton.click();

    // Wait for modal to appear (short delay)
    setTimeout(() => {
      handleReorderModal(mode);
    }, 500);

    return createSuccessResponse(message.id, {
      orderId,
      mode,
      clicked: true,
    });
  } catch (error) {
    return createErrorResponse(
      message.id,
      'UNKNOWN',
      'Failed to click reorder button',
      error
    );
  }
}

/**
 * Handle the reorder modal that appears after clicking reorder
 *
 * Auchan shows a modal with two options:
 * - "Substituir carrinho" (Replace cart)
 * - "Adicionar ao carrinho" (Add to cart)
 *
 * @param mode - 'replace' or 'add'
 */
function handleReorderModal(mode: 'replace' | 'add'): void {
  try {
    // Find modal container
    const modal = document.querySelector('.modal.show, [role="dialog"]');

    if (!modal) {
      logger.warn('ContentScript', 'Reorder modal not found. It may appear later.');
      return;
    }

    // Find buttons in modal
    // Replace button typically has classes like "btn-primary" or text "Substituir"
    // Add button typically has classes like "btn-secondary" or text "Adicionar"

    const buttons = Array.from(modal.querySelectorAll('button'));

    let targetButton: HTMLButtonElement | null = null;

    if (mode === 'replace') {
      // Look for "Substituir" button
      targetButton = buttons.find((btn) => {
        const text = btn.textContent?.toLowerCase() || '';
        return text.includes('substituir') || text.includes('replace');
      }) as HTMLButtonElement | undefined || null;
    } else {
      // Look for "Adicionar" button
      targetButton = buttons.find((btn) => {
        const text = btn.textContent?.toLowerCase() || '';
        return text.includes('adicionar') || text.includes('add');
      }) as HTMLButtonElement | undefined || null;
    }

    if (targetButton) {
      logger.info('ContentScript', `Clicking ${mode} button in modal`);
      targetButton.click();
    } else {
      logger.warn('ContentScript', `Could not find ${mode} button in modal`);
    }
  } catch (error) {
    logger.error('ContentScript', 'Error handling reorder modal', error);
  }
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
