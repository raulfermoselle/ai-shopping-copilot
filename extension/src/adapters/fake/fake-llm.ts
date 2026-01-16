/**
 * Fake LLM Adapter
 *
 * Mock implementation of ILLMPort for unit testing.
 * Allows setting up canned responses and simulating errors.
 */

import type {
  ILLMPort,
  LLMMessage,
  LLMCompletionOptions,
  LLMCompletionResponse,
  LLMError,
  LLMErrorType,
} from '../../ports/llm.js';
import { DEFAULT_LLM_CONFIG } from '../../ports/llm.js';

/**
 * Canned response configuration
 */
export interface CannedResponse {
  /** Response content or function to generate it */
  content: string | ((messages: LLMMessage[]) => string);
  /** Optional token usage override */
  usage?: { inputTokens: number; outputTokens: number };
  /** Optional stop reason */
  stopReason?: 'end_turn' | 'max_tokens' | 'stop_sequence';
  /** Delay in ms before responding (simulates API latency) */
  delayMs?: number;
}

/**
 * Error to simulate
 */
export interface SimulatedError {
  type: LLMErrorType;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
}

/**
 * FakeLLMAdapter - Mock LLM for tests
 *
 * Features:
 * - Set canned responses for predictable test output
 * - Simulate specific errors (rate limit, network, etc.)
 * - Track call history for assertions
 * - Configure availability state
 */
export class FakeLLMAdapter implements ILLMPort {
  private apiKey: string | null = null;
  private lastError: LLMError | undefined;
  private available = false;
  private cannedResponses: CannedResponse[] = [];
  private currentResponseIndex = 0;
  private simulatedError: SimulatedError | null = null;
  private callHistory: Array<{
    messages: LLMMessage[];
    options?: LLMCompletionOptions;
    timestamp: number;
  }> = [];

  // ============================================================================
  // Test Helpers
  // ============================================================================

  /**
   * Reset the adapter state.
   * Call in test teardown.
   */
  reset(): void {
    this.apiKey = null;
    this.lastError = undefined;
    this.available = false;
    this.cannedResponses = [];
    this.currentResponseIndex = 0;
    this.simulatedError = null;
    this.callHistory = [];
  }

  /**
   * Set the API key directly (without validation).
   * Use for test setup.
   */
  setApiKeyDirect(key: string | null): void {
    this.apiKey = key;
    this.available = key !== null;
  }

  /**
   * Get the current API key.
   * Use for test assertions.
   */
  getApiKey(): string | null {
    return this.apiKey;
  }

  /**
   * Set whether the LLM is available.
   * Use to test graceful degradation.
   */
  setAvailable(available: boolean): void {
    this.available = available;
  }

  /**
   * Add a canned response to the queue.
   * Responses are returned in order, cycling back to start.
   */
  addResponse(response: CannedResponse): void {
    this.cannedResponses.push(response);
  }

  /**
   * Set a single response to always return.
   */
  setResponse(content: string, stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence' = 'end_turn'): void {
    this.cannedResponses = [{ content, stopReason }];
    this.currentResponseIndex = 0;
  }

  /**
   * Configure an error to throw on next complete() call.
   * Error is thrown once, then cleared (unless permanent is true).
   */
  setError(error: SimulatedError | null): void {
    this.simulatedError = error;
  }

  /**
   * Get the call history for assertions.
   */
  getCallHistory(): ReadonlyArray<{
    messages: LLMMessage[];
    options?: LLMCompletionOptions;
    timestamp: number;
  }> {
    return this.callHistory;
  }

  /**
   * Get the number of times complete() was called.
   */
  getCallCount(): number {
    return this.callHistory.length;
  }

  /**
   * Get the last call's messages.
   */
  getLastMessages(): LLMMessage[] | undefined {
    return this.callHistory[this.callHistory.length - 1]?.messages;
  }

  /**
   * Get the last call's options.
   */
  getLastOptions(): LLMCompletionOptions | undefined {
    return this.callHistory[this.callHistory.length - 1]?.options;
  }

