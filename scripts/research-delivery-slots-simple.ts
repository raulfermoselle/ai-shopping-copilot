#!/usr/bin/env npx ts-node
/**
 * Simple Delivery Slot Research - Assumes cart already has €260+
 *
 * This simplified script:
 * 1. Login
 * 2. Go to cart (assumes items already there)
 * 3. Proceed to checkout (handle unavailable items modal)
 * 4. Capture delivery slot selection UI
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

const logger = createLogger('research-delivery-slots-simple');
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

async function main() {
  let browser: Browser | null = null;

  try {
    console.log('=== Simple Delivery Slots Research (Assumes Cart Has Items) ===\n');

    browser = await chromium.launch({ headless: false, slowMo: 200 });
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
      throw new Error('Missing AUCHAN_EMAIL or AUCHAN_PASSWORD env vars');
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

    // Step 2: Navigate to cart
    logger.info('Step 2: Navigating to cart');
    await page.goto('https://www.auchan.pt/pt/carrinho-compras', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: screenshotPath('cart-page'), fullPage: true });
    await saveSnapshot(page, 'cart-page');

    // Extract cart total
    const totalText = await page
      .locator('.auc-cart__total, .cart-total, .auc-header-cart-total, [class*="total"]')
      .first()
      .textContent()
      .catch(() => null);
    console.log(`\nCart Total: ${totalText ?? 'Not found'}`);

    // Check if cart is empty
    const emptyCart = await page.locator('.auc-cart--empty, :has-text("Carrinho vazio")').isVisible({ timeout: 2000 }).catch(() => false);

    if (emptyCart) {
      console.log('\n=== ERROR: Cart is empty! ===');
      console.log('Please add items to cart before running this script.');
      console.log('Browser will remain open for 2 minutes for you to add items manually.\n');
      await page.waitForTimeout(120000);
      return;
    }

    // Step 3: Proceed to checkout
    logger.info('Step 3: Proceeding to checkout');

    const checkoutBtn = page.locator('.checkout-btn.auc-button__rounded--primary, button.auc-js-confirm-cart').first();
    const btnVisible = await checkoutBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (!btnVisible) {
      throw new Error('Checkout button not found!');
    }

    logger.info('Clicking checkout button');
    await checkoutBtn.evaluate((el: HTMLElement) => el.click());
    await page.waitForTimeout(3000);

    // Check for unavailable products confirmation modal
    const modal = page.locator('#confirm-unavailable-products-removal');
    const modalVisible = await modal.isVisible({ timeout: 3000 }).catch(() => false);

    if (modalVisible) {
      logger.info('Unavailable products modal appeared!');
      await page.screenshot({ path: screenshotPath('modal-unavailable-products'), fullPage: true });

      logger.info('Clicking Confirmar to remove unavailable items and proceed');
      const confirmBtn = page.locator('.auc-js-cart-remove-unavailable-products').first();
      await confirmBtn.click();
      await page.waitForTimeout(4000);
    }

    // Step 4: Capture delivery slot page
    logger.info('Step 4: Capturing delivery slot selection page');
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    console.log(`\n=== CHECKOUT/DELIVERY PAGE ===`);
    console.log(`URL: ${currentUrl}\n`);

    await page.screenshot({ path: screenshotPath('delivery-slots-page'), fullPage: true });
    await saveSnapshot(page, 'delivery-slots-page');

    // Analyze delivery slot selectors
    logger.info('Analyzing delivery slot selectors...');

    const potentialSelectors = [
      { name: 'slotContainer', selector: '[class*="delivery"], [class*="slot"], [class*="entrega"]' },
      { name: 'datePicker', selector: '[class*="date"], [class*="calendar"], [role="tablist"]' },
      { name: 'timeSlot', selector: '[class*="time"][class*="slot"], button[data-slot]' },
      { name: 'slotPrice', selector: '[class*="price"], [class*="fee"], [class*="custo"]' },
      { name: 'slotTime', selector: '[class*="time"]:not([class*="slot"])' },
    ];

    console.log('\n=== SELECTOR DISCOVERY ===');
    for (const { name, selector } of potentialSelectors) {
      const count = await page.locator(selector).count();
      console.log(`${name} (${selector}): ${count} matches`);

      if (count > 0 && count < 20) {
        // Sample text content
        const samples = await page.locator(selector).evaluateAll((els) =>
          els.slice(0, 3).map(el => ({
            tag: el.tagName,
            class: el.className,
            text: el.textContent?.trim().slice(0, 50)
          }))
        );
        console.log(`  Samples:`, JSON.stringify(samples, null, 2));
      }
    }

    // Keep browser open for manual inspection
    console.log('\n=== RESEARCH COMPLETE ===');
    console.log(`Screenshots: ${SCREENSHOT_DIR}`);
    console.log(`Snapshots: ${SNAPSHOTS_DIR}`);
    console.log('\nBrowser will remain open for 2 minutes for inspection.\n');

    await page.waitForTimeout(120000);
  } catch (error) {
    logger.error('Script failed', { error });
    console.error('\nERROR:', error);
  } finally {
    if (browser) {
      await browser.close();
      logger.info('Browser closed');
    }
  }
}

main().catch(console.error);
