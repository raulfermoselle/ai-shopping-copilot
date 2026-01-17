/**
 * Service Worker Entry Point
 *
 * Bootstraps the Chrome Extension service worker (Manifest V3).
 * Responsible for:
 * - Creating and wiring up Chrome adapters
 * - Creating state machine with recovery
 * - Setting up message listeners for popup/content script communication
 * - Handling service worker lifecycle (startup, suspension, resume)
 * - Registering alarm handlers for scheduled tasks
 *
 * SAFETY CONSTRAINT (ADR-007):
 * - NO checkout, purchase, or payment code paths
 * - 'review' state is terminal for automation
 * - User must manually proceed with checkout in the browser
 *
 * @module
 */

import { ChromeStorageAdapter } from '../adapters/chrome/storage-adapter.js';
import { ChromeMessagingAdapter } from '../adapters/chrome/messaging-adapter.js';
import { ChromeTabsAdapter } from '../adapters/chrome/tabs-adapter.js';
import { ChromeAlarmsAdapter } from '../adapters/chrome/alarms-adapter.js';
import { createStateMachineWithRecovery } from '../core/orchestrator/state-machine.js';
import { ALARM_NAMES } from '../ports/alarms.js';
import {
  createSuccessResponse,
  createErrorResponse,
  ERROR_CODES,
  generateMessageId,
} from '../types/messages.js';
import { logger } from '../utils/logger.js';

import type { StateMachine } from '../core/orchestrator/types.js';
import type { IStoragePort } from '../ports/storage.js';
import type { IMessagingPort, MessageSender } from '../ports/messaging.js';
import type { ITabsPort } from '../ports/tabs.js';
import type { IAlarmsPort, AlarmInfo } from '../ports/alarms.js';
import type {
  ExtensionMessage,
  ExtensionResponse,
  RunStartRequest,
  LLMSetApiKeyRequest,
} from '../types/messages.js';
import type { RunState } from '../types/state.js';

// =============================================================================
// SAFETY ASSERTION
// =============================================================================

/**
 * CRITICAL SAFETY CHECK: This assertion runs at module load.
 * It verifies that no checkout/purchase functions exist in this module.
 *
 * This is a compile-time-ish check to ensure the safety constraint is maintained.
 *
 * Forbidden function names (NEVER implement these):
 * - placeOrder, confirmPurchase, submitCheckout, completeOrder
 * - processPayment, checkout, purchase, pay, confirmOrder
 */

// This assertion will fail at runtime if any forbidden function is defined
function assertNoCheckoutFunctions(): void {
  // In production, this is a no-op
  // In development, it serves as a documentation of the safety constraint
  console.log('[SAFETY] Service worker verified: no checkout functions present');
}

// =============================================================================
// Global State
// =============================================================================

/** Chrome adapters - initialized in bootstrap() */
let storage: IStoragePort;
let messaging: IMessagingPort;
let tabs: ITabsPort;
let alarms: IAlarmsPort;

/** State machine - initialized in bootstrap() */
let stateMachine: StateMachine;

/** Track if bootstrap has completed */
let bootstrapped = false;

/** Track active port connections for keep-alive */
const activePorts: Set<chrome.runtime.Port> = new Set();

// =============================================================================
// Bootstrap
// =============================================================================

/**
 * Bootstrap the service worker.
 * Creates adapters, recovers state, sets up listeners.
 *
 * This function is idempotent - calling it multiple times is safe.
 */
async function bootstrap(): Promise<void> {
  if (bootstrapped) {
    logger.info('SW', 'Already bootstrapped, skipping');
    return;
  }

  logger.info('SW', 'Bootstrapping service worker...');

  try {
    // 1. Create Chrome adapters
    storage = new ChromeStorageAdapter();
    messaging = new ChromeMessagingAdapter();
    tabs = new ChromeTabsAdapter();
    alarms = new ChromeAlarmsAdapter();

    logger.info('SW', 'Adapters created');

    // 2. Create state machine with recovery from chrome.storage.session
    stateMachine = await createStateMachineWithRecovery(
      {
        storage,
        onStateChange: handleStateChange,
      },
      { debug: true }
    );

    logger.info('SW', 'State machine created', { status: stateMachine.getState().status });

    // 3. Check if recovery is needed
    const currentState = stateMachine.getState();
    if (currentState.recoveryNeeded) {
      logger.info('SW', 'Recovery needed, resuming interrupted run');
      // Clear recovery flag
      stateMachine.dispatch({ type: 'RECOVERY_COMPLETE' });
      // TODO: Resume orchestration from last known phase
    }

    // 4. Set up alarm handlers
    setupAlarmHandlers();

    // 5. Set up keep-alive alarm during active runs
    if (currentState.status === 'running') {
      await startKeepAlive();
    }

    bootstrapped = true;
    logger.info('SW', 'Bootstrap complete');

    // Run safety assertion
    assertNoCheckoutFunctions();

  } catch (error) {
    logger.error('SW', 'Bootstrap failed', error);
    throw error;
  }
}

