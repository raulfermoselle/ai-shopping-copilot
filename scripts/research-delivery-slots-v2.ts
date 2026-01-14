#!/usr/bin/env npx tsx
/**
 * Delivery Slot Research Script v2
 *
 * Focused approach:
 * 1. Login
 * 2. Go to cart
 * 3. Remove ALL unavailable items first
 * 4. Click checkout button
 * 5. Capture delivery slots page
 *
 * SAFETY: Never confirms orders or navigates to payment pages
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { chromium, type Browser, type Page } from 'playwright';
import { createLoginTool } from '../dist/tools/login.js';
import { createLogger } from '../dist/utils/logger.js';
import { attachPopupObserver } from '../dist/utils/auto-popup-dismisser.js';

const SCREENSHOT_DIR = 'data/selectors/pages/delivery-slots/screenshots';
const SNAPSHOTS_DIR = 'data/selectors/pages/delivery-slots/snapshots';
const logger = createLogger('research-slots');

function screenshotPath(name: string): string {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(SCREENSHOT_DIR, `${name}_${ts}.png`);
}

async function saveSnapshot(page: Page, name: string): Promise<void> {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const html = await page.content();
  fs.writeFileSync(path.join(SNAPSHOTS_DIR, `${name}_${ts}.html`), html);
  console.log(`  Saved snapshot: ${name}`);
}

async function dismissPopups(page: Page): Promise<void> {
  // Cookie consent
  const cookieBtn = page.locator('#onetrust-accept-btn-handler');
  if (await cookieBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await cookieBtn.click();
    console.log('  Dismissed cookie consent');
  }

  // Generic close buttons on modals
  const closeSelectors = [
    '.modal.show .close',
    '.modal.show [aria-label="Close"]',
    '.auc-modal.show button.close',
  ];
  for (const sel of closeSelectors) {
    const closeBtn = page.locator(sel).first();
    if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await closeBtn.click();
      console.log(`  Closed modal: ${sel}`);
      await page.waitForTimeout(500);
    }
  }
}

async function login(page: Page): Promise<boolean> {
  const email = process.env.AUCHAN_EMAIL;

  if (!email) {
    throw new Error('Missing AUCHAN_EMAIL');
  }

  console.log('Step 1: Login');

  // Attach popup observer
  await attachPopupObserver(page, logger);

  const loginTool = createLoginTool();
  const result = await loginTool.execute(
    { email },
    {
      page,
      logger,
      screenshot: async (name: string) => screenshotPath(`login-${name}`),
      config: { navigationTimeout: 30000, elementTimeout: 10000, screenshotDir: SCREENSHOT_DIR },
    }
  );

  if (result.success && result.data?.loggedIn) {
    console.log(`  Logged in as: ${result.data.userName ?? 'user'}`);
    return true;
  }

  console.log('  Login failed:', result.error?.message);
  return false;
}

async function removeUnavailableItems(page: Page): Promise<void> {
  console.log('Step 3: Removing unavailable items');

  // Look for unavailable items notice
  const unavailableSection = page.locator('.auc-cart__unavailable, [class*="unavailable"]');
  const hasUnavailable = await unavailableSection.isVisible({ timeout: 2000 }).catch(() => false);

  if (!hasUnavailable) {
    console.log('  No unavailable items found');
    return;
  }

  // Try to find and click "Remove all unavailable" button
  const removeAllSelectors = [
    '.auc-js-cart-remove-unavailable-products',
    'button:has-text("Remover todos os indisponíveis")',
    'button:has-text("Remover indisponíveis")',
    '.auc-cart__unavailable button',
  ];

  for (const sel of removeAllSelectors) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log(`  Found remove button: ${sel}`);
      await btn.click();
      await page.waitForTimeout(2000);

      // Handle confirmation modal
      const confirmBtn = page.locator('button:has-text("Confirmar"), button:has-text("Sim")').first();
      if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmBtn.click();
        await page.waitForTimeout(2000);
      }
      console.log('  Unavailable items removed');
      return;
    }
  }

  console.log('  Could not find remove button, trying individual removal');

  // Find individual remove buttons for unavailable items
  const unavailableItems = page.locator('.auc-cart__item--unavailable, .line-item:has(.auc-unavailable-text)');
  const count = await unavailableItems.count();
  console.log(`  Found ${count} unavailable items`);

  for (let i = 0; i < Math.min(count, 20); i++) {
    const item = unavailableItems.nth(i);
    const removeBtn = item.locator('button.remove-btn, button[aria-label*="Remover"], .remove-product');
    if (await removeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await removeBtn.click();
      await page.waitForTimeout(500);
    }
  }
}

async function removeUnavailableProductsDirectly(page: Page): Promise<boolean> {
  console.log('Step 3b: Removing unavailable products directly');

  // Check if there are unavailable items
  const unavailableCount = await page.locator('.auc-unavailable-text, [class*="unavailable"]').count();
  console.log(`  Found ${unavailableCount} unavailable item markers`);

  if (unavailableCount === 0) {
    return false;
  }

  // Try to call the remove endpoint directly via the button's data-url
  const removed = await page.evaluate(async () => {
    const btn = document.querySelector('.auc-js-cart-remove-unavailable-products') as HTMLButtonElement;
    if (btn && btn.dataset.url) {
      try {
        const csrfInput = document.querySelector('input[name="csrf_token"]') as HTMLInputElement;
        const csrfToken = csrfInput?.value || '';

        const response = await fetch(btn.dataset.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `csrf_token=${encodeURIComponent(csrfToken)}`,
          credentials: 'include',
        });

        return response.ok;
      } catch (e) {
        console.error('Failed to remove unavailable products:', e);
        return false;
      }
    }
    return false;
  });

  if (removed) {
    console.log('  Unavailable products removed via API');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    return true;
  }

  console.log('  Could not remove via API, will try modal approach');
  return false;
}

async function proceedToCheckout(page: Page): Promise<boolean> {
  console.log('Step 4: Proceeding to checkout');

  // First try to remove unavailable products directly
  await removeUnavailableProductsDirectly(page);

  // Find checkout button
  const checkoutSelectors = [
    '.checkout-btn.auc-button__rounded--primary',
    '.auc-cart__checkout-btn',
    'button:has-text("Finalizar compra")',
    'a:has-text("Finalizar compra")',
    '.auc-checkout-btn',
  ];

  for (const sel of checkoutSelectors) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log(`  Found checkout button: ${sel}`);

      // Use JavaScript to click the button (more reliable than Playwright click)
      console.log('  Clicking checkout button via JavaScript');
      await page.evaluate((selector) => {
        const button = document.querySelector(selector) as HTMLElement;
        if (button) {
          button.click();
        }
      }, sel);

      await page.waitForTimeout(2000);

      // Check if unavailable products modal appeared (check for show class)
      const modalHasShow = await page.evaluate(() => {
        const modal = document.querySelector('#confirm-unavailable-products-removal');
        return modal?.classList.contains('show') || false;
      });

      if (modalHasShow) {
        console.log('  Unavailable products modal is visible');
        await page.screenshot({ path: screenshotPath('unavailable-modal'), fullPage: false });

        // Click "Confirmar" via JavaScript
        console.log('  Clicking "Confirmar" to remove unavailable products');
        await page.evaluate(() => {
          const confirmBtn = document.querySelector('.auc-js-cart-remove-unavailable-products') as HTMLElement;
          if (confirmBtn) {
            confirmBtn.click();
          }
        });

        await page.waitForTimeout(5000);
      } else {
        // Check if we navigated somewhere
        const currentUrl = page.url();
        console.log(`  Current URL after click: ${currentUrl}`);

        if (currentUrl.includes('checkout') || currentUrl.includes('entrega')) {
          console.log('  Already navigated to checkout!');
        } else {
          console.log('  No modal and no navigation. Trying modal click anyway...');
          // Try clicking confirm button anyway in case modal is there but not detected
          await page.evaluate(() => {
            const confirmBtn = document.querySelector('.auc-js-cart-remove-unavailable-products') as HTMLElement;
            if (confirmBtn) {
              confirmBtn.click();
            }
          });
          await page.waitForTimeout(3000);
        }
      }

      await page.waitForLoadState('domcontentloaded');
      return true;
    }
  }

  console.log('  No checkout button found');
  return false;
}

async function captureDeliverySlots(page: Page): Promise<void> {
  console.log('Step 5: Capturing delivery slots page');

  const url = page.url();
  console.log(`  Current URL: ${url}`);

  await page.screenshot({ path: screenshotPath('delivery-slots'), fullPage: true });
  await saveSnapshot(page, 'delivery-slots');

  // Check if we're on a checkout page
  if (url.includes('checkout') || url.includes('entrega') || url.includes('delivery')) {
    console.log('  SUCCESS: Reached checkout/delivery page!');

    // Look for delivery slot elements
    const slotSelectors = [
      { name: 'dayTabs', sel: '[role="tablist"], .delivery-day-tabs' },
      { name: 'timeSlots', sel: '.time-slot, .delivery-slot, [class*="slot"]' },
      { name: 'slotButtons', sel: 'button[class*="slot"], button[data-slot]' },
      { name: 'calendar', sel: '.calendar, [class*="calendar"]' },
      { name: 'deliveryOptions', sel: '.delivery-option, [class*="delivery"]' },
    ];

    console.log('\n  Selector Discovery:');
    for (const { name, sel } of slotSelectors) {
      const count = await page.locator(sel).count();
      console.log(`    ${name}: ${count} matches`);
    }
  } else {
    console.log('  WARNING: Not on checkout page. May have been blocked.');
  }
}

async function main() {
  let browser: Browser | null = null;

  try {
    console.log('\n=== SlotScout Delivery Slots Research v2 ===\n');

    browser = await chromium.launch({ headless: false, slowMo: 200 });
    const context = await browser.newContext({
      viewport: { width: 1400, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });
    const page = await context.newPage();

    // Step 1: Login
    await login(page);

    // Step 2: Go to cart
    console.log('Step 2: Navigating to cart');
    await page.goto('https://www.auchan.pt/pt/carrinho-compras', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForTimeout(2000);
    await dismissPopups(page);
    await page.screenshot({ path: screenshotPath('cart-initial'), fullPage: true });

    // Get cart total
    const totalEl = page.locator('.auc-cart__total-price, .grand-total');
    const total = await totalEl.textContent().catch(() => 'Not found');
    console.log(`  Cart total: ${total}`);

    // Step 3: Remove unavailable items
    await removeUnavailableItems(page);
    await page.waitForTimeout(1000);
    await dismissPopups(page);

    // Step 4: Proceed to checkout
    const proceeded = await proceedToCheckout(page);

    if (proceeded) {
      // Wait for page load
      await page.waitForTimeout(3000);
      await dismissPopups(page);

      // Step 5: Capture delivery slots
      await captureDeliverySlots(page);
    } else {
      console.log('\n  Could not proceed to checkout.');
      await page.screenshot({ path: screenshotPath('checkout-blocked'), fullPage: true });
    }

    // Keep browser open for inspection
    console.log('\n=== RESEARCH COMPLETE ===');
    console.log(`Screenshots: ${SCREENSHOT_DIR}`);
    console.log(`Snapshots: ${SNAPSHOTS_DIR}`);
    console.log('\nBrowser staying open for 2 minutes for manual inspection.');
    console.log('SAFETY: Do NOT proceed to payment. Close browser or wait.\n');

    await page.waitForTimeout(120000);

  } catch (error) {
    console.error('Research failed:', error);
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed');
    }
  }
}

main();
