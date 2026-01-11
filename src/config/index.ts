/**
 * Configuration System
 *
 * Loads and validates application configuration from:
 * - config/default.json (defaults, committed to repo)
 * - Environment variables (for secrets and overrides)
 *
 * Uses Zod for runtime validation with clear error messages.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { AppConfig, AuchanCredentials, SessionConfig } from '../types/config.js';

/**
 * Zod schema for timeout configuration
 */
const TimeoutsSchema = z.object({
  navigation: z.number().int().positive().describe('Navigation timeout in milliseconds'),
  element: z.number().int().positive().describe('Element wait timeout in milliseconds'),
});

/**
 * Zod schema for Auchan configuration
 */
const AuchanConfigSchema = z.object({
  baseUrl: z.string().url().describe('Base URL for Auchan.pt'),
  timeouts: TimeoutsSchema,
});

/**
 * Zod schema for viewport configuration
 */
const ViewportSchema = z.object({
  width: z.number().int().positive().describe('Viewport width in pixels'),
  height: z.number().int().positive().describe('Viewport height in pixels'),
});

/**
 * Zod schema for browser configuration
 */
const BrowserConfigSchema = z.object({
  headless: z.boolean().describe('Run browser in headless mode'),
  slowMo: z.number().int().nonnegative().describe('Slow down actions by this many milliseconds'),
  viewport: ViewportSchema,
});

/**
 * Zod schema for logging configuration
 */
const LoggingConfigSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).describe('Log level'),
  outputDir: z.string().min(1).describe('Output directory for logs'),
});

/**
 * Complete application configuration schema
 */
const AppConfigSchema = z.object({
  auchan: AuchanConfigSchema,
  browser: BrowserConfigSchema,
  logging: LoggingConfigSchema,
});

/**
 * Environment variable names for configuration overrides
 */
const ENV_VARS = {
  // Auchan settings
  AUCHAN_BASE_URL: 'AUCHAN_BASE_URL',
  AUCHAN_TIMEOUT_NAVIGATION: 'AUCHAN_TIMEOUT_NAVIGATION',
  AUCHAN_TIMEOUT_ELEMENT: 'AUCHAN_TIMEOUT_ELEMENT',

  // Auchan credentials (never logged or stored in config files)
  AUCHAN_EMAIL: 'AUCHAN_EMAIL',
  AUCHAN_PASSWORD: 'AUCHAN_PASSWORD',

  // Browser settings
  BROWSER_HEADLESS: 'BROWSER_HEADLESS',
  BROWSER_SLOW_MO: 'BROWSER_SLOW_MO',
  BROWSER_VIEWPORT_WIDTH: 'BROWSER_VIEWPORT_WIDTH',
  BROWSER_VIEWPORT_HEIGHT: 'BROWSER_VIEWPORT_HEIGHT',

  // Logging settings
  LOG_LEVEL: 'LOG_LEVEL',
  LOG_OUTPUT_DIR: 'LOG_OUTPUT_DIR',

  // Session settings
  SESSION_STORAGE_DIR: 'SESSION_STORAGE_DIR',
} as const;

/**
 * Get the project root directory
 */
function getProjectRoot(): string {
  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFilePath);
  // Navigate from src/config to project root
  return join(currentDir, '..', '..');
}

/**
 * Load the default configuration file
 */
