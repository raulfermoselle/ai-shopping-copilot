#!/usr/bin/env npx tsx
/**
 * Interactive CLI Session Runner
 *
 * Runs a complete AI Shopping Copilot session with:
 * - Login to Auchan.pt
 * - CartBuilder (load/merge orders)
 * - StockPruner with LLM enhancement
 * - SlotScout (if enabled)
 * - CLI Review Pack display
 * - User approval prompt
 *
 * SAFETY: This script NEVER confirms orders or navigates to payment pages.
 *
 * Usage:
 *   npx tsx scripts/run-session.ts
 *   npx tsx scripts/run-session.ts --skip-slots
 *   npx tsx scripts/run-session.ts --headless
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as readline from 'readline';
import { chromium, type Browser, type Page } from 'playwright';
import { createLogger } from '../dist/utils/logger.js';
import { Coordinator } from '../dist/agents/coordinator/coordinator.js';
import type { ReviewPack as CoordinatorReviewPack } from '../dist/agents/coordinator/types.js';
import type { ReviewPack as ControlPanelReviewPack, SlotOption, SuggestedRemoval, AddedItem, QuantityChange, UnavailableItem } from '../dist/control-panel/types.js';
import { CLIRenderer } from '../dist/control-panel/cli-renderer.js';
import { loadPurchaseHistoryFromFile } from '../dist/agents/stock-pruner/heuristics.js';

// =============================================================================
// Configuration
// =============================================================================

const logger = createLogger('run-session');

interface SessionConfig {
  headless: boolean;
  enableStockPruning: boolean;
  enableSlotScouting: boolean;
  enableSubstitution: boolean;
  maxOrdersToLoad: number;
  householdId: string;
}

function parseArgs(): SessionConfig {
  const args = process.argv.slice(2);
  return {
    headless: args.includes('--headless'),
    enableStockPruning: !args.includes('--skip-pruning'),
    enableSlotScouting: !args.includes('--skip-slots'),
    enableSubstitution: args.includes('--enable-substitution'),
    maxOrdersToLoad: parseInt(args.find(a => a.startsWith('--orders='))?.split('=')[1] ?? '3'),
    householdId: args.find(a => a.startsWith('--household='))?.split('=')[1] ?? 'default',
  };
}

// =============================================================================
// Review Pack Adapter
// =============================================================================

/**
 * Transform Coordinator's ReviewPack to Control Panel format.
 */
