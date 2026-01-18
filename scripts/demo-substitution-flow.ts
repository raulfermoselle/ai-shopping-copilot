#!/usr/bin/env npx ts-node
/**
 * Substitution Flow Demo Script (LLM-Enhanced)
 *
 * Demonstrates the handling of unavailable/out-of-stock items with:
 * 1. Value Analytics (price per unit, store brand detection)
 * 2. LLM-enhanced recommendations with reasoning
 * 3. Two-phase substitute finding (Auchan's suggestions + search)
 * 4. Smart Portuguese query generation
 *
 * The demo NEVER places orders - it only reads and recommends.
 *
 * Usage:
 *   npx tsx scripts/demo-substitution-flow.ts              # Full demo with LLM
 *   npx tsx scripts/demo-substitution-flow.ts --no-llm     # Heuristics only
 *   npx tsx scripts/demo-substitution-flow.ts --headless   # Run headless
 *   npx tsx scripts/demo-substitution-flow.ts --skip-reorder # Use existing cart
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
  reorderTool,
  scanCartTool,
} from '../dist/agents/cart-builder/tools/index.js';
import {
  searchProductsTool,
  navigateToReplacementsPageTool,
  createSubstitutionLLMEnhancer,
  generateSearchQueries,
  addToCartTool,
} from '../dist/agents/substitution/index.js';
import {
  buildValueAnalytics,
  buildOriginalAnalytics,
  compareValues,
  formatPricePerUnit,
  formatPriceChange,
  isStoreBrand,
  classifyBrandTier,
} from '../dist/agents/substitution/analytics/index.js';
import type { ToolContext } from '../dist/types/tool.js';
import type { CartItem } from '../dist/agents/cart-builder/types.js';
import type {
  SubstituteCandidate,
  RankedSubstitute,
  SubstituteScore,
} from '../dist/agents/substitution/types.js';
import type {
  OriginalProductContext,
  ProductValueAnalytics,
  ValueComparison,
} from '../dist/agents/substitution/analytics/index.js';
import type {
  SubstitutionLLMEnhancer,
  EnhancedSubstituteDecision,
  SubstitutionLLMEnhancementResult,
  RecommendationLevel,
} from '../dist/agents/substitution/llm-enhancer.js';

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
  white: '\x1b[37m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgRed: '\x1b[41m',
};

// Constants
const SCREENSHOT_DIR = 'data/demo-screenshots/substitution';

// Create login tool instance
const loginTool = new LoginTool();

// Parse CLI arguments
const args = process.argv.slice(2);
const HEADLESS = args.includes('--headless');
const SKIP_REORDER = args.includes('--skip-reorder');
const NO_LLM = args.includes('--no-llm');

// Stats tracking
interface DemoStats {
  itemsProcessed: number;
  itemsWithSubstitutes: number;
  itemsWithoutSubstitutes: number;
  llmEnhanced: number;
  heuristicsOnly: number;
  storeBrandSwitches: number;
  potentialSavings: number;
}

/**
 * Print the demo banner
 */
function printBanner(): void {
  console.log(`
${colors.cyan}╔══════════════════════════════════════════════════════════════════╗
║                                                                    ║
║   ${colors.bright}AI Shopping Copilot - Substitution Demo (LLM-Enhanced)${colors.reset}${colors.cyan}       ║
║                                                                    ║
║   Detects unavailable items in your cart and finds substitutes     ║
║   using value analytics, store brand detection, and LLM reasoning. ║
║                                                                    ║
║   ${colors.yellow}SAFETY: This demo NEVER places orders${colors.cyan}                          ║
║                                                                    ║
╚══════════════════════════════════════════════════════════════════╝${colors.reset}
`);
}

/**
 * Print a section header
 */
function printSection(title: string): void {
  console.log(`\n${colors.blue}━━━ ${title} ━━━${colors.reset}\n`);
}

/**
 * Print a subsection header
 */
function printSubsection(title: string): void {
  console.log(`\n${colors.cyan}   ─── ${title} ───${colors.reset}`);
}

/**
 * Format price for display
 */
function formatPrice(price: number): string {
  return `${price.toFixed(2).replace('.', ',')} €`;
}

/**
 * Get recommendation color and symbol
 */
function getRecommendationStyle(level: RecommendationLevel): { color: string; symbol: string } {
  switch (level) {
    case 'strongly_recommend':
      return { color: colors.green, symbol: '★' };
    case 'recommend':
      return { color: colors.green, symbol: '✓' };
    case 'acceptable':
      return { color: colors.yellow, symbol: '○' };
    case 'poor':
      return { color: colors.yellow, symbol: '△' };
    case 'reject':
      return { color: colors.red, symbol: '✗' };
    default:
      return { color: colors.white, symbol: '?' };
  }
}

/**
 * Format recommendation level for display
 */
function formatRecommendation(level: RecommendationLevel): string {
  const labels: Record<RecommendationLevel, string> = {
    strongly_recommend: 'STRONGLY RECOMMEND',
    recommend: 'RECOMMEND',
    acceptable: 'ACCEPTABLE',
    poor: 'POOR MATCH',
    reject: 'NOT RECOMMENDED',
  };
  return labels[level] ?? level.toUpperCase();
}

/**
 * Build OriginalProductContext from CartItem
 */
