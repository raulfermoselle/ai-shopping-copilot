#!/usr/bin/env npx ts-node
/**
 * Automated Delivery Slot Research
 * Builds cart automatically, then navigates to delivery slots
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { chromium, type Browser, type Page } from 'playwright';
import { createLogger } from '../dist/utils/logger.js';
import { attachPopupObserver } from '../dist/utils/auto-popup-dismisser.js';
import { LoginTool } from '../dist/tools/login.js';

const SCREENSHOT_DIR = 'data/selectors/pages/delivery-slots/screenshots';
const SNAPSHOTS_DIR = 'data/selectors/pages/delivery-slots/snapshots';

const logger = createLogger('research-delivery-slots-auto');
const loginTool = new LoginTool();

function screenshotPath(name: string): string {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  return path.join(SCREENSHOT_DIR, `${name}.png`);
}

async function saveSnapshot(page: Page, name: string): Promise<void> {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  const html = await page.content();
  const snapshotFile = path.join(SNAPSHOTS_DIR, `${name}.html`);
  fs.writeFileSync(snapshotFile, html);
  logger.info(`Saved HTML snapshot: ${snapshotFile}`);
}

/**
 * Add items to cart via search to reach minimum threshold
 */
async function buildCart(page: Page, targetValue: number = 60): Promise<boolean> {
  try {
    logger.info(`Building cart to reach ~${targetValue} EUR`);

    const searchQueries = [
      { query: 'azeite', maxItems: 5 },
      { query: 'arroz', maxItems: 5 },
      { query: 'massa', maxItems: 5 },
      { query: 'conservas', maxItems: 5 },
    ];

    let itemsAdded = 0;

    for (const { query, maxItems } of searchQueries) {
      if (itemsAdded >= 15) break; // Stop after adding enough items

      logger.info(`Searching for: ${query}`);
      await page.goto(`https://www.auchan.pt/pt/pesquisa?q=${query}`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
      await page.waitForTimeout(2000);

      // Find add to cart buttons
      const addButtons = page.locator('.product-tile').locator('button:has-text("Adicionar"), button[aria-label*="Adicionar"]');
      const count = await addButtons.count();
      logger.info(`Found ${count} products`);

      const toAdd = Math.min(count, maxItems);
      for (let i = 0; i < toAdd; i++) {
        try {
          await addButtons.nth(i).click({ timeout: 3000 });
          await page.waitForTimeout(1500);
          itemsAdded++;
          logger.info(`Added item ${itemsAdded}`);
        } catch (err) {
          logger.warn(`Failed to add item ${i}`, { error: err });
        }
      }
    }

    logger.info(`Cart building complete. Added ${itemsAdded} items.`);
    return itemsAdded > 0;
  } catch (error) {
    logger.error('Failed to build cart', { error });
    return false;
  }
}

async function main() {
  let browser: Browser | null = null;

  try {
    console.log('=== Automated Delivery Slot Research ===\n');

    browser = await chromium.launch({ headless: false, slowMo: 150 });
    const context = await browser.newContext({
      viewport: { width: 1400, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });
    const page = await context.newPage();

    await attachPopupObserver(page, logger);

    // Step 1: Login
    const username = process.env.AUCHAN_EMAIL;
    const password = process.env.AUCHAN_PASSWORD;
    if (!username || !password) {
      throw new Error('Missing AUCHAN_EMAIL or AUCHAN_PASSWORD');
    }

    logger.info('Step 1: Logging in');
    const loginResult = await loginTool.execute(
      { username, password },
      {
        page,
        logger,
        screenshot: async (name: string) => screenshotPath(`login-${name}`),
        config: { navigationTimeout: 30000, actionTimeout: 10000, retryCount: 3 },
      }
    );

    if (!loginResult.success) {
      throw new Error(`Login failed: ${loginResult.error?.message}`);
    }
    logger.info('Login successful');

    // Step 2: Build cart
    logger.info('Step 2: Building cart');
    await buildCart(page, 60);

    // Step 3: Navigate to cart
    logger.info('Step 3: Going to cart');
    await page.goto('https://www.auchan.pt/pt/carrinho-compras', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: screenshotPath('cart-filled'), fullPage: true });

    const totalText = await page
      .locator('.auc-header-cart-total')
      .first()
      .textContent()
      .catch(() => 'N/A');
    console.log(`\nCart Total: ${totalText}\n`);

    // Step 4: Proceed to checkout
    logger.info('Step 4: Proceeding to checkout');

    const checkoutBtn = page.locator('.checkout-btn, button.auc-js-confirm-cart').first();
    const btnVisible = await checkoutBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (!btnVisible) {
      console.log('\n=== Checkout button not found ===');
      console.log('Cart may not meet minimum requirements or items may be unavailable.');
      console.log('Browser will remain open for 1 minute.\n');
      await page.waitForTimeout(60000);
      return;
    }

    logger.info('Clicking checkout button');
    await checkoutBtn.evaluate((el: HTMLElement) => el.click());
    await page.waitForTimeout(3000);

    // Handle unavailable products modal
    const modal = page.locator('#confirm-unavailable-products-removal');
    const modalVisible = await modal.isVisible({ timeout: 3000 }).catch(() => false);

    if (modalVisible) {
      logger.info('Unavailable products modal detected - confirming to proceed');
      await page.screenshot({ path: screenshotPath('modal-unavailable'), fullPage: true });

      const confirmBtn = page.locator('.auc-js-cart-remove-unavailable-products').first();
      await confirmBtn.click();
      await page.waitForTimeout(4000);
    }

    // Step 5: Capture delivery slots page
    logger.info('Step 5: Analyzing delivery slots page');
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(3000);

    const url = page.url();
    console.log(`\n=== DELIVERY SLOTS PAGE ===`);
    console.log(`URL: ${url}\n`);

    await page.screenshot({ path: screenshotPath('delivery-slots'), fullPage: true });
    await saveSnapshot(page, 'delivery-slots');

    // Discover selectors
    const selectors = [
      { key: 'slotContainer', pattern: '[class*="delivery"], [class*="slot"], [class*="entrega"]' },
      { key: 'datePicker', pattern: '[class*="date"], [role="tablist"]' },
      { key: 'timeSlot', pattern: '[class*="slot"][class*="time"], button[data-slot]' },
      { key: 'slotPrice', pattern: '[class*="price"], [class*="custo"]' },
    ];

    console.log('\n=== SELECTOR ANALYSIS ===');
    for (const { key, pattern } of selectors) {
      const count = await page.locator(pattern).count();
      console.log(`${key}: ${count} matches`);
    }

    console.log('\n=== SUCCESS ===');
    console.log(`Screenshots: ${SCREENSHOT_DIR}`);
    console.log(`Snapshots: ${SNAPSHOTS_DIR}`);
    console.log('\nBrowser open for 2 minutes.\n');

    await page.waitForTimeout(120000);
  } catch (error) {
    logger.error('Script failed', { error });
    console.error(error);
  } finally {
    if (browser) {
      await browser.close();
      logger.info('Browser closed');
    }
  }
}

main().catch(console.error);
