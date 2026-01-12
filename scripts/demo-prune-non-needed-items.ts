#!/usr/bin/env npx ts-node
/**
 * StockPruner Demo Script
 *
 * Demonstrates the intelligent pruning of cart items based on purchase history
 * and consumption patterns.
 *
 * Flow:
 * 1. Sync purchase history from Auchan.pt order history (if needed)
 * 2. Scan current cart
 * 3. Run StockPruner to analyze items
 * 4. Display prune recommendations with reasoning
 *
 * The agent NEVER removes items - it only suggests. The user reviews and approves.
 *
 * Usage:
 *   npx tsx scripts/demo-prune-non-needed-items.ts           # Uses cached history
 *   npx tsx scripts/demo-prune-non-needed-items.ts --sync    # Force sync history first
 */

import 'dotenv/config';

import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';
import { createLogger } from '../dist/utils/logger.js';
import { attachPopupObserver, detachPopupObserver } from '../dist/utils/auto-popup-dismisser.js';
import { loginTool } from '../dist/agents/cart-builder/tools/login.js';
import { navigateToOrderHistoryTool } from '../dist/agents/cart-builder/tools/navigate-to-order-history.js';
import { loadOrderHistoryTool } from '../dist/agents/cart-builder/tools/load-order-history.js';
import { loadOrderDetailTool } from '../dist/agents/cart-builder/tools/load-order-detail.js';
import { scanCartTool } from '../dist/agents/cart-builder/tools/scan-cart.js';
import { createStockPruner } from '../dist/agents/stock-pruner/stock-pruner.js';
import type { AgentContext, WorkingMemory } from '../dist/types/agent.js';
import type { ToolContext } from '../dist/types/tool.js';
import type { PurchaseRecord } from '../dist/agents/stock-pruner/types.js';
import type { CartSnapshot } from '../dist/agents/cart-builder/types.js';

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

// Constants
const HOUSEHOLD_ID = 'household-demo';
const HISTORY_FILE = `data/memory/${HOUSEHOLD_ID}/purchase-history.json`;
const MAX_ORDERS_TO_SYNC = 10;

interface StoredPurchaseHistory {
  records: PurchaseRecord[];
  lastSyncedAt: string;
  ordersCount: number;
}

function printBanner(): void {
  console.log(`
${colors.cyan}╔══════════════════════════════════════════════════════════════╗
║                                                                ║
║   ${colors.bright}AI Shopping Copilot - StockPruner Demo${colors.reset}${colors.cyan}                     ║
║                                                                ║
║   Analyzes your cart and suggests items to remove based on     ║
║   your purchase history and consumption patterns.              ║
║                                                                ║
╚══════════════════════════════════════════════════════════════╝${colors.reset}
`);
}

function printSection(title: string): void {
  console.log(`\n${colors.blue}━━━ ${title} ━━━${colors.reset}\n`);
}

/**
 * Check if purchase history exists and is recent enough
 */
function checkHistoryExists(): { exists: boolean; lastSync?: Date; recordCount?: number } {
  const historyPath = path.resolve(HISTORY_FILE);

  if (!fs.existsSync(historyPath)) {
    return { exists: false };
  }

  try {
    const data = JSON.parse(fs.readFileSync(historyPath, 'utf-8')) as StoredPurchaseHistory;
    return {
      exists: true,
      lastSync: new Date(data.lastSyncedAt),
      recordCount: data.records.length,
    };
  } catch {
    return { exists: false };
  }
}

/**
 * Load purchase history from disk
 */
function loadPurchaseHistory(): PurchaseRecord[] {
  const historyPath = path.resolve(HISTORY_FILE);

  if (!fs.existsSync(historyPath)) {
    return [];
  }

  try {
    const data = JSON.parse(fs.readFileSync(historyPath, 'utf-8')) as StoredPurchaseHistory;
    // Parse dates back to Date objects
    return data.records.map(r => ({
      ...r,
      purchaseDate: new Date(r.purchaseDate),
    }));
  } catch {
    return [];
  }
}

/**
 * Save purchase history to disk
 */