function adaptReviewPack(coordPack: CoordinatorReviewPack): ControlPanelReviewPack {
  // Transform cart items to AddedItem format
  const addedItems: AddedItem[] = coordPack.cart.after.map(item => ({
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    totalPrice: item.totalPrice,
    available: item.available,
  }));

  // Transform pruning recommendations to SuggestedRemoval format
  const suggestedRemovals: SuggestedRemoval[] = [];
  if (coordPack.pruning?.recommendedRemovals) {
    for (const removal of coordPack.pruning.recommendedRemovals) {
      suggestedRemovals.push({
        name: removal.productName,
        quantity: 1, // Default
        unitPrice: 0, // Not available in coordinator output
        reason: removal.reason,
        confidence: removal.confidence,
        daysSinceLastPurchase: removal.daysSinceLastPurchase,
        userAction: 'pending',
      });
    }
  }
  // Also add uncertain items as lower-confidence suggestions
  if (coordPack.pruning?.uncertainItems) {
    for (const uncertain of coordPack.pruning.uncertainItems) {
      suggestedRemovals.push({
        name: uncertain.productName,
        quantity: 1,
        unitPrice: 0,
        reason: uncertain.reason ?? 'Uncertain - needs review',
        confidence: uncertain.confidence,
        daysSinceLastPurchase: uncertain.daysSinceLastPurchase,
        userAction: 'pending',
      });
    }
  }

  // Transform quantity changes
  const quantityChanges: QuantityChange[] = coordPack.cart.diff.quantityChanged.map(change => ({
    name: change.name,
    previousQuantity: change.previousQuantity,
    newQuantity: change.newQuantity,
    unitPrice: change.unitPrice,
    reason: change.reason,
  }));

  // Transform unavailable items (from substitutions if available)
  const unavailableItems: UnavailableItem[] = [];
  if (coordPack.substitutions?.substitutionResults) {
    for (const sub of coordPack.substitutions.substitutionResults) {
      if (sub.originalItem) {
        unavailableItems.push({
          name: sub.originalItem.name,
          quantity: sub.originalItem.quantity,
          unitPrice: sub.originalItem.unitPrice,
          substitutes: sub.substitutes?.map(s => ({
            productId: s.productId,
            name: s.name,
            unitPrice: s.unitPrice,
            priceDelta: s.unitPrice - sub.originalItem.unitPrice,
            reason: s.reason ?? 'Alternative',
            score: s.matchScore ?? 0.5,
            selected: false,
          })) ?? [],
          userAction: 'pending',
        });
      }
    }
  }

  // Transform delivery slots
  const slotOptions: SlotOption[] = [];
  let slotsAvailable = false;
  if (coordPack.slots?.rankedSlots) {
    slotsAvailable = true;
    for (const slot of coordPack.slots.rankedSlots) {
      slotOptions.push({
        date: new Date(slot.date),
        dayName: slot.dayName ?? new Date(slot.date).toLocaleDateString('en-US', { weekday: 'short' }),
        startTime: slot.startTime,
        endTime: slot.endTime,
        deliveryCost: slot.price,
        isFree: slot.price === 0,
        rank: slot.rank,
        reason: slot.reason ?? 'Available',
        selected: false,
      });
    }
  }

  // Calculate totals
  const subtotal = coordPack.cart.summary.totalPrice;
  const estimatedDeliveryCost = slotOptions.length > 0 ? slotOptions[0]?.deliveryCost ?? 0 : 0;

  // Extract confidence
  const confidence = coordPack.confidence?.cartAccuracy ?? 0.7;

  // Extract warnings
  const warnings: string[] = coordPack.warnings?.map(w => w.message) ?? [];

  return {
    sessionId: coordPack.sessionId,
    generatedAt: coordPack.generatedAt,
    addedItems,
    suggestedRemovals,
    quantityChanges,
    unavailableItems,
    slotOptions,
    slotsAvailable,
    subtotal,
    estimatedDeliveryCost,
    estimatedTotal: subtotal + estimatedDeliveryCost,
    ordersAnalyzed: coordPack.confidence?.sourceOrders ?? [],
    confidence,
    warnings,
  };
}

// =============================================================================
// User Input
// =============================================================================

/**
 * Prompt user for approval decision.
 */
async function promptForApproval(): Promise<'approve' | 'reject' | 'quit'> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const prompt = () => {
      rl.question('\nYour choice [A/R/Q]: ', (answer) => {
        const choice = answer.trim().toLowerCase();
        if (choice === 'a' || choice === 'approve') {
          rl.close();
          resolve('approve');
        } else if (choice === 'r' || choice === 'reject') {
          rl.close();
          resolve('reject');
        } else if (choice === 'q' || choice === 'quit') {
          rl.close();
          resolve('quit');
        } else {
          console.log('Invalid choice. Enter A (Approve), R (Reject), or Q (Quit)');
          prompt();
        }
      });
    };
    prompt();
  });
}

// =============================================================================
// Main Session Runner
// =============================================================================

