/**
 * AI Shopping Copilot - Auchan.pt Content Script
 *
 * Injected into all Auchan.pt pages.
 * Handles:
 * - Login state detection
 * - Page ready signaling
 * - DOM extraction
 * - User action execution
 */

// =============================================================================
// Constants
// =============================================================================

const SELECTORS = {
  // Login detection
  userName: '.auc-header__user-name',
  loginButton: '.auc-header__login',

  // Cart
  cartItems: '.auc-cart-item, .cart-item, [class*="cart-item"]',
  cartItemName: '.product-name, .auc-cart-item__name',
  cartItemPrice: '.product-price, .auc-cart-item__price',
  cartItemQuantity: '.quantity-input, [class*="quantity"]',
  cartTotal: '.cart-total, .auc-cart__total',

  // Order history
  orderCards: '.auc-orders__card',
  orderNumber: '.auc-orders__number',
  orderDate: '.auc-orders__date',
  orderTotal: '.auc-orders__total',
  reorderButton: '[class*="reorder"], button[data-action="reorder"]'
};

// =============================================================================
// Login Detection
// =============================================================================

function detectLoginState() {
  const userElement = document.querySelector(SELECTORS.userName);
  const isLoggedIn = !!(userElement?.textContent?.trim());

  chrome.runtime.sendMessage({
    action: 'loginStateChanged',
    isLoggedIn,
    userName: isLoggedIn ? userElement.textContent.trim() : null
  });

  return isLoggedIn;
}

// =============================================================================
// Page Detection
// =============================================================================

function detectCurrentPage() {
  const path = window.location.pathname;

  if (path.includes('carrinho-compras')) return 'cart';
  if (path.includes('historico-encomendas')) return 'order-history';
  if (path.includes('detalhes-encomenda')) return 'order-detail';
  if (path.includes('pesquisa')) return 'search';
  if (path.includes('checkout') || path.includes('entrega')) return 'checkout';
  if (path.endsWith('.html')) return 'product-detail';

  return 'home';
}

function signalPageReady() {
  const page = detectCurrentPage();

  chrome.runtime.sendMessage({
    action: 'pageReady',
    page,
    url: window.location.href
  });
}

// =============================================================================
// Cart Extraction
// =============================================================================

function extractCartItems() {
  const items = [];
  const cartElements = document.querySelectorAll(SELECTORS.cartItems);

  cartElements.forEach((element, index) => {
    const name = element.querySelector(SELECTORS.cartItemName)?.textContent?.trim();
    const priceText = element.querySelector(SELECTORS.cartItemPrice)?.textContent?.trim();
    const quantityInput = element.querySelector(SELECTORS.cartItemQuantity);
    const quantity = quantityInput?.value || '1';

    if (name) {
      items.push({
        index,
        name,
        price: parsePrice(priceText),
        priceText,
        quantity: parseInt(quantity, 10) || 1
      });
    }
  });

  return items;
}

function parsePrice(priceText) {
  if (!priceText) return 0;
  // Handle Portuguese format: "1,29 €" or "1.29€"
  const cleaned = priceText.replace(/[^\d,\.]/g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
}

function getCartTotal() {
  const totalElement = document.querySelector(SELECTORS.cartTotal);
  return parsePrice(totalElement?.textContent);
}

// =============================================================================
// Order History Extraction
// =============================================================================

function extractOrderHistory() {
  const orders = [];
  const orderCards = document.querySelectorAll(SELECTORS.orderCards);

  orderCards.forEach((card, index) => {
    const orderNumber = card.querySelector(SELECTORS.orderNumber)?.textContent?.trim();
    const date = card.querySelector(SELECTORS.orderDate)?.textContent?.trim();
    const total = card.querySelector(SELECTORS.orderTotal)?.textContent?.trim();
    const detailUrl = card.querySelector('a')?.href;

    if (orderNumber) {
      orders.push({
        index,
        orderNumber,
        date,
        total: parsePrice(total),
        totalText: total,
        detailUrl
      });
    }
  });

  return orders;
}

// =============================================================================
// Actions
// =============================================================================

function clickReorderButton() {
  const button = document.querySelector(SELECTORS.reorderButton);
  if (button) {
    button.click();
    return true;
  }
  return false;
}

// =============================================================================
// Message Handler
// =============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[AISC-CS] Message received:', message.action);

  switch (message.action) {
    case 'scanCart':
      const cartItems = extractCartItems();
      const cartTotal = getCartTotal();
      sendResponse({
        success: true,
        items: cartItems,
        total: cartTotal,
        itemCount: cartItems.length
      });
      // Also send to service worker
      chrome.runtime.sendMessage({
        action: 'scanCartResult',
        items: cartItems,
        total: cartTotal
      });
      break;

    case 'extractOrderHistory':
      const orders = extractOrderHistory();
      sendResponse({ success: true, orders });
      break;

    case 'clickReorder':
      const clicked = clickReorderButton();
      sendResponse({ success: clicked });
      break;

    case 'getLoginState':
      const isLoggedIn = detectLoginState();
      sendResponse({ isLoggedIn });
      break;

    case 'getPageInfo':
      sendResponse({
        page: detectCurrentPage(),
        url: window.location.href,
        title: document.title
      });
      break;

    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }

  return true; // Keep channel open for async operations
});

// =============================================================================
// Initialization
// =============================================================================

function init() {
  console.log('[AISC-CS] Content script loaded on:', window.location.href);

  // Detect initial state
  detectLoginState();
  signalPageReady();

  // Watch for SPA navigation
  const observer = new MutationObserver(() => {
    detectLoginState();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
