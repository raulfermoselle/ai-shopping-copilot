/**
 * AI Shopping Copilot - Popup Script
 *
 * Handles:
 * - UI state display
 * - User interactions
 * - API key management
 * - Communication with service worker
 */

// =============================================================================
// DOM Elements
// =============================================================================

const loginStatus = document.getElementById('login-status');
const runStatus = document.getElementById('run-status');
const currentPhase = document.getElementById('current-phase');
const startBtn = document.getElementById('start-btn');
const scanBtn = document.getElementById('scan-btn');
const apiKeyInput = document.getElementById('api-key-input');
const saveKeyBtn = document.getElementById('save-key-btn');
const errorContainer = document.getElementById('error-container');

// =============================================================================
// State Management
// =============================================================================

let currentState = null;

async function loadState() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getState' });
    currentState = response.state;
    updateUI();
  } catch (error) {
    console.error('[AISC-Popup] Failed to load state:', error);
    showError('Failed to connect to service worker');
  }
}

function updateUI() {
  if (!currentState) return;

  // Login status
  if (currentState.isLoggedIn) {
    loginStatus.textContent = currentState.userName || 'Logged in';
    loginStatus.className = 'status-value logged-in';
  } else {
    loginStatus.textContent = 'Not logged in';
    loginStatus.className = 'status-value logged-out';
  }

  // Run status
  runStatus.textContent = capitalizeFirst(currentState.runStatus);
  runStatus.className = `status-value ${currentState.runStatus}`;

  // Current phase
  currentPhase.textContent = currentState.currentPhase
    ? capitalizeFirst(currentState.currentPhase)
    : '-';

  // Button states
  startBtn.disabled = !currentState.isLoggedIn || currentState.runStatus === 'running';

  // Error display
  if (currentState.lastError) {
    showError(currentState.lastError);
  } else {
    clearError();
  }
}

function capitalizeFirst(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// =============================================================================
// Error Display
// =============================================================================

function showError(message) {
  errorContainer.innerHTML = `<div class="error-message">${escapeHtml(message)}</div>`;
}

function clearError() {
  errorContainer.innerHTML = '';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// =============================================================================
// Event Handlers
// =============================================================================

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  startBtn.textContent = 'Starting...';

  try {
    await chrome.runtime.sendMessage({ action: 'startRun' });
  } catch (error) {
    showError('Failed to start run: ' + error.message);
    startBtn.disabled = false;
  }

  startBtn.textContent = 'Start Shopping Assistant';
});

scanBtn.addEventListener('click', async () => {
  scanBtn.disabled = true;
  scanBtn.textContent = 'Scanning...';

  try {
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      showError('No active tab');
      return;
    }

    // Check if we're on Auchan.pt
    if (!tab.url?.includes('auchan.pt')) {
      showError('Please navigate to Auchan.pt first');
      return;
    }

    // Send scan command to content script
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'scanCart' });

    if (response?.success) {
      console.log('[AISC-Popup] Cart scanned:', response);
      clearError();
      // Could show a summary here
    } else {
      showError('Scan failed: ' + (response?.error || 'Unknown error'));
    }
  } catch (error) {
    showError('Scan failed: ' + error.message);
  } finally {
    scanBtn.disabled = false;
    scanBtn.textContent = 'Scan Current Page';
  }
});

saveKeyBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();

  if (!apiKey) {
    showError('Please enter an API key');
    return;
  }

  if (!apiKey.startsWith('sk-ant-')) {
    showError('Invalid API key format');
    return;
  }

  try {
    await chrome.storage.session.set({ anthropicApiKey: apiKey });
    apiKeyInput.value = '';
    clearError();
    saveKeyBtn.textContent = 'Saved!';
    setTimeout(() => {
      saveKeyBtn.textContent = 'Save API Key';
    }, 2000);
  } catch (error) {
    showError('Failed to save API key: ' + error.message);
  }
});

// =============================================================================
// Message Listener
// =============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'stateUpdate') {
    currentState = message.state;
    updateUI();
  }
  return false;
});

// =============================================================================
// API Key Status
// =============================================================================

async function checkApiKey() {
  try {
    const { anthropicApiKey } = await chrome.storage.session.get('anthropicApiKey');
    if (anthropicApiKey) {
      apiKeyInput.placeholder = 'API Key configured';
    }
  } catch (error) {
    console.error('[AISC-Popup] Failed to check API key:', error);
  }
}

// =============================================================================
// Initialization
// =============================================================================

async function init() {
  console.log('[AISC-Popup] Initializing...');
  await loadState();
  await checkApiKey();
}

init();
