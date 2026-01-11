/**
 * StockPruner Heuristics - Pure Functions
 *
 * All functions in this module are pure: no side effects, deterministic,
 * and operate only on their input parameters. This enables easy testing
 * and composability.
 *
 * Key algorithms:
 * - Category detection from product names
 * - Restock cadence calculation from purchase history
 * - Days until restock estimation
 * - Pruning decision with confidence scoring
 */

import {
  ProductCategory,
  CATEGORY_KEYWORDS,
  CATEGORY_CADENCE_DEFAULTS,
  PruneReason,
  type PurchaseRecord,
  type PruneDecision,
  type PruneDecisionContext,
  type RestockCadenceSource,
  type StockPrunerConfig,
  type UserOverride,
  type ItemPurchaseHistory,
} from './types.js';

// =============================================================================
// Result Types for Pure Functions
// =============================================================================

/**
 * Result of category detection with confidence and reasoning.
 */
export interface CategoryDetectionResult {
  /** Detected category */
  category: ProductCategory;
  /** Confidence in detection (0-1) */
  confidence: number;
  /** Keywords that matched */
  matchedKeywords: string[];
  /** Human-readable reasoning */
  reasoning: string;
}

/**
 * Result of cadence calculation with source tracking.
 */
export interface CadenceCalculationResult {
  /** Calculated cadence in days */
  cadenceDays: number;
  /** How the cadence was determined */
  source: RestockCadenceSource;
  /** Confidence in the cadence (0-1) */
  confidence: number;
  /** Number of data points used */
  dataPoints: number;
  /** Human-readable reasoning */
  reasoning: string;
}

/**
 * Result of restock timing estimation.
 */
export interface RestockTimingResult {
  /** Days since last purchase */
  daysSincePurchase: number;
  /** Estimated days until restock needed */
  daysUntilRestock: number;
  /** Urgency ratio (daysSince / cadence) */
  urgencyRatio: number;
  /** Human-readable status */
  status: 'overdue' | 'due-soon' | 'adequate' | 'recently-purchased' | 'unknown';
  /** Human-readable reasoning */
  reasoning: string;
}

/**
 * Cart item for pruning analysis.
 * Accepts undefined values to be compatible with CartSnapshot items.
 */
export interface CartItemForPruning {
  productId?: string | undefined;
  name: string;
  quantity: number;
  unitPrice?: number | undefined;
}

// =============================================================================
// Category Detection
// =============================================================================

/**
 * Detect product category from product name using keyword matching.
 *
 * Algorithm:
 * 1. Normalize product name (lowercase, remove accents)
 * 2. For each category, count matching keywords
 * 3. Return category with most matches (or UNKNOWN if none)
 * 4. Confidence based on match count and specificity
 *
 * @param productName - Product name to classify
 * @returns Detection result with category, confidence, and reasoning
 *
 * @example
 * detectCategory('Leite Mimosa UHT 1L')
 * // => { category: 'dairy', confidence: 0.85, matchedKeywords: ['leite'], ... }
 */
export function detectCategory(productName: string): CategoryDetectionResult {
  const normalizedName = normalizeText(productName);

  let bestCategory = ProductCategory.UNKNOWN;
  let bestMatchCount = 0;
  let bestMatchedKeywords: string[] = [];

  // Check each category for keyword matches
  const categoryOrder = getCategoryPriorityOrder();

  for (const category of categoryOrder) {
    const keywords = CATEGORY_KEYWORDS[category];
    if (!keywords || keywords.length === 0) continue;

    const matched: string[] = [];
    for (const keyword of keywords) {
      const normalizedKeyword = normalizeText(keyword);
      if (normalizedName.includes(normalizedKeyword)) {
        matched.push(keyword);
      }
    }

    // Prefer category with more matches
    // On tie, prefer the one earlier in priority order (more specific)
    if (matched.length > bestMatchCount) {
      bestCategory = category;
      bestMatchCount = matched.length;
      bestMatchedKeywords = matched;
    }
  }

  // Calculate confidence based on match quality
  const confidence = calculateCategoryConfidence(bestMatchCount, bestMatchedKeywords);

  const reasoning =
    bestMatchCount > 0
      ? `Detected "${bestCategory}" from keywords: ${bestMatchedKeywords.join(', ')}`
      : `No category keywords matched for "${productName}"`;

  return {
    category: bestCategory,
    confidence,
    matchedKeywords: bestMatchedKeywords,
    reasoning,
  };
}

