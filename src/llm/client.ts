/**
 * LLM Client
 *
 * Anthropic Claude SDK wrapper with agentic patterns (tool-use, structured outputs).
 * Designed for agent decision-making, NOT chatbot interactions.
 *
 * Key features:
 * - Tool-use pattern with ReAct loop support
 * - Structured output parsing with Zod schemas
 * - Rate limiting and retry with exponential backoff
 * - Typed errors for graceful degradation
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  ContentBlock as AnthropicContentBlock,
  Message as AnthropicMessage,
  MessageParam,
  Tool,
} from '@anthropic-ai/sdk/resources/messages';
import { z } from 'zod';

import type {
  ContentBlock,
  LLMClient,
  LLMClientConfig,
  LLMError,
  LLMErrorCode,
  Message,
  StopReason,
  StructuredResult,
  TokenUsage,
  ToolDefinition,
  ToolUseContent,
  ToolUseResult,
} from './types.js';
import { TokenManager, withRetry } from './token-manager.js';

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Custom error class for LLM-specific errors.
 */
export class LLMClientError extends Error implements LLMError {
  readonly code: LLMErrorCode;
  readonly recoverable: boolean;
  readonly statusCode?: number;
  readonly retryAfterMs?: number;
  override readonly cause?: Error;

  constructor(
    message: string,
    code: LLMErrorCode,
    options?: {
      recoverable?: boolean;
      statusCode?: number;
      retryAfterMs?: number;
      cause?: Error;
    },
  ) {
    super(message);
    this.name = 'LLMClientError';
    this.code = code;
    this.recoverable = options?.recoverable ?? false;
    // Only set optional properties if they have a value
    if (options?.statusCode !== undefined) {
      this.statusCode = options.statusCode;
    }
    if (options?.retryAfterMs !== undefined) {
      this.retryAfterMs = options.retryAfterMs;
    }
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }

    // Maintains proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LLMClientError);
    }
  }
}

// =============================================================================
// Error Classification
// =============================================================================

/**
 * Classified error result.
 */
interface ClassifiedError {
  code: LLMErrorCode;
  recoverable: boolean;
  statusCode?: number;
  retryAfterMs?: number;
}

/**
 * Classify an error from the Anthropic SDK.
 */
function classifyError(error: unknown): ClassifiedError {
  // Handle Anthropic API errors
  if (error instanceof Anthropic.APIError) {
    const status = error.status;

    // Rate limited
    if (status === 429) {
      // Try to parse retry-after from headers
      const retryAfter = parseRetryAfter(error);
      const result: ClassifiedError = {
        code: 'RATE_LIMITED',
        recoverable: true,
        statusCode: status,
      };
      if (retryAfter !== undefined) {
        result.retryAfterMs = retryAfter;
      }
      return result;
    }

    // Overloaded
    if (status === 529) {
      return {
        code: 'OVERLOADED',
        recoverable: true,
        statusCode: status,
      };
    }

    // Authentication errors
    if (status === 401) {
      return {
        code: 'API_KEY_INVALID',
        recoverable: false,
        statusCode: status,
      };
    }

    // Bad request (invalid input)
    if (status === 400) {
      return {
        code: 'INVALID_REQUEST',
        recoverable: false,
        statusCode: status,
      };
    }

    // Server errors
    if (status >= 500) {
      return {
        code: 'MODEL_ERROR',
        recoverable: true,
        statusCode: status,
      };
    }

    // Other client errors
    return {
      code: 'INVALID_REQUEST',
      recoverable: false,
      statusCode: status,
    };
  }

  // Network/connection errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('enotfound')
    ) {
      return {
        code: 'NETWORK_ERROR',
        recoverable: true,
      };
    }

    if (message.includes('timeout')) {
      return {
        code: 'TIMEOUT',
        recoverable: true,
      };
    }
  }

  return {
    code: 'UNKNOWN_ERROR',
    recoverable: false,
  };
}

/**
 * Parse retry-after header from API error.
 */
function parseRetryAfter(error: InstanceType<typeof Anthropic.APIError>): number | undefined {
  // The SDK may expose headers through the error
  // Default to 60 seconds if not found
  try {
    const headers = (error as unknown as { headers?: Record<string, string> }).headers;
    if (headers?.['retry-after']) {
      const value = parseInt(headers['retry-after'], 10);
      if (!isNaN(value)) {
        return value * 1000; // Convert to milliseconds
      }
    }
  } catch {
    // Ignore parsing errors
  }
  return undefined;
}

// =============================================================================
// Response Processing
// =============================================================================

/**
 * Convert Anthropic message to our Message type.
 */
function convertMessage(msg: AnthropicMessage): Message {
  const content: ContentBlock[] = [];

  for (const block of msg.content) {
    if (block.type === 'text') {
      content.push({
        type: 'text',
        text: block.text,
      });
    } else if (block.type === 'tool_use') {
      content.push({
        type: 'tool_use',
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      });
    }
  }

  return {
    role: 'assistant',
    content,
  };
}

/**
 * Convert stop reason.
 */
