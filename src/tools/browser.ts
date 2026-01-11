/**
 * Browser Automation Module
 *
 * Provides Playwright browser instance management for Auchan.pt automation.
 */

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
 * Launch a browser session configured for Auchan.pt
 */
export async function launchBrowser(
  config: Partial<BrowserConfig> = {},
  logger?: Logger
): Promise<BrowserSession> {
  const log = logger ?? createLogger('info', 'Browser');
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  log.info('Launching browser', { headless: mergedConfig.headless });

  const browser = await chromium.launch({
    headless: mergedConfig.headless,
    slowMo: mergedConfig.slowMo,
  });

  const context = await browser.newContext({
    viewport: mergedConfig.viewport,
    locale: 'pt-PT',
    timezoneId: 'Europe/Lisbon',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

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
