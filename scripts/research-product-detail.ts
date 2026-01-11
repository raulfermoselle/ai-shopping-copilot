/**
 * Research Product Detail Page
 */

import { chromium, type Browser } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const OUTPUT_DIR = 'C:\\Users\\rcoelho\\Desktop\\ai-shopping-copilot\\data\\selectors\\pages\\product-detail';
const SCREENSHOTS_DIR = path.join(OUTPUT_DIR, 'screenshots');

async function ensureDirectories() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await mkdir(SCREENSHOTS_DIR, { recursive: true });
}

async function capturePageState(page: any, label: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotPath = path.join(SCREENSHOTS_DIR, `${label}_${timestamp}.png`);
  const htmlPath = path.join(OUTPUT_DIR, `${label}_${timestamp}.html`);

  await page.screenshot({ path: screenshotPath, fullPage: true });
  const html = await page.content();
  await writeFile(htmlPath, html, 'utf-8');

  console.log(`Captured: ${label}`);
  console.log(`  Screenshot: ${screenshotPath}`);
  console.log(`  HTML: ${htmlPath}`);

  return { screenshotPath, htmlPath };
}

async function dismissCookieConsent(page: any) {
  console.log('Checking for cookie consent...');

  try {
    const button = page.locator('button:has-text("Aceitar")').first();
    if (await button.isVisible({ timeout: 2000 })) {
      await button.click();
      console.log('Dismissed cookie consent');
      await page.waitForTimeout(1000);
    }
  } catch {
    // No consent popup
  }
}

async function main() {
  let browser: Browser | null = null;

  try {
    await ensureDirectories();

    browser = await chromium.launch({
      headless: false,
      slowMo: 200,
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });

    const page = await context.newPage();

    // Navigate to search first to get a product link
    console.log('Navigating to search...');
    await page.goto('https://www.auchan.pt/pt/pesquisa?q=leite', {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });
    await page.waitForTimeout(2000);

    await dismissCookieConsent(page);

    // Click first product tile
    console.log('Finding first product...');
    const firstProduct = page.locator('.auc-product-tile').first();
    const productName = await firstProduct.locator('.auc-product-tile__name').textContent();
    console.log(`Product: ${productName?.trim()}`);

    // Get the product link - click the image or name
    const productLink = firstProduct.locator('.auc-product-tile__image-container a, .auc-product-tile__name a').first();
    await productLink.click();

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    console.log(`\n=== PRODUCT DETAIL PAGE ===\n`);
    console.log(`URL: ${page.url()}`);

    await capturePageState(page, 'product-detail-1');

    // Analyze product detail page
    console.log('\n--- Product Information ---');

    // Product title
    const titleSelectors = [
      '.product-name',
      '.auc-product-name',
      'h1.product-title',
      'h1',
    ];

    for (const selector of titleSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        const text = await page.locator(selector).first().textContent();
        console.log(`${selector}: "${text?.trim().substring(0, 80)}"`);
      }
    }

    // Price
    console.log('\n--- Price Information ---');
    const priceSelectors = [
      '.price',
      '.auc-price',
      '[class*="price"]',
    ];

    for (const selector of priceSelectors.slice(0, 1)) {
      const count = await page.locator(selector).count();
      console.log(`${selector}: ${count} elements`);
      if (count > 0) {
        const text = await page.locator(selector).first().textContent();
        console.log(`  Text: "${text?.trim()}"`);
      }
    }

    // Add to cart
    console.log('\n--- Add to Cart ---');
    const addToCartSelectors = [
      'button:has-text("Adicionar")',
      'button:has-text("carrinho")',
      '.add-to-cart',
      '[data-action="add-to-cart"]',
      'button[class*="add-to-cart"]',
    ];

    for (const selector of addToCartSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        console.log(`${selector}: ${count} elements`);
        const button = page.locator(selector).first();
        const text = await button.textContent().catch(() => 'N/A');
        const classes = await button.getAttribute('class').catch(() => 'N/A');
        const disabled = await button.isDisabled().catch(() => false);
        console.log(`  Text: "${text?.trim()}"`);
        console.log(`  Classes: ${classes}`);
        console.log(`  Disabled: ${disabled}`);
        break;
      }
    }

    // Availability
    console.log('\n--- Availability ---');
    const availabilitySelectors = [
      '.availability',
      '.stock-status',
      '[class*="availability"]',
      '[class*="stock"]',
      'text=/disponível/i',
      'text=/stock/i',
      'text=/esgotado/i',
    ];

    for (const selector of availabilitySelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        console.log(`${selector}: ${count} elements`);
        const text = await page.locator(selector).first().textContent().catch(() => 'N/A');
        console.log(`  Text: "${text?.trim().substring(0, 80)}"`);
      }
    }

    // Product description
    console.log('\n--- Description ---');
    const descriptionSelectors = [
      '.product-description',
      '.description',
      '[class*="description"]',
      '.product-info',
    ];

    for (const selector of descriptionSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        console.log(`${selector}: ${count} elements`);
      }
    }

    // Recommendations / Similar products
    console.log('\n--- Recommendations / Similar Products ---');
    const recSelectors = [
      '[class*="similar"]',
      '[class*="related"]',
      '[class*="recommend"]',
      '[class*="upsell"]',
      '[class*="alternative"]',
      'h2:has-text("similar")',
      'h2:has-text("relacionados")',
      'h3:has-text("também")',
    ];

    let foundRecommendations = false;
    for (const selector of recSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        console.log(`${selector}: ${count} elements`);
        const text = await page.locator(selector).first().textContent().catch(() => '');
        console.log(`  Text: "${text?.trim().substring(0, 80)}"`);
        foundRecommendations = true;
      }
    }

    if (!foundRecommendations) {
      console.log('No obvious recommendation sections found');
      console.log('Checking for section headings...');

      const headings = await page.locator('h2, h3').all();
      console.log(`Found ${headings.length} headings`);
      for (let i = 0; i < Math.min(headings.length, 10); i++) {
        const text = await headings[i].textContent();
        console.log(`  "${text?.trim()}"`);
      }
    }

    // Product images
    console.log('\n--- Product Images ---');
    const productImages = await page.locator('.product-detail img, .product-image img, [class*="product"] img[src*="image"]').all();
    console.log(`Product images found: ${Math.min(productImages.length, 5)}`);

    // Try another product - search for a different item
    console.log('\n\n=== TESTING WITH DIFFERENT PRODUCT ===\n');
    await page.goto('https://www.auchan.pt/pt/pesquisa?q=azeite', {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });
    await page.waitForTimeout(2000);

    const secondProduct = page.locator('.auc-product-tile').nth(2);
    const secondProductName = await secondProduct.locator('.auc-product-tile__name').textContent();
    console.log(`Product: ${secondProductName?.trim()}`);

    const secondProductLink = secondProduct.locator('.auc-product-tile__image-container a, .auc-product-tile__name a').first();
    await secondProductLink.click();

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    console.log(`URL: ${page.url()}`);
    await capturePageState(page, 'product-detail-2');

    console.log('\n=== RESEARCH COMPLETE ===\n');

  } catch (error) {
    console.error('Error:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed.');
    }
  }
}

main().catch(console.error);
