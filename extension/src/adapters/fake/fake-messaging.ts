/**
 * Fake Messaging Adapter
 *
 * In-memory implementation of IMessagingPort for unit testing.
 * Queues messages for inspection and simulates port connections.
 */

import type {
  IMessagingPort,
  IPort,
  MessageHandler,
  MessageSender,
} from '../../ports/messaging.js';
import type { ExtensionMessage, ExtensionResponse } from '../../types/messages.js';

/**
 * Recorded message for test assertions
 */
export interface RecordedMessage {
  message: ExtensionMessage;
  timestamp: number;
  target: 'extension' | 'tab';
  tabId?: number;
}

/**
 * Fake port for long-lived connections
 */
export class FakePort implements IPort {
  name: string;
  private messageHandlers: Array<(message: ExtensionMessage) => void> = [];
  private disconnectHandlers: Array<() => void> = [];
  private connected = true;
  private otherEnd: FakePort | null = null;

  /** Messages sent through this port (for assertions) */
  readonly sentMessages: ExtensionMessage[] = [];

  constructor(name: string) {
    this.name = name;
  }

  /**
   * Connect this port to another port (simulates two-way connection)
   */
  connectTo(other: FakePort): void {
    this.otherEnd = other;
    other.otherEnd = this;
  }

  /**
   * Check if port is still connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  disconnect(): void {
    if (!this.connected) return;

    this.connected = false;

    // Notify disconnect handlers
    for (const handler of this.disconnectHandlers) {
      try {
        handler();
      } catch (error) {
        console.error('FakePort: Disconnect handler threw error:', error);
      }
    }

    // Disconnect the other end too
    if (this.otherEnd && this.otherEnd.isConnected()) {
      this.otherEnd.disconnect();
    }
  }

  postMessage(message: ExtensionMessage): void {
    if (!this.connected) {
      throw new Error('FakePort: Cannot send message on disconnected port');
    }

    this.sentMessages.push(message);

    // Deliver to other end's message handlers
    if (this.otherEnd) {
      for (const handler of this.otherEnd.messageHandlers) {
        try {
          handler(message);
        } catch (error) {
          console.error('FakePort: Message handler threw error:', error);
        }
      }
    }
  }

  onMessage(handler: (message: ExtensionMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  onDisconnect(handler: () => void): void {
    this.disconnectHandlers.push(handler);
  }

  /**
   * Simulate receiving a message (for tests)
   */
  receiveMessage(message: ExtensionMessage): void {
    for (const handler of this.messageHandlers) {
      try {
        handler(message);
      } catch (error) {
        console.error('FakePort: Message handler threw error:', error);
      }
    }
  }
}

/**
 * FakeMessagingAdapter - Mock messaging for tests
 *
 * Features:
 * - Queue messages for test inspection
 * - Register handlers that get called directly
 * - Simulate port connections with in-memory channels
 * - Configurable responses for sendMessage/sendToTab
 */
export class FakeMessagingAdapter implements IMessagingPort {
  private messageHandlers: MessageHandler[] = [];
  private connectHandlers: Array<(port: IPort) => void> = [];
  private ports: Map<string, FakePort> = new Map();

  /** All messages sent (for assertions) */
  readonly sentMessages: RecordedMessage[] = [];

  /** Configurable response generator */
  private responseGenerator:
    | ((message: ExtensionMessage, tabId?: number) => ExtensionResponse)
    | null = null;

  /** Default response for messages without handler */
  private defaultResponse: ExtensionResponse = {
    id: 'fake-response',
    success: true,
    data: {},
  };

  // ============================================================================
  // Test Helpers
  // ============================================================================

  /**
   * Reset adapter state
   */
  reset(): void {
    this.sentMessages.length = 0;
    this.messageHandlers = [];
    this.connectHandlers = [];
    for (const port of this.ports.values()) {
      port.disconnect();
    }
    this.ports.clear();
    this.responseGenerator = null;
  }

  /**
   * Set a function to generate responses for sendMessage/sendToTab
   */
  setResponseGenerator(
    generator: (message: ExtensionMessage, tabId?: number) => ExtensionResponse
  ): void {
    this.responseGenerator = generator;
  }

  /**
   * Set the default response returned when no handler matches
   */
  setDefaultResponse(response: ExtensionResponse): void {
    this.defaultResponse = response;
  }

  /**
   * Get messages sent to a specific action type
   */
  getMessagesByAction(action: string): RecordedMessage[] {
    return this.sentMessages.filter((m) => m.message.action === action);
  }