/**
 * Returns categories in priority order for detection.
 * More specific categories come first to avoid false positives.
 */
function getCategoryPriorityOrder(): ProductCategory[] {
  return [
    // Most specific first
    ProductCategory.BABY_CARE,
    ProductCategory.PET_SUPPLIES,
    // Food categories
    ProductCategory.BREAD_BAKERY,
    ProductCategory.DAIRY,
    ProductCategory.MEAT_FISH,
    ProductCategory.FRESH_PRODUCE,
    // Household - specific before general
    ProductCategory.LAUNDRY,
    ProductCategory.PAPER_PRODUCTS,
    ProductCategory.PERSONAL_HYGIENE,
    ProductCategory.CLEANING,
    // Pantry categories
    ProductCategory.BEVERAGES,
    ProductCategory.SNACKS,
    ProductCategory.PANTRY_STAPLES,
    // Fallback
    ProductCategory.UNKNOWN,
  ];
}

/**
 * Calculate confidence in category detection based on match quality.
 */
function calculateCategoryConfidence(matchCount: number, matchedKeywords: string[]): number {
  if (matchCount === 0) return 0.1; // Very low confidence for unknown
  if (matchCount === 1) return 0.6; // Single match - moderate confidence
  if (matchCount === 2) return 0.75; // Two matches - good confidence
  if (matchCount >= 3) return 0.9; // Multiple matches - high confidence

  // Bonus for longer/more specific keywords
  const avgKeywordLength =
    matchedKeywords.reduce((sum, kw) => sum + kw.length, 0) / matchedKeywords.length;
  const lengthBonus = Math.min(avgKeywordLength / 10, 0.1);

  return Math.min(0.6 + matchCount * 0.15 + lengthBonus, 1.0);
}

/**
 * Normalize text for keyword matching.
 * Removes accents, converts to lowercase, collapses whitespace.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/\s+/g, ' ')
    .trim();
}

// =============================================================================
// Restock Cadence Calculation
// =============================================================================

/**
 * Calculate restock cadence from purchase history.
 *
 * Algorithm:
 * 1. Sort purchases by date
 * 2. Calculate intervals between consecutive purchases
 * 3. Use median interval (robust to outliers)
 * 4. Fall back to category default if insufficient data
 *
 * @param history - Aggregated purchase history for an item
 * @param category - Product category for fallback
 * @param minPurchasesForLearning - Minimum purchases needed to learn cadence
 * @returns Cadence calculation result
 *
 * @example
 * calculateRestockCadence(milkHistory, ProductCategory.DAIRY, 3)
 * // => { cadenceDays: 7, source: 'learned', confidence: 0.85, ... }
 */
export function calculateRestockCadence(
  history: ItemPurchaseHistory | null,
  category: ProductCategory,
  minPurchasesForLearning: number = 3
): CadenceCalculationResult {
  const categoryDefault = CATEGORY_CADENCE_DEFAULTS[category];

  // No history - use category default
  if (!history || history.purchases.length === 0) {
    return {
      cadenceDays: categoryDefault,
      source: 'no-history',
      confidence: 0.3,
      dataPoints: 0,
      reasoning: `No purchase history. Using ${category} default of ${categoryDefault} days.`,
    };
  }

  // Insufficient history - use category default with slightly higher confidence
  if (history.purchases.length < minPurchasesForLearning) {
    return {
      cadenceDays: categoryDefault,
      source: 'category-default',
      confidence: 0.4 + history.purchases.length * 0.1,
      dataPoints: history.purchases.length,
      reasoning: `Only ${history.purchases.length} purchase(s). Using ${category} default of ${categoryDefault} days.`,
    };
  }

  // Calculate intervals between purchases
  const intervals = calculatePurchaseIntervals(history.purchases);

  if (intervals.length === 0) {
    return {
      cadenceDays: categoryDefault,
      source: 'category-default',
      confidence: 0.4,
      dataPoints: history.purchases.length,
      reasoning: `Could not calculate intervals. Using ${category} default.`,
    };
  }

  // Use median for robustness against outliers
  const medianInterval = calculateMedian(intervals);

  // Clamp to reasonable bounds (1-180 days)
  const clampedCadence = Math.max(1, Math.min(180, Math.round(medianInterval)));

  // Calculate confidence based on consistency of intervals
  const confidence = calculateCadenceConfidence(intervals, medianInterval, history.purchases.length);

  return {
    cadenceDays: clampedCadence,
    source: 'learned',
    confidence,
    dataPoints: history.purchases.length,
    reasoning: `Learned ${clampedCadence}-day cadence from ${history.purchases.length} purchases (median of ${intervals.length} intervals).`,
  };
}

