/**
 * Base Tool Abstraction
 *
 * Provides a foundation for Playwright-based tools with built-in:
 * - Timeout handling
 * - Screenshot capture on error
 * - Structured logging
 * - Duration tracking
 */

import type { Page } from 'playwright';
import type {
  Tool,
  ToolContext,
  ToolConfig,
  ToolResult,
  ToolError,
  ToolErrorCode,
} from '../types/tool.js';
import type { Logger } from '../utils/logger.js';
import { createLogger } from '../utils/logger.js';
import { captureScreenshot } from './browser.js';

/**
 * Default tool configuration
 */
const DEFAULT_TOOL_CONFIG: ToolConfig = {
  navigationTimeout: 30000,
  elementTimeout: 10000,
  screenshotDir: './screenshots',
};

/**
 * Abstract base class for Playwright tools
 *
 * Extend this class to create new tools with automatic:
 * - Error handling and classification
 * - Screenshot capture on failure
 * - Execution timing
 * - Structured logging
 */
export abstract class BaseTool<TInput, TOutput> implements Tool<TInput, TOutput> {
  abstract readonly name: string;
  abstract readonly description: string;

  /**
   * Implement this method with the tool's core logic.
   * Errors thrown here are automatically caught and classified.
   */
  protected abstract run(input: TInput, context: ToolContext): Promise<TOutput>;

