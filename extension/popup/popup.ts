/**
 * AI Shopping Copilot - Popup Script
 *
 * Handles:
 * - Merge button trigger (T005)
 * - Progress display (T006)
 * - State update subscription (T007)
 * - Results display (T008)
 * - Error handling with retry (T009)
 * - API key management
 *
 * NOTE: All message action names are imported from src/types/messages.ts.
 * Never use hardcoded action strings - always use the MessageAction constants.
 */

import type { MessageAction, RunStartRequest } from '../src/types/messages';
import type { RunState } from '../src/types/state';
import { logger } from '../src/utils/logger';

// =============================================================================
// MESSAGE ACTION CONSTANTS
// =============================================================================

/**
 * Message actions used by the popup.
 * These must match the MessageAction type in src/types/messages.ts.
 *
 * IMPORTANT: Never hardcode these strings elsewhere in the popup code.
 * Always reference these constants.
 */
const ACTIONS = {
  GET_STATE: 'state.get' as const satisfies MessageAction,
  STATE_UPDATE: 'state.update' as const satisfies MessageAction,
  RUN_START: 'run.start' as const satisfies MessageAction,
  RUN_CANCEL: 'run.cancel' as const satisfies MessageAction,
  CART_SCAN: 'cart.scan' as const satisfies MessageAction,
} as const;

// =============================================================================
// DOM Elements
// =============================================================================

// Sections
const idleSection = document.getElementById('idle-section')!;
const progressSection = document.getElementById('progress-section')!;
const resultsSection = document.getElementById('results-section')!;
const errorSection = document.getElementById('error-section')!;

// Progress elements
const progressFill = document.getElementById('progress-fill') as HTMLDivElement;
const progressText = document.getElementById('progress-text')!;
const progressSubtext = document.getElementById('progress-subtext')!;
const cancelBtn = document.getElementById('cancel-btn') as HTMLButtonElement;

// Results elements
const itemsCount = document.getElementById('items-count')!;
const totalPrice = document.getElementById('total-price')!;
const unavailableWarning = document.getElementById('unavailable-warning')!;
const unavailableCount = document.getElementById('unavailable-count')!;
const viewCartBtn = document.getElementById('view-cart-btn')!;
const newMergeBtn = document.getElementById('new-merge-btn') as HTMLButtonElement;

// Error elements
const errorMessage = document.getElementById('error-message')!;
const retryBtn = document.getElementById('retry-btn') as HTMLButtonElement;
const dismissBtn = document.getElementById('dismiss-btn') as HTMLButtonElement;

// Idle elements
const mergeBtn = document.getElementById('merge-btn') as HTMLButtonElement;
const scanBtn = document.getElementById('scan-btn') as HTMLButtonElement;

// API key elements
const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement;
const saveKeyBtn = document.getElementById('save-key-btn') as HTMLButtonElement;

// =============================================================================
// Error Messages (T009)
// =============================================================================

const ERROR_MESSAGES: Record<string, string> = {
  'NO_ORDERS': 'No orders found in your history',
  'NOT_LOGGED_IN': 'Please log in to Auchan.pt first',
  'SESSION_EXPIRED': 'Session expired - please log in again',
  'NETWORK_ERROR': 'Network error - please check your connection',
  'SELECTOR_FAILED': 'Unable to read page - please report this issue',
  'CANCELLED': 'Merge cancelled',
  'TIMEOUT': 'Operation timed out - please try again',
  'NOT_ON_AUCHAN': 'Please open Auchan.pt first',
  'TAB_NOT_ON_AUCHAN': 'Tab is not on Auchan.pt',
  'default': 'An unexpected error occurred'
};

interface ErrorObject {
  code?: string;
  message?: string;
}