async function runSession(config: SessionConfig): Promise<void> {
  let browser: Browser | null = null;

  try {
    // Validate environment
    const email = process.env.AUCHAN_EMAIL;
    const password = process.env.AUCHAN_PASSWORD;

    if (!email || !password) {
      throw new Error('Missing AUCHAN_EMAIL or AUCHAN_PASSWORD in .env');
    }

    console.log('\n');
    console.log('='.repeat(55));
    console.log('   AI SHOPPING COPILOT - Interactive Session Runner');
    console.log('='.repeat(55));
    console.log('\n');

    logger.info('Starting session', {
      headless: config.headless,
      enableStockPruning: config.enableStockPruning,
      enableSlotScouting: config.enableSlotScouting,
      maxOrdersToLoad: config.maxOrdersToLoad,
    });

    // Launch browser
    console.log('Launching browser...');
    browser = await chromium.launch({
      headless: config.headless,
      slowMo: config.headless ? 0 : 100,
    });

    const context = await browser.newContext({
      viewport: { width: 1400, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });

    const page = await context.newPage();

    // Load purchase history for StockPruner
    let purchaseHistory: Array<{ productName: string; purchaseDate: Date; quantity: number; unitPrice: number; orderId: string }> = [];
    if (config.enableStockPruning) {
      console.log('Loading purchase history...');
      try {
        purchaseHistory = loadPurchaseHistoryFromFile('data/memory/purchase-history.json');
        console.log(`  Loaded ${purchaseHistory.length} purchase records`);
      } catch (err) {
        console.log('  No purchase history found (will use empty)');
      }
    }

    // Create Coordinator with config
    console.log('\nInitializing Coordinator...');
    const coordinator = new Coordinator({
      maxOrdersToLoad: config.maxOrdersToLoad,
      enableStockPruning: config.enableStockPruning,
      enableSlotScouting: config.enableSlotScouting,
      enableSubstitution: config.enableSubstitution,
      captureScreenshots: true,
      sessionTimeout: 300000, // 5 minutes
      maxRetries: 2,
    });

    // Run the session
    console.log('\nRunning Coordinator session...\n');
    const startTime = Date.now();

    const result = await coordinator.run(
      {
        page,
        logger,
        sessionId: `session-${Date.now()}`,
      },
      email,
      config.householdId,
      purchaseHistory.map(h => ({
        productName: h.productName,
        purchaseDate: h.purchaseDate,
        quantity: h.quantity,
        unitPrice: h.unitPrice,
        orderId: h.orderId,
      }))
    );

    const durationMs = Date.now() - startTime;
    console.log(`\nSession completed in ${(durationMs / 1000).toFixed(1)}s\n`);

    // Handle result
    if (!result.success) {
      console.log('\nSession FAILED');
      console.log(`Error: ${result.error?.message ?? 'Unknown error'}`);
      if (result.logs) {
        console.log('\nLogs:');
        for (const log of result.logs) {
          console.log(`  ${log}`);
        }
      }
      return;
    }

    // Get Review Pack
    const coordPack = result.data?.reviewPack;
    if (!coordPack) {
      console.log('\nNo Review Pack generated');
      return;
    }

    // Adapt to control-panel format
    const cpPack = adaptReviewPack(coordPack);

    // Render using CLI Renderer
    const renderer = new CLIRenderer(60);
    console.log('\n');
    console.log(renderer.renderReviewPack(cpPack));

    // Show logs
    if (result.logs && result.logs.length > 0) {
      console.log('\nSession Log:');
      for (const log of result.logs.slice(-10)) {
        console.log(`  ${log}`);
      }
    }

    // Prompt for approval
    const decision = await promptForApproval();

    console.log('\n');
    switch (decision) {
      case 'approve':
        console.log('Cart APPROVED');
        console.log('Cart is ready for manual checkout at:');
        console.log('  https://www.auchan.pt/pt/carrinho-compras');
        console.log('\nSAFETY: This script does not complete checkout.');
        console.log('Please review the cart manually before placing order.');
        break;
      case 'reject':
        console.log('Cart REJECTED');
        console.log('No changes applied. You can re-run the session.');
        break;
      case 'quit':
        console.log('Session cancelled.');
        break;
    }

    // Keep browser open briefly for manual inspection (non-headless)
    if (!config.headless) {
      console.log('\nBrowser will close in 10 seconds...');
      await page.waitForTimeout(10000);
    }

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Session failed', { error: err.message });
    console.error('\nFATAL ERROR:', err.message);
    throw err;
  } finally {
    if (browser) {
      await browser.close();
      logger.info('Browser closed');
    }
  }
}

// =============================================================================
// Entry Point
// =============================================================================

const config = parseArgs();

// Show help
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
AI Shopping Copilot - Interactive Session Runner

Usage:
  npx tsx scripts/run-session.ts [options]

Options:
  --headless          Run browser in headless mode
  --skip-pruning      Disable StockPruner worker
  --skip-slots        Disable SlotScout worker
  --enable-substitution Enable Substitution worker (experimental)
  --orders=N          Load N recent orders (default: 3)
  --household=ID      Household ID for preferences

Environment Variables:
  AUCHAN_EMAIL        Auchan.pt login email (required)
  AUCHAN_PASSWORD     Auchan.pt login password (required)

Examples:
  npx tsx scripts/run-session.ts
  npx tsx scripts/run-session.ts --headless --skip-slots
  npx tsx scripts/run-session.ts --orders=5
`);
  process.exit(0);
}

runSession(config).catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