/**
 * Calculate intervals between consecutive purchases in days.
 */
function calculatePurchaseIntervals(purchases: PurchaseRecord[]): number[] {
  if (purchases.length < 2) return [];

  // Sort by date ascending
  const sorted = [...purchases].sort(
    (a, b) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime()
  );

  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (!prev || !curr) continue;

    const daysDiff = daysBetween(new Date(prev.purchaseDate), new Date(curr.purchaseDate));
    if (daysDiff > 0) {
      intervals.push(daysDiff);
    }
  }

  return intervals;
}

/**
 * Calculate median of an array of numbers.
 */
function calculateMedian(numbers: number[]): number {
  if (numbers.length === 0) return 0;

  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    const left = sorted[mid - 1] ?? 0;
    const right = sorted[mid] ?? 0;
    return (left + right) / 2;
  }

  return sorted[mid] ?? 0;
}

/**
 * Calculate confidence in learned cadence based on interval consistency.
 */
function calculateCadenceConfidence(
  intervals: number[],
  _median: number, // Kept for potential future use (median-based confidence)
  purchaseCount: number
): number {
  if (intervals.length === 0) return 0.3;

  // Calculate coefficient of variation (lower = more consistent)
  const mean = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
  const variance = intervals.reduce((sum, i) => sum + Math.pow(i - mean, 2), 0) / intervals.length;
  const stdDev = Math.sqrt(variance);
  const coefficientOfVariation = mean > 0 ? stdDev / mean : 1;

  // Base confidence from consistency (lower CV = higher confidence)
  // CV of 0 -> 0.9, CV of 1+ -> 0.5
  let confidence = 0.9 - Math.min(coefficientOfVariation * 0.4, 0.4);

  // Bonus for more data points (max +0.1)
  const dataBonus = Math.min(purchaseCount / 20, 0.1);
  confidence += dataBonus;

  return Math.min(Math.max(confidence, 0.5), 0.95);
}

// =============================================================================
// Restock Timing Estimation
// =============================================================================

/**
 * Estimate days until restock is needed.
 *
 * @param lastPurchaseDate - Date of last purchase
 * @param cadenceDays - Expected restock cadence
 * @param referenceDate - Reference date for calculation (defaults to now)
 * @returns Timing estimation result
 *
 * @example
 * estimateRestockTiming(new Date('2026-01-01'), 7, new Date('2026-01-05'))
 * // => { daysSincePurchase: 4, daysUntilRestock: 3, urgencyRatio: 0.57, ... }
 */
export function estimateRestockTiming(
  lastPurchaseDate: Date | null,
  cadenceDays: number,
  referenceDate: Date = new Date()
): RestockTimingResult {
  // No purchase history
  if (!lastPurchaseDate) {
    return {
      daysSincePurchase: 0,
      daysUntilRestock: 0,
      urgencyRatio: 1.0,
      status: 'unknown',
      reasoning: 'No purchase history available.',
    };
  }

  const daysSince = daysBetween(lastPurchaseDate, referenceDate);
  const daysUntil = cadenceDays - daysSince;
  const ratio = daysSince / cadenceDays;

  let status: RestockTimingResult['status'];
  let reasoning: string;

  if (ratio >= 1.2) {
    status = 'overdue';
    reasoning = `Overdue by ${Math.round(daysSince - cadenceDays)} days. Last purchased ${daysSince} days ago.`;
  } else if (ratio >= 0.9) {
    status = 'due-soon';
    reasoning = `Due for restock soon. ${Math.max(0, Math.round(daysUntil))} days remaining.`;
  } else if (ratio >= 0.5) {
    status = 'adequate';
    reasoning = `Adequate stock. About ${Math.round(daysUntil)} days until restock needed.`;
  } else {
    status = 'recently-purchased';
    reasoning = `Recently purchased ${daysSince} days ago. About ${Math.round(daysUntil)} days until restock.`;
  }

  return {
    daysSincePurchase: daysSince,
    daysUntilRestock: Math.round(daysUntil),
    urgencyRatio: ratio,
    status,
    reasoning,
  };
}

/**
 * Calculate days between two dates.
 */
