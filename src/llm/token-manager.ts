/**
 * Token Manager
 *
 * Handles rate limiting, token usage tracking, and request queuing
 * for the Anthropic Claude API.
 */

import type { TokenUsage } from './types.js';

// =============================================================================
// Rate Limiter
// =============================================================================

/**
 * Token bucket rate limiter for API requests.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per millisecond

  /**
   * Create a new rate limiter.
   *
   * @param requestsPerMinute - Maximum requests per minute
   */
  constructor(requestsPerMinute: number) {
    this.maxTokens = requestsPerMinute;
    this.tokens = requestsPerMinute;
    this.lastRefill = Date.now();
    // Refill rate: requests per minute -> tokens per millisecond
    this.refillRate = requestsPerMinute / 60000;
  }

  /**
   * Refill tokens based on elapsed time.
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const newTokens = elapsed * this.refillRate;
    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefill = now;
  }

  /**
   * Try to acquire a token for a request.
   *
   * @returns true if token acquired, false if rate limited
   */
  tryAcquire(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /**
   * Get the time in milliseconds until a token is available.
   */
  getWaitTime(): number {
    this.refill();
    if (this.tokens >= 1) {
      return 0;
    }
    const tokensNeeded = 1 - this.tokens;
    return Math.ceil(tokensNeeded / this.refillRate);
  }

  /**
   * Wait until a token is available.
   */
  async waitForToken(): Promise<void> {
    const waitTime = this.getWaitTime();
    if (waitTime > 0) {
      await sleep(waitTime);
    }
  }

  /**
   * Acquire a token, waiting if necessary.
   */
  async acquire(): Promise<void> {
    while (!this.tryAcquire()) {
      await this.waitForToken();
    }
  }

  /**
   * Get current available tokens.
   */
  getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
}

// =============================================================================
// Usage Tracker
// =============================================================================

/**
 * Tracks token usage across requests.
 */
export class UsageTracker {
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private requestCount = 0;
  private readonly history: Array<{
    timestamp: Date;
    usage: TokenUsage;
  }> = [];
  private readonly maxHistorySize: number;

  constructor(maxHistorySize = 1000) {
    this.maxHistorySize = maxHistorySize;
  }

  /**
   * Record token usage from a request.
   */
  record(usage: TokenUsage): void {
    this.totalInputTokens += usage.inputTokens;
    this.totalOutputTokens += usage.outputTokens;
    this.requestCount += 1;

    this.history.push({
      timestamp: new Date(),
      usage,
    });

    // Trim history if needed
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  /**
   * Get cumulative usage statistics.
   */
  getStats(): {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    requestCount: number;
    averageInputTokens: number;
    averageOutputTokens: number;
  } {
    return {
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      totalTokens: this.totalInputTokens + this.totalOutputTokens,
      requestCount: this.requestCount,
      averageInputTokens:
        this.requestCount > 0 ? this.totalInputTokens / this.requestCount : 0,
      averageOutputTokens:
        this.requestCount > 0 ? this.totalOutputTokens / this.requestCount : 0,
    };
  }

  /**
   * Get usage for a time window.
   *
   * @param windowMs - Time window in milliseconds
   */
  getUsageInWindow(windowMs: number): {
    inputTokens: number;
    outputTokens: number;
    requestCount: number;
  } {
    const cutoff = new Date(Date.now() - windowMs);
    const windowEntries = this.history.filter(
      (entry) => entry.timestamp >= cutoff,
    );

    return {
      inputTokens: windowEntries.reduce(
        (sum, entry) => sum + entry.usage.inputTokens,
        0,
      ),
      outputTokens: windowEntries.reduce(
        (sum, entry) => sum + entry.usage.outputTokens,
        0,
      ),
      requestCount: windowEntries.length,
    };
  }

  /**
   * Reset all statistics.
   */
  reset(): void {
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.requestCount = 0;
    this.history.length = 0;
  }
}

// =============================================================================
// Retry Logic
// =============================================================================

/**
 * Configuration for retry behavior.
 */
export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  useJitter: boolean;
}

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  useJitter: true,
};

