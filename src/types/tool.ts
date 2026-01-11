/**
 * Tool Types
 *
 * Type definitions for the tool abstraction layer.
 */

import type { Page } from 'playwright';
import type { Logger } from '../utils/logger.js';

/**
 * Tool interface - all Playwright tools implement this
 */
export interface Tool<TInput, TOutput> {
  /** Unique tool name */
  name: string;
  /** Human-readable description */
  description: string;
  /** Execute the tool */
  execute(input: TInput, context: ToolContext): Promise<ToolResult<TOutput>>;
}

/**
 * Context provided to tools during execution
 */
export interface ToolContext {
  /** Playwright page instance */
  page: Page;
  /** Structured logger */
  logger: Logger;
  /** Capture a screenshot */
  screenshot: (name: string) => Promise<string>;
  /** Base configuration */
  config: ToolConfig;
}

/**
 * Tool configuration
 */
export interface ToolConfig {
  /** Default navigation timeout in ms */
  navigationTimeout: number;
  /** Default element timeout in ms */
  elementTimeout: number;
  /** Screenshot output directory */
  screenshotDir: string;
}

/**
 * Result from tool execution
 */
export interface ToolResult<T> {
  /** Whether execution succeeded */
  success: boolean;
  /** Result data if successful */
  data?: T;
  /** Error details if failed */
  error?: ToolError;
  /** Screenshots captured during execution */
  screenshots?: string[];
  /** Execution duration in ms */
  duration: number;
}

/**
 * Tool error with categorization
 */
export interface ToolError {
  /** Error message */
  message: string;
  /** Error code for categorization */
  code: ToolErrorCode;
  /** Whether this error is recoverable */
  recoverable: boolean;
  /** Original error if wrapped */
  cause?: Error;
}

/**
 * Error codes for categorization
 */
export type ToolErrorCode =
  | 'NETWORK_ERROR'
  | 'TIMEOUT_ERROR'
  | 'SELECTOR_ERROR'
  | 'AUTH_ERROR'
  | 'VALIDATION_ERROR'
  | 'UNKNOWN_ERROR';
