#!/usr/bin/env npx ts-node
/**
 * Script to grab the raw HTML of an order detail page for analysis.
 * Compares the actual displayed item count with what we have in our JSON.
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';
import { createLogger } from '../dist/utils/logger.js';
import { attachPopupObserver, detachPopupObserver } from '../dist/utils/auto-popup-dismisser.js';
import { LoginTool } from '../dist/tools/login.js';

const logger = createLogger('grab-order-html');
const loginTool = new LoginTool();

// Order to check (one with +3 difference: HTML 29, JSON 32)
const ORDER_ID = 'e0951a1f-bd38-4c45-9f56-5c8a7dc15c54'; // Order 002853812 (HTML: 35, JSON: 37)
const ORDER_URL = `https://www.auchan.pt/pt/detalhes-encomenda?orderID=${ORDER_ID}`;

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  });
  const page = await context.newPage();

  try {
    // Attach popup observer (pass logger)
    await attachPopupObserver(page, logger);
    logger.info('Popup observer attached');

    // Login first
    const username = process.env.AUCHAN_EMAIL!;
    const password = process.env.AUCHAN_PASSWORD!;

    if (!username || !password) {
      throw new Error('Missing AUCHAN_EMAIL or AUCHAN_PASSWORD env vars');
    }

    logger.info('Logging in...');
    const loginResult = await loginTool.execute(
      { username, password },
      {
        page,
        logger,
        screenshot: async (name: string) => `screenshots/${name}.png`,
        config: { navigationTimeout: 30000, actionTimeout: 10000, retryCount: 3 },
      }
    );

    if (!loginResult.success) {
      throw new Error(`Login failed: ${loginResult.error?.message}`);
    }
    logger.info('Login successful');

    // Navigate to order detail page
    logger.info(`Navigating to order: ${ORDER_URL}`);
    await page.goto(ORDER_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Click "Ver todos" if present
    const viewAllBtn = page.locator("button:has-text('Ver todos')");
    if (await viewAllBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      logger.info('Clicking "Ver todos" to expand all products');
      await viewAllBtn.click();
      await page.waitForTimeout(2000);
    }

    // Count product cards
    const productCards = await page.locator('.auc-orders__product-card').all();
    logger.info(`Found ${productCards.length} product cards on page`);

    // Extract the product count from header
    const productCountEl = await page.locator('.auc-orders__order-products').textContent();
    logger.info(`Header product count: ${productCountEl}`);

    // Get all product names from page
    const productNames: string[] = [];
    for (const card of productCards) {
      const nameEl = card.locator('.auc-orders__product-name a');
      const name = await nameEl.textContent().catch(() => null);
      if (name) {
        productNames.push(name.trim().toLowerCase());
      }
    }

    console.log('\n=== COMPARISON ===');
    console.log(`Order: ${ORDER_ID.slice(0, 8)}...`);
    console.log(`Header says: ${productCountEl}`);
    console.log(`Product cards found: ${productCards.length}`);
    console.log('\nProducts on page:');
    productNames.forEach((name, i) => {
      console.log(`  ${i + 1}. ${name.slice(0, 70)}${name.length > 70 ? '...' : ''}`);
    });

    // Save HTML for analysis
    const html = await page.content();
    const htmlPath = path.resolve('data/artifacts/order-html-sample.html');
    fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
    fs.writeFileSync(htmlPath, html);
    logger.info(`Saved HTML to ${htmlPath}`);

    // Pause to inspect
    logger.info('Pausing for 30 seconds to inspect...');
    await page.waitForTimeout(30000);

  } finally {
    await detachPopupObserver(page);
    await browser.close();
  }
}

main().catch(console.error);
