/**
 * Chrome Messaging Adapter
 *
 * Implements IMessagingPort using Chrome Extension runtime messaging APIs.
 * Handles communication between service worker, content scripts, and popup.
 *
 * Key responsibilities:
 * - One-shot messaging via chrome.runtime.sendMessage / chrome.tabs.sendMessage
 * - Long-lived port connections via chrome.runtime.connect
 * - Proper async response handling (return true from listener)
 * - Graceful error handling for disconnected ports
 */

import type {
  IMessagingPort,
  IPort,
  MessageHandler,
  MessageSender,
} from '../../ports/messaging.js';
import type { ExtensionMessage, ExtensionResponse } from '../../types/messages.js';

/**
 * Wraps a Chrome runtime.Port to implement IPort interface.
 * Handles disconnect errors gracefully.
 */
class ChromePortWrapper implements IPort {
  private readonly chromePort: chrome.runtime.Port;
  private disconnected = false;

  constructor(chromePort: chrome.runtime.Port) {
    this.chromePort = chromePort;

    // Track disconnect state
    this.chromePort.onDisconnect.addListener(() => {
      this.disconnected = true;
    });
  }

  get name(): string {
    return this.chromePort.name;
  }

  disconnect(): void {
    if (!this.disconnected) {
      this.chromePort.disconnect();
      this.disconnected = true;
    }
  }

  postMessage(message: ExtensionMessage): void {
    if (this.disconnected) {
      console.warn('[ChromeMessagingAdapter] Cannot post message: port disconnected');
      return;
    }

    try {
      this.chromePort.postMessage(message);
    } catch (error) {
      // Handle case where port is disconnected but we haven't received the event yet
      if (isDisconnectedError(error)) {
        this.disconnected = true;
        console.warn('[ChromeMessagingAdapter] Port disconnected while posting message');
      } else {
        throw error;
      }
    }
  }

  onMessage(handler: (message: ExtensionMessage) => void): void {
    this.chromePort.onMessage.addListener((message: unknown) => {
      handler(message as ExtensionMessage);
    });
  }

  onDisconnect(handler: () => void): void {
    this.chromePort.onDisconnect.addListener(() => {
      handler();
    });
  }
}

/**
 * Maps chrome.runtime.MessageSender to our MessageSender type.
 * Extracts only the fields we care about.
 *
 * Note: With exactOptionalPropertyTypes, we cannot assign undefined to optional
 * properties. We only include properties that have defined values.
 */
function mapMessageSender(sender: chrome.runtime.MessageSender): MessageSender {
  const result: MessageSender = {};

  // Only add properties when they have defined values
  if (sender.tab?.id !== undefined) {
    result.tabId = sender.tab.id;
  }

  if (sender.frameId !== undefined) {
    result.frameId = sender.frameId;
  }

  // Prefer sender.url, fall back to tab.url
  const url = sender.url ?? sender.tab?.url;
  if (url !== undefined) {
    result.url = url;
  }

  if (sender.id !== undefined) {
    result.extensionId = sender.id;
  }

  return result;
}

/**
 * Checks if an error is due to a disconnected port or context.
 */
function isDisconnectedError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('disconnected') ||
      message.includes('receiving end does not exist') ||
      message.includes('context invalidated') ||
      message.includes('extension context was invalidated')
    );
  }
  return false;
}

/**
 * Creates a promise that wraps chrome.runtime.lastError handling.
 * Chrome APIs don't throw on error; they set chrome.runtime.lastError.
 */
function checkRuntimeError(): Error | null {
  const lastError = chrome.runtime.lastError;
  if (lastError) {
    return new Error(lastError.message ?? 'Unknown Chrome runtime error');
  }
  return null;
}

/**
 * ChromeMessagingAdapter - Implementation of IMessagingPort for Chrome Extensions
 *
 * Usage:
 * ```typescript
 * const messaging = new ChromeMessagingAdapter();
 *
 * // Send message to service worker
 * const response = await messaging.sendMessage({ action: 'state.get', id: '123' });
 *
 * // Send to content script in a tab
 * const tabResponse = await messaging.sendToTab(tabId, { action: 'cart.scan', id: '456' });
 *
 * // Listen for incoming messages
 * const unsubscribe = messaging.addMessageListener((message, sender, sendResponse) => {
 *   // Handle message...
 *   sendResponse({ id: message.id, success: true, data: {} });
 *   return true; // Indicate async response
 * });
 * ```
 */
