/**
 * Configuration Types
 *
 * Type definitions for application configuration.
 */

/**
 * Main application configuration
 */
export interface AppConfig {
  /** Auchan.pt settings */
  auchan: AuchanConfig;
  /** Browser automation settings */
  browser: BrowserConfig;
  /** Logging settings */
  logging: LoggingConfig;
}

/**
 * Auchan.pt specific configuration
 */
export interface AuchanConfig {
  /** Base URL for Auchan.pt */
  baseUrl: string;
  /** Timeout settings */
  timeouts: {
    /** Navigation timeout in ms */
    navigation: number;
    /** Element wait timeout in ms */
    element: number;
  };
}

/**
 * Browser automation configuration
 */
export interface BrowserConfig {
  /** Run in headless mode */
  headless: boolean;
  /** Slow down actions by this many ms */
  slowMo: number;
  /** Viewport dimensions */
  viewport: {
    width: number;
    height: number;
  };
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
  /** Log level */
  level: 'debug' | 'info' | 'warn' | 'error';
  /** Output directory for logs */
  outputDir: string;
}

/**
 * Auchan credentials (loaded from environment only)
 *
 * These are never stored in config files or logged.
 */
export interface AuchanCredentials {
  /** Auchan.pt account email */
  email: string;
  /** Auchan.pt account password */
  password: string;
}

/**
 * Session persistence configuration
 */
export interface SessionConfig {
  /** Directory for session storage files */
  storageDir: string;
  /** Session file name */
  fileName: string;
  /** Maximum session age in milliseconds before re-login */
  maxAge: number;
}
