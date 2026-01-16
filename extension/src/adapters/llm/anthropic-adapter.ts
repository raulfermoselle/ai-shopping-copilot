/**
 * Anthropic LLM Adapter
 *
 * Implements ILLMPort using the Anthropic Messages API via fetch.
 * Designed for Chrome Extension service worker context (no Node.js SDK).
 *
 * Features:
 * - API key storage in chrome.storage.session (ephemeral, secure)
 * - Proper error classification for retry/escalation decisions
 * - Graceful degradation when API key is missing
 * - Last error tracking for debugging
 */

import type {
  ILLMPort,
  LLMMessage,
  LLMCompletionOptions,
  LLMCompletionResponse,
  LLMError,
  LLMErrorType,
} from '../../ports/llm.js';
import type { IStoragePort } from '../../ports/storage.js';
import { DEFAULT_LLM_CONFIG } from '../../ports/llm.js';

/**
 * Anthropic API constants
 */
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const STORAGE_KEY = 'anthropicApiKey';

/**
 * Anthropic API request format
 */
interface AnthropicRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  stop_sequences?: string[];
}

/**
 * Anthropic API response format
 */
interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{
    type: 'text';
    text: string;
  }>;
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence';
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Anthropic API error response format
 */
interface AnthropicErrorResponse {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
}

/**
 * AnthropicAdapter - Chrome Extension implementation of ILLMPort
 *
 * Uses fetch() to call the Anthropic Messages API directly.
 * Stores API key in session storage for security.
 */
export class AnthropicAdapter implements ILLMPort {
  private apiKey: string | null = null;
  private lastError: LLMError | undefined;
  private readonly storage: IStoragePort;

  /**
   * Create a new AnthropicAdapter
   * @param storage - Storage port for API key persistence
   */
  constructor(storage: IStoragePort) {
    this.storage = storage;
  }

