/**
 * Test Order Detail Tools
 *
 * Quick validation script for loadOrderDetailTool and reorderTool.
 * Verifies selector registry integration and tool execution.
 */

import { chromium } from 'playwright';
import { createLogger } from '../src/utils/logger.js';
import { createToolContext } from '../src/tools/base-tool.js';
import { loadOrderDetailTool, reorderTool } from '../src/agents/cart-builder/tools/index.js';

async function main() {
  const logger = createLogger('info', 'TestOrderDetailTools');
  let browser;

  try {
    logger.info('Launching browser...');
    browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Create tool context
    const toolContext = createToolContext(page, {
      logger,
      config: {
        navigationTimeout: 30000,
        elementTimeout: 10000,
        screenshotDir: './screenshots/test',
      },
    });

    logger.info('Tool context created successfully');

    // Test 1: Verify tools are properly exported
    logger.info('Verifying tool exports...');
    logger.info(`loadOrderDetailTool: ${loadOrderDetailTool.name} - ${loadOrderDetailTool.description}`);
    logger.info(`reorderTool: ${reorderTool.name} - ${reorderTool.description}`);

    // Test 2: Verify selector registry integration
    logger.info('\nVerifying selector registry integration...');
    const { createSelectorResolver } = await import('../src/selectors/resolver.js');
    const resolver = createSelectorResolver();

    if (!resolver.hasPage('order-detail')) {
      throw new Error('order-detail page not found in selector registry');
    }

    const selectorKeys = resolver.getKeys('order-detail');
    logger.info(`Found ${selectorKeys.length} selectors for order-detail page`);

    // Verify key selectors exist
    const requiredSelectors = [
      'orderHeader',
      'orderDate',
      'orderProductCount',
      'orderTotalPrice',
      'deliveryType',
      'deliveryAddress',
      'deliveryDateTime',
      'productCard',
      'productNameLink',
      'productQuantity',
      'productPrice',
      'reorderButton',
      'summaryProductsTotal',
      'summaryDeliveryFee',
      'summaryTotal',
    ];

    const missingSelectors = requiredSelectors.filter(key => !selectorKeys.includes(key));
    if (missingSelectors.length > 0) {
      throw new Error(`Missing required selectors: ${missingSelectors.join(', ')}`);
    }

    logger.info('All required selectors found in registry');

    // Test 3: Verify selector resolution
    logger.info('\nTesting selector resolution...');
    for (const selectorKey of requiredSelectors.slice(0, 5)) {
      const selectors = resolver.resolveWithFallbacks('order-detail', selectorKey);
      logger.info(`${selectorKey}: ${selectors.length} selectors (primary + ${selectors.length - 1} fallbacks)`);
    }

    logger.info('\nAll tests passed!');
    logger.info('Tools are ready for use.');
    logger.info('\nNote: To test actual execution, you need:');
    logger.info('  1. Valid Auchan login session');
    logger.info('  2. Order ID and detail URL from order history');
    logger.info('  3. Run: npm run dev:browser and use tools interactively');

  } catch (err) {
    logger.error('Test failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
      logger.info('Browser closed');
    }
  }
}

main().catch(console.error);
