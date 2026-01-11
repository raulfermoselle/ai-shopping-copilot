/**
 * Error Handling Utilities
 *
 * Custom error classes, retry logic with exponential backoff,
 * and error categorization for the AI Shopping Copilot.
 */

import type { ToolErrorCode } from '../types/tool.js';

// =============================================================================
// Custom Error Classes
// =============================================================================

/**
 * Base class for all copilot errors.
 * Provides common properties for error handling and categorization.
 */
export abstract class CopilotError extends Error {
  /** Whether this error type is recoverable via retry */
  abstract readonly recoverable: boolean;
  /** The error code for categorization */
  abstract readonly code: ToolErrorCode;
  /** Original error if this wraps another error */
  readonly cause: Error | undefined;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = this.constructor.name;
    this.cause = cause ?? undefined;

    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Network-related errors (connection failures, DNS issues, etc.)
 * These are typically transient and can be retried.
 */
export class NetworkError extends CopilotError {
  readonly recoverable = true as const;
  readonly code = 'NETWORK_ERROR' as const;

  constructor(message: string, cause?: Error) {
    super(message, cause);
  }
}

/**
 * Timeout errors (navigation timeouts, element wait timeouts, etc.)
 * These are typically transient and can be retried.
 */
export class TimeoutError extends CopilotError {
  readonly recoverable = true as const;
  readonly code = 'TIMEOUT_ERROR' as const;
  /** The timeout duration in milliseconds */
  readonly timeoutMs: number | undefined;

  constructor(message: string, timeoutMs?: number, cause?: Error) {
    super(message, cause);
    this.timeoutMs = timeoutMs ?? undefined;
  }
}

/**
 * Selector errors (element not found, selector changed, etc.)
 * These indicate UI structure changes and are NOT recoverable via retry.
 * Requires investigation and selector updates.
 */
export class SelectorError extends CopilotError {
  readonly recoverable = false as const;
  readonly code = 'SELECTOR_ERROR' as const;
  /** The selector that failed */
  readonly selector: string | undefined;

  constructor(message: string, selector?: string, cause?: Error) {
    super(message, cause);
    this.selector = selector ?? undefined;
  }
}

/**
 * Authentication errors (login failed, session expired, etc.)
 * These are NOT recoverable via retry and require user intervention.
 */
export class AuthError extends CopilotError {
  readonly recoverable = false as const;
  readonly code = 'AUTH_ERROR' as const;

  constructor(message: string, cause?: Error) {
    super(message, cause);
  }
}

/**
 * Validation errors (invalid input, schema mismatch, etc.)
 * These are NOT recoverable via retry as the input needs to change.
 */
export class ValidationError extends CopilotError {
  readonly recoverable = false as const;
  readonly code = 'VALIDATION_ERROR' as const;
  /** The field or property that failed validation */
  readonly field: string | undefined;
  /** The invalid value that was provided */
  readonly value: unknown;

  constructor(message: string, field?: string, value?: unknown, cause?: Error) {
    super(message, cause);
    this.field = field ?? undefined;
    this.value = value;
  }
}

// =============================================================================
// Retry Utility
// =============================================================================

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in milliseconds for exponential backoff (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelayMs?: number;
  /** Optional callback invoked before each retry */
  onRetry?: (error: Error, attempt: number, delayMs: number) => void;
}

const DEFAULT_RETRY_CONFIG: Required<Omit<RetryConfig, 'onRetry'>> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
};

/**
 * Check if an error is recoverable (can be retried)
 */
export function isRecoverableError(error: unknown): boolean {
  if (error instanceof CopilotError) {
    return error.recoverable;
  }
  // Unknown errors are not considered recoverable
  return false;
}

/**
 * Calculate delay for exponential backoff with jitter
 */
function calculateBackoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
): number {
  // Exponential backoff: base * 2^attempt
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  // Add jitter (0-25% of delay) to prevent thundering herd
  const jitter = exponentialDelay * Math.random() * 0.25;
  const delay = exponentialDelay + jitter;
  // Cap at maximum delay
  return Math.min(delay, maxDelayMs);
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an async operation with exponential backoff.
 * Only retries if the error is recoverable (NetworkError, TimeoutError).
 * Non-recoverable errors are thrown immediately.
 *
 * @param operation - The async function to retry
 * @param config - Optional retry configuration
 * @returns The result of the operation if successful
 * @throws The last error if all retries are exhausted, or immediately for non-recoverable errors
 *
 * @example
 * ```ts
 * const result = await withRetry(
 *   () => fetchData(),
 *   { maxRetries: 5, baseDelayMs: 500 }
 * );
 * ```
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = {}
): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs } = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };
  const { onRetry } = config;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      // Ensure we have an Error instance
      const err = error instanceof Error ? error : new Error(String(error));
      lastError = err;

      // Check if this error is recoverable
      if (!isRecoverableError(err)) {
        // Non-recoverable errors are thrown immediately
        throw err;
      }

      // Check if we have retries remaining
      if (attempt >= maxRetries) {
        // No more retries, throw the error
        break;
      }

      // Calculate backoff delay
      const delayMs = calculateBackoffDelay(attempt, baseDelayMs, maxDelayMs);

      // Notify via callback if provided
      if (onRetry) {
        onRetry(err, attempt + 1, delayMs);
      }

      // Wait before retrying
      await sleep(delayMs);
    }
  }

  // All retries exhausted
  throw lastError;
}