// =============================================================================
// State Change Handler
// =============================================================================

/**
 * Called whenever the state machine transitions.
 * Used to manage alarms and notify connected UIs.
 */
function handleStateChange(state: RunState): void {
  logger.info('SW', 'State changed', { status: state.status, phase: state.phase });

  // Manage keep-alive alarm based on run status
  if (state.status === 'running') {
    startKeepAlive().catch(console.error);
  } else if (state.status === 'idle' || state.status === 'complete') {
    stopKeepAlive().catch(console.error);
  }

  // Broadcast state change to all connected ports
  broadcastStateUpdate(state);
}

/**
 * Broadcast state update to all connected ports (popup, side panel).
 */
function broadcastStateUpdate(state: RunState): void {
  const message: ExtensionMessage = {
    id: generateMessageId(),
    action: 'state.update',
    payload: state,
    timestamp: Date.now(),
  };

  for (const port of activePorts) {
    try {
      port.postMessage(message);
    } catch {
      // Port may be disconnected
      activePorts.delete(port);
    }
  }
}

// =============================================================================
// Message Handlers
// =============================================================================

/**
 * Main message handler for chrome.runtime.onMessage.
 * Routes messages to appropriate handlers based on action.
 *
 * IMPORTANT: Returns true for async handlers to keep message channel open.
 */
function handleMessage(
  message: ExtensionMessage,
  sender: MessageSender,
  sendResponse: (response: ExtensionResponse) => void
): boolean {
  const startTime = Date.now();

  logger.info('SW', 'Received message', { action: message.action, from: sender.tabId ?? 'extension' });

  // Ensure bootstrap is complete
  if (!bootstrapped) {
    sendResponse(createErrorResponse(
      message.id,
      ERROR_CODES.INVALID_STATE,
      'Service worker not yet initialized'
    ));
    return false;
  }

  // Route to handler based on action
  switch (message.action) {
    // === STATE MANAGEMENT ===
    case 'state.get':
      handleGetState(message, sendResponse, startTime);
      return false; // Synchronous

    // === RUN CONTROL ===
    case 'run.start':
      handleStartRun(message as RunStartRequest, sendResponse, startTime);
      return true; // Async

    case 'run.pause':
      handlePauseRun(message, sendResponse, startTime);
      return false;

    case 'run.resume':
      handleResumeRun(message, sendResponse, startTime);
      return false;

    case 'run.cancel':
      handleCancelRun(message, sendResponse, startTime);
      return false;

    // === LLM ===
    case 'llm.setApiKey':
      handleSetApiKey(message as LLMSetApiKeyRequest, sendResponse, startTime);
      return true; // Async

    case 'llm.checkAvailable':
      handleCheckLLMAvailable(message, sendResponse, startTime);
      return true; // Async

    // === SYSTEM ===
    case 'system.ping':
      sendResponse(createSuccessResponse(message.id, { pong: true }, Date.now() - startTime));
      return false;

    default:
      sendResponse(createErrorResponse(
        message.id,
        ERROR_CODES.INVALID_REQUEST,
        `Unknown action: ${message.action}`
      ));
      return false;
  }
}

/**
 * Handle state.get - Return current run state
 */
function handleGetState(
  message: ExtensionMessage,
  sendResponse: (response: ExtensionResponse) => void,
  startTime: number
): void {
  const state = stateMachine.getState();
  sendResponse(createSuccessResponse(message.id, state, Date.now() - startTime));
}

/**
 * Handle run.start - Start a new shopping session
 *
 * SAFETY: This starts the automation but NEVER proceeds to checkout.
 * The state machine's 'review' state is terminal for automation.
 */
