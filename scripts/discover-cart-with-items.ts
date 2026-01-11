/**
 * Discover Cart Page Selectors (With Items)
 *
 * Adds items to cart then captures selectors for the Selector Registry.
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

async function addItemsFromLastOrder(page: Page): Promise<void> {
  console.log('\n📦 Adding items from last order...');

  // Go to order history
  const accountBtn = page.locator('text=OLÁ').first();
  await accountBtn.click();
  await page.waitForTimeout(1500);

  const orderHistoryLink = page.locator('text=Histórico de encomendas').first();
  await orderHistoryLink.click();
  await page.waitForTimeout(3000);
  console.log('📍 Order history loaded');

  // Click first order
  const firstOrder = page.locator('.auc-orders__order-card').first();
  await firstOrder.click();
  await page.waitForTimeout(3000);
  console.log('📍 Order detail loaded');

  // Click "Encomendar de novo"
  const reorderButton = page.locator('text=Encomendar de novo').first();
  if (await reorderButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    await reorderButton.click();
    console.log('🔄 Reorder button clicked');
    await page.waitForTimeout(5000);
  } else {
    console.log('⚠️ Reorder button not found, cart will be empty');
  }
}

async function main() {
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: false, slowMo: 100 });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    await login(page);
    await addItemsFromLastOrder(page);

    // Navigate to cart
    console.log('\n🛒 Navigating to cart...');
    await page.goto('https://www.auchan.pt/pt/carrinho-compras', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    console.log(`📍 Cart URL: ${page.url()}`);

    // Take screenshot
    await mkdir(SCREENSHOTS_DIR, { recursive: true });
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'cart-with-items.png'),
      fullPage: true,
    });
    console.log('📸 Screenshot captured');

    // Save HTML
    const html = await page.content();
    const snapshotDir = join(SNAPSHOTS_DIR, 'snapshots');
    await mkdir(snapshotDir, { recursive: true });
    await writeFile(join(snapshotDir, 'cart-with-items.html'), html, 'utf-8');
    console.log('💾 HTML saved');

    // Detailed analysis
    const analysis = await page.evaluate(() => {
      // Check if cart is empty
      const emptyIndicator = document.querySelector('.auc-cart--empty');
      if (emptyIndicator) {
        return { isEmpty: true, message: 'Cart is empty' };
      }

      // Find cart item containers
      const itemCandidates = [
        '.auc-cart__product',
        '.auc-product-card',
        '.product-card',
        '.cart-item',
        '[class*="cart"]  [class*="product"]',
      ];

      const items: any[] = [];
      for (const selector of itemCandidates) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          items.push({
            selector,
            count: elements.length,
            sample: elements[0]?.outerHTML.substring(0, 500),
          });
        }
      }

      // Find all unique classes in cart items
      const cartElement = document.querySelector('.cart, [class*="cart"]');
      const allClasses = new Set<string>();
      if (cartElement) {
        const elements = cartElement.querySelectorAll('*');
        elements.forEach(el => {
          el.classList.forEach(cls => {
            if (cls.includes('cart') || cls.includes('product') || cls.includes('item')) {
              allClasses.add(cls);
            }
          });
        });
      }

      // Find product names
      const nameSelectors = [
        '.auc-product__name',
        '.product-name',
        '.auc-cart__product-name',
        'a[href*="/produtos/"]',
      ];

      const names: any[] = [];
      for (const selector of nameSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          names.push({
            selector,
            count: elements.length,
            samples: Array.from(elements).slice(0, 3).map(el => el.textContent?.trim()),
          });
        }
      }

      // Find quantity inputs
      const qtyInputs = document.querySelectorAll('input[type="number"]');
      const quantities = Array.from(qtyInputs).map(input => ({
        selector: input.className ? `.${input.className.split(' ')[0]}` : 'input[type="number"]',
        name: input.getAttribute('name'),
        value: input.getAttribute('value'),
        min: input.getAttribute('min'),
        max: input.getAttribute('max'),
      }));

      // Find prices
      const priceSelectors = [
        '.auc-product__price',
        '.product-price',
        '.price',
        '[class*="price"]',
      ];

      const prices: any[] = [];
      for (const selector of priceSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          prices.push({
            selector,
            count: elements.length,
            samples: Array.from(elements).slice(0, 3).map(el => el.textContent?.trim()),
          });
        }
      }

      // Find cart totals
      const totalSelectors = [
        '.auc-cart__total',
        '.cart-total',
        '.auc-cart__subtotal',
        '[class*="total"]',
        '[class*="subtotal"]',
      ];

      const totals: any[] = [];
      for (const selector of totalSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          totals.push({
            selector,
            count: elements.length,
            samples: Array.from(elements).slice(0, 3).map(el => ({
              text: el.textContent?.trim(),
              html: el.innerHTML.substring(0, 200),
            })),
          });
        }
      }

      return {
        isEmpty: false,
        title: document.title,
        url: window.location.href,
        relevantClasses: Array.from(allClasses),
        itemCandidates: items,
        nameCandidates: names,
        quantityCandidates: quantities,
        priceCandidates: prices,
        totalCandidates: totals,
      };
    });

    console.log('\n📊 Cart page analysis:');
    console.log(JSON.stringify(analysis, null, 2));

    await writeFile(
      join(SNAPSHOTS_DIR, 'analysis-with-items.json'),
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