export class ChromeMessagingAdapter implements IMessagingPort {
  /**
   * Send a one-shot message to the extension's service worker.
   * Returns a promise that resolves with the response.
   *
   * @param message - Message to send
   * @returns Promise resolving to the response
   * @throws Error if sending fails or receiver doesn't exist
   */
  async sendMessage<T extends ExtensionResponse>(
    message: ExtensionMessage
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response: T | undefined) => {
        const error = checkRuntimeError();
        if (error) {
          reject(error);
          return;
        }

        if (response === undefined) {
          // No response handler was registered or it didn't respond
          reject(new Error('No response received from message handler'));
          return;
        }

        resolve(response);
      });
    });
  }

  /**
   * Send a one-shot message to a specific tab's content script.
   *
   * @param tabId - ID of the tab to send to
   * @param message - Message to send
   * @returns Promise resolving to the response
   * @throws Error if tab doesn't exist or content script isn't loaded
   */
  async sendToTab<T extends ExtensionResponse>(
    tabId: number,
    message: ExtensionMessage
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response: T | undefined) => {
        const error = checkRuntimeError();
        if (error) {
          reject(error);
          return;
        }

        if (response === undefined) {
          reject(new Error(`No response received from tab ${tabId}`));
          return;
        }

        resolve(response);
      });
    });
  }

  /**
   * Add a listener for incoming messages.
   * The handler receives messages from both content scripts and other extension pages.
   *
   * IMPORTANT: If the handler will call sendResponse asynchronously,
   * it MUST return `true` to keep the message channel open.
   *
   * @param handler - Callback invoked for each message
   * @returns Function to remove the listener
   */
  addMessageListener(handler: MessageHandler): () => void {
    const chromeHandler = (
      message: unknown,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ): boolean | void => {
      // Type guard: ensure message has expected structure
      if (!isExtensionMessage(message)) {
        console.warn('[ChromeMessagingAdapter] Received non-extension message:', message);
        return;
      }

      // Map Chrome sender to our MessageSender type
      const mappedSender = mapMessageSender(sender);

      // Wrap sendResponse to match our type signature
      const typedSendResponse = (response: ExtensionResponse): void => {
        sendResponse(response);
      };

      // Call handler and preserve return value
      // Handler must return true if sendResponse will be called async
      return handler(message, mappedSender, typedSendResponse);
    };

    chrome.runtime.onMessage.addListener(chromeHandler);

    // Return unsubscribe function
    return () => {
      chrome.runtime.onMessage.removeListener(chromeHandler);
    };
  }

  /**
   * Open a long-lived port connection to the service worker.
   * Useful for streaming updates or keeping a persistent communication channel.
   *
   * @param name - Name to identify this connection
   * @returns IPort wrapper around the chrome port
   */
  connect(name: string): IPort {
    const chromePort = chrome.runtime.connect({ name });
    return new ChromePortWrapper(chromePort);
  }

  /**
   * Add a listener for incoming port connections.
   * Used by the service worker to accept connections from content scripts or popup.
   *
   * @param handler - Callback invoked when a new port connects
   * @returns Function to remove the listener
   */
  addConnectListener(handler: (port: IPort) => void): () => void {
    const chromeHandler = (chromePort: chrome.runtime.Port): void => {
      const wrappedPort = new ChromePortWrapper(chromePort);
      handler(wrappedPort);
    };

    chrome.runtime.onConnect.addListener(chromeHandler);

    // Return unsubscribe function
    return () => {
      chrome.runtime.onConnect.removeListener(chromeHandler);
    };
  }
}

/**
 * Type guard to check if a value is an ExtensionMessage.
 * Messages must have an `id` string and an `action` string.
 */
function isExtensionMessage(value: unknown): value is ExtensionMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const msg = value as Record<string, unknown>;
  return (
    typeof msg.id === 'string' &&
    typeof msg.action === 'string'
  );
}

/**
 * Singleton instance for convenience.
 * In most cases, use this instead of creating new instances.
 */
let defaultAdapter: ChromeMessagingAdapter | null = null;

/**
 * Get the default ChromeMessagingAdapter instance.
 * Creates the instance on first call (lazy initialization).
 */
export function getMessagingAdapter(): ChromeMessagingAdapter {
  if (!defaultAdapter) {
    defaultAdapter = new ChromeMessagingAdapter();
  }
  return defaultAdapter;
}

/**
 * Reset the default adapter (useful for testing).
 */
export function resetMessagingAdapter(): void {
  defaultAdapter = null;
}

// Export the class as default for direct instantiation
export default ChromeMessagingAdapter;