function buildOriginalContext(item: CartItem): OriginalProductContext {
  const nameParts = item.name.split(' ');
  const brand = nameParts.length > 0 ? nameParts[0] : undefined;
  const sizeMatch = item.name.match(/(\d+(?:,\d+)?\s*(?:g|kg|ml|l|cl|un))/i);
  const size = sizeMatch?.[1];

  return {
    name: item.name,
    productId: item.productId || `cart-item-${Date.now()}`,
    brand,
    price: item.unitPrice ?? 0,
    size,
  };
}

/**
 * Calculate brand similarity score
 */
function calculateBrandSimilarity(candidateBrand: string | undefined, originalBrand: string | undefined): number {
  if (!candidateBrand || !originalBrand) return 0.5;
  const candLower = candidateBrand.toLowerCase();
  const origLower = originalBrand.toLowerCase();
  if (candLower === origLower) return 1.0;
  if (candLower.includes(origLower) || origLower.includes(candLower)) return 0.7;
  return 0.3;
}

/**
 * Calculate size similarity score
 */
function calculateSizeSimilarity(candidateSize: string | undefined, originalSize: string | undefined): number {
  if (!candidateSize || !originalSize) return 0.5;
  if (candidateSize.toLowerCase() === originalSize.toLowerCase()) return 1.0;

  const extractValue = (s: string): number | null => {
    const match = s.match(/(\d+(?:,\d+)?)\s*(g|kg|ml|l|cl)/i);
    if (!match?.[1] || !match[2]) return null;
    let value = parseFloat(match[1].replace(',', '.'));
    const unit = match[2].toLowerCase();
    if (unit === 'kg' || unit === 'l') value *= 1000;
    if (unit === 'cl') value *= 10;
    return value;
  };

  const candVal = extractValue(candidateSize);
  const origVal = extractValue(originalSize);

  if (candVal !== null && origVal !== null && origVal > 0) {
    const ratio = candVal / origVal;
    if (ratio >= 0.9 && ratio <= 1.1) return 0.9;
    if (ratio >= 0.7 && ratio <= 1.3) return 0.7;
    if (ratio >= 0.5 && ratio <= 1.5) return 0.5;
    return 0.3;
  }

  return 0.4;
}

/**
 * Calculate price similarity score
 */
function calculatePriceSimilarity(candidatePrice: number, originalPrice: number): number {
  if (originalPrice === 0) return 0.5;
  if (candidatePrice === originalPrice) return 1.0;
  const ratio = candidatePrice / originalPrice;
  if (ratio <= 1.0) return Math.max(0.7, 1 - (1 - ratio) * 0.5);
  if (ratio <= 1.1) return 0.8;
  if (ratio <= 1.2) return 0.6;
  if (ratio <= 1.3) return 0.4;
  return 0.2;
}

/**
 * Calculate category match score based on name similarity
 */
function calculateCategoryMatch(candidateName: string, originalName: string): number {
  const candTokens = new Set(candidateName.toLowerCase().split(/\s+/).filter(t => t.length > 2));
  const origTokensArray = originalName.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  if (origTokensArray.length === 0) return 0.5;

  let matches = 0;
  for (const token of origTokensArray) {
    if (candTokens.has(token)) matches++;
  }

  const overlapRatio = matches / origTokensArray.length;
  if (overlapRatio >= 0.7) return 1.0;
  if (overlapRatio >= 0.5) return 0.8;
  if (overlapRatio >= 0.3) return 0.6;
  if (overlapRatio > 0) return 0.4;
  return 0.2;
}

/**
 * Rank substitute candidates for an unavailable item
 */
function rankSubstitutes(
  candidates: SubstituteCandidate[],
  originalItem: CartItem
): RankedSubstitute[] {
  const originalPrice = originalItem.unitPrice || 0;
  const originalName = originalItem.name.toLowerCase();
  const nameParts = originalItem.name.split(' ');
  const originalBrand = nameParts.length > 0 ? nameParts[0] : undefined;
  const sizeMatch = originalItem.name.match(/(\d+(?:,\d+)?\s*(?:g|kg|ml|l|cl|un))/i);
  const originalSize = sizeMatch?.[1];

  const ranked: RankedSubstitute[] = [];

  for (const candidate of candidates) {
    const brandSimilarity = calculateBrandSimilarity(candidate.brand, originalBrand);
    const sizeSimilarity = calculateSizeSimilarity(candidate.size, originalSize);
    const priceSimilarity = calculatePriceSimilarity(candidate.unitPrice, originalPrice);
    const categoryMatch = calculateCategoryMatch(candidate.name, originalName);

    // Weighted average
    const overall = brandSimilarity * 0.3 + sizeSimilarity * 0.2 + priceSimilarity * 0.3 + categoryMatch * 0.2;
    const priceDelta = candidate.unitPrice - originalPrice;

    // Build score object
    const score: SubstituteScore = {
      brandSimilarity,
      sizeSimilarity,
      priceSimilarity,
      categoryMatch,
      overall,
    };

    // Generate reason
    const reasons: string[] = [];
    if (overall >= 0.8) reasons.push('Excellent match');
    else if (overall >= 0.6) reasons.push('Good match');
    else reasons.push('Alternative option');

    if (brandSimilarity >= 0.9) reasons.push('Same brand');
    else if (brandSimilarity >= 0.7) reasons.push('Similar brand');

    if (sizeSimilarity >= 0.9) reasons.push('Same size');
    else if (sizeSimilarity >= 0.7) reasons.push('Similar size');

    if (priceDelta <= 0) reasons.push('Same or lower price');
    else if (priceDelta <= originalPrice * 0.1) reasons.push('Slightly more expensive');

    ranked.push({
      candidate,
      score,
      priceDelta,
      reason: reasons.join('. '),
    });
  }

  // Sort by overall score descending
  ranked.sort((a, b) => b.score.overall - a.score.overall);

  return ranked;
}