function getErrorMessage(errorCode: unknown): string {
  if (!errorCode) return ERROR_MESSAGES.default;

  // Handle error objects
  let errorStr: string;
  if (typeof errorCode === 'object' && errorCode !== null) {
    const err = errorCode as ErrorObject;
    errorStr = err.code || err.message || JSON.stringify(errorCode);
  } else {
    errorStr = String(errorCode);
  }

  // Check for direct match
  if (ERROR_MESSAGES[errorStr]) {
    return ERROR_MESSAGES[errorStr];
  }

  // Check for partial matches in error message
  const lowerError = errorStr.toLowerCase();
  if (lowerError.includes('not logged in')) return ERROR_MESSAGES.NOT_LOGGED_IN;
  if (lowerError.includes('network')) return ERROR_MESSAGES.NETWORK_ERROR;
  if (lowerError.includes('timeout')) return ERROR_MESSAGES.TIMEOUT;
  if (lowerError.includes('not on auchan')) return ERROR_MESSAGES.NOT_ON_AUCHAN;

  // Return the error as-is if no mapping found
  return errorStr;
}

// =============================================================================
// State Management (T007)
// =============================================================================

interface PopupRunState extends Partial<RunState> {
  cartItems?: Array<{ price?: number; quantity?: number }>;
  unavailableItems?: unknown[];
  reviewPack?: {
    stats?: {
      totalItems?: number;
      unavailableItems?: number;
    };
    cartItems?: Array<{ price?: number; quantity?: number }>;
  };
}

let currentState: PopupRunState | null = null;
let currentTabId: number | null = null;
let startTime: number | null = null;

/**
 * Show a specific section and hide others
 */
function showSection(sectionName: 'idle' | 'progress' | 'results' | 'error'): void {
  idleSection.classList.add('hidden');
  progressSection.classList.add('hidden');
  resultsSection.classList.add('hidden');
  errorSection.classList.add('hidden');

  switch (sectionName) {
    case 'idle':
      idleSection.classList.remove('hidden');
      break;
    case 'progress':
      progressSection.classList.remove('hidden');
      break;
    case 'results':
      resultsSection.classList.remove('hidden');
      break;
    case 'error':
      errorSection.classList.remove('hidden');
      break;
  }
}

/**
 * Load current run state from service worker
 */
async function loadState(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({ action: ACTIONS.GET_STATE });
    if (response?.state) {
      currentState = response.state;
      updateUI();
    }
  } catch (error) {
    logger.error('Popup', 'Failed to load state', error);
    // Service worker may not be ready yet - this is OK on first load
  }
}

/**
 * Update UI based on current state (T007)
 */
function updateUI(): void {
  if (!currentState) {
    showSection('idle');
    return;
  }

  const status = currentState.status || 'idle';

  switch (status) {
    case 'running':
      showSection('progress');
      updateProgressDisplay();
      break;

    case 'review':
      showSection('results');
      updateResultsDisplay();
      break;

    case 'paused':
      if (currentState.error) {
        showSection('error');
        updateErrorDisplay(currentState.error);
      } else {
        showSection('idle');
      }
      break;

    case 'idle':
    default:
      showSection('idle');
      break;
  }
}

/**
 * Update progress display (T006)
 */