/**
 * Calculate exponential backoff delay with optional jitter.
 *
 * @param attempt - Current attempt number (0-based)
 * @param config - Retry configuration
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig,
): number {
  // Exponential backoff: base * 2^attempt
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);

  // Add jitter (0-25% of delay) if enabled
  const jitter = config.useJitter ? exponentialDelay * Math.random() * 0.25 : 0;

  const delay = exponentialDelay + jitter;

  // Cap at maximum delay
  return Math.min(delay, config.maxDelayMs);
}

/**
 * Execute an operation with retry logic.
 *
 * @param operation - Async operation to execute
 * @param shouldRetry - Function to determine if error is retryable
 * @param config - Retry configuration
 * @param onRetry - Optional callback before each retry
 * @returns Operation result
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  shouldRetry: (error: unknown) => boolean,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (!shouldRetry(error)) {
        throw error;
      }

      // Check if we have retries remaining
      if (attempt >= config.maxRetries) {
        break;
      }

      // Calculate delay
      const delayMs = calculateBackoffDelay(attempt, config);

      // Notify callback if provided
      if (onRetry) {
        onRetry(error, attempt + 1, delayMs);
      }

      // Wait before retrying
      await sleep(delayMs);
    }
  }

  // All retries exhausted
  throw lastError;
}

// =============================================================================
// Token Manager
// =============================================================================

/**
 * Combined token management: rate limiting + usage tracking + retries.
 */
export class TokenManager {
  private readonly rateLimiter: RateLimiter;
  private readonly usageTracker: UsageTracker;
  private readonly retryConfig: RetryConfig;
  private isOverloaded = false;
  private overloadedUntil: number | null = null;

  constructor(
    requestsPerMinute: number,
    retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG,
  ) {
    this.rateLimiter = new RateLimiter(requestsPerMinute);
    this.usageTracker = new UsageTracker();
    this.retryConfig = retryConfig;
  }

  /**
   * Check if ready to make a request.
   */
  isReady(): boolean {
    // Check if we're in an overload backoff period
    if (this.isOverloaded && this.overloadedUntil !== null) {
      if (Date.now() < this.overloadedUntil) {
        return false;
      }
      // Overload period ended
      this.isOverloaded = false;
      this.overloadedUntil = null;
    }

    return this.rateLimiter.getAvailableTokens() >= 1;
  }

  /**
   * Wait for a request slot to be available.
   */
  async waitForSlot(): Promise<void> {
    // Wait for overload period if needed
    if (this.isOverloaded && this.overloadedUntil !== null) {
      const waitTime = this.overloadedUntil - Date.now();
      if (waitTime > 0) {
        await sleep(waitTime);
      }
      this.isOverloaded = false;
      this.overloadedUntil = null;
    }

    // Wait for rate limit token
    await this.rateLimiter.acquire();
  }

  /**
   * Record successful request with token usage.
   */
  recordSuccess(usage: TokenUsage): void {
    this.usageTracker.record(usage);
  }

  /**
   * Record rate limit hit from API.
   *
   * @param retryAfterMs - Retry-after header value in milliseconds
   */
  recordRateLimit(retryAfterMs?: number): void {
    // Default to 60 seconds if not specified
    const waitTime = retryAfterMs ?? 60000;
    this.overloadedUntil = Date.now() + waitTime;
    this.isOverloaded = true;
  }

  /**
   * Record API overload.
   */
  recordOverload(): void {
    // Back off for 30 seconds on overload
    this.overloadedUntil = Date.now() + 30000;
    this.isOverloaded = true;
  }

  /**
   * Get retry configuration.
   */
  getRetryConfig(): RetryConfig {
    return this.retryConfig;
  }

  /**
   * Get usage statistics.
   */
  getUsageStats(): {
    totalInputTokens: number;
    totalOutputTokens: number;
    requestCount: number;
  } {
    const stats = this.usageTracker.getStats();
    return {
      totalInputTokens: stats.totalInputTokens,
      totalOutputTokens: stats.totalOutputTokens,
      requestCount: stats.requestCount,
    };
  }

  /**
   * Get detailed usage statistics.
   */
  getDetailedStats(): ReturnType<UsageTracker['getStats']> {
    return this.usageTracker.getStats();
  }

  /**
   * Get usage in a time window.
   */
  getUsageInWindow(
    windowMs: number,
  ): ReturnType<UsageTracker['getUsageInWindow']> {
    return this.usageTracker.getUsageInWindow(windowMs);
  }

  /**
   * Reset all statistics and state.
   */
  reset(): void {
    this.usageTracker.reset();
    this.isOverloaded = false;
    this.overloadedUntil = null;
  }
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Sleep for a specified duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
