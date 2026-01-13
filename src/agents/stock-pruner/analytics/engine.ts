/**
 * Product Analytics Engine
 *
 * Builds rich statistical analytics from purchase history.
 * Pre-computes statistics per product for efficient LLM context building.
 */

import type {
  ProductAnalytics,
  PurchaseRecord,
  IntervalStats,
  QuantityStats,
  TrendAnalysis,
  SeasonalityAnalysis,
  CoPurchaseRelation,
  DetectedBundle,
  AnalyticsSummary,
} from './types.js';

import {
  mean,
  median,
  mode,
  stdDev,
  coefficientOfVariation,
  zScore,
  linearRegression,
  calculateIntervals,
  daysBetween,
  getMonth,
  seasonalityChiSquared,
  normalizeSeasonalityScore,
  findPeakMonths,
  findTroughMonths,
  calculateLift,
  clamp,
  roundTo,
} from './statistics.js';

/**
 * Configuration for the analytics engine.
 */
export interface AnalyticsEngineConfig {
  /** Minimum purchases needed for reliable statistics */
  minPurchasesForStats: number;
  /** How many recent purchases to use for trend calculation */
  recentWindowSize: number;
  /** Threshold for considering a purchase "regular" (CV < threshold) */
  regularPurchaseThreshold: number;
  /** How many co-purchase relations to keep per product */
  maxCoPurchaseRelations: number;
  /** Minimum lift value to consider a co-purchase significant */
  minLiftThreshold: number;
  /** Minimum co-occurrence count to consider */
  minCoOccurrenceCount: number;
}

const DEFAULT_CONFIG: AnalyticsEngineConfig = {
  minPurchasesForStats: 3,
  recentWindowSize: 5,
  regularPurchaseThreshold: 0.5,
  maxCoPurchaseRelations: 5,
  minLiftThreshold: 1.2,
  minCoOccurrenceCount: 2,
};

/**
 * Normalize product name for matching.
 */
export function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Product Analytics Engine.
 *
 * Builds and maintains product analytics from purchase history.
 */
export class ProductAnalyticsEngine {
  private config: AnalyticsEngineConfig;
  private productAnalytics: Map<string, ProductAnalytics> = new Map();
  private orderProducts: Map<string, Set<string>> = new Map(); // orderId -> product names
  private productOrders: Map<string, Set<string>> = new Map(); // product -> orderIds
  private totalOrders = 0;

