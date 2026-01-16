/**
 * Messaging Port
 *
 * Abstracts chrome.runtime messaging for communication between
 * service worker, content scripts, and popup.
 */

import type {
  MessageAction,
  ExtensionMessage,
  ExtensionResponse,
} from '../types/messages.js';

/**
 * Message sender information
 */
export interface MessageSender {
  /** Tab ID that sent the message (undefined if from extension page) */
  tabId?: number;
  /** Frame ID within the tab */
  frameId?: number;
  /** URL of the sender */
  url?: string;
  /** Extension ID (for external messages) */
  extensionId?: string;
}

/**
 * Message handler callback type
 */
export type MessageHandler = (
  message: ExtensionMessage,
  sender: MessageSender,
  sendResponse: (response: ExtensionResponse) => void
) => boolean | void;

/**
 * Port connection for long-lived messaging
 */
export interface IPort {
  /** Port name */
  name: string;

  /** Disconnect the port */
  disconnect(): void;

  /** Send message through the port */
  postMessage(message: ExtensionMessage): void;

  /** Add message listener */
  onMessage(handler: (message: ExtensionMessage) => void): void;

  /** Add disconnect listener */
  onDisconnect(handler: () => void): void;
}

/**
 * IMessagingPort - Interface for extension messaging
 *
 * Implementations:
 * - ChromeMessagingAdapter: Real Chrome runtime messaging
 * - FakeMessagingAdapter: Mock messaging for tests
 */
export interface IMessagingPort {
  /**
   * Send one-shot message to the extension (service worker)
   * @param message - Message to send
   * @returns Promise resolving to the response
   */
  sendMessage<T extends ExtensionResponse>(
    message: ExtensionMessage
  ): Promise<T>;

  /**
   * Send message to a specific tab's content script
   * @param tabId - Target tab ID
   * @param message - Message to send
   * @returns Promise resolving to the response
   */
  sendToTab<T extends ExtensionResponse>(
    tabId: number,
    message: ExtensionMessage
  ): Promise<T>;

  /**
   * Add listener for incoming messages
   * @param handler - Message handler callback
   * @returns Unsubscribe function
   *
   * Handler should return true if response will be sent asynchronously.
   */
  addMessageListener(handler: MessageHandler): () => void;

  /**
   * Open a long-lived port connection
   * @param name - Port name for identification
   * @returns Port connection object
   */
  connect(name: string): IPort;

  /**
   * Add listener for incoming port connections
   * @param handler - Connection handler callback
   * @returns Unsubscribe function
   */
  addConnectListener(handler: (port: IPort) => void): () => void;
}

/**
 * Helper type for type-safe message sending
 *
 * Usage:
 * ```typescript
 * const response = await messaging.sendMessage<CartScanResponse>({
 *   action: 'scanCart',
 *   payload: { includeOutOfStock: true }
 * });
 * ```
 */
export type TypedMessageSender = {
  // Cart operations
  scanCart: {
    request: { includeOutOfStock?: boolean };
    response: { items: import('../types/cart.js').CartItem[] };
  };

  // Order operations
  extractOrderHistory: {
    request: { limit?: number };
    response: { orders: import('../types/orders.js').OrderSummary[] };
  };

  // Search operations
  searchProducts: {
    request: { query: string; maxResults?: number };
    response: { products: import('../types/cart.js').ProductInfo[] };
  };

  // State updates
  getRunState: {
    request: Record<string, never>;
    response: import('../types/state.js').RunState;
  };
};
