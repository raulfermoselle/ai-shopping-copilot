/**
 * LLM Types
 *
 * Type definitions for the Anthropic Claude SDK integration.
 * Designed for AGENTIC patterns (tool-use, structured outputs),
 * NOT chatbot patterns.
 */

import type { z } from 'zod';

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Supported Claude models.
 * Use claude-sonnet-4-20250514 for complex reasoning tasks.
 * Use claude-3-haiku-20240307 for simpler, faster, cheaper tasks (recommended for StockPruner).
 */
export type ClaudeModel = 'claude-sonnet-4-20250514' | 'claude-3-haiku-20240307';

/**
 * Retry configuration for transient failures.
 */
export interface LLMRetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
  /** Base delay in milliseconds for exponential backoff (default: 1000) */
  baseDelayMs: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelayMs: number;
  /** Whether to use jitter to prevent thundering herd (default: true) */
  useJitter: boolean;
}

/**
 * LLM client configuration.
 */
export interface LLMClientConfig {
  /** Claude model to use */
  model: ClaudeModel;
  /** Maximum tokens in response */
  maxTokens: number;
  /** Temperature for response generation (0-1) */
  temperature: number;
  /** Requests per minute rate limit */
  rateLimitRpm: number;
  /** Retry configuration for transient failures */
  retryConfig: LLMRetryConfig;
  /** Optional timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * LLM configuration from environment/config files.
 */
export interface LLMConfig {
  /** Whether LLM features are enabled */
  enabled: boolean;
  /** Anthropic API key (from environment) */
  apiKey?: string;
  /** Model to use */
  model: ClaudeModel;
  /** Maximum tokens per request */
  maxTokens: number;
  /** Temperature for generation */
  temperature: number;
  /** Whether to fallback to heuristics if LLM unavailable */
  fallbackToHeuristics: boolean;
  /** Requests per minute limit */
  rateLimitRpm: number;
}

// =============================================================================
// Message Types
// =============================================================================

/**
 * Role in the conversation.
 */
export type MessageRole = 'user' | 'assistant';

/**
 * Text content block.
 */
export interface TextContent {
  type: 'text';
  text: string;
}

/**
 * Tool use request from assistant.
 */
export interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Tool result from user (after tool execution).
 */
export interface ToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

/**
 * Content block in a message.
 */
export type ContentBlock = TextContent | ToolUseContent | ToolResultContent;

/**
 * Message in a conversation.
 */
export interface Message {
  role: MessageRole;
  content: string | ContentBlock[];
}

// =============================================================================
// Tool Types
// =============================================================================

/**
 * JSON Schema for tool input parameters.
 * Must be an object schema with properties.
 */
export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
}

/**
 * JSON Schema property definition.
 */
export interface JSONSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  default?: unknown;
}

/**
 * Tool definition for Claude.
 */
export interface ToolDefinition {
  /** Unique tool name */
  name: string;
  /** Description of what the tool does */
  description: string;
  /** JSON Schema for input parameters */
  input_schema: ToolInputSchema;
}

/**
 * Result from a tool execution.
 */
export interface ToolExecutionResult {
  /** Tool use ID from the request */
  toolUseId: string;
  /** Result content (will be serialized to string) */
  result: unknown;
  /** Whether the execution errored */
  isError?: boolean;
}

// =============================================================================
// Response Types
// =============================================================================

/**
 * Stop reason for a response.
 */
export type StopReason = 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';

/**
 * Token usage for a request.
 */
export interface TokenUsage {
  /** Tokens in the input (prompt) */
  inputTokens: number;
  /** Tokens in the output (response) */
  outputTokens: number;
  /** Total tokens used */
  totalTokens: number;
}

/**
 * Result from an LLM invocation with tools.
 */
export interface ToolUseResult<T = unknown> {
  /** Whether the invocation completed successfully */
  success: boolean;
  /** The final structured output (if outputSchema provided) */
  structuredOutput?: T;
  /** Text content from the response */
  textContent?: string;
  /** Tool calls made during the interaction */
  toolCalls: ToolUseContent[];
  /** Stop reason */
  stopReason: StopReason;
  /** Token usage */
  usage: TokenUsage;
  /** All messages in the conversation (for context/debugging) */
  messages: Message[];
}

/**
 * Result from structured output invocation.
 */
export interface StructuredResult<T> {
  /** The parsed structured output */
  data: T;
  /** Raw text before parsing */
  rawText: string;
  /** Token usage */
  usage: TokenUsage;
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * LLM-specific error codes.
 */
export type LLMErrorCode =
  | 'API_KEY_MISSING'
  | 'API_KEY_INVALID'
  | 'RATE_LIMITED'
  | 'OVERLOADED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'INVALID_REQUEST'
  | 'CONTENT_FILTERED'
  | 'MODEL_ERROR'
  | 'PARSING_ERROR'
  | 'UNKNOWN_ERROR';

/**
 * LLM error with typed code.
 */
export interface LLMError extends Error {
  code: LLMErrorCode;
  /** Whether this error is recoverable via retry */
  recoverable: boolean;
  /** HTTP status code if from API */
  statusCode?: number;
  /** Retry-after header value if rate limited */
  retryAfterMs?: number;
  /** Original error if wrapped */
  cause?: Error;
}

// =============================================================================
// Client Interface
// =============================================================================

/**
 * LLM Client interface for agentic interactions.
 */
export interface LLMClient {
  /**
   * Invoke the LLM with tools available.
   * Supports the ReAct pattern: Thought -> Tool Call -> Observation -> Repeat.
   *
   * @param messages - Conversation messages
   * @param tools - Available tool definitions
   * @param outputSchema - Optional Zod schema for structured output
   * @returns Tool use result with structured output if schema provided
   */
  invokeWithTools<T = unknown>(
    messages: Message[],
    tools: ToolDefinition[],
    outputSchema?: z.ZodType<T>,
  ): Promise<ToolUseResult<T>>;

  /**
   * Invoke the LLM for structured output only (no tools).
   * Used for decision-making that requires a specific response format.
   *
   * @param messages - Conversation messages
   * @param schema - Zod schema for the expected output
   * @returns Parsed structured output
   */
  invokeStructured<T>(
    messages: Message[],
    schema: z.ZodType<T>,
  ): Promise<StructuredResult<T>>;

  /**
   * Check if the client is ready to make requests.
   * Returns false if API key is missing or rate limited.
   */
  isReady(): boolean;

  /**
   * Get current token usage statistics.
   */
  getUsageStats(): {
    totalInputTokens: number;
    totalOutputTokens: number;
    requestCount: number;
  };
}

// =============================================================================
// Handler Types (for tool execution)
// =============================================================================

/**
 * Tool handler function type.
 * Receives tool input and returns a result.
 */
export type ToolHandler<TInput = Record<string, unknown>, TOutput = unknown> = (
  input: TInput,
) => Promise<TOutput>;

/**
 * Registry of tool handlers.
 */
export type ToolHandlerRegistry = Record<string, ToolHandler>;