  /**
   * Check if LLM is available (API key is configured)
   * Attempts to load from storage if not in memory
   */
  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) {
      await this.loadApiKeyFromStorage();
    }
    return this.apiKey !== null && this.apiKey.length > 0;
  }

  /**
   * Send a completion request to the Anthropic Messages API
   * @param messages - Conversation messages
   * @param options - Completion options
   * @returns Completion response
   * @throws Error with LLMError details on failure
   */
  async complete(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): Promise<LLMCompletionResponse> {
    // Clear previous error
    this.lastError = undefined;

    // Ensure API key is loaded
    if (!this.apiKey) {
      await this.loadApiKeyFromStorage();
    }

    // Check API key availability
    if (!this.apiKey) {
      this.lastError = {
        type: 'api_key_missing',
        message: 'Anthropic API key not configured. Please set your API key in extension settings.',
        retryable: false,
      };
      throw new Error(this.lastError.message);
    }

    // Merge options with defaults
    const config = {
      model: options?.model ?? DEFAULT_LLM_CONFIG.model,
      maxTokens: options?.maxTokens ?? DEFAULT_LLM_CONFIG.maxTokens,
      systemPrompt: options?.systemPrompt ?? DEFAULT_LLM_CONFIG.systemPrompt,
      temperature: options?.temperature ?? DEFAULT_LLM_CONFIG.temperature,
      stopSequences: options?.stopSequences ?? DEFAULT_LLM_CONFIG.stopSequences,
    };

    // Build request body
    const requestBody: AnthropicRequest = {
      model: config.model,
      max_tokens: config.maxTokens,
      messages: messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
    };

    // Add optional fields
    if (config.systemPrompt) {
      requestBody.system = config.systemPrompt;
    }
    if (config.temperature !== undefined) {
      requestBody.temperature = config.temperature;
    }
    if (config.stopSequences && config.stopSequences.length > 0) {
      requestBody.stop_sequences = config.stopSequences;
    }

    try {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(requestBody),
      });

      // Handle non-OK responses
      if (!response.ok) {
        await this.handleErrorResponse(response);
        // handleErrorResponse always throws, but TypeScript doesn't know that
        throw new Error('Unexpected error handling path');
      }

      // Parse successful response
      const data = (await response.json()) as AnthropicResponse;

      // Extract text content
      const textContent = data.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('');

      // Map stop reason
      const stopReason = this.mapStopReason(data.stop_reason);

      return {
        content: textContent,
        usage: {
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens,
        },
        model: data.model,
        stopReason,
      };
    } catch (error) {
      // If we already set lastError, rethrow
      if (this.lastError) {
        throw error;
      }

      // Handle network errors
      this.lastError = this.classifyNetworkError(error);
      throw new Error(this.lastError.message);
    }
  }

  /**
   * Configure the API key
   * @param apiKey - Anthropic API key (should start with 'sk-ant-')
   */
  async setApiKey(apiKey: string): Promise<void> {
    // Basic validation
    const trimmedKey = apiKey.trim();

    if (!trimmedKey) {
      this.lastError = {
        type: 'api_key_invalid',
        message: 'API key cannot be empty',
        retryable: false,
      };
      throw new Error(this.lastError.message);
    }

    // Anthropic keys typically start with 'sk-ant-' but we allow flexibility
    // since key format may change
    if (trimmedKey.length < 20) {
      this.lastError = {
        type: 'api_key_invalid',
        message: 'API key appears to be too short',
        retryable: false,
      };
      throw new Error(this.lastError.message);
    }

    // Store in memory and persist to session storage
    this.apiKey = trimmedKey;
    await this.storage.set({ [STORAGE_KEY]: trimmedKey }, 'session');

    // Clear any previous error
    this.lastError = undefined;
  }

  /**
   * Clear the API key from memory and storage
   */
  async clearApiKey(): Promise<void> {
    this.apiKey = null;
    await this.storage.remove(STORAGE_KEY, 'session');
    this.lastError = undefined;
  }

  /**
   * Get the last error that occurred
   */
  getLastError(): LLMError | undefined {
    return this.lastError;
  }

  /**
   * Load API key from session storage
   */
  private async loadApiKeyFromStorage(): Promise<void> {
    try {
      const stored = await this.storage.get<{ anthropicApiKey: string }>(
        [STORAGE_KEY],
        'session'
      );
      this.apiKey = stored.anthropicApiKey || null;
    } catch {
      // Storage error - key not available
      this.apiKey = null;
    }
  }

  /**
   * Handle non-OK HTTP responses from Anthropic API
   * Always throws an error after setting lastError
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let errorMessage = `API request failed with status ${response.status}`;
    let errorType: LLMErrorType = 'unknown';
    let retryable = false;
    let retryAfterMs: number | undefined;

    // Try to parse error response
    try {
      const errorData = (await response.json()) as AnthropicErrorResponse;
      if (errorData.error?.message) {
        errorMessage = errorData.error.message;
      }

      // Check for context length error
      if (
        errorData.error?.type === 'invalid_request_error' &&
        errorMessage.toLowerCase().includes('context')
      ) {
        errorType = 'context_too_long';
        retryable = false;
      }
    } catch {
      // Could not parse error response, use status code
    }

    // Classify by status code
    switch (response.status) {
      case 401:
        errorType = 'api_key_invalid';
        errorMessage = 'Invalid API key. Please check your Anthropic API key in settings.';
        retryable = false;
        // Clear invalid key from storage
        this.apiKey = null;
        await this.storage.remove(STORAGE_KEY, 'session').catch(() => {
          // Ignore storage error during error handling
        });
        break;

      case 429:
        errorType = 'rate_limited';
        retryable = true;
        // Parse Retry-After header if present
        const retryAfter = response.headers.get('Retry-After');
        if (retryAfter) {
          const seconds = parseInt(retryAfter, 10);
          if (!isNaN(seconds)) {
            retryAfterMs = seconds * 1000;
          }
        } else {
          // Default retry delay for rate limiting
          retryAfterMs = 60000; // 1 minute
        }
        errorMessage = `Rate limited. Please wait ${Math.ceil((retryAfterMs ?? 60000) / 1000)} seconds.`;
        break;

      case 500:
      case 502:
      case 503:
      case 504:
        errorType = 'server_error';
        errorMessage = 'Anthropic API server error. Please try again later.';
        retryable = true;
        retryAfterMs = 5000; // 5 seconds for server errors
        break;

      case 400:
        // Check if it's a context length error
        if (errorType !== 'context_too_long') {
          errorType = 'unknown';
          errorMessage = `Bad request: ${errorMessage}`;
        }
        retryable = false;
        break;

      default:
        // Keep whatever we parsed or default
        if (errorType === 'unknown') {
          retryable = response.status >= 500;
        }
    }

    this.lastError = {
      type: errorType,
      message: errorMessage,
      retryable,
      ...(retryAfterMs !== undefined && { retryAfterMs }),
    };

    throw new Error(errorMessage);
  }

  /**
   * Classify network/fetch errors
   */
  private classifyNetworkError(error: unknown): LLMError {
    const message = error instanceof Error ? error.message : 'Unknown network error';

    // Check for common network error patterns
    if (
      message.includes('Failed to fetch') ||
      message.includes('NetworkError') ||
      message.includes('net::') ||
      message.includes('ENOTFOUND') ||
      message.includes('ECONNREFUSED')
    ) {
      return {
        type: 'network_error',
        message: 'Network error. Please check your internet connection.',
        retryable: true,
        retryAfterMs: 3000, // 3 seconds
      };
    }

    // Timeout errors
    if (message.includes('timeout') || message.includes('Timeout')) {
      return {
        type: 'network_error',
        message: 'Request timed out. Please try again.',
        retryable: true,
        retryAfterMs: 1000,
      };
    }

    // Default to unknown error
    return {
      type: 'unknown',
      message: `LLM request failed: ${message}`,
      retryable: false,
    };
  }

  /**
   * Map Anthropic stop reason to our interface format
   */
  private mapStopReason(
    reason: string
  ): 'end_turn' | 'max_tokens' | 'stop_sequence' {
    switch (reason) {
      case 'end_turn':
        return 'end_turn';
      case 'max_tokens':
        return 'max_tokens';
      case 'stop_sequence':
        return 'stop_sequence';
      default:
        // Default to end_turn for unknown reasons
        return 'end_turn';
    }
  }
}