function daysBetween(date1: Date, date2: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((date2.getTime() - date1.getTime()) / msPerDay);
}

// =============================================================================
// Pruning Decision
// =============================================================================

/**
 * Decide whether to prune an item from the cart.
 *
 * Algorithm:
 * 1. Check user overrides (always/never prune)
 * 2. Get or detect product category
 * 3. Calculate restock cadence (learned or default)
 * 4. Estimate days until restock
 * 5. Apply pruning thresholds with confidence
 *
 * @param item - Cart item to evaluate
 * @param purchaseHistory - Purchase history for this item (if any)
 * @param config - Pruner configuration
 * @param userOverride - User override for this item (if any)
 * @param referenceDate - Reference date for timing calculations
 * @returns Pruning decision with confidence and reasoning
 */
export function shouldPruneItem(
  item: CartItemForPruning,
  purchaseHistory: ItemPurchaseHistory | null,
  config: StockPrunerConfig,
  userOverride?: UserOverride,
  referenceDate: Date = new Date()
): PruneDecision {
  // Check user overrides first
  if (userOverride?.alwaysPrune) {
    return createPruneDecision(item, true, 1.0, PruneReason.USER_PREFERENCE_EXCLUDE, {
      daysSinceLastPurchase: undefined,
      restockCadenceDays: 0,
      restockUrgencyRatio: undefined,
      category: ProductCategory.UNKNOWN,
      lastPurchaseDate: undefined,
      cadenceSource: 'user-override',
    });
  }

  if (userOverride?.neverPrune) {
    return createPruneDecision(item, false, 1.0, PruneReason.NO_HISTORY, {
      daysSinceLastPurchase: undefined,
      restockCadenceDays: 0,
      restockUrgencyRatio: undefined,
      category: ProductCategory.UNKNOWN,
      lastPurchaseDate: undefined,
      cadenceSource: 'user-override',
    });
  }

  // Detect category
  const categoryResult = detectCategory(item.name);
  const category = categoryResult.category;

  // Get cadence (user override > learned > category default)
  let cadenceResult: CadenceCalculationResult;
  if (userOverride?.customCadenceDays) {
    cadenceResult = {
      cadenceDays: userOverride.customCadenceDays,
      source: 'user-override',
      confidence: 1.0,
      dataPoints: 0,
      reasoning: `Using user-specified cadence of ${userOverride.customCadenceDays} days.`,
    };
  } else if (config.useLearnedCadences && purchaseHistory) {
    cadenceResult = calculateRestockCadence(purchaseHistory, category);
  } else {
    cadenceResult = {
      cadenceDays: CATEGORY_CADENCE_DEFAULTS[category],
      source: 'category-default',
      confidence: 0.5,
      dataPoints: 0,
      reasoning: `Using ${category} default of ${CATEGORY_CADENCE_DEFAULTS[category]} days.`,
    };
  }

  // Get last purchase date
  const lastPurchaseDate = purchaseHistory?.lastPurchaseDate
    ? new Date(purchaseHistory.lastPurchaseDate)
    : null;

  // Estimate restock timing
  const timingResult = estimateRestockTiming(lastPurchaseDate, cadenceResult.cadenceDays, referenceDate);

  // Build decision context
  const context: PruneDecisionContext = {
    daysSinceLastPurchase: lastPurchaseDate ? timingResult.daysSincePurchase : undefined,
    restockCadenceDays: cadenceResult.cadenceDays,
    restockUrgencyRatio: lastPurchaseDate ? timingResult.urgencyRatio : undefined,
    category,
    lastPurchaseDate: lastPurchaseDate ?? undefined,
    cadenceSource: cadenceResult.source,
  };

  // No history - keep in cart (conservative)
  if (!lastPurchaseDate) {
    return createPruneDecision(
      item,
      false,
      0.4,
      PruneReason.NO_HISTORY,
      context
    );
  }

  // Apply pruning thresholds
  const urgencyRatio = timingResult.urgencyRatio;

  // Overdue - definitely keep
  if (urgencyRatio >= 1.0) {
    return createPruneDecision(
      item,
      false,
      0.9,
      PruneReason.OVERDUE_RESTOCK,
      context
    );
  }

  // Approaching restock time - uncertain
  if (urgencyRatio >= config.uncertainThreshold) {
    const confidence = 0.5 + (1 - urgencyRatio) * 0.3;
    return createPruneDecision(
      item,
      false,
      confidence,
      PruneReason.APPROACHING_RESTOCK,
      context
    );
  }

  // Below prune threshold - suggest pruning
  if (urgencyRatio < config.pruneThreshold) {
    // Confidence increases the further below threshold we are
    const baseConfidence = 0.6 + (config.pruneThreshold - urgencyRatio) * 0.5;
    const confidence = Math.min(baseConfidence * cadenceResult.confidence, 0.95);

    // Conservative mode requires higher confidence
    if (config.conservativeMode && confidence < config.minPruneConfidence) {
      return createPruneDecision(
        item,
        false,
        confidence,
        PruneReason.ADEQUATE_STOCK,
        context
      );
    }

    return createPruneDecision(
      item,
      true,
      confidence,
      PruneReason.RECENTLY_PURCHASED,
      context
    );
  }

  // Between prune and uncertain threshold - moderate confidence keep
  return createPruneDecision(
    item,
    false,
    0.6,
    PruneReason.ADEQUATE_STOCK,
    context
  );
}