  // ============================================================================
  // ILLMPort Implementation
  // ============================================================================

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async complete(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): Promise<LLMCompletionResponse> {
    // Record the call
    const historyEntry: {
      messages: LLMMessage[];
      options?: LLMCompletionOptions;
      timestamp: number;
    } = {
      messages: [...messages],
      timestamp: Date.now(),
    };
    if (options) {
      historyEntry.options = { ...options };
    }
    this.callHistory.push(historyEntry);

    // Clear previous error
    this.lastError = undefined;

    // Check for simulated error
    if (this.simulatedError) {
      const error = this.simulatedError;
      this.lastError = {
        type: error.type,
        message: error.message,
        retryable: error.retryable,
        ...(error.retryAfterMs !== undefined && { retryAfterMs: error.retryAfterMs }),
      };
      throw new Error(error.message);
    }

    // Check availability
    if (!this.available) {
      this.lastError = {
        type: 'api_key_missing',
        message: 'LLM not available (fake adapter)',
        retryable: false,
      };
      throw new Error(this.lastError.message);
    }

    // Get canned response
    if (this.cannedResponses.length === 0) {
      // Default response if none configured
      return {
        content: 'This is a fake LLM response.',
        usage: { inputTokens: 10, outputTokens: 10 },
        model: options?.model ?? DEFAULT_LLM_CONFIG.model,
        stopReason: 'end_turn',
      };
    }

    const response = this.cannedResponses[this.currentResponseIndex];
    if (!response) {
      throw new Error('No canned response available');
    }

    // Cycle through responses
    this.currentResponseIndex = (this.currentResponseIndex + 1) % this.cannedResponses.length;

    // Simulate delay if configured
    if (response.delayMs && response.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, response.delayMs));
    }

    // Generate content
    const content = typeof response.content === 'function'
      ? response.content(messages)
      : response.content;

    return {
      content,
      usage: response.usage ?? { inputTokens: 10, outputTokens: 20 },
      model: options?.model ?? DEFAULT_LLM_CONFIG.model,
      stopReason: response.stopReason ?? 'end_turn',
    };
  }

  async setApiKey(apiKey: string): Promise<void> {
    const trimmedKey = apiKey.trim();

    if (!trimmedKey) {
      this.lastError = {
        type: 'api_key_invalid',
        message: 'API key cannot be empty',
        retryable: false,
      };
      throw new Error(this.lastError.message);
    }

    this.apiKey = trimmedKey;
    this.available = true;
    this.lastError = undefined;
  }

  async clearApiKey(): Promise<void> {
    this.apiKey = null;
    this.available = false;
    this.lastError = undefined;
  }

  getLastError(): LLMError | undefined {
    return this.lastError;
  }
}

/**
 * Create a pre-configured FakeLLMAdapter for tests
 */
export function createFakeLLM(options?: {
  available?: boolean;
  apiKey?: string;
  responses?: CannedResponse[];
  error?: SimulatedError;
}): FakeLLMAdapter {
  const adapter = new FakeLLMAdapter();

  if (options?.available !== undefined) {
    adapter.setAvailable(options.available);
  }

  if (options?.apiKey) {
    adapter.setApiKeyDirect(options.apiKey);
  }

  if (options?.responses) {
    for (const response of options.responses) {
      adapter.addResponse(response);
    }
  }

  if (options?.error) {
    adapter.setError(options.error);
  }

  return adapter;
}

/**
 * Common mock responses for testing
 */
export const MOCK_RESPONSES = {
  /**
   * Simple acknowledgment response
   */
  simple: {
    content: 'Understood.',
    usage: { inputTokens: 10, outputTokens: 5 },
  } as CannedResponse,

  /**
   * Substitution recommendation response
   */
  substitution: {
    content: JSON.stringify({
      recommendation: 'accept',
      reason: 'Similar product at lower price',
      confidence: 0.85,
    }),
    usage: { inputTokens: 150, outputTokens: 80 },
  } as CannedResponse,

  /**
   * Stock pruning response
   */
  stockPruning: {
    content: JSON.stringify({
      include: true,
      reason: 'Last purchased 2 weeks ago, typical consumption is weekly',
      confidence: 0.9,
    }),
    usage: { inputTokens: 200, outputTokens: 100 },
  } as CannedResponse,

  /**
   * Max tokens reached response
   */
  truncated: {
    content: 'This response was cut off because it exceeded the maximum',
    usage: { inputTokens: 100, outputTokens: 500 },
    stopReason: 'max_tokens',
  } as CannedResponse,
} as const;

/**
 * Common mock errors for testing
 */
export const MOCK_ERRORS = {
  rateLimited: {
    type: 'rate_limited',
    message: 'Rate limit exceeded',
    retryable: true,
    retryAfterMs: 60000,
  } as SimulatedError,

  networkError: {
    type: 'network_error',
    message: 'Network request failed',
    retryable: true,
  } as SimulatedError,

  serverError: {
    type: 'server_error',
    message: 'Internal server error',
    retryable: true,
    retryAfterMs: 5000,
  } as SimulatedError,

  invalidKey: {
    type: 'api_key_invalid',
    message: 'Invalid API key',
    retryable: false,
  } as SimulatedError,

  contextTooLong: {
    type: 'context_too_long',
    message: 'Request exceeds context window',
    retryable: false,
  } as SimulatedError,
} as const;