function loadDefaultConfig(): unknown {
  const projectRoot = getProjectRoot();
  const configPath = join(projectRoot, 'config', 'default.json');

  try {
    const fileContent = readFileSync(configPath, 'utf-8');
    return JSON.parse(fileContent) as unknown;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(
        `Configuration file not found: ${configPath}\n` +
          'Please ensure config/default.json exists in the project root.'
      );
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in configuration file: ${configPath}\n${error.message}`);
    }
    throw error;
  }
}

/**
 * Parse an environment variable as a number
 */
function parseEnvNumber(value: string | undefined): number | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    return undefined;
  }
  return parsed;
}

/**
 * Parse an environment variable as a boolean
 */
function parseEnvBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  const lower = value.toLowerCase();
  if (lower === 'true' || lower === '1' || lower === 'yes') {
    return true;
  }
  if (lower === 'false' || lower === '0' || lower === 'no') {
    return false;
  }
  return undefined;
}

/**
 * Apply environment variable overrides to the configuration
 */
function applyEnvironmentOverrides(config: unknown): unknown {
  // Type assertion after validation happens later
  const cfg = config as Record<string, unknown>;

  const env = process.env;

  // Create a deep copy to avoid mutating the original
  const result = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>;

  // Auchan overrides
  const auchan = result['auchan'] as Record<string, unknown>;
  const timeouts = auchan['timeouts'] as Record<string, unknown>;

  if (env[ENV_VARS.AUCHAN_BASE_URL]) {
    auchan['baseUrl'] = env[ENV_VARS.AUCHAN_BASE_URL];
  }
  const navTimeout = parseEnvNumber(env[ENV_VARS.AUCHAN_TIMEOUT_NAVIGATION]);
  if (navTimeout !== undefined) {
    timeouts['navigation'] = navTimeout;
  }
  const elemTimeout = parseEnvNumber(env[ENV_VARS.AUCHAN_TIMEOUT_ELEMENT]);
  if (elemTimeout !== undefined) {
    timeouts['element'] = elemTimeout;
  }

  // Browser overrides
  const browser = result['browser'] as Record<string, unknown>;
  const viewport = browser['viewport'] as Record<string, unknown>;

  const headless = parseEnvBoolean(env[ENV_VARS.BROWSER_HEADLESS]);
  if (headless !== undefined) {
    browser['headless'] = headless;
  }
  const slowMo = parseEnvNumber(env[ENV_VARS.BROWSER_SLOW_MO]);
  if (slowMo !== undefined) {
    browser['slowMo'] = slowMo;
  }
  const viewportWidth = parseEnvNumber(env[ENV_VARS.BROWSER_VIEWPORT_WIDTH]);
  if (viewportWidth !== undefined) {
    viewport['width'] = viewportWidth;
  }
  const viewportHeight = parseEnvNumber(env[ENV_VARS.BROWSER_VIEWPORT_HEIGHT]);
  if (viewportHeight !== undefined) {
    viewport['height'] = viewportHeight;
  }

  // Logging overrides
  const logging = result['logging'] as Record<string, unknown>;

  if (env[ENV_VARS.LOG_LEVEL]) {
    logging['level'] = env[ENV_VARS.LOG_LEVEL];
  }
  if (env[ENV_VARS.LOG_OUTPUT_DIR]) {
    logging['outputDir'] = env[ENV_VARS.LOG_OUTPUT_DIR];
  }

  return result;
}

/**
 * Format Zod validation errors into a readable string
 */
function formatValidationErrors(error: z.ZodError): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.join('.');
    return `  - ${path}: ${issue.message}`;
  });
  return `Configuration validation failed:\n${issues.join('\n')}`;
}

/**
 * Cached configuration instance
 */
let cachedConfig: AppConfig | null = null;

/**
 * Load and validate the application configuration
 *
 * Configuration is loaded from:
 * 1. config/default.json (base defaults)
 * 2. Environment variables (overrides)
 *
 * The configuration is cached after first load.
 *
 * @throws Error if configuration file is missing or invalid
 * @throws Error if configuration fails validation
 */
export function loadConfig(): AppConfig {
  if (cachedConfig !== null) {
    return cachedConfig;
  }

  // Load default configuration
  const defaultConfig = loadDefaultConfig();

  // Apply environment variable overrides
  const mergedConfig = applyEnvironmentOverrides(defaultConfig);

  // Validate with Zod
  const result = AppConfigSchema.safeParse(mergedConfig);

  if (!result.success) {
    throw new Error(formatValidationErrors(result.error));
  }

  // The Zod schema matches AppConfig, but we need explicit casting
  // because z.infer produces a structurally compatible but not identical type
  cachedConfig = result.data as AppConfig;
  return cachedConfig;
}

/**
 * Get the current configuration
 *
 * This is a convenience function that returns the cached config
 * or loads it if not yet cached.
 */
export function getConfig(): AppConfig {
  return loadConfig();
}

/**
 * Clear the cached configuration
 *
 * Useful for testing or when configuration needs to be reloaded.
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}

/**
 * Redact sensitive values for logging
 *
 * Returns a copy of the config safe for logging.
 * Currently no sensitive values in AppConfig, but this
 * provides a pattern for future credential handling.
 */
export function getLoggableConfig(config: AppConfig): Record<string, unknown> {
  // Create a deep copy
  const loggable = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;

  // Add redaction logic here if sensitive fields are added
  // Example: if (loggable.credentials) loggable.credentials = '[REDACTED]';

  return loggable;
}

/**
 * Default session configuration
 */
const DEFAULT_SESSION_CONFIG: SessionConfig = {
  storageDir: './sessions',
  fileName: 'auchan-session.json',
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
};

/**
 * Get session configuration
 *
 * Session storage can be overridden via SESSION_STORAGE_DIR environment variable.
 */
export function getSessionConfig(): SessionConfig {
  const storageDir = process.env[ENV_VARS.SESSION_STORAGE_DIR];

  return {
    ...DEFAULT_SESSION_CONFIG,
    ...(storageDir !== undefined && storageDir !== '' ? { storageDir } : {}),
  };
}

/**
 * Load Auchan credentials from environment variables
 *
 * Credentials are NEVER stored in config files or logged.
 * They are loaded fresh from environment each time to avoid
 * accidental exposure through caching.
 *
 * @throws Error if credentials are not configured
 */
export function loadCredentials(): AuchanCredentials {
  const email = process.env[ENV_VARS.AUCHAN_EMAIL];
  const password = process.env[ENV_VARS.AUCHAN_PASSWORD];

  if (email === undefined || email === '') {
    throw new Error(
      `Missing required environment variable: ${ENV_VARS.AUCHAN_EMAIL}\n` +
        'Set this to your Auchan.pt account email address.'
    );
  }

  if (password === undefined || password === '') {
    throw new Error(
      `Missing required environment variable: ${ENV_VARS.AUCHAN_PASSWORD}\n` +
        'Set this to your Auchan.pt account password.'
    );
  }

  return { email, password };
}

/**
 * Check if credentials are configured (without loading them)
 *
 * Useful for checking availability before attempting login.
 */
export function hasCredentials(): boolean {
  const email = process.env[ENV_VARS.AUCHAN_EMAIL];
  const password = process.env[ENV_VARS.AUCHAN_PASSWORD];

  return (
    email !== undefined && email !== '' && password !== undefined && password !== ''
  );
}

// Re-export types for convenience
export type {
  AppConfig,
  AuchanConfig,
  BrowserConfig,
  LoggingConfig,
  AuchanCredentials,
  SessionConfig,
} from '../types/config.js';