function updateProgressDisplay(): void {
  if (!currentState) return;

  const phase = currentState.phase || 'initializing';
  const step = currentState.step || '';
  const progress = currentState.progress || {};

  // Calculate progress percentage based on phase
  let progressPercent = 0;
  let statusText = 'Starting...';
  let subtextContent = '';

  switch (phase) {
    case 'initializing':
      progressPercent = 10;
      statusText = 'Initializing...';
      break;

    case 'cart':
      // Cart phase has multiple steps
      if (step === 'loading-orders') {
        progressPercent = 20;
        statusText = 'Loading order history...';
      } else if (step === 'selecting-order') {
        progressPercent = 30;
        statusText = 'Preparing orders...';
      } else if (step === 'reordering') {
        // Show progress for each order being merged
        const processed = progress.itemsProcessed || 0;
        const total = progress.itemsTotal || 3;
        progressPercent = 30 + ((processed / total) * 30);
        statusText = `Merging order ${processed}/${total}...`;
        subtextContent = processed > 0 ? `${processed} of ${total} orders merged` : '';
      } else if (step === 'scanning-cart') {
        progressPercent = 65;
        statusText = 'Scanning cart...';
      } else if (step === 'comparing') {
        progressPercent = 70;
        statusText = 'Comparing items...';
      } else {
        progressPercent = 25;
        statusText = 'Processing cart...';
      }
      break;

    case 'substitution':
      progressPercent = 75;
      statusText = 'Finding substitutes...';
      if (progress.unavailableItems && progress.unavailableItems > 0) {
        subtextContent = `${progress.unavailableItems} items need substitutes`;
      }
      break;

    case 'slots':
      progressPercent = 85;
      statusText = 'Checking delivery slots...';
      break;

    case 'finalizing':
      progressPercent = 95;
      statusText = 'Finalizing...';
      break;

    default:
      progressPercent = 5;
      statusText = 'Working...';
  }

  // Show "still working" after 30 seconds
  if (startTime && Date.now() - startTime > 30000) {
    subtextContent = 'Still working...';
  }

  // Update DOM
  progressFill.style.width = `${progressPercent}%`;
  progressText.textContent = statusText;
  progressSubtext.textContent = subtextContent;
}

/**
 * Update results display (T008)
 */
function updateResultsDisplay(): void {
  if (!currentState) return;

  // Get stats from review pack or state
  const reviewPack = currentState.reviewPack;
  const stats = reviewPack?.stats || {};

  // Items count
  const totalItems = stats.totalItems || currentState.cartItems?.length || 0;
  itemsCount.textContent = String(totalItems);

  // Calculate total price from cart items
  const cartItems = currentState.cartItems || reviewPack?.cartItems || [];
  const total = cartItems.reduce((sum, item) => {
    const price = item.price || 0;
    const qty = item.quantity || 1;
    return sum + (price * qty);
  }, 0);
  totalPrice.textContent = `€${total.toFixed(2)}`;

  // Unavailable items
  const unavailable = stats.unavailableItems || currentState.unavailableItems?.length || 0;
  if (unavailable > 0) {
    unavailableCount.textContent = String(unavailable);
    unavailableWarning.classList.remove('hidden');
  } else {
    unavailableWarning.classList.add('hidden');
  }
}

/**
 * Update error display (T009)
 */
function updateErrorDisplay(error: unknown): void {
  // Log the full error for debugging
  logger.error('Popup', 'Error received', {
    error,
    type: typeof error,
    keys: error && typeof error === 'object' ? Object.keys(error) : null,
  });

  const message = getErrorMessage(error);
  errorMessage.textContent = message;
}

// =============================================================================
// Event Handlers
// =============================================================================

/**
 * Handle merge button click (T005)
 */
