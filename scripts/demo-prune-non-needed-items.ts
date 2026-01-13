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
 *   npx tsx scripts/demo-prune-non-needed-items.ts              # Uses cached history
 *   npx tsx scripts/demo-prune-non-needed-items.ts --sync       # Sync NEW orders only (idempotent)
 *   npx tsx scripts/demo-prune-non-needed-items.ts --force-sync # Full re-sync ALL orders
 *   npx tsx scripts/demo-prune-non-needed-items.ts --llm        # Enable LLM enhancement (requires ANTHROPIC_API_KEY)
 */

import 'dotenv/config';

import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';
import { createLogger } from '../dist/utils/logger.js';
import { attachPopupObserver, detachPopupObserver } from '../dist/utils/auto-popup-dismisser.js';
import { LoginTool } from '../dist/tools/login.js';
import {
  navigateToOrderHistoryTool,
  loadOrderHistoryTool,
  loadOrderDetailTool,
  scanCartTool,
} from '../dist/agents/cart-builder/tools/index.js';
import { createStockPruner } from '../dist/agents/stock-pruner/stock-pruner.js';
import { createLLMEnhancer } from '../dist/agents/stock-pruner/llm-enhancer.js';
import type { AgentContext, WorkingMemory } from '../dist/types/agent.js';
import type { ToolContext } from '../dist/types/tool.js';
import type { PurchaseRecord, PruneDecision } from '../dist/agents/stock-pruner/types.js';
import type { CartSnapshot } from '../dist/agents/cart-builder/types.js';
import type { EnhancedPruneDecision } from '../dist/agents/stock-pruner/llm-enhancer.js';

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
const MAX_ORDERS_TO_SYNC = 100; // Sync all orders (practical limit)

// Create login tool instance
const loginTool = new LoginTool();

interface StoredPurchaseHistory {
  records: PurchaseRecord[];
  lastSyncedAt: string;
  ordersCount: number;
  /** Order IDs that have been synced (for idempotency) */
  syncedOrderIds: string[];
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
 * Check if purchase history exists and return metadata
 */
function checkHistoryExists(): {
  exists: boolean;
  lastSync?: Date;
  recordCount?: number;
  syncedOrderIds?: string[];
} {
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
      syncedOrderIds: data.syncedOrderIds || [],
    };
  } catch {
    return { exists: false };
  }
}

/**
 * Load full purchase history data from disk
 */
function loadPurchaseHistoryData(): { records: PurchaseRecord[]; syncedOrderIds: string[] } {
  const historyPath = path.resolve(HISTORY_FILE);

  if (!fs.existsSync(historyPath)) {
    return { records: [], syncedOrderIds: [] };
  }

  try {
    const data = JSON.parse(fs.readFileSync(historyPath, 'utf-8')) as StoredPurchaseHistory;
    // Parse dates back to Date objects
    const records = data.records.map(r => ({
      ...r,
      purchaseDate: new Date(r.purchaseDate),
    }));
    return {
      records,
      syncedOrderIds: data.syncedOrderIds || []
    };
  } catch {
    return { records: [], syncedOrderIds: [] };
  }
}

/**
 * Load purchase history records only (for StockPruner)
 */
function loadPurchaseHistory(): PurchaseRecord[] {
  return loadPurchaseHistoryData().records;
}

/**
 * Save purchase history to disk with synced order tracking.
 * CRITICAL: Deduplicates records and sorts deterministically.
 */
