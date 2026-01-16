#!/usr/bin/env npx tsx
/**
 * Test Script: SlotScout Agent
 *
 * Tests the SlotScout agent directly without going through Coordinator.
 * Assumes cart is already populated.
 *
 * Usage:
 *   npx tsx scripts/test-slot-scout.ts
 */

import 'dotenv/config';
import { chromium, type Browser, type Page } from 'playwright';
import { createLoginTool } from '../dist/tools/login.js';
import { createLogger } from '../dist/utils/logger.js';
import { SlotScout } from '../dist/agents/slot-scout/slot-scout.js';
import { attachPopupObserver } from '../dist/utils/auto-popup-dismisser.js';

const logger = createLogger('test-slot-scout');

async function main() {
  let browser: Browser | null = null;

  try {
    console.log('\n');
    console.log('='.repeat(50));
    console.log('   SlotScout Agent Test');
    console.log('='.repeat(50));
    console.log('\n');

    const email = process.env.AUCHAN_EMAIL;
    if (!email) {
      throw new Error('Missing AUCHAN_EMAIL in .env');
    }

    // Launch browser
    console.log('Launching browser...');
    browser = await chromium.launch({
      headless: false,
      slowMo: 100,
    });

    const context = await browser.newContext({
      viewport: { width: 1400, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });

    const page = await context.newPage();

    // Attach popup observer
    await attachPopupObserver(page, logger);

    // Step 1: Login
    console.log('\nStep 1: Logging in...');
    const loginTool = createLoginTool();
    const loginResult = await loginTool.execute(
      { email },
      {
        page,
        logger,
        screenshot: async (name: string) => `screenshots/test-${name}.png`,
        config: { navigationTimeout: 30000, elementTimeout: 10000, screenshotDir: 'screenshots' },
      }
    );

    if (!loginResult.success || !loginResult.data?.loggedIn) {
      throw new Error('Login failed');
    }
    console.log(`  Logged in as: ${loginResult.data.userName ?? 'user'}`);

    // Step 2: Check cart status
    console.log('\nStep 2: Navigating to cart...');
    await page.goto('https://www.auchan.pt/pt/carrinho-compras', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForTimeout(2000);

    // Get cart total from header (more reliable)
    const headerCartEl = page.locator('.auc-header__minicart-total, .minicart-total, [class*="cart"][class*="total"]').first();
    let headerCartText = await headerCartEl.textContent().catch(() => null);
    console.log(`  Header cart: ${headerCartText ?? 'Not found'}`);

    // Get cart total from cart page
    const totalEl = page.locator('.auc-cart__total-price, .grand-total, .cart-total-price').first();
    const totalText = await totalEl.textContent().catch(() => null);
    console.log(`  Cart total: ${totalText ?? 'Not found'}`);

    // Check cart has items using multiple selectors
    let itemCount = await page.locator('.auc-cart__item, .line-item, .product-line-item').count();
    console.log(`  Cart items (selector 1): ${itemCount}`);

    // Also check for cart line items
    const lineItems = await page.locator('[class*="line-item"], [class*="cart-item"]').count();
    console.log(`  Cart items (selector 2): ${lineItems}`);

    // Use header cart value to determine if cart has items
    const cartHasItems = headerCartText && !headerCartText.includes('0,00') && parseFloat((headerCartText ?? '0').replace(/[^0-9.,]/g, '').replace(',', '.')) > 0;
    console.log(`  Cart has items: ${cartHasItems}`);

    // If cart is empty, populate it by reordering
    if (!cartHasItems && itemCount === 0) {
      console.log('\n  Cart is empty. Populating by reordering last order...');

      // Go to order history
      await page.goto('https://www.auchan.pt/pt/myaccount/orders', {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: 'screenshots/test-orders-page.png', fullPage: true });

      // First, click on the first order to go to order detail page
      const orderLink = page.locator('.order-history-card__header a, a[href*="orderdetail"]').first();
      if (await orderLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log('  Clicking on first order to see details...');
        await orderLink.click();
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'screenshots/test-order-detail.png', fullPage: true });
      }

      // Find and click reorder on the order detail page (use verified selector)
      const reorderBtn = page.locator('.auc-js-action__reorder, button:has-text("Encomendar de novo")').first();
      if (await reorderBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
        console.log('  Found reorder button, clicking...');
        await reorderBtn.click();
        await page.waitForTimeout(3000);

        // Handle modal (replace or merge)
        const replaceBtn = page.locator('button:has-text("Substituir"), .auc-button:has-text("Substituir")').first();
        const mergeBtn = page.locator('button:has-text("Juntar"), .auc-button:has-text("Juntar")').first();

        if (await replaceBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          console.log('  Clicking "Substituir" to replace cart...');
          await replaceBtn.click();
        } else if (await mergeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log('  Clicking "Juntar" to merge cart...');
          await mergeBtn.click();
        }

        await page.waitForTimeout(5000);

        // Navigate back to cart
        await page.goto('https://www.auchan.pt/pt/carrinho-compras', {
          waitUntil: 'domcontentloaded',
          timeout: 15000,
        });
        await page.waitForTimeout(2000);

        // Re-check item count
        itemCount = await page.locator('.auc-cart__item, .line-item').count();
        console.log(`  Cart now has ${itemCount} items`);
      } else {
        console.log('  No reorder button found');
        await page.waitForTimeout(5000);
        return;
      }
    }

    // Step 3: Run SlotScout
    console.log('\nStep 3: Running SlotScout agent...');
    const slotScout = new SlotScout({
      daysAhead: 7,
      maxSlots: 20,
      pageTimeout: 60000,
    });

    const result = await slotScout.run(
      {
        page,
        logger,
        sessionId: `test-slot-scout-${Date.now()}`,
      },
      {
        cartTotal: parseFloat((totalText ?? '0').replace(/[^0-9.,]/g, '').replace(',', '.')),
      }
    );

    // Display results
    console.log('\n');
    console.log('='.repeat(50));
    console.log('   SlotScout Results');
    console.log('='.repeat(50));

    if (!result.success || !result.data) {
      console.log('\n  FAILED');
      console.log(`  Error: ${result.error?.message ?? 'Unknown error'}`);
      if (result.logs) {
        console.log('\n  Logs:');
        for (const log of result.logs) {
          console.log(`    ${log}`);
        }
      }
    } else {
      const { slotsByDay, rankedSlots, summary, minimumOrder } = result.data;

      console.log('\n  SUMMARY:');
      console.log(`    Days checked: ${summary.daysChecked}`);
      console.log(`    Total slots: ${summary.totalSlots}`);
      console.log(`    Available slots: ${summary.availableSlots}`);
      console.log(`    Free delivery: ${summary.freeDeliveryAvailable ? 'Yes' : 'No'}`);
      if (summary.cheapestDelivery !== undefined) {
        console.log(`    Cheapest delivery: €${summary.cheapestDelivery.toFixed(2)}`);
      }
      if (minimumOrder !== undefined) {
        console.log(`    Minimum order: €${minimumOrder.toFixed(2)}`);
      }

      console.log('\n  SLOTS BY DAY:');
      for (const dayGroup of slotsByDay.slice(0, 5)) {
        console.log(`    ${dayGroup.dayName} (${dayGroup.dateString}): ${dayGroup.availableCount} available`);
      }

      console.log('\n  TOP RANKED SLOTS:');
      for (const slot of rankedSlots.slice(0, 5)) {
        const price = slot.price ?? 0;
        const cost = price === 0 ? 'FREE' : `€${price.toFixed(2)}`;
        console.log(`    ${slot.rank ?? '?'}. ${slot.dayName ?? 'Unknown'} ${slot.startTime}-${slot.endTime} - ${cost}`);
        const overallScore = slot.score?.overall ?? 0;
        console.log(`       Score: ${overallScore.toFixed(2)} | ${slot.reason ?? ''}`);
      }

      if (result.logs && result.logs.length > 0) {
        console.log('\n  LOGS:');
        for (const log of result.logs) {
          console.log(`    ${log}`);
        }
      }
    }

    console.log('\n');
    console.log('='.repeat(50));
    console.log('   Test Complete');
    console.log('='.repeat(50));
    console.log('\n');

    // Keep browser open briefly
    console.log('Browser closing in 10 seconds...');
    await page.waitForTimeout(10000);

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('\nFATAL ERROR:', err.message);
    console.error(err.stack);
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed.');
    }
  }
}

main();