// =============================================================================
// Error Categorization
// =============================================================================

/**
 * Categorization result containing error code and recovery information
 */
export interface ErrorCategorization {
  /** The categorized error code */
  code: ToolErrorCode;
  /** Whether the error is recoverable */
  recoverable: boolean;
  /** The original error message */
  message: string;
  /** The original error for reference */
  cause: Error;
}

/**
 * Map an error to its ToolErrorCode categorization.
 * Handles both custom CopilotError types and standard errors.
 *
 * @param error - The error to categorize
 * @returns Categorization with error code and recovery information
 *
 * @example
 * ```ts
 * try {
 *   await page.click('.submit');
 * } catch (e) {
 *   const category = categorizeError(e);
 *   if (category.recoverable) {
 *     // Retry the operation
 *   } else {
 *     // Escalate or handle permanently
 *   }
 * }
 * ```
 */
export function categorizeError(error: unknown): ErrorCategorization {
  // Handle CopilotError subclasses directly
  if (error instanceof CopilotError) {
    return {
      code: error.code,
      recoverable: error.recoverable,
      message: error.message,
      cause: error,
    };
  }

  // Handle standard Error instances by inspecting message/name
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // Network-related errors
    if (
      message.includes('network') ||
      message.includes('net::') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('fetch failed') ||
      name.includes('network')
    ) {
      return {
        code: 'NETWORK_ERROR',
        recoverable: true,
        message: error.message,
        cause: error,
      };
    }

    // Timeout-related errors
    if (
      message.includes('timeout') ||
      message.includes('timed out') ||
      name.includes('timeout')
    ) {
      return {
        code: 'TIMEOUT_ERROR',
        recoverable: true,
        message: error.message,
        cause: error,
      };
    }

    // Selector/element-related errors (Playwright specific patterns)
    if (
      message.includes('selector') ||
      message.includes('element') ||
      message.includes('locator') ||
      message.includes('waiting for') ||
      message.includes('strict mode violation')
    ) {
      return {
        code: 'SELECTOR_ERROR',
        recoverable: false,
        message: error.message,
        cause: error,
      };
    }

    // Authentication-related errors
    if (
      message.includes('auth') ||
      message.includes('login') ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('401') ||
      message.includes('403')
    ) {
      return {
        code: 'AUTH_ERROR',
        recoverable: false,
        message: error.message,
        cause: error,
      };
    }

    // Validation-related errors
    if (
      message.includes('valid') ||
      message.includes('required') ||
      message.includes('must be') ||
      message.includes('expected') ||
      name.includes('validation') ||
      name.includes('type')
    ) {
      return {
        code: 'VALIDATION_ERROR',
        recoverable: false,
        message: error.message,
        cause: error,
      };
    }

    // Unknown error type
    return {
      code: 'UNKNOWN_ERROR',
      recoverable: false,
      message: error.message,
      cause: error,
    };
  }

  // Handle non-Error values
  const message = String(error);
  return {
    code: 'UNKNOWN_ERROR',
    recoverable: false,
    message,
    cause: new Error(message),
  };
}

/**
 * Wrap any error into an appropriate CopilotError subclass
 * based on its categorization.
 *
 * @param error - The error to wrap
 * @returns A CopilotError subclass instance
 */
export function wrapError(error: unknown): CopilotError {
  // Already a CopilotError, return as-is
  if (error instanceof CopilotError) {
    return error;
  }

  const category = categorizeError(error);

  switch (category.code) {
    case 'NETWORK_ERROR':
      return new NetworkError(category.message, category.cause);
    case 'TIMEOUT_ERROR':
      return new TimeoutError(category.message, undefined, category.cause);
    case 'SELECTOR_ERROR':
      return new SelectorError(category.message, undefined, category.cause);
    case 'AUTH_ERROR':
      return new AuthError(category.message, category.cause);
    case 'VALIDATION_ERROR':
      return new ValidationError(category.message, undefined, undefined, category.cause);
    default:
      // For UNKNOWN_ERROR, wrap as ValidationError (non-recoverable by default)
      return new ValidationError(category.message, undefined, undefined, category.cause);
  }
}
