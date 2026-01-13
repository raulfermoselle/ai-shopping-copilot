#!/usr/bin/env npx ts-node
/**
 * Delivery Slot UI Research Script for SlotScout
 *
 * This script navigates through the checkout flow to reach the delivery slot
 * selection page and captures the UI structure for selector discovery.
 *
 * Prerequisites:
 * - AUCHAN_EMAIL and AUCHAN_PASSWORD set in .env
 * - Auchan account with configured delivery address
 *
 * Approach:
 * 1. Login to Auchan.pt
 * 2. Add items to cart via reorder (to meet minimum >50 EUR)
 * 3. Navigate to checkout flow
 * 4. Capture delivery slot selection UI
 * 5. Document selectors and save screenshots/HTML
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { chromium, type Browser, type Page } from 'playwright';
import { createLogger } from '../dist/utils/logger.js';
import { attachPopupObserver, detachPopupObserver } from '../dist/utils/auto-popup-dismisser.js';
import { LoginTool } from '../dist/tools/login.js';

// Directories
const SCREENSHOT_DIR = 'data/selectors/pages/delivery-slots/screenshots';
const SNAPSHOTS_DIR = 'data/selectors/pages/delivery-slots/snapshots';

const logger = createLogger('research-delivery-slots');
const loginTool = new LoginTool();

/**
 * Helper to create screenshot path
 */
function screenshotPath(name: string): string {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  return path.join(SCREENSHOT_DIR, `${name}.png`);
}

/**
 * Helper to save HTML snapshot
 */
async function saveSnapshot(page: Page, name: string): Promise<void> {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  const html = await page.content();
  const snapshotFile = path.join(SNAPSHOTS_DIR, `${name}.html`);
  fs.writeFileSync(snapshotFile, html);
  logger.info(`Saved HTML snapshot: ${snapshotFile}`);
}

/**
 * Attempt to add items to cart via reorder
 */
async function addItemsToCart(page: Page): Promise<boolean> {
  try {
    logger.info('Navigating to order history to reorder items');
    await page.goto('https://www.auchan.pt/pt/historico-encomendas', {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: screenshotPath('02-order-history'), fullPage: false });

    // Find first reorder button
    const reorderButton = page.locator('button:has-text("Adicionar ao carrinho"), button[aria-label*="Adicionar"]').first();
    const reorderVisible = await reorderButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (!reorderVisible) {
      logger.warn('No reorder button found in order history');
      return false;
    }

    logger.info('Clicking reorder button');
    await reorderButton.click();
    await page.waitForTimeout(3000);

    // Handle reorder modal (replace vs merge)
    const replaceBtn = page.locator('button:has-text("Substituir carrinho"), button:has-text("Substituir")');
    const mergeBtn = page.locator('button:has-text("Juntar"), button:has-text("Adicionar")');

    if (await replaceBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      logger.info('Reorder modal: Clicking "Substituir carrinho"');
      await replaceBtn.click();
      await page.waitForTimeout(2000);
      return true;
    } else if (await mergeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      logger.info('Reorder modal: Clicking "Juntar"');
      await mergeBtn.click();
      await page.waitForTimeout(2000);
      return true;
    }

    logger.info('Reorder completed (no modal)');
    return true;
  } catch (error) {
    logger.error('Failed to add items via reorder', { error });
    return false;
  }
}

/**
 * Try to proceed to checkout
 */
async function proceedToCheckout(page: Page): Promise<boolean> {
  try {
    logger.info('Looking for checkout button');

    // Try multiple checkout button selectors
    const checkoutSelectors = [
      '.auc-cart__checkout-btn',
      'button:has-text("Finalizar compra")',
      'button:has-text("Finalizar")',
      'a:has-text("Finalizar")',
      '[data-testid="checkout-button"]',
    ];

    for (const selector of checkoutSelectors) {
      const btn = page.locator(selector).first();
      const visible = await btn.isVisible({ timeout: 2000 }).catch(() => false);
      const enabled = await btn.isEnabled().catch(() => false);

      if (visible) {
        logger.info(`Found checkout button: ${selector}`, { enabled });

        if (!enabled) {
          logger.warn('Checkout button is DISABLED (minimum order not met)');
          return false;
        }

        logger.info('Clicking checkout button');
        await btn.click();
        await page.waitForTimeout(3000);

        // Wait for navigation
        await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => null);
        return true;
      }
    }

    logger.warn('No checkout button found');
    return false;
  } catch (error) {
    logger.error('Failed to proceed to checkout', { error });
    return false;
  }
}

/**
 * Main research flow
 */