  constructor(config: Partial<AnalyticsEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Build analytics from purchase history.
   *
   * @param records - Purchase records from order history
   */
  buildFromHistory(records: PurchaseRecord[]): void {
    if (records.length === 0) return;

    // Group records by product and by order
    const productRecords = new Map<string, PurchaseRecord[]>();
    this.orderProducts.clear();
    this.productOrders.clear();

    for (const record of records) {
      const normalizedName = normalizeProductName(record.productName);

      // Group by product
      if (!productRecords.has(normalizedName)) {
        productRecords.set(normalizedName, []);
      }
      productRecords.get(normalizedName)!.push(record);

      // Track order-product relationships for co-purchase analysis
      if (!this.orderProducts.has(record.orderId)) {
        this.orderProducts.set(record.orderId, new Set());
      }
      this.orderProducts.get(record.orderId)!.add(normalizedName);

      if (!this.productOrders.has(normalizedName)) {
        this.productOrders.set(normalizedName, new Set());
      }
      this.productOrders.get(normalizedName)!.add(record.orderId);
    }

    this.totalOrders = this.orderProducts.size;

    // Build analytics for each product
    const now = new Date();
    for (const [normalizedName, productRecs] of productRecords) {
      const analytics = this.buildProductAnalytics(normalizedName, productRecs, now);
      this.productAnalytics.set(normalizedName, analytics);
    }

    // Calculate co-purchase relations (after all products are indexed)
    this.calculateAllCoPurchaseRelations();
  }

  /**
   * Build analytics for a single product.
   */
  private buildProductAnalytics(
    normalizedName: string,
    records: PurchaseRecord[],
    now: Date,
  ): ProductAnalytics {
    // Sort by date ascending
    const sorted = [...records].sort(
      (a, b) => a.purchaseDate.getTime() - b.purchaseDate.getTime(),
    );

    const firstRecord = sorted[0]!;
    const lastRecord = sorted[sorted.length - 1]!;
    const daysSinceLast = daysBetween(lastRecord.purchaseDate, now);

    // Calculate interval statistics
    const intervalStats = this.calculateIntervalStats(sorted);

    // Calculate quantity statistics
    const quantityStats = this.calculateQuantityStats(sorted);

    // Calculate trend
    const trend = this.calculateTrend(sorted, intervalStats, daysSinceLast);

    // Calculate seasonality
    const seasonality = this.calculateSeasonality(sorted, now);

    // Determine derived insights
    const isRegular =
      intervalStats.coefficientOfVariation < this.config.regularPurchaseThreshold;
    const isOverdue =
      intervalStats.meanDays > 0 && daysSinceLast > intervalStats.meanDays * 1.2;
    const isEarly =
      intervalStats.meanDays > 0 && daysSinceLast < intervalStats.meanDays * 0.5;

    // Calculate confidence based on data points
    const analyticsConfidence = this.calculateConfidence(sorted.length);

    return {
      productName: normalizedName,
      originalName: firstRecord.productName,
      intervalStats,
      quantityStats,
      trend,
      seasonality,
      frequentlyBoughtWith: [], // Filled in later by calculateAllCoPurchaseRelations
      firstPurchaseDate: firstRecord.purchaseDate,
      lastPurchaseDate: lastRecord.purchaseDate,
      daysSinceLastPurchase: roundTo(daysSinceLast, 1),
      isRegularPurchase: isRegular,
      isOverdue,
      isEarly,
      analyticsConfidence,
    };
  }

  /**
   * Calculate interval statistics.
   */
  private calculateIntervalStats(sortedRecords: PurchaseRecord[]): IntervalStats {
    const dates = sortedRecords.map((r) => r.purchaseDate);
    const intervals = calculateIntervals(dates);

    if (intervals.length === 0) {
      return {
        purchaseCount: sortedRecords.length,
        meanDays: 0,
        stdDevDays: 0,
        coefficientOfVariation: 0,
        minIntervalDays: 0,
        maxIntervalDays: 0,
        medianDays: 0,
      };
    }

    return {
      purchaseCount: sortedRecords.length,
      meanDays: roundTo(mean(intervals), 1),
      stdDevDays: roundTo(stdDev(intervals), 1),
      coefficientOfVariation: roundTo(coefficientOfVariation(intervals), 2),
      minIntervalDays: roundTo(Math.min(...intervals), 1),
      maxIntervalDays: roundTo(Math.max(...intervals), 1),
      medianDays: roundTo(median(intervals), 1),
    };
  }

  /**
   * Calculate quantity statistics.
   */
  private calculateQuantityStats(records: PurchaseRecord[]): QuantityStats {
    const quantities = records.map((r) => r.quantity);

    return {
      meanQuantity: roundTo(mean(quantities), 1),
      stdDevQuantity: roundTo(stdDev(quantities), 1),
      modeQuantity: mode(quantities),
      totalQuantity: quantities.reduce((sum, q) => sum + q, 0),
    };
  }

  /**
   * Calculate trend analysis.
   */
  private calculateTrend(
    sortedRecords: PurchaseRecord[],
    intervalStats: IntervalStats,
    daysSinceLast: number,
  ): TrendAnalysis {
    const dates = sortedRecords.map((r) => r.purchaseDate);
    const intervals = calculateIntervals(dates);

    if (intervals.length < 2) {
      return {
        velocityTrend: 'stable',
        recentVsHistoricalDelta: 0,
        recentIntervalZScore: 0,
        intervalSlope: 0,
        trendReliability: 0,
      };
    }

    // Calculate recent vs historical
    const recentWindow = Math.min(this.config.recentWindowSize, intervals.length);
    const recentIntervals = intervals.slice(-recentWindow);
    const recentMean = mean(recentIntervals);
    const historicalMean = intervalStats.meanDays;
    const delta = historicalMean > 0 ? (recentMean - historicalMean) / historicalMean : 0;

    // Linear regression to detect trend
    const xValues = intervals.map((_, i) => i);
    const regression = linearRegression(xValues, intervals);

    // Calculate z-score for current position
    const recentZScore =
      intervalStats.stdDevDays > 0
        ? zScore(daysSinceLast, intervalStats.meanDays, intervalStats.stdDevDays)
        : 0;

    // Determine velocity trend
    let velocityTrend: 'accelerating' | 'stable' | 'decelerating' = 'stable';
    if (regression.rSquared > 0.3) {
      // Only trust trend if R² is reasonable
      if (regression.slope < -0.5) {
        velocityTrend = 'accelerating'; // Intervals getting shorter
      } else if (regression.slope > 0.5) {
        velocityTrend = 'decelerating'; // Intervals getting longer
      }
    }

    return {
      velocityTrend,
      recentVsHistoricalDelta: roundTo(delta, 2),
      recentIntervalZScore: roundTo(recentZScore, 2),
      intervalSlope: roundTo(regression.slope, 3),
      trendReliability: roundTo(regression.rSquared, 2),
    };
  }

  /**
   * Calculate seasonality analysis.
   */
  private calculateSeasonality(
    records: PurchaseRecord[],
    now: Date,
  ): SeasonalityAnalysis {
    const dates = records.map((r) => r.purchaseDate);

    if (dates.length < 12) {
      // Not enough data for seasonality
      return {
        seasonalityScore: 0,
        peakMonths: [],
        troughMonths: [],
        isCurrentlyPeakSeason: false,
      };
    }

    const chiSquared = seasonalityChiSquared(dates);
    const score = normalizeSeasonalityScore(chiSquared);
    const peaks = findPeakMonths(dates);
    const troughs = findTroughMonths(dates);
    const currentMonth = getMonth(now);

    return {
      seasonalityScore: roundTo(score, 2),
      peakMonths: peaks,
      troughMonths: troughs,
      isCurrentlyPeakSeason: peaks.includes(currentMonth),
    };
  }

  /**
   * Calculate confidence in analytics based on data points.
   */
  private calculateConfidence(purchaseCount: number): number {
    // Sigmoid-like scaling: 3 purchases = 0.5, 10 purchases = 0.9
    const scaled = (purchaseCount - 3) / 5;
    const confidence = 1 / (1 + Math.exp(-scaled));
    return roundTo(clamp(confidence, 0.1, 0.99), 2);
  }

  /**
   * Calculate co-purchase relations for all products.
   */
  private calculateAllCoPurchaseRelations(): void {
    for (const [productName, analytics] of this.productAnalytics) {
      const relations = this.calculateCoPurchaseRelations(productName);
      analytics.frequentlyBoughtWith = relations;
    }
  }

  /**
   * Calculate co-purchase relations for a single product.
   */
  private calculateCoPurchaseRelations(productName: string): CoPurchaseRelation[] {
    const productOrderIds = this.productOrders.get(productName);
    if (!productOrderIds || productOrderIds.size < this.config.minCoOccurrenceCount) {
      return [];
    }

    const coOccurrenceCounts = new Map<string, number>();

    // Count co-occurrences
    for (const orderId of productOrderIds) {
      const orderItems = this.orderProducts.get(orderId);
      if (!orderItems) continue;

      for (const otherProduct of orderItems) {
        if (otherProduct === productName) continue;
        coOccurrenceCounts.set(
          otherProduct,
          (coOccurrenceCounts.get(otherProduct) ?? 0) + 1,
        );
      }
    }

    // Calculate lift and build relations
    const relations: CoPurchaseRelation[] = [];
    const countA = productOrderIds.size;

    for (const [otherProduct, coCount] of coOccurrenceCounts) {
      if (coCount < this.config.minCoOccurrenceCount) continue;

      const countB = this.productOrders.get(otherProduct)?.size ?? 0;
      const lift = calculateLift(coCount, countA, countB, this.totalOrders);

      if (lift >= this.config.minLiftThreshold) {
        const otherAnalytics = this.productAnalytics.get(otherProduct);
        relations.push({
          productName: otherAnalytics?.originalName ?? otherProduct,
          coOccurrenceRate: roundTo(coCount / countA, 2),
          lift: roundTo(lift, 2),
          coOccurrenceCount: coCount,
        });
      }
    }

    // Sort by lift and limit
    return relations
      .sort((a, b) => b.lift - a.lift)
      .slice(0, this.config.maxCoPurchaseRelations);
  }

  /**
   * Get analytics for a specific product.
   */
  getProductAnalytics(productName: string): ProductAnalytics | undefined {
    const normalized = normalizeProductName(productName);
    return this.productAnalytics.get(normalized);
  }

  /**
   * Get analytics for multiple products (cart items).
   */
  getCartAnalytics(productNames: string[]): Map<string, ProductAnalytics> {
    const result = new Map<string, ProductAnalytics>();

    for (const name of productNames) {
      const analytics = this.getProductAnalytics(name);
      if (analytics) {
        result.set(normalizeProductName(name), analytics);
      }
    }

    return result;
  }

  /**
   * Detect bundles in a cart based on co-purchase patterns.
   */
  detectBundles(cartProductNames: string[]): DetectedBundle[] {
    const normalizedCart = new Set(cartProductNames.map(normalizeProductName));
    const bundles: DetectedBundle[] = [];
    const usedProducts = new Set<string>();

    // For each product in cart, check if it forms a bundle with others
    for (const productName of normalizedCart) {
      if (usedProducts.has(productName)) continue;

      const analytics = this.productAnalytics.get(productName);
      if (!analytics || analytics.frequentlyBoughtWith.length === 0) continue;

      // Find products in cart that are frequently bought with this one
      const bundleProducts = [productName];
      const bundleLift: number[] = [];

      for (const relation of analytics.frequentlyBoughtWith) {
        const relatedNormalized = normalizeProductName(relation.productName);
        if (normalizedCart.has(relatedNormalized) && !usedProducts.has(relatedNormalized)) {
          bundleProducts.push(relatedNormalized);
          bundleLift.push(relation.lift);
        }
      }

      // Only create bundle if we have 2+ products
      if (bundleProducts.length >= 2) {
        const avgLift = mean(bundleLift);
        const strength = clamp(avgLift / 5, 0, 1); // Normalize lift to 0-1

        // Mark products as used
        for (const p of bundleProducts) {
          usedProducts.add(p);
        }

        // Get original names for display
        const originalNames = bundleProducts.map((p) => {
          const a = this.productAnalytics.get(p);
          return a?.originalName ?? p;
        });

        bundles.push({
          name: this.inferBundleName(originalNames),
          products: originalNames,
          strength: roundTo(strength, 2),
          itemsInCart: bundleProducts.length,
          itemsMissing: 0, // Could expand to detect missing bundle items
        });
      }
    }

    return bundles.sort((a, b) => b.strength - a.strength);
  }

  /**
   * Infer a name for a bundle based on its products.
   */
  private inferBundleName(products: string[]): string {
    // Simple heuristic: look for common keywords
    const categoryHints = [
      { pattern: /leite|queijo|iogurte|nata|manteiga/i, name: 'Dairy Bundle' },
      { pattern: /farinha|fermento|açúcar|ovo/i, name: 'Baking Bundle' },
      { pattern: /massa|arroz|azeite/i, name: 'Pantry Bundle' },
      { pattern: /fruta|legume|salada|tomate/i, name: 'Fresh Produce Bundle' },
      { pattern: /carne|frango|peixe/i, name: 'Protein Bundle' },
      { pattern: /café|chá|bolachas/i, name: 'Breakfast Bundle' },
      { pattern: /detergente|lixívia|limpa/i, name: 'Cleaning Bundle' },
      { pattern: /shampoo|sabonete|pasta.*dent/i, name: 'Personal Care Bundle' },
    ];

    const productText = products.join(' ');
    for (const { pattern, name } of categoryHints) {
      if (pattern.test(productText)) {
        return name;
      }
    }

    return `Bundle (${products.length} items)`;
  }

  /**
   * Build a complete analytics summary for LLM context.
   */
  buildSummary(cartProductNames: string[]): AnalyticsSummary {
    const products = this.getCartAnalytics(cartProductNames);
    const bundles = this.detectBundles(cartProductNames);

    let totalConfidence = 0;
    let itemsWithHistory = 0;

    for (const analytics of products.values()) {
      totalConfidence += analytics.analyticsConfidence;
      itemsWithHistory++;
    }

    return {
      products,
      detectedBundles: bundles,
      cartStats: {
        totalItems: cartProductNames.length,
        itemsWithHistory,
        itemsWithoutHistory: cartProductNames.length - itemsWithHistory,
        averageConfidence:
          itemsWithHistory > 0 ? roundTo(totalConfidence / itemsWithHistory, 2) : 0,
      },
    };
  }

  /**
   * Get total number of products indexed.
   */
  get productCount(): number {
    return this.productAnalytics.size;
  }

  /**
   * Get total number of orders in history.
   */
  get orderCount(): number {
    return this.totalOrders;
  }
}

/**
 * Create a new analytics engine instance.
 */
export function createAnalyticsEngine(
  config?: Partial<AnalyticsEngineConfig>,
): ProductAnalyticsEngine {
  return new ProductAnalyticsEngine(config);
}
