#!/usr/bin/env npx ts-node
/**
 * Coordinator Demo Script
 *
 * Demonstrates the full Phase 1 flow:
 */

// Load environment variables from .env
import 'dotenv/config';

/*
 * 1. Launch browser
 * 2. Login to Auchan.pt
 * 3. Load last 3 orders into cart
 * 4. Generate Review Pack
 * 5. Display cart diff for user approval
 *
 * Requirements:
 * - Set AUCHAN_EMAIL and AUCHAN_PASSWORD environment variables
 *
 * Usage:
 *   npx ts-node scripts/demo-coordinator.ts
 *   npm run demo (if added to package.json)
 */

import { chromium } from 'playwright';
import { createCoordinator } from '../dist/agents/coordinator/coordinator.js';
import { createLogger } from '../dist/utils/logger.js';
import { attachPopupObserver, detachPopupObserver } from '../dist/utils/auto-popup-dismisser.js';
import type { AgentContext, WorkingMemory } from '../dist/types/agent.js';
import type { ReviewPack } from '../dist/agents/coordinator/types.js';

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function printBanner(): void {
  console.log(`
${colors.cyan}╔══════════════════════════════════════════════════════════════╗
║                                                                ║
║   ${colors.bright}AI Shopping Copilot - Phase 1 Demo${colors.reset}${colors.cyan}                        ║
║                                                                ║
║   Automatically loads your cart with recent orders from        ║
║   Auchan.pt and generates a Review Pack for your approval.     ║
║                                                                ║
╚══════════════════════════════════════════════════════════════╝${colors.reset}
`);
}

function printSection(title: string): void {
  console.log(`\n${colors.blue}━━━ ${title} ━━━${colors.reset}\n`);
}

function printReviewPack(pack: ReviewPack): void {
  printSection('📦 REVIEW PACK');

  // Cart Summary
  console.log(`${colors.bright}Cart Summary:${colors.reset}`);
  console.log(`  Items: ${pack.cart.summary.itemCount}`);
  console.log(`  Total: €${pack.cart.summary.totalPrice.toFixed(2)}`);
  console.log();

  // Diff Summary
  const diff = pack.cart.diff;
  console.log(`${colors.bright}Changes Made:${colors.reset}`);
  console.log(`  ${colors.green}+ Added:${colors.reset} ${diff.summary.addedCount} items`);
  console.log(`  ${colors.red}- Removed:${colors.reset} ${diff.summary.removedCount} items`);
  console.log(`  ${colors.yellow}~ Changed:${colors.reset} ${diff.summary.changedCount} items`);
  console.log(`  = Unchanged: ${diff.summary.unchangedCount} items`);
  console.log();

  // Price Difference
  const priceDiff = diff.summary.priceDifference;
  const priceColor = priceDiff >= 0 ? colors.red : colors.green;
  console.log(
    `${colors.bright}Price Difference:${colors.reset} ${priceColor}${priceDiff >= 0 ? '+' : ''}€${priceDiff.toFixed(2)}${colors.reset}`
  );
  console.log();

  // Added Items
  if (diff.added.length > 0) {
    console.log(`${colors.green}${colors.bright}Items Added:${colors.reset}`);
    for (const item of diff.added.slice(0, 10)) {
      console.log(`  + ${item.name} (x${item.quantity}) - €${(item.quantity * item.unitPrice).toFixed(2)}`);
    }
    if (diff.added.length > 10) {
      console.log(`  ... and ${diff.added.length - 10} more`);
    }
    console.log();
  }

  // Removed Items
  if (diff.removed.length > 0) {
    console.log(`${colors.red}${colors.bright}Items Removed:${colors.reset}`);
    for (const item of diff.removed.slice(0, 5)) {
      console.log(`  - ${item.name} (x${item.quantity})`);
    }
    if (diff.removed.length > 5) {
      console.log(`  ... and ${diff.removed.length - 5} more`);
    }
    console.log();
  }

  // Quantity Changes
  if (diff.quantityChanged.length > 0) {
    console.log(`${colors.yellow}${colors.bright}Quantity Changes:${colors.reset}`);
    for (const item of diff.quantityChanged.slice(0, 5)) {
      console.log(`  ~ ${item.name}: ${item.previousQuantity} → ${item.newQuantity}`);
    }
    if (diff.quantityChanged.length > 5) {
      console.log(`  ... and ${diff.quantityChanged.length - 5} more`);
    }
    console.log();
  }

  // Warnings
  if (pack.warnings.length > 0) {
    console.log(`${colors.yellow}${colors.bright}Warnings:${colors.reset}`);
    for (const warning of pack.warnings) {
      console.log(`  ⚠ ${warning.message}`);
    }
    console.log();
  }

  // Confidence
  console.log(`${colors.bright}Confidence Scores:${colors.reset}`);
  console.log(`  Cart Accuracy: ${(pack.confidence.cartAccuracy * 100).toFixed(0)}%`);
  console.log(`  Data Quality: ${(pack.confidence.dataQuality * 100).toFixed(0)}%`);
  console.log(`  Source Orders: ${pack.confidence.sourceOrders.join(', ')}`);
  console.log();

  // Safety Notice
  console.log(`${colors.cyan}${colors.bright}━━━ SAFETY NOTICE ━━━${colors.reset}`);
  console.log(`${colors.cyan}The agent has STOPPED at cart review.${colors.reset}`);
  console.log(`${colors.cyan}No order has been placed. Review and approve in your browser.${colors.reset}`);
}