mergeBtn.addEventListener('click', async () => {
  logger.info('Popup', 'Merge button clicked');

  try {
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    logger.info('Popup', 'Active tab', { id: tab?.id, url: tab?.url });

    if (!tab?.url?.includes('auchan.pt')) {
      showSection('error');
      updateErrorDisplay({ code: 'NOT_ON_AUCHAN' });
      return;
    }

    currentTabId = tab.id ?? null;
    startTime = Date.now();

    // Optimistically show progress
    showSection('progress');
    progressFill.style.width = '5%';
    progressText.textContent = 'Starting...';
    progressSubtext.textContent = '';

    // Send merge command to service worker using correct action
    logger.info('Popup', `Sending ${ACTIONS.RUN_START} to service worker`, { tabId: tab.id });

    const response = await chrome.runtime.sendMessage({
      action: ACTIONS.RUN_START,
      payload: {
        tabId: tab.id,
        orderCount: 3,
      },
    });

    logger.info('Popup', 'Service worker response', response);

    if (!response?.success) {
      showSection('error');
      updateErrorDisplay(response?.error || 'Failed to start merge');
    }
    // If successful, UI will update via state change message
  } catch (error) {
    logger.error('Popup', 'Merge button error', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    showSection('error');
    updateErrorDisplay(error);
  }
});

/**
 * Handle cancel button click (T006)
 */
cancelBtn.addEventListener('click', async () => {
  try {
    cancelBtn.disabled = true;
    cancelBtn.textContent = 'Cancelling...';

    await chrome.runtime.sendMessage({ action: ACTIONS.RUN_CANCEL });

    // State update will handle UI change
  } catch (error) {
    logger.error('Popup', 'Cancel failed', error);
  } finally {
    cancelBtn.disabled = false;
    cancelBtn.textContent = 'Cancel';
  }
});

/**
 * Handle retry button click (T009)
 */
retryBtn.addEventListener('click', async () => {
  // Clear error and retry merge
  showSection('idle');

  // Trigger merge after a brief delay
  setTimeout(() => {
    mergeBtn.click();
  }, 100);
});

/**
 * Handle dismiss button click (T009)
 */
dismissBtn.addEventListener('click', () => {
  showSection('idle');
});

/**
 * Handle new merge button click (T008)
 */
newMergeBtn.addEventListener('click', () => {
  showSection('idle');
});

/**
 * Handle scan button click
 */
scanBtn.addEventListener('click', async () => {
  scanBtn.disabled = true;
  scanBtn.textContent = 'Scanning...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      showSection('error');
      updateErrorDisplay({ message: 'No active tab' });
      return;
    }

    if (!tab.url?.includes('auchan.pt')) {
      showSection('error');
      updateErrorDisplay({ code: 'NOT_ON_AUCHAN' });
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id!, { action: ACTIONS.CART_SCAN });

    if (response?.success) {
      logger.info('Popup', 'Cart scanned', response);
    } else {
      logger.error('Popup', 'Scan failed', response);
    }
  } catch (error) {
    logger.error('Popup', 'Scan error', error);
  } finally {
    scanBtn.disabled = false;
    scanBtn.textContent = 'Scan Current Page';
  }
});

/**
 * Handle save API key button click
 */
saveKeyBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();

  if (!apiKey) {
    showSection('error');
    updateErrorDisplay({ message: 'Please enter an API key' });
    return;
  }

  if (!apiKey.startsWith('sk-ant-')) {
    showSection('error');
    updateErrorDisplay({ message: 'Invalid API key format' });
    return;
  }

  try {
    await chrome.storage.session.set({ anthropicApiKey: apiKey });
    apiKeyInput.value = '';
    saveKeyBtn.textContent = 'Saved!';
    setTimeout(() => {
      saveKeyBtn.textContent = 'Save API Key';
    }, 2000);
  } catch (error) {
    showSection('error');
    updateErrorDisplay({ message: 'Failed to save API key' });
  }
});

// =============================================================================
// Message Listener (T007)
// =============================================================================

chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  // Handle both old and new action names for backwards compatibility during migration
  if (message.action === ACTIONS.STATE_UPDATE) {
    currentState = message.state;
    updateUI();
  }
  return false;
});

// =============================================================================
// API Key Status
// =============================================================================

async function checkApiKey(): Promise<void> {
  try {
    const { anthropicApiKey } = await chrome.storage.session.get('anthropicApiKey');
    if (anthropicApiKey) {
      apiKeyInput.placeholder = 'API Key configured';
    }
  } catch (error) {
    logger.error('Popup', 'Failed to check API key', error);
  }
}

// =============================================================================
// Initialization
// =============================================================================

async function init(): Promise<void> {
  logger.info('Popup', 'Initializing...');

  // Load run state
  await loadState();

  // Check if API key is configured
  await checkApiKey();

  logger.info('Popup', 'Initialization complete');
}

init();