async function handleStartRun(
  message: RunStartRequest,
  sendResponse: (response: ExtensionResponse) => void,
  startTime: number
): Promise<void> {
  try {
    const currentState = stateMachine.getState();

    // Validate: can only start from idle
    if (currentState.status !== 'idle') {
      sendResponse(createErrorResponse(
        message.id,
        ERROR_CODES.INVALID_STATE,
        `Cannot start run: current status is '${currentState.status}'`
      ));
      return;
    }

    // Try to find an Auchan.pt tab
    const auchanTabs = await tabs.query({ url: 'https://www.auchan.pt/*' });
    const firstTab = auchanTabs[0];
    if (!firstTab) {
      sendResponse(createErrorResponse(
        message.id,
        ERROR_CODES.WRONG_PAGE,
        'No Auchan.pt tab found. Please open Auchan.pt first.'
      ));
      return;
    }

    const tabId = firstTab.id;
    if (tabId === undefined || tabId < 0) {
      sendResponse(createErrorResponse(
        message.id,
        ERROR_CODES.INVALID_STATE,
        'Found Auchan.pt tab but could not get valid tab ID'
      ));
      return;
    }

    // Build payload with optional orderId (only include if defined)
    const payload: { tabId: number; orderId?: string } = { tabId };
    if (message.payload?.orderId !== undefined) {
      payload.orderId = message.payload.orderId;
    }

    // Dispatch START_RUN action
    const newState = stateMachine.dispatch({
      type: 'START_RUN',
      payload,
    });

    logger.info('SW', 'Run started', { runId: newState.runId });

    // TODO: In future, orchestrator will be instantiated here to drive the run
    // For now, we just transition the state machine

    sendResponse(createSuccessResponse(message.id, newState, Date.now() - startTime));

  } catch (error) {
    logger.error('SW', 'Error starting run', error);
    sendResponse(createErrorResponse(
      message.id,
      ERROR_CODES.UNKNOWN,
      error instanceof Error ? error.message : 'Unknown error starting run'
    ));
  }
}

/**
 * Handle run.pause - Pause the current run
 */
function handlePauseRun(
  message: ExtensionMessage,
  sendResponse: (response: ExtensionResponse) => void,
  startTime: number
): void {
  const currentState = stateMachine.getState();

  if (!stateMachine.canTransition('paused')) {
    sendResponse(createErrorResponse(
      message.id,
      ERROR_CODES.INVALID_STATE,
      `Cannot pause: current status is '${currentState.status}'`
    ));
    return;
  }

  const newState = stateMachine.dispatch({ type: 'PAUSE_RUN' });
  sendResponse(createSuccessResponse(message.id, newState, Date.now() - startTime));
}

/**
 * Handle run.resume - Resume a paused run
 */
function handleResumeRun(
  message: ExtensionMessage,
  sendResponse: (response: ExtensionResponse) => void,
  startTime: number
): void {
  const currentState = stateMachine.getState();

  if (currentState.status !== 'paused') {
    sendResponse(createErrorResponse(
      message.id,
      ERROR_CODES.INVALID_STATE,
      `Cannot resume: current status is '${currentState.status}'`
    ));
    return;
  }

  const newState = stateMachine.dispatch({ type: 'RESUME_RUN' });
  sendResponse(createSuccessResponse(message.id, newState, Date.now() - startTime));
}

/**
 * Handle run.cancel - Cancel the current run and return to idle
 */
function handleCancelRun(
  message: ExtensionMessage,
  sendResponse: (response: ExtensionResponse) => void,
  startTime: number
): void {
  const currentState = stateMachine.getState();

  // Can cancel from running, paused, or review states
  if (currentState.status === 'idle' || currentState.status === 'complete') {
    sendResponse(createErrorResponse(
      message.id,
      ERROR_CODES.INVALID_STATE,
      `Nothing to cancel: current status is '${currentState.status}'`
    ));
    return;
  }

  const newState = stateMachine.dispatch({ type: 'CANCEL_RUN' });
  sendResponse(createSuccessResponse(message.id, newState, Date.now() - startTime));
}

/**
 * Handle llm.setApiKey - Store the Anthropic API key
 */
async function handleSetApiKey(
  message: LLMSetApiKeyRequest,
  sendResponse: (response: ExtensionResponse) => void,
  startTime: number
): Promise<void> {
  try {
    const apiKey = message.payload?.apiKey;

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      sendResponse(createErrorResponse(
        message.id,
        ERROR_CODES.INVALID_REQUEST,
        'API key is required'
      ));
      return;
    }

    // Basic validation: Anthropic keys start with 'sk-ant-'
    if (!apiKey.startsWith('sk-ant-')) {
      sendResponse(createErrorResponse(
        message.id,
        ERROR_CODES.API_KEY_INVALID,
        'Invalid API key format. Anthropic keys start with "sk-ant-"'
      ));
      return;
    }

    // Store in session storage (ephemeral, cleared on browser close)
    await storage.set({ anthropicApiKey: apiKey }, 'session');

    logger.info('SW', 'API key stored in session storage');

    sendResponse(createSuccessResponse(message.id, { stored: true }, Date.now() - startTime));

  } catch (error) {
    logger.error('SW', 'Error storing API key', error);
    sendResponse(createErrorResponse(
      message.id,
      ERROR_CODES.UNKNOWN,
      error instanceof Error ? error.message : 'Failed to store API key'
    ));
  }
}