  /**
   * Execute the tool with automatic error handling, timing, and logging
   */
  async execute(input: TInput, context: ToolContext): Promise<ToolResult<TOutput>> {
    const startTime = Date.now();
    const screenshots: string[] = [];

    context.logger.info(`Executing tool: ${this.name}`, { input });

    try {
      const data = await this.run(input, context);
      const duration = Date.now() - startTime;

      context.logger.info(`Tool completed: ${this.name}`, { duration });

      return {
        success: true,
        data,
        screenshots,
        duration,
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      const error = this.classifyError(err);

      context.logger.error(`Tool failed: ${this.name}`, {
        error: error.message,
        code: error.code,
        recoverable: error.recoverable,
        duration,
      });

      // Capture screenshot on error
      try {
        const screenshotPath = await context.screenshot(`${this.name}-error`);
        screenshots.push(screenshotPath);
      } catch (screenshotErr) {
        context.logger.warn('Failed to capture error screenshot', {
          error: screenshotErr instanceof Error ? screenshotErr.message : 'Unknown',
        });
      }

      return {
        success: false,
        error,
        screenshots,
        duration,
      };
    }
  }

  /**
   * Classify an error into the appropriate category
   */
  protected classifyError(err: unknown): ToolError {
    const error = err instanceof Error ? err : new Error(String(err));
    const message = error.message.toLowerCase();

    // Timeout errors - transient, recoverable
    if (message.includes('timeout') || message.includes('timed out')) {
      return {
        message: error.message,
        code: 'TIMEOUT_ERROR',
        recoverable: true,
        cause: error,
      };
    }

    // Network errors - transient, recoverable
    if (
      message.includes('net::') ||
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('enotfound')
    ) {
      return {
        message: error.message,
        code: 'NETWORK_ERROR',
        recoverable: true,
        cause: error,
      };
    }

    // Selector errors - may indicate UI change
    if (
      message.includes('selector') ||
      message.includes('element') ||
      message.includes('locator') ||
      message.includes('not found')
    ) {
      return {
        message: error.message,
        code: 'SELECTOR_ERROR',
        recoverable: false,
        cause: error,
      };
    }

    // Auth errors - require intervention
    if (
      message.includes('auth') ||
      message.includes('login') ||
      message.includes('unauthorized') ||
      message.includes('403')
    ) {
      return {
        message: error.message,
        code: 'AUTH_ERROR',
        recoverable: false,
        cause: error,
      };
    }

    // Validation errors
    if (message.includes('invalid') || message.includes('validation')) {
      return {
        message: error.message,
        code: 'VALIDATION_ERROR',
        recoverable: false,
        cause: error,
      };
    }

    // Unknown errors
    return {
      message: error.message,
      code: 'UNKNOWN_ERROR',
      recoverable: false,
      cause: error,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Playwright Wrapper Methods
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Wait for a selector with timeout handling
   */
  protected async waitForSelector(
    context: ToolContext,
    selector: string,
    options?: { timeout?: number; state?: 'attached' | 'detached' | 'visible' | 'hidden' }
  ): Promise<void> {
    const timeout = options?.timeout ?? context.config.elementTimeout;
    context.logger.debug(`Waiting for selector: ${selector}`, { timeout });

    await context.page.waitForSelector(selector, {
      timeout,
      state: options?.state ?? 'visible',
    });
  }

  /**
   * Click an element with timeout handling
   */
  protected async click(
    context: ToolContext,
    selector: string,
    options?: { timeout?: number }
  ): Promise<void> {
    const timeout = options?.timeout ?? context.config.elementTimeout;
    context.logger.debug(`Clicking: ${selector}`, { timeout });

    await context.page.click(selector, { timeout });
  }

  /**
   * Fill an input field with timeout handling
   */
  protected async fill(
    context: ToolContext,
    selector: string,
    value: string,
    options?: { timeout?: number }
  ): Promise<void> {
    const timeout = options?.timeout ?? context.config.elementTimeout;
    context.logger.debug(`Filling: ${selector}`, { timeout });

    await context.page.fill(selector, value, { timeout });
  }

  /**
   * Navigate to a URL with timeout handling
   */
  protected async navigate(
    context: ToolContext,
    url: string,
    options?: { timeout?: number; waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }
  ): Promise<void> {
    const timeout = options?.timeout ?? context.config.navigationTimeout;
    context.logger.debug(`Navigating to: ${url}`, { timeout });

    await context.page.goto(url, {
      timeout,
      waitUntil: options?.waitUntil ?? 'domcontentloaded',
    });
  }

  /**
   * Get text content from an element
   */
  protected async getText(
    context: ToolContext,
    selector: string,
    options?: { timeout?: number }
  ): Promise<string | null> {
    const timeout = options?.timeout ?? context.config.elementTimeout;
    context.logger.debug(`Getting text: ${selector}`, { timeout });

    const element = await context.page.waitForSelector(selector, { timeout, state: 'visible' });
    return element ? element.textContent() : null;
  }

  /**
   * Check if an element exists on the page
   */
  protected async exists(
    context: ToolContext,
    selector: string,
    options?: { timeout?: number }
  ): Promise<boolean> {
    const timeout = options?.timeout ?? 1000; // Short timeout for existence check
    context.logger.debug(`Checking existence: ${selector}`, { timeout });

    try {
      await context.page.waitForSelector(selector, { timeout, state: 'attached' });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create a ToolContext from a Playwright Page
 *
 * Helper function to construct a properly configured ToolContext
 * for tool execution.
 */
export function createToolContext(
  page: Page,
  options?: {
    logger?: Logger;
    config?: Partial<ToolConfig>;
  }
): ToolContext {
  const config: ToolConfig = {
    ...DEFAULT_TOOL_CONFIG,
    ...options?.config,
  };

  const logger = options?.logger ?? createLogger('info', 'Tool');

  return {
    page,
    logger,
    config,
    screenshot: async (name: string): Promise<string> => {
      return captureScreenshot(page, name, config.screenshotDir);
    },
  };
}

/**
 * Create a successful ToolResult
 */
export function successResult<T>(
  data: T,
  duration: number,
  screenshots?: string[]
): ToolResult<T> {
  const result: ToolResult<T> = {
    success: true,
    data,
    duration,
  };
  if (screenshots !== undefined) {
    result.screenshots = screenshots;
  }
  return result;
}

/**
 * Create a failed ToolResult
 */
export function failureResult<T>(
  error: ToolError,
  duration: number,
  screenshots?: string[]
): ToolResult<T> {
  const result: ToolResult<T> = {
    success: false,
    error,
    duration,
  };
  if (screenshots !== undefined) {
    result.screenshots = screenshots;
  }
  return result;
}

/**
 * Create a ToolError with the given properties
 */
export function createToolError(
  message: string,
  code: ToolErrorCode,
  recoverable: boolean,
  cause?: Error
): ToolError {
  const error: ToolError = { message, code, recoverable };
  if (cause !== undefined) {
    error.cause = cause;
  }
  return error;
}
