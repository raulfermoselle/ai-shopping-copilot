/**
 * Exploratory Script: Manual Order History Discovery
 *
 * This script:
 * 1. Logs in
 * 2. Takes screenshot of logged-in homepage
 * 3. Dumps page structure (all links, menus, navigation)
 * 4. Waits for manual exploration
 */

import 'dotenv/config';
import { chromium, type Browser, type Page } from 'playwright';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const SCREENSHOTS_DIR = 'C:\\Users\\rcoelho\\Desktop\\ai-shopping-copilot\\screenshots';
const EXPLORATION_DIR = 'C:\\Users\\rcoelho\\Desktop\\ai-shopping-copilot\\data\\exploration';

/**
 * Login to Auchan.pt
 */
async function login(page: Page): Promise<void> {
  const email = process.env.AUCHAN_EMAIL;
  const password = process.env.AUCHAN_PASSWORD;

  if (!email || !password) {
    throw new Error('Missing AUCHAN_EMAIL or AUCHAN_PASSWORD in .env');
  }

  console.log('🔐 Logging in to Auchan.pt...');

  // Navigate to homepage
  await page.goto('https://www.auchan.pt', { waitUntil: 'networkidle' });

  // Handle cookie consent
  const cookieButton = page.locator(
    '[data-testid="cookie-accept"], .cookie-accept, #onetrust-accept-btn-handler'
  ).first();
  if (await cookieButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await cookieButton.click();
    await page.waitForTimeout(500);
  }

  // Dismiss popups
  const dismissButton = page.locator(
    '#onesignal-slidedown-cancel-button, button:has-text("Não"), button:has-text("Fechar")'
  ).first();
  if (await dismissButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await dismissButton.click();
    await page.waitForTimeout(500);
  }

  // Check if already logged in
  const loggedIn = await page
    .locator('.auc-header-account span:not(:has-text("Login")), [data-testid="user-menu"]')
    .first()
    .isVisible({ timeout: 2000 })
    .catch(() => false);

  if (loggedIn) {
    console.log('✅ Already logged in');
    return;
  }

  // Navigate to login
  const accountButton = page
    .locator('.auc-header-account a[href*="Login-OAuthLogin"], .auc-header-account a:has-text("Login")')
    .first();
  if (await accountButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await accountButton.click();
    await page.waitForTimeout(500);
  }

  const loginLink = page.locator('a[href*="Login-OAuthLogin"]').first();
  if (await loginLink.isVisible({ timeout: 2000 }).catch(() => false)) {
    await loginLink.click();
  }

  // Wait for login form
  await page.waitForSelector(
    '#uname1, input[type="email"], input[name="uname1"]',
    { timeout: 10000 }
  );

  // Fill login form
  await page.fill('#uname1, input[type="email"], input[name="uname1"]', email);
  await page.fill('#pwd1, input[type="password"]', password);
  await page.click('#btnSubmit_login, input[type="button"][value*="Aceda"]');

  // Wait for redirect back to Auchan
  await page.waitForURL(/auchan\.pt/, { timeout: 15000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

  console.log('✅ Logged in successfully');
}

/**
 * Extract all navigation links from the page
 */
async function extractNavigation(page: Page): Promise<void> {
  console.log('\n📋 Extracting navigation structure...');

  // Get all links with text
  const links = await page.evaluate(() => {
    const allLinks = Array.from(document.querySelectorAll('a'));
    return allLinks
      .filter(a => a.href && a.textContent?.trim())
      .map(a => ({
        text: a.textContent?.trim() || '',
        href: a.href,
        selector: a.className ? `.${a.className.split(' ')[0]}` : a.tagName,
        hasText: a.textContent?.trim() || '',
      }))
      .slice(0, 100); // Limit to first 100 links
  });

  console.log(`Found ${links.length} navigation links:`);
  links.forEach((link, i) => {
    if (
      link.text.toLowerCase().includes('encomenda') ||
      link.text.toLowerCase().includes('pedido') ||
      link.text.toLowerCase().includes('histor') ||
      link.text.toLowerCase().includes('conta') ||
      link.text.toLowerCase().includes('perfil')
    ) {
      console.log(`  [${i}] "${link.text}" → ${link.href}`);
    }
  });

  // Save full navigation dump
  await mkdir(EXPLORATION_DIR, { recursive: true });
  await writeFile(
    join(EXPLORATION_DIR, 'navigation-links.json'),
    JSON.stringify(links, null, 2),
    'utf-8'
  );
  console.log(`\n💾 Saved navigation dump to: ${join(EXPLORATION_DIR, 'navigation-links.json')}`);
}

/**
 * Extract all buttons with text
 */
async function extractButtons(page: Page): Promise<void> {
  console.log('\n🔘 Extracting buttons...');

  const buttons = await page.evaluate(() => {
    const allButtons = Array.from(document.querySelectorAll('button'));
    return allButtons
      .filter(b => b.textContent?.trim())
      .map(b => ({
        text: b.textContent?.trim() || '',
        className: b.className,
        id: b.id,
      }))
      .slice(0, 50);
  });

  console.log(`Found ${buttons.length} buttons:`);
  buttons.forEach((btn, i) => {
    if (
      btn.text.toLowerCase().includes('encomenda') ||
      btn.text.toLowerCase().includes('pedido') ||
      btn.text.toLowerCase().includes('histor') ||
      btn.text.toLowerCase().includes('conta')
    ) {
      console.log(`  [${i}] "${btn.text}"`);
    }
  });

  await writeFile(
    join(EXPLORATION_DIR, 'buttons.json'),
    JSON.stringify(buttons, null, 2),
    'utf-8'
  );
}

/**
 * Main exploration flow
 */
async function main() {
  let browser: Browser | null = null;

  try {
    // Launch browser
    console.log('🚀 Launching browser...');
    browser = await chromium.launch({
      headless: false,
      slowMo: 100,
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });

    const page = await context.newPage();

    // Step 1: Login
    await login(page);

    // Step 2: Take screenshot
    await mkdir(SCREENSHOTS_DIR, { recursive: true });
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'logged-in-homepage.png'),
      fullPage: true,
    });
    console.log(`\n📸 Screenshot saved: ${join(SCREENSHOTS_DIR, 'logged-in-homepage.png')}`);

    // Step 3: Extract navigation
    await extractNavigation(page);
    await extractButtons(page);

    // Step 4: Save HTML
    const html = await page.content();
    await writeFile(
      join(EXPLORATION_DIR, 'logged-in-homepage.html'),
      html,
      'utf-8'
    );
    console.log(`💾 HTML saved: ${join(EXPLORATION_DIR, 'logged-in-homepage.html')}`);

    console.log('\n📋 Page URL:', page.url());
    console.log('\n✅ Exploration complete!');
    console.log('\n🔍 Manual exploration mode:');
    console.log('   - Browser will stay open');
    console.log('   - Navigate to order history manually');
    console.log('   - Observe URL, page structure, selectors');
    console.log('   - Press Ctrl+C when done\n');

    // Wait indefinitely
    await new Promise(() => {});
  } catch (error) {
    console.error('\n❌ Exploration failed:', error);
    throw error;
  }
}

main().catch(console.error);