function savePurchaseHistory(
  records: PurchaseRecord[],
  syncedOrderIds: string[]
): void {
  const historyPath = path.resolve(HISTORY_FILE);
  const dir = path.dirname(historyPath);

  // Ensure directory exists
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // DEDUPLICATE: Use orderId + productName as composite key
  const seenKeys = new Set<string>();
  const deduplicatedRecords: PurchaseRecord[] = [];

  for (const record of records) {
    const key = `${record.orderId}|${record.productName}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      deduplicatedRecords.push(record);
    }
  }

  // SORT: By date descending (newest first), then by orderId descending
  deduplicatedRecords.sort((a, b) => {
    const dateA = new Date(a.purchaseDate).getTime();
    const dateB = new Date(b.purchaseDate).getTime();
    if (dateB !== dateA) return dateB - dateA;
    // Secondary sort by orderId descending
    const orderA = a.orderId || '';
    const orderB = b.orderId || '';
    return orderB.localeCompare(orderA);
  });

  const duplicatesRemoved = records.length - deduplicatedRecords.length;
  if (duplicatesRemoved > 0) {
    console.log(`${colors.yellow}  Removed ${duplicatesRemoved} duplicate records${colors.reset}`);
  }

  const data: StoredPurchaseHistory = {
    records: deduplicatedRecords,
    lastSyncedAt: new Date().toISOString(),
    ordersCount: syncedOrderIds.length,
    syncedOrderIds: [...new Set(syncedOrderIds)], // Deduplicate order IDs too
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
 * Sync purchase history from Auchan.pt (idempotent - skips already-synced orders)
 */
async function syncPurchaseHistory(
  context: AgentContext,
  toolContext: ToolContext,
  email: string,
  forceFullSync: boolean = false
): Promise<PurchaseRecord[]> {
  // Load existing history for idempotency
  const existing = loadPurchaseHistoryData();
  const existingRecords = forceFullSync ? [] : existing.records;
  const syncedOrderIds = new Set(forceFullSync ? [] : existing.syncedOrderIds);

  if (syncedOrderIds.size > 0) {
    console.log(`${colors.dim}Already synced ${syncedOrderIds.size} orders, will skip those${colors.reset}`);
  }

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

  const allOrders = historyResult.data.orders;
  const ordersToSync = allOrders.filter(o => !syncedOrderIds.has(o.orderId));

  console.log(`Found ${allOrders.length} total orders, ${ordersToSync.length} new to sync`);

  if (ordersToSync.length === 0) {
    console.log(`${colors.green}✓ All orders already synced${colors.reset}`);
    return existingRecords;
  }

  // Step 4: Extract items from each NEW order
  printSection('📦 Extracting Order Details');
  const newRecords: PurchaseRecord[] = [];
  const newSyncedIds: string[] = [];

  for (let i = 0; i < ordersToSync.length; i++) {
    const order = ordersToSync[i];
    if (!order) continue;

    console.log(`  [${i + 1}/${ordersToSync.length}] Order ${order.orderId} (${order.date.toLocaleDateString()})`);

    try {
      // Re-attach popup observer before each order detail page to catch popups immediately
      await attachPopupObserver(context.page, context.logger);

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
          newRecords.push(record);
        }

        newSyncedIds.push(order.orderId);
        console.log(`    ${colors.green}✓${colors.reset} Extracted ${orderDetail.items.length} items`);
      } else {
        console.log(`    ${colors.yellow}⚠${colors.reset} Failed to load order details`);
      }
    } catch (err) {
      console.log(`    ${colors.red}✗${colors.reset} Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Merge with existing records
  const allRecords = [...existingRecords, ...newRecords];
  const allSyncedIds = [...syncedOrderIds, ...newSyncedIds];

  // Save to disk
  savePurchaseHistory(allRecords, allSyncedIds);
  console.log(`\n${colors.green}✓ Synced ${newRecords.length} new records from ${newSyncedIds.length} orders${colors.reset}`);
  console.log(`${colors.green}  Total: ${allRecords.length} records from ${allSyncedIds.length} orders${colors.reset}`);
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
    llmReasoning?: string;
    wasLLMEnhanced?: boolean;
  }>,
  uncertainItems: Array<{
    productName: string;
    confidence: number;
    reason: string;
    llmReasoning?: string;
    wasLLMEnhanced?: boolean;
  }>,
  keepItems: Array<{
    productName: string;
    reason: string;
    llmReasoning?: string;
    wasLLMEnhanced?: boolean;
  }>,
  llmStats?: { itemsEnhanced: number; tokenUsage?: { inputTokens: number; outputTokens: number } }
): void {
  printSection('🧹 STOCK PRUNER REPORT');

  // Summary
  console.log(`${colors.bright}📊 Cart Analysis:${colors.reset}`);
  console.log(`  Items analyzed: ${cart.itemCount}`);
  console.log(`  ${colors.red}Suggested for removal:${colors.reset} ${recommendedRemovals.length}`);
  console.log(`  ${colors.yellow}Uncertain (review):${colors.reset} ${uncertainItems.length}`);
  console.log(`  ${colors.green}Keep in cart:${colors.reset} ${keepItems.length}`);

  // LLM stats
  if (llmStats && llmStats.itemsEnhanced > 0) {
    console.log();
    console.log(`${colors.magenta}🤖 LLM Enhancement:${colors.reset}`);
    console.log(`  Items enhanced: ${llmStats.itemsEnhanced}`);
    if (llmStats.tokenUsage) {
      console.log(`  Tokens used: ${llmStats.tokenUsage.inputTokens} in / ${llmStats.tokenUsage.outputTokens} out`);
    }
  }
  console.log();

  // Recommended removals
  if (recommendedRemovals.length > 0) {
    console.log(`${colors.red}${colors.bright}🚫 RECOMMENDED REMOVALS (High Confidence):${colors.reset}`);
    console.log();

    for (let i = 0; i < recommendedRemovals.length && i < 10; i++) {
      const item = recommendedRemovals[i];
      if (!item) continue;

      const llmBadge = item.wasLLMEnhanced ? `${colors.magenta}[LLM]${colors.reset} ` : '';
      console.log(`  ${i + 1}. ${llmBadge}${colors.bright}${item.productName}${colors.reset}`);
      console.log(`     ${colors.dim}${item.reason}${colors.reset}`);
      if (item.llmReasoning && item.llmReasoning !== item.reason) {
        console.log(`     ${colors.magenta}LLM: ${item.llmReasoning}${colors.reset}`);
      }
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

      const llmBadge = item.wasLLMEnhanced ? `${colors.magenta}[LLM]${colors.reset} ` : '';
      console.log(`  ${i + 1}. ${llmBadge}${colors.bright}${item.productName}${colors.reset}`);
      console.log(`     ${colors.dim}${item.reason}${colors.reset}`);
      if (item.llmReasoning && item.llmReasoning !== item.reason) {
        console.log(`     ${colors.magenta}LLM: ${item.llmReasoning}${colors.reset}`);
      }
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

      const llmBadge = item.wasLLMEnhanced ? `${colors.magenta}[LLM]${colors.reset} ` : '';
      console.log(`  ${i + 1}. ${llmBadge}${colors.bright}${item.productName}${colors.reset}`);
      console.log(`     ${colors.dim}${item.reason}${colors.reset}`);
      if (item.llmReasoning && item.llmReasoning !== item.reason) {
        console.log(`     ${colors.magenta}LLM: ${item.llmReasoning}${colors.reset}`);
      }
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

  // Check for --sync, --force-sync, and --llm flags
  const syncNewOrders = process.argv.includes('--sync');
  const forceFullSync = process.argv.includes('--force-sync');
  const forceSync = syncNewOrders || forceFullSync;
  const useLLM = process.argv.includes('--llm');

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
  } else if (forceFullSync) {
    console.log(`${colors.yellow}Force full sync requested. Will re-sync ALL orders.${colors.reset}`);
  } else if (syncNewOrders) {
    console.log(`${colors.yellow}Sync requested. Will sync NEW orders only (idempotent).${colors.reset}`);
  } else {
    console.log(`${colors.green}Found existing purchase history:${colors.reset}`);
    console.log(`  Records: ${historyStatus.recordCount}`);
    console.log(`  Last synced: ${historyStatus.lastSync?.toLocaleString()}`);
    console.log();
    console.log(`${colors.dim}(Use --sync to sync new orders, --force-sync to re-sync all)${colors.reset}`);
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
      purchaseHistory = await syncPurchaseHistory(context, toolContext, email, forceFullSync);
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

    const cart = cartResult.data.snapshot;
    console.log(`${colors.green}✓ Found ${cart.itemCount} items in cart (€${cart.totalPrice.toFixed(2)})${colors.reset}`);

    if (cart.itemCount === 0) {
      console.log(`\n${colors.yellow}Cart is empty. Nothing to prune.${colors.reset}`);
      console.log('Run the demo-merge-past-three-orders-onto-cart.ts script first to populate your cart.');
      return;
    }

    // Run StockPruner
    printSection('🤖 Running StockPruner Analysis');
    console.log(`Analyzing ${cart.itemCount} cart items against ${purchaseHistory.length} purchase records...`);
    if (useLLM) {
      console.log(`${colors.magenta}LLM enhancement enabled${colors.reset}`);
    }
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

    let { recommendedRemovals, uncertainItems, keepItems } = pruneResult.data;
    let llmStats: { itemsEnhanced: number; tokenUsage?: { inputTokens: number; outputTokens: number } } | undefined;

    // Run LLM enhancement if enabled
    if (useLLM) {
      const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
      if (!anthropicApiKey) {
        console.log(`${colors.yellow}⚠️ ANTHROPIC_API_KEY not set, skipping LLM enhancement${colors.reset}`);
      } else {
        printSection('🤖 Running LLM Enhancement');
        console.log('Enhancing uncertain decisions with Claude...');

        const llmEnhancer = createLLMEnhancer(
          {
            enabled: true,
            apiKey: anthropicApiKey,
            uncertaintyThreshold: 0.6,
            highConsequenceCategories: ['baby-care' as any, 'pet-supplies' as any],
          },
          {
            info: (msg, meta) => console.log(`${colors.cyan}[LLM] ${msg}${colors.reset}`, meta ? JSON.stringify(meta) : ''),
            warn: (msg, meta) => console.log(`${colors.yellow}[LLM WARN] ${msg}${colors.reset}`, meta ? JSON.stringify(meta) : ''),
            error: (msg, meta) => console.log(`${colors.red}[LLM ERROR] ${msg}${colors.reset}`, meta ? JSON.stringify(meta) : ''),
          }
        );

        if (llmEnhancer.isAvailable()) {
          // Build analytics from purchase history for rich context
          console.log(`Building analytics from ${purchaseHistory.length} purchase records...`);
          llmEnhancer.buildAnalytics(purchaseHistory.map(r => ({
            productName: r.productName,
            quantity: r.quantity,
            purchaseDate: r.purchaseDate,
            orderId: r.orderId || '',
            price: r.unitPrice,
          })));
          const analyticsEngine = llmEnhancer.getAnalyticsEngine();
          console.log(`${colors.green}✓ Built analytics for ${analyticsEngine.productCount} products from ${analyticsEngine.orderCount} orders${colors.reset}`);

          // Collect all decisions for enhancement
          const allDecisions: PruneDecision[] = [
            ...recommendedRemovals.map(r => ({
              productName: r.productName,
              prune: true,
              confidence: r.confidence,
              reason: r.reason,
              context: {
                daysSinceLastPurchase: r.daysSinceLastPurchase,
                category: 'grocery' as any,
                restockCadenceDays: 14,
              },
            })),
            ...uncertainItems.map(u => ({
              productName: u.productName,
              prune: u.confidence > 0.5,
              confidence: u.confidence,
              reason: u.reason,
              context: {
                daysSinceLastPurchase: 0,
                category: 'grocery' as any,
                restockCadenceDays: 14,
              },
            })),
            ...keepItems.map(k => ({
              productName: k.productName,
              prune: false,
              confidence: 0.8,
              reason: k.reason,
              context: {
                daysSinceLastPurchase: 0,
                category: 'grocery' as any,
                restockCadenceDays: 14,
              },
            })),
          ];

          try {
            const enhanceResult = await llmEnhancer.enhance(allDecisions);

            // Log detected bundles
            if (enhanceResult.analyticsSummary?.detectedBundles.length) {
              console.log();
              console.log(`${colors.cyan}📦 Detected bundles in cart:${colors.reset}`);
              for (const bundle of enhanceResult.analyticsSummary.detectedBundles) {
                console.log(`  - ${bundle.name}: ${bundle.products.slice(0, 3).join(', ')}${bundle.products.length > 3 ? '...' : ''}`);
              }
            }

            llmStats = {
              itemsEnhanced: enhanceResult.itemsEnhanced,
              tokenUsage: enhanceResult.tokenUsage,
            };

            console.log(`${colors.green}✓ Enhanced ${enhanceResult.itemsEnhanced} items with LLM${colors.reset}`);
            if (enhanceResult.tokenUsage) {
              console.log(`  Tokens: ${enhanceResult.tokenUsage.inputTokens} in / ${enhanceResult.tokenUsage.outputTokens} out`);
            }

            // Re-categorize based on enhanced decisions
            const enhancedRemovals: typeof recommendedRemovals = [];
            const enhancedUncertain: typeof uncertainItems = [];
            const enhancedKeep: typeof keepItems = [];

            for (const decision of enhanceResult.decisions) {
              const enhanced = decision as EnhancedPruneDecision;
              if (enhanced.prune && enhanced.confidence >= 0.7) {
                enhancedRemovals.push({
                  productName: enhanced.productName,
                  confidence: enhanced.confidence,
                  reason: enhanced.reason,
                  daysSinceLastPurchase: enhanced.context.daysSinceLastPurchase ?? 0,
                  llmReasoning: enhanced.llmReasoning,
                  wasLLMEnhanced: enhanced.wasLLMEnhanced,
                });
              } else if (enhanced.confidence < 0.6) {
                enhancedUncertain.push({
                  productName: enhanced.productName,
                  confidence: enhanced.confidence,
                  reason: enhanced.reason,
                  llmReasoning: enhanced.llmReasoning,
                  wasLLMEnhanced: enhanced.wasLLMEnhanced,
                });
              } else {
                enhancedKeep.push({
                  productName: enhanced.productName,
                  reason: enhanced.reason,
                  llmReasoning: enhanced.llmReasoning,
                  wasLLMEnhanced: enhanced.wasLLMEnhanced,
                });
              }
            }

            recommendedRemovals = enhancedRemovals;
            uncertainItems = enhancedUncertain;
            keepItems = enhancedKeep;

          } catch (err) {
            console.log(`${colors.red}✗ LLM enhancement failed: ${err instanceof Error ? err.message : String(err)}${colors.reset}`);
            console.log(`${colors.yellow}Falling back to heuristics only${colors.reset}`);
          }
        } else {
          console.log(`${colors.yellow}⚠️ LLM not available${colors.reset}`);
        }
      }
    }

    // Print the report
    printPruneReport(cart, recommendedRemovals, uncertainItems, keepItems, llmStats);

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
