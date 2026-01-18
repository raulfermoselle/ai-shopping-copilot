/**
 * Chrome LLM Adapter
 *
 * Implements ILLMPort using direct fetch calls to the Anthropic API.
 * Designed for Chrome Extension service worker context.
 *
 * Features:
 * - API key stored in session storage (ephemeral)
 * - Direct fetch to Anthropic Messages API
 * - Error classification with retry hints
 *
 * Security:
 * - API key never logged or exposed
 * - Cleared on browser close (session storage)
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
import type { IStoragePort } from '../../ports/storage.js';
import { logger } from '../../utils/logger.js';

/**
 * Anthropic API endpoint
 */
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Anthropic API version header
 */
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Anthropic API response type
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
 * Anthropic API error response type
 */
interface AnthropicErrorResponse {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
}

/**
 * Chrome LLM Adapter
 *
 * Wraps Anthropic API for use in Chrome Extension context.
 * API key is stored in session storage for security.
 */
export class ChromeLLMAdapter implements ILLMPort {
  private storage: IStoragePort;
  private lastError: LLMError | undefined;

  constructor(storage: IStoragePort) {
    this.storage = storage;
  }

  /**
   * Check if LLM is available (API key configured)
   */
  async isAvailable(): Promise<boolean> {
    const result = await this.storage.get<{ anthropicApiKey: string }>(
      ['anthropicApiKey'],
      'session'
    );
    return Boolean(result.anthropicApiKey);
  }

  /**
   * Send a completion request to Claude
   */
  async complete(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): Promise<LLMCompletionResponse> {
    // Get API key
    const result = await this.storage.get<{ anthropicApiKey: string }>(
      ['anthropicApiKey'],
      'session'
    );
    const apiKey = result.anthropicApiKey;

    if (!apiKey) {
      this.lastError = {
        type: 'api_key_missing',
        message: 'API key not configured',
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
    const body: Record<string, unknown> = {
      model: config.model,
      max_tokens: config.maxTokens,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };

    // Add optional fields
    if (config.systemPrompt) {
      body.system = config.systemPrompt;
    }
    if (config.temperature !== undefined) {
      body.temperature = config.temperature;
    }
    if (config.stopSequences.length > 0) {
      body.stop_sequences = config.stopSequences;
    }

    logger.info('LLM', 'Sending completion request', {
      model: config.model,
      messageCount: messages.length,
    });

    try {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
      });

      // Handle error responses
      if (!response.ok) {
        const errorData = (await response.json()) as AnthropicErrorResponse;
        this.lastError = this.classifyError(response.status, errorData);
        logger.error('LLM', 'API error', {
          status: response.status,
          error: this.lastError,
        });
        throw new Error(this.lastError.message);
      }

      // Parse successful response
      const data = (await response.json()) as AnthropicResponse;

      // Extract text content
      const textContent = data.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('');

      const result: LLMCompletionResponse = {
        content: textContent,
        usage: {
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens,
        },
        model: data.model,
        stopReason: data.stop_reason,
      };

      logger.info('LLM', 'Completion success', {
        model: data.model,
        tokens: data.usage.input_tokens + data.usage.output_tokens,
      });

      // Clear last error on success
      this.lastError = undefined;

      return result;
    } catch (error) {
      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        this.lastError = {
          type: 'network_error',
          message: 'Failed to connect to Anthropic API',
          retryable: true,
          retryAfterMs: 5000,
        };
        throw new Error(this.lastError.message);
      }

      // Re-throw if already handled
      throw error;
    }
  }

  /**
   * Set the API key
   */
  async setApiKey(apiKey: string): Promise<void> {
    // Validate format
    if (!apiKey.startsWith('sk-ant-')) {
      this.lastError = {
        type: 'api_key_invalid',
        message: 'Invalid API key format. Anthropic keys start with "sk-ant-"',
        retryable: false,
      };
      throw new Error(this.lastError.message);
    }

    await this.storage.set({ anthropicApiKey: apiKey }, 'session');
    logger.info('LLM', 'API key stored');
  }

  /**
   * Clear the API key
   */
  async clearApiKey(): Promise<void> {
    await this.storage.remove('anthropicApiKey', 'session');
    logger.info('LLM', 'API key cleared');
  }

  /**
   * Get the last error
   */
  getLastError(): LLMError | undefined {
    return this.lastError;
  }

  /**
   * Classify API error into LLMError
   */
  private classifyError(
    status: number,
    errorData: AnthropicErrorResponse
  ): LLMError {
    const errorType = errorData.error?.type ?? 'unknown';
    const message = errorData.error?.message ?? 'Unknown API error';

    let type: LLMErrorType;
    let retryable = false;
    let retryAfterMs: number | undefined;

    switch (status) {
      case 401:
        type = 'api_key_invalid';
        break;
      case 429:
        type = 'rate_limited';
        retryable = true;
        retryAfterMs = 60000; // Default to 1 minute
        break;
      case 500:
      case 502:
      case 503:
        type = 'server_error';
        retryable = true;
        retryAfterMs = 5000;
        break;
      case 400:
        if (errorType === 'invalid_request_error' && message.includes('context')) {
          type = 'context_too_long';
        } else {
          type = 'unknown';
        }
        break;
      default:
        type = 'unknown';
    }

    const error: LLMError = {
      type,
      message,
      retryable,
    };
    if (retryAfterMs !== undefined) {
      error.retryAfterMs = retryAfterMs;
    }

    return error;
  }
}

/**
 * Singleton instance
 */
let defaultAdapter: ChromeLLMAdapter | null = null;

/**
 * Get the default ChromeLLMAdapter instance
 */
export function getLLMAdapter(storage: IStoragePort): ChromeLLMAdapter {
  if (!defaultAdapter) {
    defaultAdapter = new ChromeLLMAdapter(storage);
  }
  return defaultAdapter;
}

/**
 * Reset the default adapter (for testing)
 */
export function resetLLMAdapter(): void {
  defaultAdapter = null;
}

export default ChromeLLMAdapter;
