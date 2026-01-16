/**
 * LLM Port
 *
 * Abstracts LLM API calls for AI-enhanced decision making.
 * The extension uses Claude for substitution suggestions and decision explanations.
 */

/**
 * LLM message role
 */
export type LLMRole = 'user' | 'assistant';

/**
 * LLM message format
 */
export interface LLMMessage {
  role: LLMRole;
  content: string;
}

/**
 * LLM completion request options
 */
export interface LLMCompletionOptions {
  /** Model to use (default: claude-sonnet-4-20250514) */
  model?: string;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** System prompt for context */
  systemPrompt?: string;
  /** Temperature for randomness (0-1) */
  temperature?: number;
  /** Stop sequences */
  stopSequences?: string[];
}

/**
 * LLM completion response
 */
export interface LLMCompletionResponse {
  /** Generated text content */
  content: string;
  /** Token usage statistics */
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  /** Model used */
  model: string;
  /** Stop reason */
  stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence';
}

/**
 * LLM error types
 */
export type LLMErrorType =
  | 'api_key_missing'
  | 'api_key_invalid'
  | 'rate_limited'
  | 'network_error'
  | 'server_error'
  | 'context_too_long'
  | 'unknown';

/**
 * LLM error with type information
 */
export interface LLMError {
  type: LLMErrorType;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
}

/**
 * ILLMPort - Interface for LLM operations
 *
 * Implementations:
 * - AnthropicAdapter: Real Anthropic API via fetch
 * - FakeLLMAdapter: Mock responses for tests
 *
 * IMPORTANT: Graceful degradation is required.
 * If LLM is unavailable, fall back to heuristics-only mode.
 */
export interface ILLMPort {
  /**
   * Check if LLM is available (API key configured)
   * @returns true if LLM can be used
   */
  isAvailable(): Promise<boolean>;

  /**
   * Send a completion request to the LLM
   * @param messages - Conversation messages
   * @param options - Completion options
   * @returns Completion response
   * @throws LLMError on failure
   */
  complete(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): Promise<LLMCompletionResponse>;

  /**
   * Configure the API key
   * @param apiKey - Anthropic API key
   * @throws LLMError if key format is invalid
   */
  setApiKey(apiKey: string): Promise<void>;

  /**
   * Clear the API key
   */
  clearApiKey(): Promise<void>;

  /**
   * Get the last error that occurred
   * @returns Last error or undefined
   */
  getLastError(): LLMError | undefined;
}

/**
 * Default LLM configuration
 */
export const DEFAULT_LLM_CONFIG: Required<LLMCompletionOptions> = {
  model: 'claude-sonnet-4-20250514',
  maxTokens: 1024,
  systemPrompt: '',
  temperature: 0.3,
  stopSequences: [],
};

/**
 * LLM prompts used by the extension
 */
export const LLM_PROMPTS = {
  /**
   * System prompt for substitution suggestions
   */
  SUBSTITUTION_SYSTEM: `You are an AI assistant helping with grocery shopping on Auchan.pt.
Your task is to evaluate product substitutes and explain your recommendations.
Be concise and focus on practical factors: price, brand, nutritional similarity.
Never recommend products that don't match the category of the original.`,

  /**
   * System prompt for stock pruning decisions
   */
  STOCK_PRUNER_SYSTEM: `You are an AI assistant helping manage household grocery inventory.
Your task is to evaluate whether items should be included in an order based on:
- Purchase history and typical consumption rate
- Time since last purchase
- Item category (perishable vs shelf-stable)
Be concise and explain your reasoning clearly.`,
} as const;
