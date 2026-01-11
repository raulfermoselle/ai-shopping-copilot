/**
 * Discover Cart Page Selectors
 *
 * Navigates to the cart page and captures selectors for the Selector Registry.
 */

import 'dotenv/config';
import { chromium, type Browser, type Page } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

const SCREENSHOTS_DIR = 'C:\\Users\\rcoelho\\Desktop\\ai-shopping-copilot\\screenshots';
const SNAPSHOTS_DIR = 'C:\\Users\\rcoelho\\Desktop\\ai-shopping-copilot\\data\\selectors\\pages\\cart';

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
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: false, slowMo: 100 });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    await login(page);

    // Navigate to cart
    console.log('\n🛒 Navigating to cart...');
    await page.goto('https://www.auchan.pt/pt/cart', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    console.log(`📍 Cart URL: ${page.url()}`);

    // Take screenshot
    await mkdir(SCREENSHOTS_DIR, { recursive: true });
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'cart-page.png'),
      fullPage: true,
    });
    console.log('📸 Screenshot captured');

    // Save HTML
    const html = await page.content();
    const snapshotDir = join(SNAPSHOTS_DIR, 'snapshots');
    await mkdir(snapshotDir, { recursive: true });
    await writeFile(join(snapshotDir, 'cart.html'), html, 'utf-8');
    console.log('💾 HTML saved');

    // Analyze structure
    const analysis = await page.evaluate(() => {
      // Check if cart is empty
      const emptyIndicators = [
        '.auc-cart--empty',
        '.cart--empty',
        '.empty-cart',
        '[class*="empty"]',
      ];

      const foundEmptyIndicators = emptyIndicators
        .map(selector => {
          const el = document.querySelector(selector);
          return el ? { selector, text: el.textContent?.trim() } : null;
        })
        .filter(Boolean);

      // Find cart container
      const containerCandidates = [
        '.auc-cart',
        '.cart',
        '.shopping-cart',
        '[class*="cart"]',
        'main',
      ];

      const foundContainers = containerCandidates
        .map(selector => {
          const el = document.querySelector(selector);
          return el ? { selector, found: true, childCount: el.children.length } : null;
        })
        .filter(Boolean);

      // Find cart items
      const itemCandidates = [
        '.auc-cart__product',
        '.cart-item',
        '.product-item',
        '[class*="cart-item"]',
        '[class*="product"]',
      ];

      const foundItems = itemCandidates
        .map(selector => {
          const elements = document.querySelectorAll(selector);
          return elements.length > 0 ? { selector, count: elements.length } : null;
        })
        .filter(Boolean);

      // Find price elements
      const priceCandidates = [
        '.auc-cart__total',
        '.cart-total',
        '.total-price',
        '[class*="total"]',
        '[class*="subtotal"]',
      ];

      const foundPrices = priceCandidates
        .map(selector => {
          const el = document.querySelector(selector);
          return el ? { selector, text: el.textContent?.trim() } : null;
        })
        .filter(Boolean);

      // Find quantity inputs
      const quantityInputs = document.querySelectorAll('input[type="number"]');
      const qtySelectors = Array.from(quantityInputs).slice(0, 3).map(input => ({
        tag: input.tagName,
        type: input.getAttribute('type'),
        class: input.getAttribute('class'),
        name: input.getAttribute('name'),
        value: input.getAttribute('value'),
      }));

      // Find product names
      const nameCandidates = [
        '.auc-cart__product-name',
        '.product-name',
        '.item-name',
        'a[href*="/produtos/"]',
      ];

      const foundNames = nameCandidates
        .map(selector => {
          const elements = document.querySelectorAll(selector);
          return elements.length > 0 ? {
            selector,
            count: elements.length,
            sample: elements[0]?.textContent?.trim(),
          } : null;
        })
        .filter(Boolean);

      return {
        title: document.title,
        url: window.location.href,
        emptyIndicators: foundEmptyIndicators,
        containers: foundContainers,
        items: foundItems,
        prices: foundPrices,
        quantityInputs: qtySelectors,
        productNames: foundNames,
      };
    });

    console.log('\n📊 Cart page analysis:');
    console.log(JSON.stringify(analysis, null, 2));

    await writeFile(
      join(SNAPSHOTS_DIR, 'analysis.json'),
      JSON.stringify(analysis, null, 2),
      'utf-8'
    );

    console.log('\n✅ Discovery complete!');
    console.log('   Review screenshot and HTML in:', SNAPSHOTS_DIR);

  } catch (error) {
    console.error('\n❌ Error:', error);
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed.');
    }
  }
}

main();
