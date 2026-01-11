/**
 * Capture Order Detail Page
 *
 * Navigates to order history, clicks first order, captures detail page
 */

import 'dotenv/config';
import { chromium, type Browser, type Page } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

const SCREENSHOTS_DIR = 'C:\\Users\\rcoelho\\Desktop\\ai-shopping-copilot\\screenshots';
const SNAPSHOTS_DIR = 'C:\\Users\\rcoelho\\Desktop\\ai-shopping-copilot\\data\\selectors\\pages';

async function login(page: Page): Promise<void> {
  const email = process.env.AUCHAN_EMAIL!;
  const password = process.env.AUCHAN_PASSWORD!;

  console.log('🔐 Logging in...');
  await page.goto('https://www.auchan.pt', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const cookieButton = page.locator('#onetrust-accept-btn-handler').first();
  if (await cookieButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await cookieButton.click();
    await page.waitForTimeout(500);
  }

  const dismissButton = page.locator('#onesignal-slidedown-cancel-button').first();
  if (await dismissButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await dismissButton.click();
    await page.waitForTimeout(500);
  }

  const loggedIn = await page.locator('.auc-header-account span:not(:has-text("Login"))').first().isVisible({ timeout: 2000 }).catch(() => false);
  if (loggedIn) {
    console.log('✅ Already logged in');
    return;
  }

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
  console.log('✅ Logged in');
}

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 100 });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await login(page);

    // Navigate to order history
    console.log('\n📋 Going to order history...');
    const accountBtn = page.locator('text=OLÁ').first();
    await accountBtn.click();
    await page.waitForTimeout(1500);

    const orderHistoryLink = page.locator('text=Histórico de encomendas').first();
    await orderHistoryLink.click();
    await page.waitForTimeout(3000);
    console.log(`📍 Order history: ${page.url()}`);

    // Click first order using the selector we discovered
    console.log('\n🖱️  Clicking first order...');
    const firstOrder = page.locator('.auc-orders__order-card').first();
    await firstOrder.click();
    await page.waitForTimeout(3000);

    console.log(`📍 Order detail URL: ${page.url()}`);

    // Take screenshot
    await mkdir(SCREENSHOTS_DIR, { recursive: true });
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'order-detail-page.png'),
      fullPage: true,
    });
    console.log('📸 Screenshot captured');

    // Save HTML
    const html = await page.content();
    const snapshotDir = join(SNAPSHOTS_DIR, 'order-detail', 'snapshots');
    await mkdir(snapshotDir, { recursive: true });
    await writeFile(join(snapshotDir, 'order-detail.html'), html, 'utf-8');
    console.log('💾 HTML saved');

    // Analyze structure
    const analysis = await page.evaluate(() => {
      // Find containers with multiple items
      const containerCandidates = [
        '.order-items',
        '.product-list',
        '[data-testid*="items"]',
        '[class*="item"]',
        'ul',
        'tbody',
      ];

      const foundContainers: any[] = [];
      for (const selector of containerCandidates) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          foundContainers.push({
            selector,
            count: elements.length,
            hasChildren: elements[0]?.children.length || 0,
          });
        }
      }

      // Look for item-like elements
      const itemCandidates = [
        '.item',
        '.product',
        '.order-item',
        '[class*="product"]',
        '[class*="item"]',
        'li',
        'tr',
        'article',
      ];

      const foundItems: any[] = [];
      for (const selector of itemCandidates) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 1 && elements.length < 200) {
          foundItems.push({
            selector,
            count: elements.length,
          });
        }
      }

      return {
        title: document.title,
        url: window.location.href,
        possibleContainers: foundContainers.slice(0, 10),
        possibleItems: foundItems.slice(0, 10),
      };
    });

    console.log('\n📊 Order detail analysis:');
    console.log('   Title:', analysis.title);
    console.log('   URL:', analysis.url);
    console.log('   Possible containers:', analysis.possibleContainers);
    console.log('   Possible items:', analysis.possibleItems);

    await writeFile(
      join(SNAPSHOTS_DIR, 'order-detail', 'analysis.json'),
      JSON.stringify(analysis, null, 2),
      'utf-8'
    );

    console.log('\n✅ Capture complete!');
    console.log('   Browser stays open for review');
    await new Promise(() => {});
  } catch (error) {
    console.error('\n❌ Error:', error);
    await new Promise(() => {});
  }
}

main();