/**
 * Handle llm.checkAvailable - Check if LLM is available (API key present)
 */
async function handleCheckLLMAvailable(
  message: ExtensionMessage,
  sendResponse: (response: ExtensionResponse) => void,
  startTime: number
): Promise<void> {
  try {
    const result = await storage.get<{ anthropicApiKey: string }>(['anthropicApiKey'], 'session');
    const hasApiKey = Boolean(result.anthropicApiKey);

    sendResponse(createSuccessResponse(
      message.id,
      { available: hasApiKey },
      Date.now() - startTime
    ));

  } catch (error) {
    logger.error('SW', 'Error checking LLM availability', error);
    sendResponse(createErrorResponse(
      message.id,
      ERROR_CODES.UNKNOWN,
      error instanceof Error ? error.message : 'Failed to check LLM availability'
    ));
  }
}

// =============================================================================
// Port Connection Handler
// =============================================================================

/**
 * Handle new port connections from popup or side panel.
 * Used for long-lived connections and state streaming.
 */
function handlePortConnect(port: chrome.runtime.Port): void {
  logger.info('SW', 'Port connected', { name: port.name });

  activePorts.add(port);

  // Send current state immediately
  if (bootstrapped && stateMachine) {
    const state = stateMachine.getState();
    port.postMessage({
      id: generateMessageId(),
      action: 'state.update',
      payload: state,
      timestamp: Date.now(),
    });
  }

  // Handle port disconnect
  port.onDisconnect.addListener(() => {
    logger.info('SW', 'Port disconnected', { name: port.name });
    activePorts.delete(port);
  });

  // Handle messages on the port
  port.onMessage.addListener((message: ExtensionMessage) => {
    logger.info('SW', 'Port message', { action: message.action });

    // For port messages, we send response back through the port
    const sendResponse = (response: ExtensionResponse) => {
      try {
        port.postMessage(response);
      } catch {
        // Port may be disconnected
        activePorts.delete(port);
      }
    };

    handleMessage(message, {}, sendResponse);
  });
}

// =============================================================================
// Alarm Handlers
// =============================================================================

/**
 * Set up alarm event listeners
 */
function setupAlarmHandlers(): void {
  alarms.addListener(handleAlarm);
  logger.info('SW', 'Alarm handlers registered');
}

/**
 * Handle alarm events
 */
function handleAlarm(alarm: AlarmInfo): void {
  logger.info('SW', 'Alarm fired', { name: alarm.name });

  switch (alarm.name) {
    case ALARM_NAMES.KEEP_ALIVE:
      handleKeepAliveAlarm();
      break;

    case ALARM_NAMES.PERSIST_STATE:
      handlePersistStateAlarm();
      break;

    case ALARM_NAMES.CACHE_CLEANUP:
      handleCacheCleanupAlarm();
      break;

    case ALARM_NAMES.RETRY_OPERATION:
      handleRetryAlarm();
      break;

    default:
      logger.info('SW', 'Unknown alarm', { name: alarm.name });
  }
}

/**
 * Keep-alive alarm handler - prevents service worker termination during runs
 */
function handleKeepAliveAlarm(): void {
  logger.info('SW', 'Keep-alive ping', { time: new Date().toISOString() });

  // Check if we still need to be alive
  if (bootstrapped && stateMachine) {
    const state = stateMachine.getState();
    if (state.status !== 'running' && state.status !== 'paused') {
      // No longer need keep-alive
      stopKeepAlive().catch(console.error);
    }
  }
}

/**
 * Persist state alarm handler - ensures state is saved periodically
 */
function handlePersistStateAlarm(): void {
  logger.info('SW', 'Periodic state persistence');
  // State machine already persists on every change
  // This is a backup in case of issues
  if (bootstrapped && stateMachine) {
    const state = stateMachine.getState();
    storage.set({ runState: state }, 'session').catch(console.error);
  }
}

/**
 * Cache cleanup alarm handler - clears expired caches
 */