function savePurchaseHistory(records: PurchaseRecord[], ordersCount: number): void {
  const historyPath = path.resolve(HISTORY_FILE);
  const dir = path.dirname(historyPath);

  // Ensure directory exists
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const data: StoredPurchaseHistory = {
    records,
    lastSyncedAt: new Date().toISOString(),
    ordersCount,
  };

  fs.writeFileSync(historyPath, JSON.stringify(data, null, 2));
}

/**
 * Create tool context for executing tools
 */
function createToolContext(context: AgentContext): ToolContext {
  let screenshotCounter = 0;

  return {
    page: context.page,
    logger: context.logger,
    sessionId: context.sessionId,
    config: {
      navigationTimeout: 30000,
      actionTimeout: 10000,
      retryAttempts: 2,
      screenshotOnError: true,
    },
    screenshot: async (name: string): Promise<string> => {
      screenshotCounter++;
      const filename = `screenshots/prune-${screenshotCounter}-${name}.png`;
      await context.page.screenshot({ path: filename });
      return filename;
    },
  };
}

/**
 * Sync purchase history from Auchan.pt
 */
async function syncPurchaseHistory(
  context: AgentContext,
  toolContext: ToolContext,
  email: string
): Promise<PurchaseRecord[]> {
  const allRecords: PurchaseRecord[] = [];

  // Step 1: Login
  printSection('🔐 Logging in to Auchan.pt');
  const loginResult = await loginTool.execute({ email }, toolContext);
  if (!loginResult.success) {
    throw new Error(`Login failed: ${loginResult.error?.message}`);
  }
  console.log(`${colors.green}✓ Logged in successfully${colors.reset}`);

  // Step 2: Navigate to order history
  printSection('📋 Loading Order History');
  const navResult = await navigateToOrderHistoryTool.execute({}, toolContext);
  if (!navResult.success) {
    throw new Error(`Navigation failed: ${navResult.error?.message}`);
  }

  // Step 3: Load order list
  const historyResult = await loadOrderHistoryTool.execute(
    { maxOrders: MAX_ORDERS_TO_SYNC },
    toolContext
  );
  if (!historyResult.success || !historyResult.data) {
    throw new Error(`Failed to load order history: ${historyResult.error?.message}`);
  }

  const orders = historyResult.data.orders;
  console.log(`Found ${orders.length} orders to sync`);

  // Step 4: Extract items from each order
  printSection('📦 Extracting Order Details');

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    if (!order) continue;

    console.log(`  [${i + 1}/${orders.length}] Order ${order.orderId} (${order.date.toLocaleDateString()})`);

    try {
      const detailResult = await loadOrderDetailTool.execute(
        {
          orderId: order.orderId,
          detailUrl: order.detailUrl,
          expandAllProducts: true,
        },
        toolContext
      );

      if (detailResult.success && detailResult.data) {
        const orderDetail = detailResult.data.order;

        // Convert order items to purchase records
        for (const item of orderDetail.items) {
          const record: PurchaseRecord = {
            productId: item.productId,
            productName: item.name,
            purchaseDate: orderDetail.date,
            quantity: item.quantity,
            orderId: order.orderId,
            unitPrice: item.unitPrice,
          };
          allRecords.push(record);
        }

        console.log(`    ${colors.green}✓${colors.reset} Extracted ${orderDetail.items.length} items`);
      } else {
        console.log(`    ${colors.yellow}⚠${colors.reset} Failed to load order details`);
      }
    } catch (err) {
      console.log(`    ${colors.red}✗${colors.reset} Error: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Small delay between orders to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Save to disk
  savePurchaseHistory(allRecords, orders.length);
  console.log(`\n${colors.green}✓ Synced ${allRecords.length} purchase records from ${orders.length} orders${colors.reset}`);
  console.log(`${colors.dim}  Saved to: ${HISTORY_FILE}${colors.reset}`);

  return allRecords;
}

/**
 * Print the prune report in a human-readable format
 */
function printPruneReport(
  cart: CartSnapshot,
  recommendedRemovals: Array<{
    productName: string;
    confidence: number;
    reason: string;
    daysSinceLastPurchase: number;
  }>,
  uncertainItems: Array<{
    productName: string;
    confidence: number;
    reason: string;
  }>,
  keepItems: Array<{
    productName: string;
    reason: string;
  }>
): void {
  printSection('🧹 STOCK PRUNER REPORT');

  // Summary
  console.log(`${colors.bright}📊 Cart Analysis:${colors.reset}`);
  console.log(`  Items analyzed: ${cart.itemCount}`);
  console.log(`  ${colors.red}Suggested for removal:${colors.reset} ${recommendedRemovals.length}`);
  console.log(`  ${colors.yellow}Uncertain (review):${colors.reset} ${uncertainItems.length}`);
  console.log(`  ${colors.green}Keep in cart:${colors.reset} ${keepItems.length}`);
  console.log();

  // Recommended removals
  if (recommendedRemovals.length > 0) {
    console.log(`${colors.red}${colors.bright}🚫 RECOMMENDED REMOVALS (High Confidence):${colors.reset}`);
    console.log();

    for (let i = 0; i < recommendedRemovals.length && i < 10; i++) {
      const item = recommendedRemovals[i];
      if (!item) continue;

      console.log(`  ${i + 1}. ${colors.bright}${item.productName}${colors.reset}`);
      console.log(`     ${colors.dim}${item.reason}${colors.reset}`);
      console.log(`     Confidence: ${(item.confidence * 100).toFixed(0)}%`);
      console.log();
    }

    if (recommendedRemovals.length > 10) {
      console.log(`  ${colors.dim}... and ${recommendedRemovals.length - 10} more${colors.reset}`);
      console.log();
    }
  }

  // Uncertain items
  if (uncertainItems.length > 0) {
    console.log(`${colors.yellow}${colors.bright}⚠️ UNCERTAIN (Review Recommended):${colors.reset}`);
    console.log();

    for (let i = 0; i < uncertainItems.length && i < 5; i++) {
      const item = uncertainItems[i];
      if (!item) continue;

      console.log(`  ${i + 1}. ${colors.bright}${item.productName}${colors.reset}`);
      console.log(`     ${colors.dim}${item.reason}${colors.reset}`);
      console.log(`     Confidence: ${(item.confidence * 100).toFixed(0)}%`);
      console.log();
    }

    if (uncertainItems.length > 5) {
      console.log(`  ${colors.dim}... and ${uncertainItems.length - 5} more${colors.reset}`);
      console.log();
    }
  }

  // Keep items (show a few examples)
  if (keepItems.length > 0) {
    console.log(`${colors.green}${colors.bright}✅ KEEP IN CART (Due Soon):${colors.reset}`);
    console.log();

    for (let i = 0; i < 5 && i < keepItems.length; i++) {
      const item = keepItems[i];
      if (!item) continue;

      console.log(`  ${i + 1}. ${colors.bright}${item.productName}${colors.reset}`);
      console.log(`     ${colors.dim}${item.reason}${colors.reset}`);
      console.log();
    }

    if (keepItems.length > 5) {
      console.log(`  ${colors.dim}... and ${keepItems.length - 5} more items to keep${colors.reset}`);
      console.log();
    }
  }

  // Safety notice
  console.log(`${colors.cyan}${colors.bright}━━━ SAFETY NOTICE ━━━${colors.reset}`);
  console.log(`${colors.cyan}The agent has NOT removed any items from your cart.${colors.reset}`);
  console.log(`${colors.cyan}Review the recommendations above and remove items manually if desired.${colors.reset}`);
}

async function main(): Promise<void> {
  printBanner();

  const logger = createLogger('info', 'PruneDemo');

  // Check for --sync flag
  const forceSync = process.argv.includes('--sync');

  // Check credentials
  const email = process.env.AUCHAN_EMAIL;
  if (!email) {
    console.error(`${colors.red}Error: AUCHAN_EMAIL environment variable not set.${colors.reset}`);
    console.log('\nSet your credentials:');
    console.log('  export AUCHAN_EMAIL="your-email@example.com"');
    console.log('  export AUCHAN_PASSWORD="your-password"');
    process.exit(1);
  }

  // Check if we have purchase history
  const historyStatus = checkHistoryExists();

  if (!historyStatus.exists) {
    console.log(`${colors.yellow}No purchase history found. Will sync from Auchan.pt first.${colors.reset}`);
  } else if (forceSync) {
    console.log(`${colors.yellow}Force sync requested. Will re-sync purchase history.${colors.reset}`);
  } else {
    console.log(`${colors.green}Found existing purchase history:${colors.reset}`);
    console.log(`  Records: ${historyStatus.recordCount}`);
    console.log(`  Last synced: ${historyStatus.lastSync?.toLocaleString()}`);
    console.log();
    console.log(`${colors.dim}(Use --sync to force re-sync)${colors.reset}`);
  }

  // Launch browser
  printSection('🌐 Launching Browser');
  const browser = await chromium.launch({
    headless: false,
    slowMo: 50,
  });

  const browserContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  const page = await browserContext.newPage();

  try {
    // Attach popup dismisser
    await attachPopupObserver(page, logger);

    // Create contexts
    const sessionId = `prune-demo-${Date.now()}`;
    const workingMemory: WorkingMemory = {
      cartItems: [],
      unavailableItems: [],
      substitutions: [],
      deliverySlots: [],
    };

    const context: AgentContext = {
      page,
      logger,
      sessionId,
      workingMemory,
    };

    const toolContext = createToolContext(context);

    // Sync purchase history if needed
    let purchaseHistory: PurchaseRecord[];

    if (!historyStatus.exists || forceSync) {
      purchaseHistory = await syncPurchaseHistory(context, toolContext, email);
    } else {
      purchaseHistory = loadPurchaseHistory();
      console.log(`${colors.green}✓ Loaded ${purchaseHistory.length} purchase records from cache${colors.reset}`);

      // Still need to login for cart access
      printSection('🔐 Logging in to Auchan.pt');
      const loginResult = await loginTool.execute({ email }, toolContext);
      if (!loginResult.success) {
        throw new Error(`Login failed: ${loginResult.error?.message}`);
      }
      console.log(`${colors.green}✓ Logged in successfully${colors.reset}`);
    }

    // Scan current cart
    printSection('🛒 Scanning Current Cart');
    const cartResult = await scanCartTool.execute({}, toolContext);

    if (!cartResult.success || !cartResult.data) {
      throw new Error(`Failed to scan cart: ${cartResult.error?.message}`);
    }

    const cart = cartResult.data.cart;
    console.log(`${colors.green}✓ Found ${cart.itemCount} items in cart (€${cart.totalPrice.toFixed(2)})${colors.reset}`);

    if (cart.itemCount === 0) {
      console.log(`\n${colors.yellow}Cart is empty. Nothing to prune.${colors.reset}`);
      console.log('Run the demo-merge-past-three-orders-onto-cart.ts script first to populate your cart.');
      return;
    }

    // Run StockPruner
    printSection('🤖 Running StockPruner Analysis');
    console.log(`Analyzing ${cart.itemCount} cart items against ${purchaseHistory.length} purchase records...`);
    console.log();

    const stockPruner = createStockPruner({
      conservativeMode: true,
      minPruneConfidence: 0.7,
      useLearnedCadences: true,
    });

    const pruneResult = await stockPruner.run(context, {
      cart,
      purchaseHistory,
      referenceDate: new Date(),
    });

    if (!pruneResult.success || !pruneResult.data) {
      throw new Error(`StockPruner failed: ${pruneResult.error?.message}`);
    }

    const { recommendedRemovals, uncertainItems, keepItems } = pruneResult.data;

    // Print the report
    printPruneReport(cart, recommendedRemovals, uncertainItems, keepItems);

    // Keep browser open for review
    printSection('👀 Review Your Cart');
    console.log('Browser will stay open for 60 seconds for you to review.');
    console.log('(Press Ctrl+C to exit earlier)');

    await new Promise(resolve => setTimeout(resolve, 60000));

  } catch (error) {
    console.error(`${colors.red}Error:${colors.reset}`, error);
  } finally {
    try {
      await detachPopupObserver(page);
    } catch {
      // Page might already be closed
    }
    await browser.close();
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