/**
 * Display value analytics for a product
 */
function displayValueAnalytics(analytics: ProductValueAnalytics, indent: string = '   '): void {
  const priceStr = analytics.price != null && !isNaN(analytics.price)
    ? formatPrice(analytics.price)
    : 'N/A';

  const pricePerUnitStr = analytics.normalizedPricePerUnit !== null
    ? formatPricePerUnit(analytics.normalizedPricePerUnit, analytics.pricePerUnitLabel)
    : 'N/A';

  const brandTierEmoji: Record<string, string> = {
    store: '(store brand)',
    budget: '(budget)',
    standard: '',
    premium: '(premium)',
    unknown: '',
  };

  console.log(`${indent}Price: ${priceStr} | Per unit: ${pricePerUnitStr}`);

  if (analytics.brand) {
    const tierNote = brandTierEmoji[analytics.brandTier] || '';
    const storeBrandNote = analytics.isStoreBrand ? ` ${colors.green}[Store Brand]${colors.reset}` : '';
    console.log(`${indent}Brand: ${analytics.brand} ${tierNote}${storeBrandNote}`);
  }
}

/**
 * Display value comparison between original and substitute
 */
function displayValueComparison(comparison: ValueComparison, indent: string = '      '): void {
  const priceChangeStr = formatPriceChange(comparison.priceChangePercent);
  const priceColor = comparison.priceDelta <= 0 ? colors.green : (comparison.priceChangePercent <= 20 ? colors.yellow : colors.red);

  console.log(`${indent}${priceColor}Price change: ${priceChangeStr}${colors.reset}`);

  if (comparison.pricePerUnitDelta !== null) {
    const ppuChangeStr = comparison.pricePerUnitDelta <= 0 ? 'better' : 'worse';
    console.log(`${indent}${colors.dim}Price/unit: ${ppuChangeStr} value${colors.reset}`);
  }

  if (comparison.switchedToStoreBrand) {
    console.log(`${indent}${colors.green}Switched to store brand${colors.reset}`);
  }

  const ratingColors: Record<string, string> = {
    excellent: colors.green,
    good: colors.green,
    acceptable: colors.yellow,
    poor: colors.red,
  };
  const ratingColor = ratingColors[comparison.valueRating] || colors.white;
  console.log(`${indent}Value Rating: ${ratingColor}${comparison.valueRating.toUpperCase()}${colors.reset}`);
}

/**
 * Display an enhanced recommendation
 */
function displayEnhancedRecommendation(
  decision: EnhancedSubstituteDecision,
  index: number,
  originalPrice: number
): void {
  const style = getRecommendationStyle(decision.recommendation);
  const recLabel = formatRecommendation(decision.recommendation);
  const confidencePercent = Math.round((decision.llmConfidence ?? 0) * 100);

  console.log(`\n   ${index + 1}. ${colors.bright}${decision.candidate.name}${colors.reset}`);
  console.log(`      ${style.color}${style.symbol} ${recLabel}${colors.reset} (${confidencePercent}% confidence)`);

  // Price info
  const candidatePrice = decision.candidate.unitPrice ?? 0;
  const safeOriginalPrice = originalPrice ?? 0;
  const priceDelta = candidatePrice - safeOriginalPrice;
  const priceChangePercent = safeOriginalPrice > 0 ? (priceDelta / safeOriginalPrice) * 100 : 0;
  const priceColor = priceDelta <= 0 ? colors.green : (priceChangePercent <= 10 ? colors.yellow : colors.red);
  const priceChangeStr = priceDelta >= 0
    ? `+${formatPrice(priceDelta)}`
    : formatPrice(priceDelta);

  console.log(`      Price: ${priceColor}${formatPrice(candidatePrice)}${colors.reset} (${priceChangeStr})`);

  // Value insights
  if (decision.valueInsights.storeBrandNote) {
    console.log(`      ${colors.green}${decision.valueInsights.storeBrandNote}${colors.reset}`);
  }

  if (decision.valueInsights.pricePerUnitAssessment) {
    console.log(`      ${colors.dim}${decision.valueInsights.pricePerUnitAssessment}${colors.reset}`);
  }

  // Value rating
  const ratingColors: Record<string, string> = {
    excellent: colors.green,
    good: colors.green,
    acceptable: colors.yellow,
    poor: colors.red,
  };
  const ratingColor = ratingColors[decision.valueInsights.valueRating] || colors.white;
  console.log(`      Value: ${ratingColor}${decision.valueInsights.valueRating.toUpperCase()}${colors.reset}`);

  // LLM reasoning
  if (decision.wasLLMEnhanced && decision.llmReasoning) {
    const reasoningLines = decision.llmReasoning.split('\n').map(line => `         ${line}`);
    console.log(`      ${colors.dim}Reasoning: ${decision.llmReasoning.split('\n')[0]}${colors.reset}`);
    if (reasoningLines.length > 1) {
      reasoningLines.slice(1).forEach(line => {
        console.log(`${colors.dim}${line}${colors.reset}`);
      });
    }
  }

  // Safety flags
  if (decision.safetyFlags && decision.safetyFlags.length > 0) {
    console.log(`      ${colors.yellow}Warnings: ${decision.safetyFlags.join(', ')}${colors.reset}`);
  }
}

