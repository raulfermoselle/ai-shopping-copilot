/**
 * Login Page Selector Discovery Script
 *
 * Navigates to Auchan.pt login page and captures HTML for selector analysis
 * Run with: npx tsx scripts/discover-login-selectors.ts
 */

import 'dotenv/config';
import { launchBrowser } from '../src/tools/browser.js';
import { createLogger } from '../src/utils/logger.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const LOGIN_SELECTORS = {
  cookieAcceptButton: '#onetrust-accept-btn-handler',
  notificationDismiss: '#onesignal-slidedown-cancel-button, button:has-text("Não")',
  accountButton: '.auc-header-account a[href*="Login-OAuthLogin"]',
  loginLink: 'a[href*="Login-OAuthLogin"]',
};

async function discoverSelectors() {
  const logger = createLogger('debug', 'SelectorDiscovery');

  logger.info('Starting selector discovery...');

  // Launch browser in headed mode
  const session = await launchBrowser({
    config: {
      headless: false,
      slowMo: 500, // Slow down for observation
    },
    logger,
  });

  const { page } = session;

  try {
    // Navigate to homepage
    logger.info('Navigating to Auchan.pt homepage...');
    await page.goto('https://www.auchan.pt', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Handle cookie consent
    logger.info('Handling cookie consent...');
    const cookieButton = page.locator(LOGIN_SELECTORS.cookieAcceptButton);
    if (await cookieButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cookieButton.click();
      await page.waitForTimeout(1000);
    }

    // Dismiss popups
    logger.info('Dismissing notification popups...');
    await page.waitForTimeout(2000);
    const dismissButton = page.locator(LOGIN_SELECTORS.notificationDismiss).first();
    if (await dismissButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dismissButton.click();
      await page.waitForTimeout(1000);
    }

    // Capture homepage HTML before clicking login
    logger.info('Capturing homepage HTML...');
    const homepageHtml = await page.content();
    const snapshotDir = join(process.cwd(), 'data', 'selectors', 'pages', 'login', 'snapshots');
    mkdirSync(snapshotDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    writeFileSync(
      join(snapshotDir, `homepage-${timestamp}.html`),
      homepageHtml,
      'utf-8'
    );
    logger.info(`Homepage HTML saved to snapshots/homepage-${timestamp}.html`);

    // Click account button to trigger login
    logger.info('Clicking account/login button...');
    const accountButton = page.locator(LOGIN_SELECTORS.accountButton).first();
    if (await accountButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await accountButton.click();
      await page.waitForTimeout(1000);
    }

    // Click login link
    const loginLink = page.locator(LOGIN_SELECTORS.loginLink).first();
    if (await loginLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      logger.info('Clicking login link...');
      await loginLink.click();
      await page.waitForTimeout(2000);
    }

    // Wait for Salesforce OAuth page to load
    logger.info('Waiting for OAuth login page...');
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Capture login page HTML
    logger.info('Capturing login page HTML...');
    const loginPageHtml = await page.content();
    writeFileSync(
      join(snapshotDir, `login-page-${timestamp}.html`),
      loginPageHtml,
      'utf-8'
    );
    logger.info(`Login page HTML saved to snapshots/login-page-${timestamp}.html`);

    // Capture screenshot
    logger.info('Capturing login page screenshot...');
    const screenshotDir = join(process.cwd(), 'screenshots');
    mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({
      path: join(screenshotDir, `login-page-${timestamp}.png`),
      fullPage: true,
    });

    // Log current URL
    logger.info('Login page URL:', page.url());

    // Try to find key elements and log them
    logger.info('\n=== SELECTOR ANALYSIS ===');

    // Email input
    const emailInputs = await page.locator('input[type="email"], input[name="email"], input[name="username"], #username').all();
    logger.info(`Found ${emailInputs.length} email input(s)`);
    for (let i = 0; i < emailInputs.length; i++) {
      const input = emailInputs[i];
      const id = await input.getAttribute('id');
      const name = await input.getAttribute('name');
      const type = await input.getAttribute('type');
      const placeholder = await input.getAttribute('placeholder');
      logger.info(`  Email input ${i + 1}: id="${id}", name="${name}", type="${type}", placeholder="${placeholder}"`);
    }

    // Password input
    const passwordInputs = await page.locator('input[type="password"]').all();
    logger.info(`Found ${passwordInputs.length} password input(s)`);
    for (let i = 0; i < passwordInputs.length; i++) {
      const input = passwordInputs[i];
      const id = await input.getAttribute('id');
      const name = await input.getAttribute('name');
      logger.info(`  Password input ${i + 1}: id="${id}", name="${name}"`);
    }

    // Submit button
    const submitButtons = await page.locator('button[type="submit"], input[type="submit"]').all();
    logger.info(`Found ${submitButtons.length} submit button(s)`);
    for (let i = 0; i < submitButtons.length; i++) {
      const button = submitButtons[i];
      const id = await button.getAttribute('id');
      const className = await button.getAttribute('class');
      const text = await button.textContent();
      logger.info(`  Submit button ${i + 1}: id="${id}", class="${className}", text="${text?.trim()}"`);
    }

    // All buttons
    const allButtons = await page.locator('button').all();
    logger.info(`Found ${allButtons.length} total button(s)`);

    logger.info('\n=== END ANALYSIS ===\n');

    // Keep browser open for manual inspection
    logger.info('Keeping browser open for 60 seconds for manual inspection...');
    logger.info('You can manually inspect the page and elements in the browser.');
    await page.waitForTimeout(60000);

  } catch (error) {
    logger.error('Error during discovery:', error);
    throw error;
  } finally {
    await session.close();
    logger.info('Browser closed');
  }
}

discoverSelectors().catch(console.error);