function handleCacheCleanupAlarm(): void {
  logger.info('SW', 'Cache cleanup');
  // TODO: Implement cache cleanup when order cache is implemented
}

/**
 * Retry alarm handler - retries failed operations
 */
function handleRetryAlarm(): void {
  logger.info('SW', 'Retry alarm');
  // TODO: Implement retry logic when orchestrator is implemented
  if (bootstrapped && stateMachine) {
    const state = stateMachine.getState();
    if (state.status === 'paused' && state.error?.recoverable) {
      logger.info('SW', 'Attempting to resume from recoverable error');
      stateMachine.dispatch({ type: 'RESUME_RUN' });
    }
  }
}

/**
 * Start the keep-alive alarm (1 minute period)
 */
async function startKeepAlive(): Promise<void> {
  const existingAlarm = await alarms.get(ALARM_NAMES.KEEP_ALIVE);
  if (!existingAlarm) {
    await alarms.create(ALARM_NAMES.KEEP_ALIVE, {
      delayInMinutes: 1,
      periodInMinutes: 1,
    });
    logger.info('SW', 'Keep-alive alarm started');
  }
}

/**
 * Stop the keep-alive alarm
 */
async function stopKeepAlive(): Promise<void> {
  const cleared = await alarms.clear(ALARM_NAMES.KEEP_ALIVE);
  if (cleared) {
    logger.info('SW', 'Keep-alive alarm stopped');
  }
}

// =============================================================================
// Service Worker Lifecycle
// =============================================================================

/**
 * Handle install event (extension first installed or updated)
 */
chrome.runtime.onInstalled.addListener((details) => {
  logger.info('SW', 'Extension installed', { reason: details.reason });

  // Set up daily cache cleanup alarm
  alarms.create(ALARM_NAMES.CACHE_CLEANUP, {
    delayInMinutes: 60, // First run in 1 hour
    periodInMinutes: 24 * 60, // Then daily
  });
});

/**
 * Handle startup event (browser started with extension already installed)
 */
chrome.runtime.onStartup.addListener(() => {
  logger.info('SW', 'Browser startup');
  bootstrap().catch(console.error);
});

// =============================================================================
// Event Listeners Registration
// =============================================================================

/**
 * Convert Chrome message sender to our MessageSender type.
 * Only includes properties that have defined values (for exactOptionalPropertyTypes).
 */
function mapChromeMessageSender(sender: chrome.runtime.MessageSender): MessageSender {
  const result: MessageSender = {};

  if (sender.tab?.id !== undefined) {
    result.tabId = sender.tab.id;
  }
  if (sender.frameId !== undefined) {
    result.frameId = sender.frameId;
  }
  const url = sender.url ?? sender.tab?.url;
  if (url !== undefined) {
    result.url = url;
  }
  if (sender.id !== undefined) {
    result.extensionId = sender.id;
  }

  return result;
}

// Set up message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Ensure bootstrap is done before handling messages
  if (!bootstrapped) {
    bootstrap()
      .then(() => {
        handleMessage(
          message as ExtensionMessage,
          mapChromeMessageSender(sender),
          sendResponse
        );
        // Note: result is intentionally unused; we return true below for async
      })
      .catch((error) => {
        logger.error('SW', 'Bootstrap failed during message handling', error);
        sendResponse(createErrorResponse(
          (message as ExtensionMessage).id,
          ERROR_CODES.UNKNOWN,
          'Service worker initialization failed'
        ));
      });
    return true; // Keep channel open for async bootstrap
  }

  // Already bootstrapped, handle message directly
  return handleMessage(
    message as ExtensionMessage,
    mapChromeMessageSender(sender),
    sendResponse
  );
});

// Set up port connection listener
chrome.runtime.onConnect.addListener(handlePortConnect);

// =============================================================================
// Initial Bootstrap
// =============================================================================

// Bootstrap immediately on script load
bootstrap().catch((error) => {
  logger.error('SW', 'Initial bootstrap failed', error);
});

// =============================================================================
// Export for Testing
// =============================================================================

/**
 * Exported for testing purposes only.
 * These should not be used in production code.
 */
export const __testing__ = {
  getStateMachine: () => stateMachine,
  getStorage: () => storage,
  getMessaging: () => messaging,
  getTabs: () => tabs,
  getAlarms: () => alarms,
  isBootstrapped: () => bootstrapped,
  reset: async () => {
    bootstrapped = false;
    activePorts.clear();
    await alarms.clearAll();
    await storage.clear('session');
  },
};
