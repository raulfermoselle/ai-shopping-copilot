/**
 * AI Shopping Copilot - Service Worker
 *
 * Handles:
 * - State management
 * - Message routing
 * - Anthropic API calls
 * - Orchestration logic
 */

// =============================================================================
// State Management
// =============================================================================

const DEFAULT_STATE = {
  isLoggedIn: false,
  userName: null,
  loginTimestamp: null,
  runId: null,
  runStatus: 'idle', // idle | running | paused | review | complete
  currentPhase: null,
  ordersLoaded: 0,
  itemsProcessed: 0,
  slotsFound: 0,
  lastError: null,
  errorCount: 0
};

let sessionState = { ...DEFAULT_STATE };
let stateInitialized = false;

async function initializeState() {
  try {
    const result = await chrome.storage.session.get('sessionState');
    sessionState = result.sessionState || { ...DEFAULT_STATE };
    stateInitialized = true;
    console.log('[AISC] State initialized:', sessionState);
  } catch (error) {
    console.error('[AISC] Failed to initialize state:', error);
    sessionState = { ...DEFAULT_STATE };
    stateInitialized = true;
  }
}

async function ensureInitialized() {
  if (!stateInitialized) {
    await initializeState();
  }
}

async function updateState(updates) {
  sessionState = { ...sessionState, ...updates };
  await chrome.storage.session.set({ sessionState });
  console.log('[AISC] State updated:', updates);

  // Notify popup of state change
  chrome.runtime.sendMessage({
    action: 'stateUpdate',
    state: sessionState
  }).catch(() => {
    // Popup may not be open, ignore
  });
}

// Initialize on load
initializeState();

// =============================================================================
// Message Handling
// =============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[AISC] Message received:', message.action);

  // Ensure state is initialized before processing
  ensureInitialized().then(() => {
    handleMessage(message, sender, sendResponse);
  });

  return true; // Async response
});

function handleMessage(message, sender, sendResponse) {
  switch (message.action) {
    // State queries
    case 'getState':
      sendResponse({ state: sessionState });
      break;

    // Login status from content script
    case 'loginStateChanged':
      handleLoginStateChange(message);
      sendResponse({ success: true });
      break;

    // Page ready signals
    case 'pageReady':
      handlePageReady(message, sender.tab);
      sendResponse({ success: true });
      break;

    // Cart operations
    case 'scanCartResult':
      handleScanCartResult(message);
      sendResponse({ success: true });
      break;

    // LLM calls
    case 'callClaude':
      callClaude(message.prompt, message.systemPrompt)
        .then(result => sendResponse({ success: true, result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return; // Async - response sent in promise

    // Run control
    case 'startRun':
      startRun().then(() => sendResponse({ success: true }));
      return; // Async - response sent in promise

    case 'pauseRun':
      updateState({ runStatus: 'paused' });
      sendResponse({ success: true });
      break;

    case 'resumeRun':
      updateState({ runStatus: 'running' });
      sendResponse({ success: true });
      break;

    default:
      console.warn('[AISC] Unknown message action:', message.action);
      sendResponse({ success: false, error: 'Unknown action' });
  }
}

// =============================================================================
// Event Handlers
// =============================================================================

function handleLoginStateChange(message) {
  updateState({
    isLoggedIn: message.isLoggedIn,
    userName: message.userName,
    loginTimestamp: message.isLoggedIn ? Date.now() : null
  });
}

function handlePageReady(message, tab) {
  console.log('[AISC] Page ready:', message.page, 'in tab', tab?.id);
  // Could trigger next action based on current phase
}

function handleScanCartResult(message) {
  console.log('[AISC] Cart scanned:', message.items?.length, 'items');
  // Process cart data
}

// =============================================================================
// Run Orchestration
// =============================================================================

async function startRun() {
  const runId = `run-${Date.now()}`;

  await updateState({
    runId,
    runStatus: 'running',
    currentPhase: 'cart',
    ordersLoaded: 0,
    itemsProcessed: 0,
    slotsFound: 0,
    lastError: null,
    errorCount: 0
  });

  // Get active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab) {
    await updateState({ runStatus: 'paused', lastError: 'No active tab' });
    return;
  }

  // Send scan cart command to content script
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'scanCart' });
  } catch (error) {
    await updateState({
      runStatus: 'paused',
      lastError: 'Content script not loaded. Please navigate to Auchan.pt'
    });
  }
}

// =============================================================================
// Anthropic API Integration
// =============================================================================

async function getApiKey() {
  const result = await chrome.storage.session.get('anthropicApiKey');
  return result.anthropicApiKey || null;
}

async function callClaude(prompt, systemPrompt = '') {
  const apiKey = await getApiKey();

  if (!apiKey) {
    throw new Error('API key not configured. Please set it in extension options.');
  }

  // Validate API key format
  if (!apiKey.startsWith('sk-ant-')) {
    throw new Error('Invalid API key format. Anthropic keys start with sk-ant-');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

// =============================================================================
// Extension Lifecycle
// =============================================================================

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[AISC] Extension installed:', details.reason);

  if (details.reason === 'install') {
    // First install - show welcome
    chrome.tabs.create({ url: 'popup/popup.html' });
  }
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[AISC] Browser started, reinitializing state');
  initializeState();
});

console.log('[AISC] Service worker loaded');