/**
 * Create a prune decision with human-readable reasoning.
 */
function createPruneDecision(
  item: CartItemForPruning,
  prune: boolean,
  confidence: number,
  reasonCode: PruneReason,
  context: PruneDecisionContext
): PruneDecision {
  const reason = generateHumanReadableReason(prune, reasonCode, context);

  return {
    productId: item.productId,
    productName: item.name,
    prune,
    confidence,
    reason,
    context,
  };
}

/**
 * Generate human-readable explanation for pruning decision.
 */
function generateHumanReadableReason(
  prune: boolean,
  reasonCode: PruneReason,
  context: PruneDecisionContext
): string {
  const daysSince = context.daysSinceLastPurchase;
  const cadence = context.restockCadenceDays;
  const daysUntil =
    daysSince !== undefined ? Math.round(cadence - daysSince) : undefined;

  switch (reasonCode) {
    case PruneReason.RECENTLY_PURCHASED:
      return `Purchased ${daysSince} days ago. Typical restock every ${cadence} days. About ${daysUntil} days of stock remaining.`;

    case PruneReason.ADEQUATE_STOCK:
      return `Stock appears adequate. Last purchased ${daysSince} days ago with ${cadence}-day cycle.`;

    case PruneReason.OVERDUE_RESTOCK:
      return `Due for restock. Last purchased ${daysSince} days ago (${cadence}-day cycle).`;

    case PruneReason.APPROACHING_RESTOCK:
      return `Approaching restock time. ${daysUntil !== undefined && daysUntil > 0 ? `About ${daysUntil} days remaining.` : 'Consider keeping in cart.'}`;

    case PruneReason.NO_HISTORY:
      return `No purchase history found. Keeping in cart by default.`;

    case PruneReason.USER_PREFERENCE_EXCLUDE:
      return prune
        ? `User preference: always exclude this item.`
        : `User preference: never exclude this item.`;

    case PruneReason.DUPLICATE_IN_CART:
      return `Duplicate item detected in cart.`;

    case PruneReason.SEASONAL_MISMATCH:
      return `Seasonal item may not be appropriate for current time.`;

    default:
      return prune ? `Suggested for removal.` : `Keeping in cart.`;
  }
}

// =============================================================================
// Batch Processing
// =============================================================================

/**
 * Find purchase history for a cart item from the full history.
 *
 * Matches by:
 * 1. productId (if available)
 * 2. Normalized product name
 *
 * @param item - Cart item to find history for
 * @param allHistory - All purchase records
 * @returns Aggregated history for this item, or null if none found
 */
export function findItemHistory(
  item: CartItemForPruning,
  allHistory: PurchaseRecord[]
): ItemPurchaseHistory | null {
  // Find matching records
  const normalizedItemName = normalizeText(item.name);

  const matchingRecords = allHistory.filter((record) => {
    // Match by productId if both have it
    if (item.productId && record.productId) {
      return item.productId === record.productId;
    }
    // Fall back to name matching
    const normalizedRecordName = normalizeText(record.productName);
    return (
      normalizedRecordName === normalizedItemName ||
      normalizedRecordName.includes(normalizedItemName) ||
      normalizedItemName.includes(normalizedRecordName)
    );
  });

  if (matchingRecords.length === 0) {
    return null;
  }

  // Aggregate into history
  const totalQuantity = matchingRecords.reduce((sum, r) => sum + r.quantity, 0);
  const dates = matchingRecords.map((r) => new Date(r.purchaseDate));
  const lastPurchaseDate = new Date(Math.max(...dates.map((d) => d.getTime())));
  const averageQuantity = totalQuantity / matchingRecords.length;

  return {
    productId: item.productId,
    productName: item.name,
    purchases: matchingRecords,
    totalQuantity,
    lastPurchaseDate,
    averageQuantity,
  };
}