/**
 * Display a heuristic-only recommendation (no LLM)
 */
function displayHeuristicRecommendation(
  ranked: RankedSubstitute,
  index: number,
  originalAnalytics: ProductValueAnalytics
): void {
  const candidate = ranked.candidate;
  const candidateAnalytics = buildValueAnalytics(candidate);
  const comparison = compareValues(originalAnalytics, candidateAnalytics, 0.20);

  // Determine recommendation level from score
  let recLevel: RecommendationLevel;
  const overallScore = ranked.score.overall ?? 0;
  if (comparison.valueRating === 'excellent' && overallScore >= 0.7) {
    recLevel = 'strongly_recommend';
  } else if (overallScore >= 0.8) {
    recLevel = 'strongly_recommend';
  } else if (overallScore >= 0.7) {
    recLevel = 'recommend';
  } else if (overallScore >= 0.5) {
    recLevel = 'acceptable';
  } else if (overallScore >= 0.3) {
    recLevel = 'poor';
  } else {
    recLevel = 'reject';
  }

  const style = getRecommendationStyle(recLevel);
  const recLabel = formatRecommendation(recLevel);
  const scorePercent = Math.round(overallScore * 100);

  console.log(`\n   ${index + 1}. ${colors.bright}${candidate.name}${colors.reset}`);
  console.log(`      ${style.color}${style.symbol} ${recLabel}${colors.reset} (Score: ${scorePercent}%)`);

  // Price info
  const candidatePrice = candidate.unitPrice ?? 0;
  const priceDelta = ranked.priceDelta ?? 0;
  const priceColor = priceDelta <= 0 ? colors.green : colors.yellow;
  const priceChangeStr = priceDelta >= 0
    ? `+${formatPrice(priceDelta)}`
    : formatPrice(priceDelta);

  console.log(`      Price: ${priceColor}${formatPrice(candidatePrice)}${colors.reset} (${priceChangeStr})`);

  // Brand info
  if (candidateAnalytics.isStoreBrand) {
    console.log(`      ${colors.green}Store brand${colors.reset}`);
  }

  // Value rating
  const ratingColors: Record<string, string> = {
    excellent: colors.green,
    good: colors.green,
    acceptable: colors.yellow,
    poor: colors.red,
  };
  const ratingColor = ratingColors[comparison.valueRating] || colors.white;
  console.log(`      Value: ${ratingColor}${comparison.valueRating.toUpperCase()}${colors.reset}`);

  // Reason
  console.log(`      ${colors.dim}${ranked.reason}${colors.reset}`);
}

/**
 * Ensure screenshot directory exists
 */
