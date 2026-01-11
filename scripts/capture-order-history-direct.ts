/**
 * Direct Order History Capture
 *
 * Based on screenshot analysis, we know:
 * - Account menu opens a sidebar on the right
 * - Contains "Histórico de encomendas" link
 * - This script will click it and capture the pages
 */

import 'dotenv/config';
import { chromium, type Browser, type Page } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

const SCREENSHOTS_DIR = 'C:\\Users\\rcoelho\\Desktop\\ai-shopping-copilot\\screenshots';
const SNAPSHOTS_DIR = 'C:\\Users\\rcoelho\\Desktop\\ai-shopping-copilot\\data\\selectors\\pages';

/**
 * Login to Auchan.pt
 */
async function login(page: Page): Promise<void> {
  const email = process.env.AUCHAN_EMAIL;
  const password = process.env.AUCHAN_PASSWORD;

  if (!email || !password) {
    throw new Error('Missing AUCHAN_EMAIL or AUCHAN_PASSWORD in .env');
  }

  console.log('🔐 Logging in...');

  await page.goto('https://www.auchan.pt', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Handle cookie consent
  const cookieButton = page.locator('#onetrust-accept-btn-handler').first();
  if (await cookieButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await cookieButton.click();
    await page.waitForTimeout(500);
  }

  // Dismiss popups
  const dismissButton = page.locator('#onesignal-slidedown-cancel-button').first();
  if (await dismissButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await dismissButton.click();
    await page.waitForTimeout(500);
  }

  // Check if already logged in
  const loggedIn = await page
    .locator('.auc-header-account span:not(:has-text("Login"))')
    .first()
    .isVisible({ timeout: 2000 })
    .catch(() => false);

  if (loggedIn) {
    console.log('✅ Already logged in');
    return;
  }

  // Navigate to login
  const accountButton = page.locator('.auc-header-account a').first();
  if (await accountButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await accountButton.click();
    await page.waitForTimeout(500);
  }

  await page.waitForSelector('#uname1', { timeout: 10000 });
  await page.fill('#uname1', email);
  await page.fill('#pwd1', password);
  await page.click('#btnSubmit_login');
  await page.waitForURL(/auchan\.pt/, { timeout: 15000 });
  await page.waitForTimeout(3000);

  console.log('✅ Logged in successfully');
}

/**
 * Navigate to order history
 */
async function navigateToOrderHistory(page: Page): Promise<void> {
  console.log('\n📋 Navigating to order history...');

  // Click account button to open sidebar
  console.log('🖱️  Clicking account button...');
  const accountBtn = page.locator('text=OLÁ').first();
  await accountBtn.click();
  await page.waitForTimeout(1500);

  // Screenshot of sidebar
  await mkdir(SCREENSHOTS_DIR, { recursive: true });
  await page.screenshot({
    path: join(SCREENSHOTS_DIR, 'account-sidebar.png'),
    fullPage: false,
  });
  console.log('📸 Captured account sidebar');

  // Click "Histórico de encomendas"
  console.log('🖱️  Clicking "Histórico de encomendas"...');
  const orderHistoryLink = page.locator('text=Histórico de encomendas').first();
  await orderHistoryLink.click();
  await page.waitForTimeout(3000);

  console.log(`📍 Order history URL: ${page.url()}`);

  // Take screenshot
  await page.screenshot({
    path: join(SCREENSHOTS_DIR, 'order-history-list.png'),
    fullPage: true,
  });
  console.log('📸 Captured order history list');

  // Save HTML
  const html = await page.content();
  const snapshotDir = join(SNAPSHOTS_DIR, 'order-history', 'snapshots');
  await mkdir(snapshotDir, { recursive: true });
  await writeFile(join(snapshotDir, 'order-list.html'), html, 'utf-8');
  console.log(`💾 Saved HTML snapshot`);
}

/**
 * Analyze order list page structure
 */
async function analyzeOrderList(page: Page): Promise<void> {
  console.log('\n🔍 Analyzing order list structure...');

  const analysis = await page.evaluate(() => {
    // Look for order containers
    const possibleContainers = [
      '.order',
      '.order-item',
      '.order-card',
      '[data-testid*="order"]',
      'article',
      '.pedido',
      '.encomenda',
    ];

    const foundContainers: any[] = [];
    for (const selector of possibleContainers) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0 && elements.length < 50) {
        foundContainers.push({
          selector,
          count: elements.length,
          sampleHTML: elements[0]?.outerHTML.substring(0, 200),
        });
      }
    }

    // Get all links on page
    const links = Array.from(document.querySelectorAll('a'))
      .filter(a => a.offsetParent !== null && a.textContent?.trim())
      .map(a => ({
        text: a.textContent?.trim(),
        href: a.href,
        className: a.className,
      }))
      .slice(0, 20);

    return {
      title: document.title,
      url: window.location.href,
      possibleOrderContainers: foundContainers,
      sampleLinks: links,
    };
  });

  console.log('📊 Analysis results:');
  console.log('   Title:', analysis.title);
  console.log('   URL:', analysis.url);
  console.log('   Possible order containers:', analysis.possibleOrderContainers);
  console.log('   Sample links:', analysis.sampleLinks.slice(0, 5));

  // Save analysis
  await mkdir(join(SNAPSHOTS_DIR, 'order-history'), { recursive: true });
  await writeFile(
    join(SNAPSHOTS_DIR, 'order-history', 'analysis.json'),
    JSON.stringify(analysis, null, 2),
    'utf-8'
  );
}