async function main(): Promise<void> {
  printBanner();

  const baseLogger = createLogger('info', 'Demo');

  // Progress tracking - reset on any log activity
  let lastProgressTime = Date.now();
  const resetProgress = () => { lastProgressTime = Date.now(); };

  // Wrap logger to track activity for stuck detection
  const logger = {
    info: (msg: string, ctx?: Record<string, unknown>) => { resetProgress(); baseLogger.info(msg, ctx); },
    warn: (msg: string, ctx?: Record<string, unknown>) => { resetProgress(); baseLogger.warn(msg, ctx); },
    error: (msg: string, ctx?: Record<string, unknown>) => { resetProgress(); baseLogger.error(msg, ctx); },
    debug: (msg: string, ctx?: Record<string, unknown>) => { resetProgress(); baseLogger.debug(msg, ctx); },
  };

  // Check credentials
  const email = process.env.AUCHAN_EMAIL;
  if (!email) {
    console.error(`${colors.red}Error: AUCHAN_EMAIL environment variable not set.${colors.reset}`);
    console.log('\nSet your credentials:');
    console.log('  export AUCHAN_EMAIL="your-email@example.com"');
    console.log('  export AUCHAN_PASSWORD="your-password"');
    process.exit(1);
  }

  printSection('🚀 Starting Coordinator');
  console.log(`Email: ${email}`);
  console.log(`Config: Load last 3 orders, merge strategy: latest`);

  // Launch browser
  printSection('🌐 Launching Browser');
  const browser = await chromium.launch({
    headless: false, // Show browser for demo
    slowMo: 100, // Slow down for visibility
  });

  const browserContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  const page = await browserContext.newPage();

  try {
    // Attach auto-popup dismisser IMMEDIATELY after page creation
    printSection('🛡️ Enabling Auto-Popup Protection');
    console.log('MutationObserver will automatically dismiss popups as they appear');
    await attachPopupObserver(page, logger);

    // Create AgentContext
    const sessionId = `demo-${Date.now()}`;
    const workingMemory: WorkingMemory = {
      cartItems: [],
      unavailableItems: [],
      substitutions: [],
      deliverySlots: [],
    };

    let stepCounter = 0;
    const screenshotHelper = async (stepName: string, position: 'before' | 'after') => {
      stepCounter++;
      const timestamp = Date.now();
      const filename = `step${stepCounter.toString().padStart(2, '0')}-${stepName}-${position}-${timestamp}.png`;
      const filepath = `screenshots/${filename}`;
      try {
        await page.screenshot({ path: filepath, fullPage: false });
        logger.info(`Screenshot captured: ${filename}`, { step: stepName, position });
        return filepath;
      } catch (err) {
        logger.warn(`Failed to capture screenshot: ${filename}`, {
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
    };

    const context: AgentContext = {
      page,
      logger,
      sessionId,
      workingMemory,
    };

    // Create and run Coordinator with observability wrapper
    printSection('🤖 Running Coordinator');
    console.log('This will:');
    console.log('  1. Login to Auchan.pt');
    console.log('  2. Navigate to order history');
    console.log('  3. Load your last 3 orders');
    console.log('  4. Add items to cart');
    console.log('  5. Generate Review Pack');
    console.log();

    // Setup stuck detection (progress tracked via logger wrapper above)
    let stuckDetectionInterval: NodeJS.Timeout | null = null;
    const STUCK_TIMEOUT_MS = 30000; // 30 seconds - agent should detect stuck state quickly

    stuckDetectionInterval = setInterval(async () => {
      const timeSinceProgress = Date.now() - lastProgressTime;
      if (timeSinceProgress > STUCK_TIMEOUT_MS) {
        logger.error('STUCK DETECTION: No progress for 30+ seconds', {
          timeSinceProgress,
          lastProgressTime: new Date(lastProgressTime).toISOString(),
          currentUrl: page.url(),
        });
        await screenshotHelper('stuck-detected', 'after');
        console.error(`${colors.red}STUCK: Demo appears frozen. Exiting early.${colors.reset}`);
        if (stuckDetectionInterval) clearInterval(stuckDetectionInterval);
        await browser.close();
        process.exit(1);
      }
    }, 10000); // Check every 10 seconds

    try {
      logger.info('Progress: demo-start');

      const coordinator = createCoordinator({
        maxOrdersToLoad: 3,
        mergeStrategy: 'latest',
        captureScreenshots: true,
        maxRetries: 2,
      });

      logger.info('Progress: coordinator-created');
      const result = await coordinator.run(context, email, 'household-demo');
      logger.info('Progress: coordinator-completed');

      // Clear stuck detection
      if (stuckDetectionInterval) {
        clearInterval(stuckDetectionInterval);
        stuckDetectionInterval = null;
      }

      if (result.success && result.data) {
        printSection('✅ SUCCESS');
        console.log(`Session ID: ${result.data.sessionId}`);
        console.log(`Duration: ${(result.data.durationMs / 1000).toFixed(1)}s`);
        console.log(`Screenshots: ${result.data.screenshots.length} captured`);

        // Display Review Pack
        printReviewPack(result.data.reviewPack);

        // Capture final screenshot
        await screenshotHelper('demo-complete', 'after');

        // Keep browser open for user to review (with timeout)
        printSection('👀 Review Your Cart');
        console.log('The browser is open for you to review the cart.');
        console.log('Screenshots saved to screenshots/ directory.');
        console.log('Browser will stay open for 60 seconds for review, then automatically close.');
        console.log('(Press Ctrl+C to exit earlier)');
        console.log();

        // Wait for review period (60 seconds max) then auto-close
        const REVIEW_TIME_MS = 60000; // 60 seconds
        console.log(`Waiting ${REVIEW_TIME_MS / 1000}s for review...`);

        await new Promise((resolve) => {
          setTimeout(() => {
            console.log('Review period complete. Closing browser.');
            resolve(null);
          }, REVIEW_TIME_MS);
        });
      } else {
        printSection('❌ FAILED');
        console.error(`Error: ${result.error?.message ?? 'Unknown error'}`);
        await screenshotHelper('demo-failed', 'after');
        console.log('\nLogs:');
        for (const log of result.logs) {
          console.log(`  ${log}`);
        }
      }
    } catch (coordinatorError) {
      // Inner try-catch for coordinator execution
      logger.error('Coordinator execution error', {
        error: coordinatorError instanceof Error ? coordinatorError.message : String(coordinatorError),
      });
      await screenshotHelper('coordinator-error', 'after');
      throw coordinatorError;
    }
  } catch (error) {
    console.error(`${colors.red}Unexpected error:${colors.reset}`, error);
  } finally {
    // Cleanup: detach observer before closing
    try {
      await detachPopupObserver(page);
    } catch {
      // Page might already be closed
    }
    await browser.close();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