function ensureScreenshotDir(): void {
  const dir = path.resolve(SCREENSHOT_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Main demo function
 */
async function runDemo(): Promise<void> {
  printBanner();

  // Validate environment
  const email = process.env.AUCHAN_EMAIL;
  const password = process.env.AUCHAN_PASSWORD;

  if (!email || !password) {
    console.error(`${colors.red}Error: AUCHAN_EMAIL and AUCHAN_PASSWORD environment variables required${colors.reset}`);
    process.exit(1);
  }

  console.log(`${colors.dim}Mode: ${HEADLESS ? 'Headless' : 'Visible browser'}${colors.reset}`);
  console.log(`${colors.dim}Skip reorder: ${SKIP_REORDER ? 'Yes (use existing cart)' : 'No'}${colors.reset}`);
  console.log(`${colors.dim}LLM Enhancement: ${NO_LLM ? 'Disabled' : 'Enabled'}${colors.reset}`);

  ensureScreenshotDir();

  const baseLogger = createLogger('info');

  // Progress tracking
  let lastProgressTime = Date.now();
  const resetProgress = (): void => { lastProgressTime = Date.now(); };

  const logger = {
    info: (msg: string, ctx?: Record<string, unknown>) => { resetProgress(); baseLogger.info(msg, ctx); },
    debug: (msg: string, ctx?: Record<string, unknown>) => { resetProgress(); baseLogger.debug(msg, ctx); },
    warn: (msg: string, ctx?: Record<string, unknown>) => { resetProgress(); baseLogger.warn(msg, ctx); },
    error: (msg: string, ctx?: Record<string, unknown>) => { resetProgress(); baseLogger.error(msg, ctx); },
  };

  // Stuck detection
  const stuckChecker = setInterval(() => {
    if (Date.now() - lastProgressTime > 30000) {
      logger.error('STUCK DETECTED - no progress for 30s');
    }
  }, 10000);

  // Initialize LLM enhancer
  let llmEnhancer: SubstitutionLLMEnhancer | null = null;
  if (!NO_LLM) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.log(`${colors.yellow}LLM Enhancer: ANTHROPIC_API_KEY not set${colors.reset}`);
    } else {
      llmEnhancer = createSubstitutionLLMEnhancer(
        {
          enabled: true,
          apiKey,
          priceTolerance: 0.20,
          uncertaintyThreshold: 0.65,
        },
        logger
      );

      if (llmEnhancer.isAvailable()) {
        console.log(`${colors.green}LLM Enhancer: Ready${colors.reset}`);
      } else {
        console.log(`${colors.yellow}LLM Enhancer: Failed to initialize${colors.reset}`);
        llmEnhancer = null;
      }
    }
  }

  // Demo stats
  const stats: DemoStats = {
    itemsProcessed: 0,
    itemsWithSubstitutes: 0,
    itemsWithoutSubstitutes: 0,
    llmEnhanced: 0,
    heuristicsOnly: 0,
    storeBrandSwitches: 0,
    potentialSavings: 0,
  };

  let screenshotCount = 0;
  const captureScreenshot = async (page: import('playwright').Page, label: string): Promise<string> => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filepath = path.join(SCREENSHOT_DIR, `${++screenshotCount}-${label}_${timestamp}.png`);
    await page.screenshot({ path: filepath, fullPage: false });
    console.log(`${colors.dim}   Screenshot: ${filepath}${colors.reset}`);
    return filepath;
  };

  // Launch browser
  console.log(`\n${colors.green}Launching browser...${colors.reset}`);
  const browser = await chromium.launch({
    headless: HEADLESS,
    slowMo: HEADLESS ? 0 : 100,
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });

  const page = await context.newPage();

  try {
    await attachPopupObserver(page, logger);

    const toolContext: ToolContext = {
      page,
      logger,
      screenshot: async (name: string) => captureScreenshot(page, name),
      config: {
        navigationTimeout: 30000,
        elementTimeout: 10000,
        screenshotDir: SCREENSHOT_DIR,
      },
    };

    // ━━━ STEP 1: LOGIN ━━━
    printSection('Step 1: Login to Auchan.pt');

    console.log(`${colors.dim}   Logging in as ${email}...${colors.reset}`);
    const loginResult = await loginTool.execute({}, toolContext);

    if (!loginResult.success || !loginResult.data?.loggedIn) {
      throw new Error(`Login failed: ${loginResult.error?.message ?? 'Unknown error'}`);
    }

    console.log(`${colors.green}   Login successful${colors.reset}`);
    if (loginResult.data.userName) {
      console.log(`${colors.dim}   Welcome, ${loginResult.data.userName}${colors.reset}`);
    }

    await captureScreenshot(page, '01-after-login');

    // ━━━ STEP 2: ENSURE CART HAS ITEMS ━━━
    printSection('Step 2: Ensure Cart Has Items');

    if (!SKIP_REORDER) {
      console.log(`${colors.dim}   Navigating to order history...${colors.reset}`);
      const navResult = await navigateToOrderHistoryTool.execute({}, toolContext);

      if (!navResult.success) {
        throw new Error(`Failed to navigate to order history: ${navResult.error?.message}`);
      }

      console.log(`${colors.green}   On order history page${colors.reset}`);

      console.log(`${colors.dim}   Loading past orders...${colors.reset}`);
      const ordersResult = await loadOrderHistoryTool.execute({ maxOrders: 5 }, toolContext);

      if (!ordersResult.success || !ordersResult.data?.orders.length) {
        throw new Error('No past orders found to reorder from');
      }

      const firstOrder = ordersResult.data.orders[0];
      if (!firstOrder) {
        throw new Error('No orders available');
      }

      console.log(`${colors.dim}   Found ${ordersResult.data.orders.length} orders${colors.reset}`);
      console.log(`${colors.dim}   Reordering from: ${firstOrder.orderId} (${firstOrder.productCount} items)${colors.reset}`);

      await page.goto(firstOrder.detailUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

      console.log(`${colors.dim}   Clicking reorder button (merge mode)...${colors.reset}`);
      const reorderResult = await reorderTool.execute(
        {
          orderId: firstOrder.orderId,
          detailUrl: firstOrder.detailUrl,
          mergeMode: 'merge',
        },
        toolContext
      );

      if (!reorderResult.success) {
        console.log(`${colors.yellow}   Warning: Reorder may have partial issues: ${reorderResult.error?.message}${colors.reset}`);
      } else {
        console.log(`${colors.green}   Items added to cart${colors.reset}`);
      }

      await captureScreenshot(page, '02-after-reorder');
    } else {
      console.log(`${colors.dim}   Skipping reorder, using existing cart...${colors.reset}`);
    }

    // ━━━ STEP 3: SCAN CART FOR UNAVAILABLE ITEMS ━━━
    printSection('Step 3: Scan Cart for Unavailable Items');

    console.log(`${colors.dim}   Scanning cart...${colors.reset}`);
    const scanResult = await scanCartTool.execute(
      { expandAll: true, captureScreenshot: true },
      toolContext
    );

    if (!scanResult.success || !scanResult.data) {
      throw new Error(`Cart scan failed: ${scanResult.error?.message}`);
    }

    const { snapshot } = scanResult.data;
    const allItems = snapshot.items;
    const unavailableItems = allItems.filter(item => !item.available);
    const availableItems = allItems.filter(item => item.available);

    console.log(`\n${colors.bright}   Cart Summary:${colors.reset}`);
    console.log(`   Total items:    ${colors.white}${allItems.length}${colors.reset}`);
    console.log(`   Available:      ${colors.green}${availableItems.length}${colors.reset}`);
    console.log(`   Unavailable:    ${colors.red}${unavailableItems.length}${colors.reset}`);
    console.log(`   Cart total:     ${colors.cyan}${formatPrice(snapshot.totalPrice)}${colors.reset}`);

    await captureScreenshot(page, '03-cart-scanned');

    if (unavailableItems.length === 0) {
      printSection('Result: All Items Available');
      console.log(`${colors.green}   All ${allItems.length} items in your cart are available.${colors.reset}`);
      console.log(`${colors.dim}   No substitution needed.${colors.reset}`);

      if (!HEADLESS) {
        console.log(`\n${colors.yellow}   Browser will remain open for 30 seconds for inspection...${colors.reset}`);
        await page.waitForTimeout(30000);
      }

      clearInterval(stuckChecker);
      await detachPopupObserver(page).catch(() => {});
      await browser.close();
      return;
    }

    // ━━━ STEP 4: FIND SUBSTITUTES FOR UNAVAILABLE ITEMS ━━━
    printSection('Step 4: Find Substitutes for Unavailable Items');

    console.log(`\n${colors.red}   Unavailable items detected:${colors.reset}`);
    for (let i = 0; i < unavailableItems.length; i++) {
      const item = unavailableItems[i];
      if (!item) continue;
      console.log(`   ${i + 1}. ${item.name}`);
      if (item.unitPrice > 0) {
        console.log(`      ${colors.dim}Price: ${formatPrice(item.unitPrice)} | Qty: ${item.quantity}${colors.reset}`);
      }
    }

    interface SubstitutionRecommendation {
      originalItem: CartItem;
      originalContext: OriginalProductContext;
      originalAnalytics: ProductValueAnalytics;
      rankedSubstitutes: RankedSubstitute[];
      enhancementResult?: SubstitutionLLMEnhancementResult;
      searchQuery: string;
      phase1Succeeded: boolean;
    }

    const recommendations: SubstitutionRecommendation[] = [];

    for (let i = 0; i < unavailableItems.length; i++) {
      const item = unavailableItems[i];
      if (!item) continue;

      stats.itemsProcessed++;

      printSubsection(`Unavailable Item ${i + 1}/${unavailableItems.length}`);

      const originalContext = buildOriginalContext(item);
      const originalAnalytics = buildOriginalAnalytics(originalContext);

      console.log(`\n   ${colors.bright}Original: ${item.name}${colors.reset}`);
      displayValueAnalytics(originalAnalytics);

      console.log(`\n   ${colors.magenta}Finding substitutes...${colors.reset}`);

      // Two-phase substitute finding
      let candidates: SubstituteCandidate[] = [];
      let searchQuery = '';
      let phase1Succeeded = false;

      // Phase 1: Try Auchan's "Substituir" link (if product has ID)
      if (item.productId) {
        console.log(`${colors.dim}      Phase 1: Checking Auchan's suggestions...${colors.reset}`);
        try {
          const replResult = await navigateToReplacementsPageTool.execute(
            {
              productId: item.productId,
              productName: item.name,
              maxResults: 10,
              availableOnly: true,
            },
            toolContext
          );

          if (replResult.success && replResult.data?.products.length) {
            candidates = replResult.data.products;
            phase1Succeeded = true;
            console.log(`${colors.green}      Phase 1: Found ${candidates.length} alternatives${colors.reset}`);
          } else {
            console.log(`${colors.yellow}      Phase 1: No suggestions found, trying search...${colors.reset}`);
          }
        } catch (err) {
          console.log(`${colors.yellow}      Phase 1: Failed (${err instanceof Error ? err.message : String(err)})${colors.reset}`);
        }
      }

      // Phase 2: Fallback to search
      if (candidates.length === 0) {
        console.log(`${colors.dim}      Phase 2: Searching products...${colors.reset}`);

        // Generate search queries
        let queries: string[] = [];
        if (llmEnhancer?.isAvailable()) {
          const queryResult = await llmEnhancer.generateSmartQueries(
            item.name,
            originalContext.brand,
            undefined
          );
          queries = queryResult.queries;
          if (queryResult.wasLLMGenerated) {
            console.log(`${colors.dim}      Smart queries: ${queries.slice(0, 3).join(', ')}${colors.reset}`);
          }
        }

        // Fallback to simple query extraction
        if (queries.length === 0) {
          const simpleResult = await generateSearchQueries({ productName: item.name });
          queries = simpleResult.queries;
        }

        // Try queries until we find results
        for (const query of queries.slice(0, 3)) {
          searchQuery = query;
          console.log(`${colors.dim}      Trying: "${query}"${colors.reset}`);

          try {
            const searchResult = await searchProductsTool.execute(
              {
                query,
                maxResults: 10,
                availableOnly: true,
              },
              toolContext
            );

            if (searchResult.success && searchResult.data?.products.length) {
              candidates = searchResult.data.products.filter(
                p => p.name.toLowerCase() !== item.name.toLowerCase()
              );

              if (candidates.length > 0) {
                console.log(`${colors.green}      Found ${candidates.length} alternatives${colors.reset}`);
                break;
              }
            }
          } catch (err) {
            console.log(`${colors.yellow}      Search failed: ${err instanceof Error ? err.message : String(err)}${colors.reset}`);
          }
        }
      }

      if (candidates.length === 0) {
        console.log(`${colors.yellow}      No substitutes found${colors.reset}`);
        recommendations.push({
          originalItem: item,
          originalContext,
          originalAnalytics,
          rankedSubstitutes: [],
          searchQuery,
          phase1Succeeded,
        });
        stats.itemsWithoutSubstitutes++;
        continue;
      }

      stats.itemsWithSubstitutes++;

      // Rank substitutes with heuristics
      const rankedSubstitutes = rankSubstitutes(candidates, item);

      // Enhance with LLM if available
      let enhancementResult: SubstitutionLLMEnhancementResult | undefined;
      if (llmEnhancer?.isAvailable()) {
        console.log(`${colors.dim}      Enhancing with LLM...${colors.reset}`);
        try {
          enhancementResult = await llmEnhancer.enhance(rankedSubstitutes, originalContext);

          if (enhancementResult.llmInvoked) {
            stats.llmEnhanced++;
            console.log(`${colors.green}      LLM enhanced (${enhancementResult.llmInvocationReason})${colors.reset}`);
          } else {
            stats.heuristicsOnly++;
            console.log(`${colors.dim}      Using heuristics (${enhancementResult.llmInvocationReason})${colors.reset}`);
          }
        } catch (err) {
          console.log(`${colors.yellow}      LLM enhancement failed: ${err instanceof Error ? err.message : String(err)}${colors.reset}`);
          stats.heuristicsOnly++;
        }
      } else {
        stats.heuristicsOnly++;
      }

      recommendations.push({
        originalItem: item,
        originalContext,
        originalAnalytics,
        rankedSubstitutes,
        enhancementResult,
        searchQuery,
        phase1Succeeded,
      });

      // Track store brand switches and savings
      const topDecision = enhancementResult?.decisions[0];
      if (topDecision) {
        const topAnalytics = buildValueAnalytics(topDecision.candidate);
        if (topAnalytics.isStoreBrand && !originalAnalytics.isStoreBrand) {
          stats.storeBrandSwitches++;
        }
        if (topDecision.candidate.unitPrice < item.unitPrice) {
          stats.potentialSavings += (item.unitPrice - topDecision.candidate.unitPrice) * item.quantity;
        }
      } else if (rankedSubstitutes[0]) {
        const topCandidateAnalytics = buildValueAnalytics(rankedSubstitutes[0].candidate);
        if (topCandidateAnalytics.isStoreBrand && !originalAnalytics.isStoreBrand) {
          stats.storeBrandSwitches++;
        }
        if (rankedSubstitutes[0].priceDelta < 0) {
          stats.potentialSavings += Math.abs(rankedSubstitutes[0].priceDelta) * item.quantity;
        }
      }

      await page.waitForTimeout(500);
    }

    await captureScreenshot(page, '04-after-search');

    // ━━━ STEP 5: DISPLAY RECOMMENDATIONS ━━━
    printSection('Step 5: Substitution Recommendations');

    for (const rec of recommendations) {
      console.log(`\n${colors.bright}   ${rec.originalItem.name}${colors.reset}`);
      displayValueAnalytics(rec.originalAnalytics);

      if (rec.rankedSubstitutes.length === 0) {
        console.log(`${colors.red}   No substitutes found${colors.reset}`);
        continue;
      }

      console.log(`${colors.green}   Recommended substitutes:${colors.reset}`);

      if (rec.enhancementResult && rec.enhancementResult.llmInvoked) {
        // Display LLM-enhanced recommendations
        const decisions = rec.enhancementResult.decisions.slice(0, 3);
        for (let i = 0; i < decisions.length; i++) {
          const decision = decisions[i];
          if (!decision) continue;
          displayEnhancedRecommendation(decision, i, rec.originalItem.unitPrice);
        }
      } else {
        // Display heuristic-only recommendations
        const topSubstitutes = rec.rankedSubstitutes.slice(0, 3);
        for (let i = 0; i < topSubstitutes.length; i++) {
          const ranked = topSubstitutes[i];
          if (!ranked) continue;
          displayHeuristicRecommendation(ranked, i, rec.originalAnalytics);
        }
      }
    }

    // ━━━ STEP 6: EXECUTE SUBSTITUTIONS ━━━
    printSection('Step 6: Execute Substitutions (Add to Cart)');

    let substitutionsAdded = 0;
    let substitutionsFailed = 0;

    for (const rec of recommendations) {
      if (rec.rankedSubstitutes.length === 0) {
        console.log(`\n   ${colors.yellow}Skipping ${rec.originalItem.name} - no substitutes found${colors.reset}`);
        continue;
      }

      // Get the top recommendation
      let topCandidate: SubstituteCandidate | null = null;
      let topRecommendation: RecommendationLevel | null = null;

      if (rec.enhancementResult && rec.enhancementResult.decisions.length > 0) {
        const topDecision = rec.enhancementResult.decisions[0];
        if (topDecision && topDecision.recommendation !== 'reject') {
          topCandidate = topDecision.candidate;
          topRecommendation = topDecision.recommendation;
        }
      } else if (rec.rankedSubstitutes[0] && rec.rankedSubstitutes[0].score.overall >= 0.5) {
        topCandidate = rec.rankedSubstitutes[0].candidate;
        topRecommendation = rec.rankedSubstitutes[0].score.overall >= 0.7 ? 'recommend' : 'acceptable';
      }

      if (!topCandidate) {
        console.log(`\n   ${colors.yellow}Skipping ${rec.originalItem.name} - no acceptable substitute${colors.reset}`);
        continue;
      }

      console.log(`\n   ${colors.cyan}Replacing:${colors.reset} ${rec.originalItem.name}`);
      console.log(`   ${colors.cyan}With:${colors.reset} ${topCandidate.name}`);
      console.log(`   ${colors.dim}Recommendation: ${formatRecommendation(topRecommendation)}${colors.reset}`);

      const addResult = await addToCartTool.execute(
        {
          productId: topCandidate.productId,
          productName: topCandidate.name,
          quantity: rec.originalItem.quantity || 1,
        },
        toolContext
      );

      if (addResult.success && addResult.data?.added) {
        console.log(`   ${colors.green}Added to cart${colors.reset}`);
        substitutionsAdded++;
        await captureScreenshot(page, `substitute-added-${substitutionsAdded}`);
      } else {
        const failReason = addResult.data?.failureReason || addResult.error?.message || 'Unknown error';
        console.log(`   ${colors.red}Failed: ${failReason}${colors.reset}`);
        substitutionsFailed++;
      }

      await page.waitForTimeout(1000);
    }

    console.log(`\n${colors.bright}   Substitution Results:${colors.reset}`);
    console.log(`   Successfully added:        ${colors.green}${substitutionsAdded}${colors.reset}`);
    console.log(`   Failed:                    ${colors.red}${substitutionsFailed}${colors.reset}`);

    // Navigate back to cart to show final state
    if (substitutionsAdded > 0) {
      console.log(`\n${colors.dim}   Navigating back to cart to show final state...${colors.reset}`);
      await page.goto('https://www.auchan.pt/pt/carrinho-compras', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      await captureScreenshot(page, 'final-cart');
    }

    // ━━━ SUMMARY ━━━
    printSection('Summary');

    console.log(`${colors.bright}   Demo Statistics:${colors.reset}`);
    console.log(`   Items processed:           ${colors.white}${stats.itemsProcessed}${colors.reset}`);
    console.log(`   With substitutes found:    ${colors.green}${stats.itemsWithSubstitutes}${colors.reset}`);
    console.log(`   Without substitutes:       ${colors.yellow}${stats.itemsWithoutSubstitutes}${colors.reset}`);
    console.log(`   Substitutes added to cart: ${colors.green}${substitutionsAdded}${colors.reset}`);

    if (!NO_LLM) {
      console.log(`\n${colors.bright}   LLM Enhancement:${colors.reset}`);
      console.log(`   LLM-enhanced decisions:    ${colors.cyan}${stats.llmEnhanced}${colors.reset}`);
      console.log(`   Heuristics-only:           ${colors.dim}${stats.heuristicsOnly}${colors.reset}`);

      const llmStats = llmEnhancer?.getUsageStats();
      if (llmStats) {
        console.log(`   Total tokens used:         ${colors.dim}${llmStats.totalInputTokens + llmStats.totalOutputTokens}${colors.reset}`);
        console.log(`   LLM API calls:             ${colors.dim}${llmStats.requestCount}${colors.reset}`);
      }
    }

    console.log(`\n${colors.bright}   Value Optimization:${colors.reset}`);
    console.log(`   Store brand switches:      ${colors.green}${stats.storeBrandSwitches}${colors.reset}`);
    if (stats.potentialSavings > 0) {
      console.log(`   Potential savings:         ${colors.green}${formatPrice(stats.potentialSavings)}${colors.reset}`);
    }

    console.log(`\n${colors.cyan}   ═══════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.cyan}   ${colors.bright}Demo completed successfully!${colors.reset}`);
    console.log(`${colors.cyan}   ═══════════════════════════════════════════════════════════${colors.reset}`);

    console.log(`\n${colors.dim}   Screenshots saved to: ${SCREENSHOT_DIR}${colors.reset}`);

    if (!HEADLESS) {
      console.log(`\n${colors.yellow}   Browser will remain open for 60 seconds for inspection...${colors.reset}`);
      console.log(`${colors.dim}   You can manually explore the cart and search results.${colors.reset}`);
      await page.waitForTimeout(60000);
    }

    clearInterval(stuckChecker);
    await detachPopupObserver(page).catch(() => {});
    await browser.close();

  } catch (err) {
    clearInterval(stuckChecker);
    console.error(`\n${colors.red}Demo failed: ${err instanceof Error ? err.message : String(err)}${colors.reset}`);

    try {
      await captureScreenshot(page, 'error');
    } catch {
      // Ignore screenshot errors
    }

    await detachPopupObserver(page).catch(() => {});
    await browser.close();
    process.exit(1);
  }
}

// Run the demo
runDemo().catch(err => {
  console.error(`${colors.red}Unhandled error: ${err instanceof Error ? err.message : String(err)}${colors.reset}`);
  process.exit(1);
});