/**
 * Navigate to first order detail
 */
async function navigateToOrderDetail(page: Page): Promise<void> {
  console.log('\n🔍 Looking for first order detail...');

  // Try various selector patterns
  const detailSelectors = [
    'a:has-text("Ver detalhes")',
    'a:has-text("Ver")',
    'a:has-text("Detalhes")',
    '.order a',
    '[data-testid*="order"] a',
    'article a',
  ];

  for (const selector of detailSelectors) {
    const link = page.locator(selector).first();
    if (await link.isVisible({ timeout: 1000 }).catch(() => false)) {
      const text = await link.textContent();
      console.log(`✅ Found link: "${text?.trim()}" using ${selector}`);

      await link.click();
      await page.waitForTimeout(3000);

      console.log(`📍 Order detail URL: ${page.url()}`);

      // Screenshot
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, 'order-detail.png'),
        fullPage: true,
      });
      console.log('📸 Captured order detail page');

      // Save HTML
      const html = await page.content();
      const snapshotDir = join(SNAPSHOTS_DIR, 'order-detail', 'snapshots');
      await mkdir(snapshotDir, { recursive: true });
      await writeFile(join(snapshotDir, 'order-detail.html'), html, 'utf-8');
      console.log('💾 Saved order detail HTML');

      // Analyze
      await analyzeOrderDetail(page);
      return;
    }
  }

  console.log('⚠️  No order detail link found');
}

/**
 * Analyze order detail page
 */
async function analyzeOrderDetail(page: Page): Promise<void> {
  console.log('\n🔍 Analyzing order detail structure...');

  const analysis = await page.evaluate(() => {
    // Look for item containers
    const possibleItemContainers = [
      '.item',
      '.product',
      '.order-item',
      '[data-testid*="item"]',
      '[data-testid*="product"]',
      'li',
      'article',
    ];

    const foundContainers: any[] = [];
    for (const selector of possibleItemContainers) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0 && elements.length < 100) {
        foundContainers.push({
          selector,
          count: elements.length,
        });
      }
    }

    return {
      title: document.title,
      url: window.location.href,
      possibleItemContainers: foundContainers,
    };
  });

  console.log('📊 Order detail analysis:');
  console.log('   Title:', analysis.title);
  console.log('   Possible item containers:', analysis.possibleItemContainers);

  await mkdir(join(SNAPSHOTS_DIR, 'order-detail'), { recursive: true });
  await writeFile(
    join(SNAPSHOTS_DIR, 'order-detail', 'analysis.json'),
    JSON.stringify(analysis, null, 2),
    'utf-8'
  );
}

/**
 * Main flow
 */
async function main() {
  let browser: Browser | null = null;

  try {
    console.log('🚀 Launching browser...');
    browser = await chromium.launch({
      headless: false,
      slowMo: 100,
    });

    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });

    const page = await context.newPage();

    await login(page);
    await navigateToOrderHistory(page);
    await analyzeOrderList(page);
    await navigateToOrderDetail(page);

    console.log('\n✅ Capture complete!');
    console.log('\n📂 Review:');
    console.log(`   Screenshots: ${SCREENSHOTS_DIR}`);
    console.log(`   Snapshots: ${SNAPSHOTS_DIR}`);

    console.log('\n🔍 Browser stays open for manual review');
    console.log('   Press Ctrl+C when done\n');

    await new Promise(() => {});
  } catch (error) {
    console.error('\n❌ Failed:', error);
    await new Promise(() => {});
  }
}

main().catch(console.error);
