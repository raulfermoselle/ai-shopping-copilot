/**
 * Test Script: Order History Tools
 *
 * Quick validation that NavigateToOrderHistoryTool and LoadOrderHistoryTool work.
 * Assumes user is already logged in (run after login).
 */

import { chromium, type Browser, type Page } from 'playwright';
import { navigateToOrderHistoryTool, loadOrderHistoryTool } from '../src/agents/cart-builder/tools/index.js';
import type { ToolContext } from '../src/types/tool.js';
import { createLogger } from '../src/utils/logger.js';
import path from 'path';
import fs from 'fs';

const SCREENSHOT_DIR = path.join(process.cwd(), 'data', 'exploration', 'order-history-tools-test');

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

/**
 * Create screenshot helper
 */
function createScreenshot(page: Page) {
  return async (name: string): Promise<string> => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${name}-${timestamp}.png`;
    const filepath = path.join(SCREENSHOT_DIR, filename);
    await page.screenshot({ path: filepath, fullPage: true });
    console.log(`Screenshot saved: ${filepath}`);
    return filepath;
  };
}

/**
 * Main test function
 */
async function testOrderHistoryTools(): Promise<void> {
  const logger = createLogger('test-order-history-tools');
  let browser: Browser | null = null;

  try {
    logger.info('Starting order history tools test');

    // Launch browser
    browser = await chromium.launch({
      headless: false,
      args: ['--start-maximized'],
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });

    const page = await context.newPage();

    // Create tool context
    const toolContext: ToolContext = {
      page,
      logger,
      screenshot: createScreenshot(page),
      config: {
        navigationTimeout: 30000,
        elementTimeout: 10000,
        screenshotDir: SCREENSHOT_DIR,
      },
    };

    // Step 1: Navigate to Auchan.pt (user must already be logged in)
    logger.info('Navigate to Auchan.pt homepage');
    await page.goto('https://www.auchan.pt', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    console.log('\n===== MANUAL STEP REQUIRED =====');
    console.log('Please log in to Auchan.pt if not already logged in.');
    console.log('Press Enter when ready to continue...\n');

    // Wait for user input
    await new Promise<void>((resolve) => {
      process.stdin.once('data', () => resolve());
    });

    // Step 2: Test NavigateToOrderHistoryTool
    logger.info('Testing NavigateToOrderHistoryTool');
    console.log('\n--- Test 1: Navigate to Order History ---');

    const navResult = await navigateToOrderHistoryTool.execute(
      {
        waitForLoad: true,
        timeout: 30000,
      },
      toolContext
    );

    if (navResult.success && navResult.data) {
      console.log('✓ Navigation successful');
      console.log(`  URL: ${navResult.data.url}`);
      console.log(`  Duration: ${navResult.duration}ms`);
      if (navResult.data.screenshot) {
        console.log(`  Screenshot: ${navResult.data.screenshot}`);
      }
    } else {
      console.log('✗ Navigation failed');
      if (navResult.error) {
        console.log(`  Error: ${navResult.error.message}`);
        console.log(`  Code: ${navResult.error.code}`);
      }
      throw new Error('NavigateToOrderHistoryTool failed');
    }

    // Step 3: Test LoadOrderHistoryTool
    logger.info('Testing LoadOrderHistoryTool');
    console.log('\n--- Test 2: Load Order History ---');

    const loadResult = await loadOrderHistoryTool.execute(
      {
        maxOrders: 5,
        includeDeliveryInfo: false,
      },
      toolContext
    );

    if (loadResult.success && loadResult.data) {
      console.log('✓ Order history loaded successfully');
      console.log(`  Orders extracted: ${loadResult.data.orders.length}`);
      console.log(`  Total available: ${loadResult.data.totalAvailable}`);
      console.log(`  Has more: ${loadResult.data.hasMore}`);
      console.log(`  Duration: ${loadResult.duration}ms`);

      // Display order details
      console.log('\n  Orders:');
      loadResult.data.orders.forEach((order, idx) => {
        console.log(`    ${idx + 1}. Order ${order.orderId}`);
        console.log(`       Date: ${order.date.toLocaleDateString()}`);
        console.log(`       Products: ${order.productCount}`);
        console.log(`       Total: €${order.totalPrice.toFixed(2)}`);
        console.log(`       URL: ${order.detailUrl}`);
      });
    } else {
      console.log('✗ Order history loading failed');
      if (loadResult.error) {
        console.log(`  Error: ${loadResult.error.message}`);
        console.log(`  Code: ${loadResult.error.code}`);
      }
      throw new Error('LoadOrderHistoryTool failed');
    }

    console.log('\n===== ALL TESTS PASSED =====\n');
    logger.info('All tests completed successfully');

    // Keep browser open for inspection
    console.log('Browser will remain open for 10 seconds for inspection...');
    await page.waitForTimeout(10000);
  } catch (err) {
    logger.error('Test execution failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    console.error('\nTest failed:', err);
    throw err;
  } finally {
    if (browser) {
      await browser.close();
      logger.info('Browser closed');
    }
  }
}

// Run the test
testOrderHistoryTools()
  .then(() => {
    console.log('\nTest script completed successfully');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\nTest script failed:', err);
    process.exit(1);
  });
