/**
 * Test ScanCartTool
 *
 * Tests the cart scanning functionality.
 */

import 'dotenv/config';
import { chromium, type Browser, type Page } from 'playwright';
import { scanCartTool } from '../src/agents/cart-builder/tools/scan-cart.js';
import { createLogger } from '../src/utils/logger.js';
import type { ToolContext } from '../src/types/tool.js';
import { mkdir } from 'fs/promises';
import { join } from 'path';

const SCREENSHOTS_DIR = join(process.cwd(), 'screenshots');

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

    // Create screenshot directory
    await mkdir(SCREENSHOTS_DIR, { recursive: true });

    // Create tool context
    const logger = createLogger({ level: 'debug' });
    const toolContext: ToolContext = {
      page,
      logger,
      screenshot: async (name: string) => {
        const path = join(SCREENSHOTS_DIR, `${name}-${Date.now()}.png`);
        await page.screenshot({ path, fullPage: true });
        return path;
      },
      config: {
        navigationTimeout: 30000,
        elementTimeout: 10000,
        screenshotDir: SCREENSHOTS_DIR,
      },
    };

    // Test 1: Scan empty cart
    console.log('\n📊 Test 1: Scanning empty cart...');
    const result1 = await scanCartTool.execute(
      { expandAll: true, captureScreenshot: true },
      toolContext
    );

    console.log('\nResult:');
    console.log('  Success:', result1.success);
    console.log('  Is Empty:', result1.data?.isEmpty);
    console.log('  Item Count:', result1.data?.snapshot.itemCount);
    console.log('  Total Price:', result1.data?.snapshot.totalPrice);
    console.log('  Duration:', result1.duration, 'ms');
    console.log('  Screenshot:', result1.data?.screenshot);

    if (result1.error) {
      console.log('  Error:', result1.error.message);
    }

    // Test 2: Add items from last order and scan again
    console.log('\n📦 Test 2: Adding items from last order...');

    const accountBtn = page.locator('text=OLÁ').first();
    if (await accountBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await accountBtn.click();
      await page.waitForTimeout(1500);

      const orderHistoryLink = page.locator('text=Histórico de encomendas').first();
      if (await orderHistoryLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await orderHistoryLink.click();
        await page.waitForTimeout(3000);

        const firstOrder = page.locator('.auc-orders__order-card').first();
        if (await firstOrder.isVisible({ timeout: 3000 }).catch(() => false)) {
          await firstOrder.click();
          await page.waitForTimeout(3000);

          const reorderButton = page.locator('text=Encomendar de novo').first();
          if (await reorderButton.isVisible({ timeout: 5000 }).catch(() => false)) {
            await reorderButton.click();
            console.log('🔄 Reorder button clicked');
            await page.waitForTimeout(5000);

            console.log('\n📊 Scanning cart with items...');
            const result2 = await scanCartTool.execute(
              { expandAll: true, captureScreenshot: true },
              toolContext
            );

            console.log('\nResult:');
            console.log('  Success:', result2.success);
            console.log('  Is Empty:', result2.data?.isEmpty);
            console.log('  Item Count:', result2.data?.snapshot.itemCount);
            console.log('  Total Price:', result2.data?.snapshot.totalPrice);
            console.log('  Duration:', result2.duration, 'ms');
            console.log('  Screenshot:', result2.data?.screenshot);

            if (result2.data?.snapshot.items && result2.data.snapshot.items.length > 0) {
              console.log('\n  Items:');
              for (const item of result2.data.snapshot.items) {
                console.log(`    - ${item.name}`);
                console.log(`      Quantity: ${item.quantity}, Unit Price: €${item.unitPrice}, Available: ${item.available}`);
              }
            }

            if (result2.error) {
              console.log('  Error:', result2.error.message);
            }
          } else {
            console.log('⚠️ Reorder button not found');
          }
        } else {
          console.log('⚠️ No orders found');
        }
      } else {
        console.log('⚠️ Order history link not found');
      }
    } else {
      console.log('⚠️ Account button not found');
    }

    console.log('\n✅ Tests complete!');

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