  /**
   * Get messages sent to a specific tab
   */
  getMessagesToTab(tabId: number): RecordedMessage[] {
    return this.sentMessages.filter((m) => m.tabId === tabId);
  }

  /**
   * Get the last sent message
   */
  getLastMessage(): RecordedMessage | undefined {
    return this.sentMessages[this.sentMessages.length - 1];
  }

  /**
   * Simulate receiving a message from a content script or popup
   */
  simulateIncomingMessage(
    message: ExtensionMessage,
    sender: MessageSender = {}
  ): Promise<ExtensionResponse | undefined> {
    return new Promise((resolve) => {
      let responseWasSent = false;

      const sendResponse = (response: ExtensionResponse) => {
        responseWasSent = true;
        resolve(response);
      };

      for (const handler of this.messageHandlers) {
        const isAsync = handler(message, sender, sendResponse);
        if (!isAsync && responseWasSent) {
          return; // Sync response was sent
        }
      }

      // If no handler sent a response synchronously and none returned true,
      // resolve with undefined
      if (!responseWasSent) {
        setTimeout(() => {
          if (!responseWasSent) {
            resolve(undefined);
          }
        }, 0);
      }
    });
  }

  /**
   * Get a port by name (for test assertions)
   */
  getPort(name: string): FakePort | undefined {
    return this.ports.get(name);
  }

  /**
   * Simulate an incoming port connection (service worker side)
   */
  simulateIncomingConnection(portName: string): FakePort {
    const port = new FakePort(portName);
    this.ports.set(portName, port);

    for (const handler of this.connectHandlers) {
      try {
        handler(port);
      } catch (error) {
        console.error('FakeMessagingAdapter: Connect handler threw error:', error);
      }
    }

    return port;
  }

  // ============================================================================
  // IMessagingPort Implementation
  // ============================================================================

  async sendMessage<T extends ExtensionResponse>(
    message: ExtensionMessage
  ): Promise<T> {
    // Record the message
    this.sentMessages.push({
      message,
      timestamp: Date.now(),
      target: 'extension',
    });

    // Check if any registered handler wants to respond
    let handlerResponse: ExtensionResponse | undefined;

    for (const handler of this.messageHandlers) {
      const responsePromise = new Promise<ExtensionResponse | undefined>((resolve) => {
        const isAsync = handler(message, {}, (response) => {
          resolve(response);
        });
        if (!isAsync) {
          resolve(undefined);
        }
      });

      const response = await responsePromise;
      if (response) {
        handlerResponse = response;
        break;
      }
    }

    if (handlerResponse) {
      return handlerResponse as T;
    }

    // Use response generator if configured
    if (this.responseGenerator) {
      return this.responseGenerator(message) as T;
    }

    // Return default response with correct id
    return {
      ...this.defaultResponse,
      id: message.id,
    } as T;
  }

  async sendToTab<T extends ExtensionResponse>(
    tabId: number,
    message: ExtensionMessage
  ): Promise<T> {
    // Record the message
    this.sentMessages.push({
      message,
      timestamp: Date.now(),
      target: 'tab',
      tabId,
    });

    // Use response generator if configured
    if (this.responseGenerator) {
      return this.responseGenerator(message, tabId) as T;
    }

    // Return default response with correct id
    return {
      ...this.defaultResponse,
      id: message.id,
    } as T;
  }

  addMessageListener(handler: MessageHandler): () => void {
    this.messageHandlers.push(handler);

    return () => {
      const index = this.messageHandlers.indexOf(handler);
      if (index !== -1) {
        this.messageHandlers.splice(index, 1);
      }
    };
  }

  connect(name: string): IPort {
    const port = new FakePort(name);
    this.ports.set(name, port);
    return port;
  }

  addConnectListener(handler: (port: IPort) => void): () => void {
    this.connectHandlers.push(handler);

    return () => {
      const index = this.connectHandlers.indexOf(handler);
      if (index !== -1) {
        this.connectHandlers.splice(index, 1);
      }
    };
  }
}

/**
 * Create a FakeMessagingAdapter with optional response configuration
 */
export function createFakeMessaging(options?: {
  responseGenerator?: (message: ExtensionMessage, tabId?: number) => ExtensionResponse;
  defaultResponse?: ExtensionResponse;
}): FakeMessagingAdapter {
  const adapter = new FakeMessagingAdapter();

  if (options?.responseGenerator) {
    adapter.setResponseGenerator(options.responseGenerator);
  }
  if (options?.defaultResponse) {
    adapter.setDefaultResponse(options.defaultResponse);
  }

  return adapter;
}