/**
 * Detect duplicate items in cart.
 *
 * @param items - All cart items
 * @returns Map of item index to list of duplicate indices
 */
export function findDuplicatesInCart(
  items: CartItemForPruning[]
): Map<number, number[]> {
  const duplicates = new Map<number, number[]>();
  const seen = new Map<string, number>(); // normalized name -> first index

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;

    const key = item.productId ?? normalizeText(item.name);
    const firstIndex = seen.get(key);

    if (firstIndex !== undefined) {
      // This is a duplicate
      const existing = duplicates.get(firstIndex) ?? [];
      existing.push(i);
      duplicates.set(firstIndex, existing);
    } else {
      seen.set(key, i);
    }
  }

  return duplicates;
}

/**
 * Process all cart items and generate pruning decisions.
 *
 * @param items - Cart items to analyze
 * @param purchaseHistory - Full purchase history
 * @param config - Pruner configuration
 * @param userOverrides - User overrides by productId or name
 * @param referenceDate - Reference date for timing
 * @returns Array of pruning decisions
 */
export function processCartItems(
  items: CartItemForPruning[],
  purchaseHistory: PurchaseRecord[],
  config: StockPrunerConfig,
  userOverrides: Map<string, UserOverride> = new Map(),
  referenceDate: Date = new Date()
): PruneDecision[] {
  // Find duplicates first
  const duplicates = findDuplicatesInCart(items);

  return items.map((item, index) => {
    // Check if this is a duplicate (not the first occurrence)
    for (const [, dupIndices] of duplicates) {
      if (dupIndices.includes(index)) {
        return createPruneDecision(
          item,
          true,
          0.95,
          PruneReason.DUPLICATE_IN_CART,
          {
            daysSinceLastPurchase: undefined,
            restockCadenceDays: 0,
            restockUrgencyRatio: undefined,
            category: ProductCategory.UNKNOWN,
            lastPurchaseDate: undefined,
            cadenceSource: 'no-history',
          }
        );
      }
    }

    // Get user override
    const overrideKey = item.productId ?? normalizeText(item.name);
    const override = userOverrides.get(overrideKey);

    // Find history for this item
    const itemHistory = findItemHistory(item, purchaseHistory);

    // Generate decision
    return shouldPruneItem(item, itemHistory, config, override, referenceDate);
  });
}

// =============================================================================
// Summary Statistics
// =============================================================================

/**
 * Calculate summary statistics from pruning decisions.
 */
export interface PruningSummary {
  totalItems: number;
  suggestedForPruning: number;
  keepInCart: number;
  averageConfidence: number;
  highConfidencePrunes: number; // >= 0.8
  lowConfidenceDecisions: number; // < 0.5
  byReason: Record<string, number>;
  byCategory: Record<ProductCategory, number>;
}

/**
 * Generate summary statistics from decisions.
 */
export function summarizeDecisions(decisions: PruneDecision[]): PruningSummary {
  const byReason: Record<string, number> = {};
  const byCategory: Record<string, number> = {};

  let totalConfidence = 0;
  let suggestedForPruning = 0;
  let highConfidencePrunes = 0;
  let lowConfidenceDecisions = 0;

  for (const decision of decisions) {
    totalConfidence += decision.confidence;

    if (decision.prune) {
      suggestedForPruning++;
      if (decision.confidence >= 0.8) {
        highConfidencePrunes++;
      }
    }

    if (decision.confidence < 0.5) {
      lowConfidenceDecisions++;
    }

    // Count by category
    const cat = decision.context.category;
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;

    // Extract reason code from reason string (first word before colon or space)
    const reasonKey = decision.context.cadenceSource;
    byReason[reasonKey] = (byReason[reasonKey] ?? 0) + 1;
  }

  return {
    totalItems: decisions.length,
    suggestedForPruning,
    keepInCart: decisions.length - suggestedForPruning,
    averageConfidence: decisions.length > 0 ? totalConfidence / decisions.length : 0,
    highConfidencePrunes,
    lowConfidenceDecisions,
    byReason,
    byCategory: byCategory as Record<ProductCategory, number>,
  };
}