function convertStopReason(reason: AnthropicMessage['stop_reason']): StopReason {
  switch (reason) {
    case 'end_turn':
      return 'end_turn';
    case 'max_tokens':
      return 'max_tokens';
    case 'stop_sequence':
      return 'stop_sequence';
    case 'tool_use':
      return 'tool_use';
    default:
      return 'end_turn';
  }
}

/**
 * Extract text content from a response.
 */
function extractTextContent(content: AnthropicContentBlock[]): string | undefined {
  const textContents: string[] = [];
  for (const block of content) {
    if (block.type === 'text') {
      textContents.push(block.text);
    }
  }
  if (textContents.length === 0) {
    return undefined;
  }
  return textContents.join('\n');
}

/**
 * Extract tool use blocks from a response.
 */
function extractToolUses(content: AnthropicContentBlock[]): ToolUseContent[] {
  return content
    .filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    )
    .map((block) => ({
      type: 'tool_use' as const,
      id: block.id,
      name: block.name,
      input: block.input as Record<string, unknown>,
    }));
}

/**
 * Convert token usage.
 */
function convertUsage(usage: AnthropicMessage['usage']): TokenUsage {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens: usage.input_tokens + usage.output_tokens,
  };
}

// =============================================================================
// LLM Client Implementation
// =============================================================================

/**
 * Default client configuration.
 */
const DEFAULT_CONFIG: LLMClientConfig = {
  model: 'claude-3-haiku-20240307', // Cheaper, faster - sufficient for StockPruner decisions
  maxTokens: 1024,
  temperature: 0.3,
  rateLimitRpm: 50,
  retryConfig: {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    useJitter: true,
  },
};

/**
 * Create an LLM client instance.
 *
 * @param apiKey - Anthropic API key
 * @param config - Optional client configuration
 * @returns LLM client instance
 * @throws LLMClientError if API key is missing
 */
