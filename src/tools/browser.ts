/**
 * Browser Automation Module
 *
 * Provides Playwright browser instance management for Auchan.pt automation.
 */

import { existsSync } from 'node:fs';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import type { BrowserConfig } from '../types/config.js';
import { createLogger, Logger } from '../utils/logger.js';

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
}

const DEFAULT_CONFIG: BrowserConfig = {
  headless: true,
  slowMo: 0,
  viewport: { width: 1280, height: 720 },
};

/**
 * Options for launching a browser session
 */
export interface LaunchOptions {
  /** Browser configuration overrides */
  config?: Partial<BrowserConfig>;
  /** Path to session storage state file */
  sessionPath?: string;
  /** Logger instance */
  logger?: Logger;
}

/**
 * Launch a browser session configured for Auchan.pt
 *
 * Optionally restores session state from a previous session file.
 */
export async function launchBrowser(options: LaunchOptions = {}): Promise<BrowserSession> {
  const log = options.logger ?? createLogger('info', 'Browser');
  const mergedConfig = { ...DEFAULT_CONFIG, ...options.config };

  log.info('Launching browser', { headless: mergedConfig.headless });

  const browser = await chromium.launch({
    headless: mergedConfig.headless,
    slowMo: mergedConfig.slowMo,
  });

  // Build context options
  const contextOptions: Parameters<Browser['newContext']>[0] = {
    viewport: mergedConfig.viewport,
    locale: 'pt-PT',
    timezoneId: 'Europe/Lisbon',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  // Restore session if path provided and file exists
  if (options.sessionPath !== undefined && existsSync(options.sessionPath)) {
    log.info('Restoring session state', { path: options.sessionPath });
    contextOptions.storageState = options.sessionPath;
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  log.info('Browser session created');

  return {
    browser,
    context,
    page,
    close: async (): Promise<void> => {
      log.info('Closing browser session');
      await context.close();
      await browser.close();
    },
  };
}

/**
 * Legacy function signature for backwards compatibility
 * @deprecated Use launchBrowser({ config, logger }) instead
 */
export async function launchBrowserLegacy(
  config: Partial<BrowserConfig> = {},
  logger?: Logger
): Promise<BrowserSession> {
  const options: LaunchOptions = { config };
  if (logger !== undefined) {
    options.logger = logger;
  }
  return launchBrowser(options);
}

/**
 * Navigate to Auchan.pt homepage
 */
export async function navigateToAuchan(
  page: Page,
  logger?: Logger
): Promise<void> {
  const log = logger ?? createLogger('info', 'Browser');

  log.info('Navigating to Auchan.pt');
  await page.goto('https://www.auchan.pt', {
    waitUntil: 'domcontentloaded',
  });
  log.info('Navigation complete');
}

/**
 * Capture a screenshot with structured naming
 */
export async function captureScreenshot(
  page: Page,
  name: string,
  outputDir: string = './screenshots'
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${outputDir}/${timestamp}-${name}.png`;

  await page.screenshot({ path: filename, fullPage: false });

  return filename;
}
