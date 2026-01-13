/**
 * Product Analytics Types
 *
 * Rich statistical analysis per product for LLM-powered pruning decisions.
 * These analytics provide the context needed for holistic reasoning about
 * purchase patterns, trends, and item relationships.
 */

/**
 * Purchase interval statistics for a product.
 */
export interface IntervalStats {
  /** Number of purchases in history */
  purchaseCount: number;
  /** Mean days between purchases */
  meanDays: number;
  /** Standard deviation of purchase intervals */
  stdDevDays: number;
  /** Coefficient of variation (stdDev/mean) - normalized variability */
  coefficientOfVariation: number;
  /** Minimum interval observed */
  minIntervalDays: number;
  /** Maximum interval observed */
  maxIntervalDays: number;
  /** Median interval (more robust than mean for skewed distributions) */
  medianDays: number;
}

/**
 * Quantity purchase patterns.
 */
export interface QuantityStats {
  /** Mean quantity per purchase */
  meanQuantity: number;
  /** Standard deviation of quantities */
  stdDevQuantity: number;
  /** Most common quantity purchased (mode) */
  modeQuantity: number;
  /** Total quantity purchased historically */
  totalQuantity: number;
}

/**
 * Trend analysis for purchase behavior.
 */
export interface TrendAnalysis {
  /** Direction of purchase velocity */
  velocityTrend: 'accelerating' | 'stable' | 'decelerating';
  /** Recent interval vs historical mean (negative = buying more frequently) */
  recentVsHistoricalDelta: number;
  /** Z-score of recent purchase interval (-2 = very early, +2 = very late) */
  recentIntervalZScore: number;
  /** Slope of linear regression on intervals (negative = accelerating) */
  intervalSlope: number;
  /** R² of the trend (how reliable is the trend?) */
  trendReliability: number;
}

/**
 * Seasonality detection for a product.
 */
export interface SeasonalityAnalysis {
  /** Score from 0-1 indicating how seasonal the product is */
  seasonalityScore: number;
  /** Months with peak purchases (1-12) */
  peakMonths: number[];
  /** Months with low purchases (1-12) */
  troughMonths: number[];
  /** Whether current month is a peak month */
  isCurrentlyPeakSeason: boolean;
}

/**
 * Co-purchase relationship with another product.
 */
export interface CoPurchaseRelation {
  /** The related product name */
  productName: string;
  /** How often they're purchased together (0-1) */
  coOccurrenceRate: number;
  /** Lift: how much more likely than random (>1 = positive association) */
  lift: number;
  /** Number of times purchased together */
  coOccurrenceCount: number;
}

/**
 * Complete analytics for a single product.
 */
export interface ProductAnalytics {
  /** Normalized product name (key) */
  productName: string;
  /** Original product name (for display) */
  originalName: string;

  // === Purchase Frequency ===
  /** Interval statistics */
  intervalStats: IntervalStats;

  // === Quantity Patterns ===
  /** Quantity statistics */
  quantityStats: QuantityStats;

  // === Trend Analysis ===
  /** Trend analysis */
  trend: TrendAnalysis;

  // === Seasonality ===
  /** Seasonality analysis */
  seasonality: SeasonalityAnalysis;

  // === Relationships ===
  /** Top co-purchased products (sorted by lift) */
  frequentlyBoughtWith: CoPurchaseRelation[];

  // === Metadata ===
  /** First purchase date */
  firstPurchaseDate: Date;
  /** Last purchase date */
  lastPurchaseDate: Date;
  /** Days since last purchase */
  daysSinceLastPurchase: number;

  // === Derived Insights ===
  /** Is this a regular/predictable purchase? (low CV) */
  isRegularPurchase: boolean;
  /** Is this purchase overdue based on pattern? */
  isOverdue: boolean;
  /** Is this purchase early based on pattern? */
  isEarly: boolean;
  /** Confidence in the analytics (based on data points) */
  analyticsConfidence: number;
}

/**
 * Bundle detection result - items that form a logical group.
 */
export interface DetectedBundle {
  /** Bundle name/description */
  name: string;
  /** Products in this bundle */
  products: string[];
  /** Strength of the bundle association (0-1) */
  strength: number;
  /** How many of the bundle items are in the current cart */
  itemsInCart: number;
  /** How many of the bundle items are missing from cart */
  itemsMissing: number;
}

/**
 * Analytics summary for LLM context.
 */
export interface AnalyticsSummary {
  /** Individual product analytics */
  products: Map<string, ProductAnalytics>;
  /** Detected bundles in the cart */
  detectedBundles: DetectedBundle[];
  /** Overall cart statistics */
  cartStats: {
    totalItems: number;
    itemsWithHistory: number;
    itemsWithoutHistory: number;
    averageConfidence: number;
  };
}

/**
 * Purchase record from history (input to analytics).
 */
export interface PurchaseRecord {
  productName: string;
  quantity: number;
  purchaseDate: Date;
  orderId: string;
  price?: number;
}