export function createLLMClient(
  apiKey: string | undefined,
  config: Partial<LLMClientConfig> = {},
): LLMClient {
  // Validate API key
  if (!apiKey || apiKey.trim() === '') {
    throw new LLMClientError('Anthropic API key is required', 'API_KEY_MISSING', {
      recoverable: false,
    });
  }

  const fullConfig: LLMClientConfig = {
    ...DEFAULT_CONFIG,
    ...config,
    retryConfig: {
      ...DEFAULT_CONFIG.retryConfig,
      ...config.retryConfig,
    },
  };

  // Create Anthropic client
  const anthropic = new Anthropic({
    apiKey,
    timeout: fullConfig.timeoutMs,
  });

  // Create token manager
  const tokenManager = new TokenManager(
    fullConfig.rateLimitRpm,
    fullConfig.retryConfig,
  );

  /**
   * Make an API request with rate limiting and retries.
   */
  async function makeRequest(
    messages: MessageParam[],
    tools?: Tool[],
    systemPrompt?: string,
  ): Promise<AnthropicMessage> {
    // Wait for rate limit slot
    await tokenManager.waitForSlot();

    const requestFn = async (): Promise<AnthropicMessage> => {
      // Build request params with explicit non-streaming mode
      const baseParams = {
        model: fullConfig.model,
        max_tokens: fullConfig.maxTokens,
        temperature: fullConfig.temperature,
        messages,
      };

      // Build final params, conditionally adding optional fields
      if (systemPrompt && tools) {
        return anthropic.messages.create({
          ...baseParams,
          system: systemPrompt,
          tools,
        });
      } else if (systemPrompt) {
        return anthropic.messages.create({
          ...baseParams,
          system: systemPrompt,
        });
      } else if (tools) {
        return anthropic.messages.create({
          ...baseParams,
          tools,
        });
      } else {
        return anthropic.messages.create(baseParams);
      }
    };

    const shouldRetry = (error: unknown): boolean => {
      const classified = classifyError(error);

      // Record rate limit or overload for backoff
      if (classified.code === 'RATE_LIMITED') {
        tokenManager.recordRateLimit(classified.retryAfterMs);
      } else if (classified.code === 'OVERLOADED') {
        tokenManager.recordOverload();
      }

      return classified.recoverable;
    };

    try {
      const response = await withRetry(
        requestFn,
        shouldRetry,
        fullConfig.retryConfig,
      );

      // Record successful usage
      tokenManager.recordSuccess(convertUsage(response.usage));

      return response;
    } catch (error) {
      const classified = classifyError(error);
      // Build error options, only including defined values
      const errorOptions: {
        recoverable: boolean;
        statusCode?: number;
        retryAfterMs?: number;
        cause?: Error;
      } = {
        recoverable: classified.recoverable,
      };
      if (classified.statusCode !== undefined) {
        errorOptions.statusCode = classified.statusCode;
      }
      if (classified.retryAfterMs !== undefined) {
        errorOptions.retryAfterMs = classified.retryAfterMs;
      }
      if (error instanceof Error) {
        errorOptions.cause = error;
      }
      throw new LLMClientError(
        error instanceof Error ? error.message : String(error),
        classified.code,
        errorOptions,
      );
    }
  }

  /**
   * Convert our Message type to Anthropic MessageParam.
   */
  function toMessageParam(msg: Message): MessageParam {
    if (typeof msg.content === 'string') {
      return {
        role: msg.role,
        content: msg.content,
      };
    }

    // Handle content blocks - explicitly type for Anthropic SDK
    type ContentBlockParam =
      | { type: 'text'; text: string }
      | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
      | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

    const content: ContentBlockParam[] = msg.content.map((block) => {
      if (block.type === 'text') {
        return { type: 'text' as const, text: block.text };
      }
      if (block.type === 'tool_use') {
        return {
          type: 'tool_use' as const,
          id: block.id,
          name: block.name,
          input: block.input,
        };
      }
      if (block.type === 'tool_result') {
        const result: ContentBlockParam = {
          type: 'tool_result' as const,
          tool_use_id: block.tool_use_id,
          content: block.content,
        };
        // Only include is_error if it's true (default is false)
        if (block.is_error === true) {
          result.is_error = true;
        }
        return result;
      }
      // Fallback (should not happen with proper types)
      return { type: 'text' as const, text: JSON.stringify(block) };
    });

    return {
      role: msg.role,
      content: content as MessageParam['content'],
    };
  }

  /**
   * Convert tool definitions to Anthropic format.
   */
  function toAnthropicTools(tools: ToolDefinition[]): Tool[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema as Tool['input_schema'],
    }));
  }

  // Return the client interface
  return {
    async invokeWithTools<T = unknown>(
      messages: Message[],
      tools: ToolDefinition[],
      outputSchema?: z.ZodType<T>,
    ): Promise<ToolUseResult<T>> {
      const anthropicMessages = messages.map(toMessageParam);
      const anthropicTools = toAnthropicTools(tools);

      const response = await makeRequest(anthropicMessages, anthropicTools);

      const toolCalls = extractToolUses(response.content);
      const textContent = extractTextContent(response.content);
      const usage = convertUsage(response.usage);
      const stopReason = convertStopReason(response.stop_reason);

      // Parse structured output if schema provided and we have text content
      let structuredOutput: T | undefined;
      if (outputSchema && textContent) {
        try {
          // Try to parse JSON from the text content
          const jsonMatch = textContent.match(/```json\s*([\s\S]*?)\s*```/);
          const jsonStr = jsonMatch?.[1] ?? textContent;
          const parsed = JSON.parse(jsonStr);
          structuredOutput = outputSchema.parse(parsed);
        } catch {
          // If parsing fails, we still return successfully but without structured output
          // The caller can check if structuredOutput is undefined
        }
      }

      // Build conversation history including this response
      const allMessages: Message[] = [
        ...messages,
        convertMessage(response),
      ];

      // Build result, only including optional properties if they have values
      const result: ToolUseResult<T> = {
        success: true,
        toolCalls,
        stopReason,
        usage,
        messages: allMessages,
      };

      if (structuredOutput !== undefined) {
        result.structuredOutput = structuredOutput;
      }
      if (textContent !== undefined) {
        result.textContent = textContent;
      }

      return result;
    },

    async invokeStructured<T>(
      messages: Message[],
      schema: z.ZodType<T>,
    ): Promise<StructuredResult<T>> {
      const anthropicMessages = messages.map(toMessageParam);

      // Add instruction to return JSON
      const systemPrompt = `You are a structured data assistant. Always respond with valid JSON that matches the expected schema. Do not include any text outside of the JSON object.`;

      const response = await makeRequest(anthropicMessages, undefined, systemPrompt);

      const textContent = extractTextContent(response.content);
      const usage = convertUsage(response.usage);

      if (!textContent) {
        throw new LLMClientError(
          'No text content in response for structured output',
          'PARSING_ERROR',
          { recoverable: false },
        );
      }

      // Parse JSON from response
      let parsed: unknown;
      try {
        // Try to extract JSON from code blocks first
        const jsonMatch = textContent.match(/```json\s*([\s\S]*?)\s*```/);
        const jsonStr = jsonMatch?.[1] ?? textContent.trim();
        parsed = JSON.parse(jsonStr);
      } catch (error) {
        const errorOptions: { recoverable: boolean; cause?: Error } = {
          recoverable: false,
        };
        if (error instanceof Error) {
          errorOptions.cause = error;
        }
        throw new LLMClientError(
          `Failed to parse JSON from response: ${error instanceof Error ? error.message : String(error)}`,
          'PARSING_ERROR',
          errorOptions,
        );
      }

      // Validate against schema
      const result = schema.safeParse(parsed);
      if (!result.success) {
        throw new LLMClientError(
          `Response does not match expected schema: ${result.error.message}`,
          'PARSING_ERROR',
          { recoverable: false },
        );
      }

      return {
        data: result.data,
        rawText: textContent,
        usage,
      };
    },

    isReady(): boolean {
      return tokenManager.isReady();
    },

    getUsageStats() {
      return tokenManager.getUsageStats();
    },
  };
}

/**
 * Check if LLM features are available.
 *
 * @param apiKey - API key to check
 * @returns true if LLM can be used
 */
export function isLLMAvailable(apiKey: string | undefined): boolean {
  return apiKey !== undefined && apiKey.trim() !== '';
}