async function main() {
  let browser: Browser | null = null;

  try {
    console.log('=== SlotScout Delivery Slots Research ===\n');

    // Launch browser in headed mode
    browser = await chromium.launch({ headless: false, slowMo: 300 });
    const context = await browser.newContext({
      viewport: { width: 1400, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });
    const page = await context.newPage();

    // Attach popup observer
    await attachPopupObserver(page, logger);
    logger.info('Popup observer attached');

    // Step 1: Login
    const username = process.env.AUCHAN_EMAIL;
    const password = process.env.AUCHAN_PASSWORD;
    if (!username || !password) {
      throw new Error('Missing AUCHAN_EMAIL or AUCHAN_PASSWORD env vars');
    }

    logger.info('Step 1: Logging in to Auchan.pt');
    const loginResult = await loginTool.execute(
      { username, password },
      {
        page,
        logger,
        screenshot: async (name: string) => screenshotPath(`00-login-${name}`),
        config: { navigationTimeout: 30000, actionTimeout: 10000, retryCount: 3 },
      }
    );

    if (!loginResult.success) {
      throw new Error(`Login failed: ${loginResult.error?.message}`);
    }
    logger.info('Login successful', { userName: loginResult.data?.userName });

    // Step 2: Navigate to cart and check state
    logger.info('Step 2: Navigating to cart');
    await page.goto('https://www.auchan.pt/pt/carrinho-compras', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: screenshotPath('01-cart-initial'), fullPage: true });

    // Check if cart is empty
    const emptyCart = await page.locator('.auc-cart--empty').isVisible({ timeout: 3000 }).catch(() => false);

    if (emptyCart) {
      logger.info('Cart is empty. Attempting to add items via reorder');
      const added = await addItemsToCart(page);

      if (!added) {
        logger.warn('Could not add items automatically. Manual intervention required.');
        console.log('\n=== MANUAL ACTION REQUIRED ===');
        console.log('1. Add items to cart manually (minimum ~50 EUR)');
        console.log('2. Browser will stay open for 5 minutes');
        console.log('3. After adding items, return here\n');
        await page.waitForTimeout(300000); // 5 minutes
      }

      // Return to cart
      await page.goto('https://www.auchan.pt/pt/carrinho-compras', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
    }

    // Step 3: Capture cart state
    logger.info('Step 3: Capturing cart state');
    await page.screenshot({ path: screenshotPath('03-cart-with-items'), fullPage: true });
    await saveSnapshot(page, '03-cart-with-items');

    // Extract cart total
    const totalText = await page.locator('.auc-cart__total, .cart-total, [class*="total"]').textContent().catch(() => null);
    console.log(`\nCart Total: ${totalText ?? 'Not found'}`);

    // Step 4: Try to proceed to checkout
    logger.info('Step 4: Attempting to proceed to checkout');
    const proceededToCheckout = await proceedToCheckout(page);

    if (!proceededToCheckout) {
      logger.warn('Could not proceed to checkout automatically');
      console.log('\n=== CHECKOUT BLOCKED ===');
      console.log('The checkout button is either disabled or not found.');
      console.log('This typically means:');
      console.log('  - Cart value is below minimum order (usually 50 EUR)');
      console.log('  - Delivery address not configured');
      console.log('  - Some items are unavailable');
      console.log('\nBrowser will remain open for manual exploration (2 minutes)');
      await page.waitForTimeout(120000);
      return;
    }

    // Step 5: Capture checkout/delivery slot page
    logger.info('Step 5: Reached checkout flow! Capturing delivery slot UI');
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    console.log(`\n=== CHECKOUT FLOW URL ===`);
    console.log(`URL: ${currentUrl}\n`);

    await page.screenshot({ path: screenshotPath('04-checkout-page'), fullPage: true });
    await saveSnapshot(page, '04-checkout-page');

    // Look for delivery slot elements
    logger.info('Searching for delivery slot selectors');

    const potentialSelectors = [
      { name: 'slotContainer', selector: '[class*="delivery"], [class*="slot"], [class*="entrega"]' },
      { name: 'datePicker', selector: '[class*="date"], [class*="calendar"], [role="tablist"]' },
      { name: 'timeSlot', selector: '[class*="time"], [class*="slot"], button[data-slot]' },
      { name: 'slotPrice', selector: '[class*="price"], [class*="fee"]' },
    ];

    console.log('\n=== SELECTOR DISCOVERY ===');
    for (const { name, selector } of potentialSelectors) {
      const count = await page.locator(selector).count();
      console.log(`${name} (${selector}): ${count} matches`);
    }

    // Keep browser open for manual inspection
    console.log('\n=== RESEARCH COMPLETE ===');
    console.log(`Screenshots saved to: ${SCREENSHOT_DIR}`);
    console.log(`HTML snapshots saved to: ${SNAPSHOTS_DIR}`);
    console.log('\nBrowser will remain open for 2 minutes for manual inspection.');
    console.log('Use DevTools (F12) to explore selectors further.\n');

    await page.waitForTimeout(120000);
  } catch (error) {
    logger.error('Research script failed', { error });
    throw error;
  } finally {
    if (browser) {
      await browser.close();
      logger.info('Browser closed');
    }
  }
}

main().catch(console.error);
