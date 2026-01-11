/**
 * StockPruner Agent Types
 *
 * Data models for household stock tracking, restock cadence learning,
 * and pruning decision logic. Based on research from Sprint-SP-R-001.
 *
 * Enhanced with comprehensive category taxonomy, learned cadences,
 * user overrides, and episodic memory for continuous improvement.
 */

import { z } from 'zod';
import type { CartSnapshot } from '../cart-builder/types.js';

// =============================================================================
// Product Category Types
// =============================================================================

/**
 * Product categories with associated restock cadences.
 * Used for heuristic-based pruning when historical data is limited.
 */
export enum ProductCategory {
  // Food categories (short cadences)
  FRESH_PRODUCE = 'fresh-produce', // 3-7 days
  DAIRY = 'dairy', // 7-10 days
  MEAT_FISH = 'meat-fish', // 7-10 days
  BREAD_BAKERY = 'bread-bakery', // 3-5 days

  // Pantry staples (medium cadences)
  PANTRY_STAPLES = 'pantry-staples', // 30-45 days (rice, pasta, canned goods)
  BEVERAGES = 'beverages', // 14-21 days (coffee, tea, juices)
  SNACKS = 'snacks', // 14-21 days

  // Household consumables (long cadences)
  LAUNDRY = 'laundry', // 30-60 days (detergent, softener)
  CLEANING = 'cleaning', // 30-60 days (dish soap, cleaners)
  PAPER_PRODUCTS = 'paper-products', // 30-45 days (toilet paper, paper towels)
  PERSONAL_HYGIENE = 'personal-hygiene', // 30-60 days (shampoo, soap, toothpaste)

  // Baby & pet (variable cadences)
  BABY_CARE = 'baby-care', // 14-30 days (diapers, wipes)
  PET_SUPPLIES = 'pet-supplies', // 21-30 days (pet food, litter)

  // Uncategorized (conservative default)
  UNKNOWN = 'unknown', // 21 days (conservative)
}

/**
 * Zod schema for ProductCategory validation.
 */
export const ProductCategorySchema = z.nativeEnum(ProductCategory);

/**
 * Default restock cadences (in days) for each product category.
 */
export const CATEGORY_CADENCE_DEFAULTS: Record<ProductCategory, number> = {
  [ProductCategory.FRESH_PRODUCE]: 5,
  [ProductCategory.DAIRY]: 8,
  [ProductCategory.MEAT_FISH]: 8,
  [ProductCategory.BREAD_BAKERY]: 4,

  [ProductCategory.PANTRY_STAPLES]: 37,
  [ProductCategory.BEVERAGES]: 17,
  [ProductCategory.SNACKS]: 17,

  [ProductCategory.LAUNDRY]: 45,
  [ProductCategory.CLEANING]: 45,
  [ProductCategory.PAPER_PRODUCTS]: 37,
  [ProductCategory.PERSONAL_HYGIENE]: 45,

  [ProductCategory.BABY_CARE]: 22,
  [ProductCategory.PET_SUPPLIES]: 25,

  [ProductCategory.UNKNOWN]: 21,
};

// =============================================================================
// Purchase History Types
// =============================================================================

/**
 * Single purchase record from order history.
 */
export const PurchaseRecordSchema = z.object({
  /** Product identifier (if available) */
  productId: z.string().optional(),
  /** Product name */
  productName: z.string().min(1),
  /** Purchase date */
  purchaseDate: z.coerce.date(),
  /** Quantity purchased */
  quantity: z.number().int().positive(),
  /** Source order ID */
  orderId: z.string().min(1),
  /** Unit price at time of purchase */
  unitPrice: z.number().nonnegative().optional(),
  /** Inferred or known product category */
  category: z.nativeEnum(ProductCategory).optional(),
});

export type PurchaseRecord = z.infer<typeof PurchaseRecordSchema>;

/**
 * Aggregated purchase history for a specific item.
 */
export const ItemPurchaseHistorySchema = z.object({
  /** Product identifier */
  productId: z.string().optional(),
  /** Product name */
  productName: z.string().min(1),
  /** All purchase records for this item */
  purchases: z.array(PurchaseRecordSchema),
  /** Total quantity purchased across all records */
  totalQuantity: z.number().int().nonnegative(),
  /** Most recent purchase date */
  lastPurchaseDate: z.coerce.date(),
  /** Average quantity per purchase */
  averageQuantity: z.number().positive(),
});

export type ItemPurchaseHistory = z.infer<typeof ItemPurchaseHistorySchema>;

// =============================================================================
// Restock Profile Types
// =============================================================================

/**
 * How a restock cadence was determined.
 */
export const RestockCadenceSourceSchema = z.enum([
  'learned', // Learned from purchase history
  'category-default', // Using category-based default
  'user-override', // Explicitly set by user
  'no-history', // No data available, using conservative default
]);

export type RestockCadenceSource = z.infer<typeof RestockCadenceSourceSchema>;

/**
 * Restock profile for a specific item.
 * Tracks typical restock cadence and confidence.
 */
export const RestockProfileSchema = z.object({
  /** Product identifier */
  productId: z.string(),
  /** Product name */
  productName: z.string().min(1),
  /** Product category */
  category: z.nativeEnum(ProductCategory),
  /** Typical restock cadence in days */
  restockCadenceDays: z.number().int().positive(),
  /** Confidence in this cadence (0-1) */
  confidence: z.number().min(0).max(1),
  /** Last known purchase date */
  lastPurchaseDate: z.coerce.date().optional(),
  /** Average quantity per purchase */
  averageQuantity: z.number().positive().optional(),
  /** How this cadence was determined */
  source: RestockCadenceSourceSchema,
  /** When this profile was last updated */
  updatedAt: z.coerce.date().optional(),
});

export type RestockProfile = z.infer<typeof RestockProfileSchema>;

/**
 * Collection of restock profiles for a household.
 */
export const HouseholdStockProfileSchema = z.object({
  /** Map of productId to RestockProfile */
  profiles: z.record(z.string(), RestockProfileSchema),
  /** When this profile set was last updated */
  lastUpdated: z.coerce.date(),
  /** Number of items with learned cadences */
  learnedCount: z.number().int().nonnegative(),
  /** Number of items using category defaults */
  defaultCount: z.number().int().nonnegative(),
});

export type HouseholdStockProfile = z.infer<typeof HouseholdStockProfileSchema>;

// =============================================================================
// User Override Types
// =============================================================================

/**
 * User-specified overrides for pruning behavior.
 */
export const UserOverrideSchema = z.object({
  /** Product identifier */
  productId: z.string(),
  /** Product name */
  productName: z.string().min(1),
  /** Never suggest pruning this item */
  neverPrune: z.boolean().optional(),
  /** Always suggest pruning this item */
  alwaysPrune: z.boolean().optional(),
  /** Custom restock cadence (overrides learned/default) */
  customCadenceDays: z.number().int().positive().optional(),
  /** User notes */
  notes: z.string().optional(),
  /** When this override was created */
  createdAt: z.coerce.date(),
});

export type UserOverride = z.infer<typeof UserOverrideSchema>;

// =============================================================================
// Pruning Decision Types
// =============================================================================

/**
 * Reason for pruning suggestion.
 */
export enum PruneReason {
  RECENTLY_PURCHASED = 'recently-purchased', // Purchased within threshold of cadence
  ADEQUATE_STOCK = 'adequate-stock', // Sufficient quantity purchased recently
  SEASONAL_MISMATCH = 'seasonal-mismatch', // Seasonal item out of season
  DUPLICATE_IN_CART = 'duplicate-in-cart', // Same item already in cart
  USER_PREFERENCE_EXCLUDE = 'user-preference-exclude', // User explicitly excluded
  OVERDUE_RESTOCK = 'overdue-restock', // Past typical restock time (keep in cart)
  NO_HISTORY = 'no-history', // No purchase history (keep in cart)
  APPROACHING_RESTOCK = 'approaching-restock', // Near restock time (uncertain)
}

/**
 * Context for a pruning decision.
 */
export const PruneDecisionContextSchema = z.object({
  /** Days since last purchase (if known) */
  daysSinceLastPurchase: z.number().int().nonnegative().optional(),
  /** Expected restock cadence in days */
  restockCadenceDays: z.number().int().positive(),
  /** Restock urgency ratio (daysSince / cadence) */
  restockUrgencyRatio: z.number().nonnegative().optional(),
  /** Product category used for decision */
  category: z.nativeEnum(ProductCategory),
  /** Last purchase date (if known) */
  lastPurchaseDate: z.coerce.date().optional(),
  /** How cadence was determined */
  cadenceSource: RestockCadenceSourceSchema,
});

export type PruneDecisionContext = z.infer<typeof PruneDecisionContextSchema>;

/**
 * Decision whether to prune an item from the cart.
 */
export const PruneDecisionSchema = z.object({
  /** Product identifier */
  productId: z.string().optional(),
  /** Product name */
  productName: z.string().min(1),
  /** Should this item be pruned? */
  prune: z.boolean(),
  /** Confidence in this decision (0-1) */
  confidence: z.number().min(0).max(1),
  /** Human-readable reason */
  reason: z.string(),
  /** Detailed context for the decision */
  context: PruneDecisionContextSchema,
});

export type PruneDecision = z.infer<typeof PruneDecisionSchema>;

// =============================================================================
// Stock Prune Report Types
// =============================================================================

/**
 * Summary of purchase history analysis.
 */
export const HistoryAnalysisSummarySchema = z.object({
  /** Number of days back analyzed */
  daysBackAnalyzed: z.number().int().positive(),
  /** Number of orders analyzed */
  ordersAnalyzed: z.number().int().nonnegative(),
  /** Number of unique items purchased */
  uniqueItemsPurchased: z.number().int().nonnegative(),
});

export type HistoryAnalysisSummary = z.infer<typeof HistoryAnalysisSummarySchema>;

/**
 * Recommended prune item (high confidence).
 */
export const RecommendedPruneSchema = z.object({
  /** Product name */
  productName: z.string().min(1),
  /** Product identifier */
  productId: z.string().optional(),
  /** Confidence in prune decision */
  confidence: z.number().min(0).max(1),
  /** Reason for pruning */
  reason: z.string(),
  /** Days since last purchase */
  daysSinceLastPurchase: z.number().int().nonnegative(),
});

export type RecommendedPrune = z.infer<typeof RecommendedPruneSchema>;

/**
 * Uncertain prune item (moderate confidence).
 */
export const UncertainItemSchema = z.object({
  /** Product name */
  productName: z.string().min(1),
  /** Product identifier */
  productId: z.string().optional(),
  /** Confidence in decision */
  confidence: z.number().min(0).max(1),
  /** Reason for uncertainty */
  reason: z.string(),
});

export type UncertainItem = z.infer<typeof UncertainItemSchema>;

/**
 * Complete stock pruning report.
 */
export const StockPruneReportSchema = z.object({
  /** Report timestamp */
  timestamp: z.coerce.date(),
  /** Session identifier */
  sessionId: z.string().min(1),

  /** Number of cart items analyzed */
  itemsAnalyzed: z.number().int().nonnegative(),
  /** Number of items suggested for pruning */
  itemsSuggestedForPruning: z.number().int().nonnegative(),

  /** All prune decisions */
  decisions: z.array(PruneDecisionSchema),

  /** High-confidence items to remove */
  recommendedPrunes: z.array(RecommendedPruneSchema),

  /** Items with uncertain prune status */
  uncertainItems: z.array(UncertainItemSchema),

  /** Purchase history metadata */
  historyAnalyzed: HistoryAnalysisSummarySchema,

  /** Overall confidence in report */
  overallConfidence: z.number().min(0).max(1),

  /** Warnings (e.g., limited history) */
  warnings: z.array(z.string()),

  /** Screenshots captured during analysis */
  screenshots: z.array(z.string()),
});

export type StockPruneReport = z.infer<typeof StockPruneReportSchema>;

// =============================================================================
// StockPruner Configuration Types
// =============================================================================

/**
 * StockPruner configuration.
 */
export const StockPrunerConfigSchema = z.object({
  /** Days of purchase history to analyze */
  historyDaysBack: z.number().int().positive().default(90),

  /** Minimum confidence to suggest pruning */
  minPruneConfidence: z.number().min(0).max(1).default(0.7),

  /** Use learned cadences or always use category defaults */
  useLearnedCadences: z.boolean().default(true),

  /** Conservative mode: only prune items with very high confidence */
  conservativeMode: z.boolean().default(true),

  /** Include uncertain items in report */
  includeUncertainItems: z.boolean().default(true),

  /** Threshold for pruning (ratio of daysSince / cadence) */
  pruneThreshold: z.number().min(0).max(1).default(0.7),

  /** Threshold for uncertainty (between prune and keep) */
  uncertainThreshold: z.number().min(0).max(1).default(0.9),
});

export type StockPrunerConfig = z.infer<typeof StockPrunerConfigSchema>;

// =============================================================================
// StockPruner Agent Interface
// =============================================================================

/**
 * StockPruner agent context (runtime dependencies).
 */
export interface StockPrunerContext {
  /** Session identifier */
  sessionId: string;
  /** Logger instance */
  logger: {
    info: (message: string, meta?: Record<string, unknown>) => void;
    warn: (message: string, meta?: Record<string, unknown>) => void;
    error: (message: string, meta?: Record<string, unknown>) => void;
  };
}

/**
 * StockPruner agent interface.
 */
export interface StockPrunerAgent {
  /**
   * Analyze cart and generate prune suggestions.
   */
  analyzeCart(
    cart: CartSnapshot,
    config: StockPrunerConfig,
    context: StockPrunerContext,
  ): Promise<StockPruneReport>;

  /**
   * Load purchase history from persistent storage.
   */
  loadPurchaseHistory(daysBack: number): Promise<PurchaseRecord[]>;

  /**
   * Load restock profiles from persistent storage.
   */
  loadRestockProfiles(): Promise<HouseholdStockProfile>;

  /**
   * Learn restock cadences from purchase history.
   * Updates restock profiles in persistent storage.
   */
  learnRestockCadences(
    purchaseHistory: PurchaseRecord[],
  ): Promise<HouseholdStockProfile>;

  /**
   * Load user overrides from persistent storage.
   */
  loadUserOverrides(): Promise<Record<string, UserOverride>>;

  /**
   * Apply user feedback to improve prune decisions.
   * Updates episodic memory for future learning.
   */
  applyUserFeedback(
    sessionId: string,
    decisions: PruneDecision[],
    userFeedback: Record<string, boolean>,
  ): Promise<void>;
}

// =============================================================================
// Persistence Layer Types
// =============================================================================

/**
 * Prune history record (episodic memory).
 */
export const PruneHistoryRecordSchema = z.object({
  /** Session identifier */
  sessionId: z.string().min(1),
  /** Product identifier */
  productId: z.string().optional(),
  /** Product name */
  productName: z.string().min(1),
  /** Was pruning suggested? */
  pruneSuggested: z.boolean(),
  /** Did user accept the suggestion? */
  userAccepted: z.boolean().optional(),
  /** Confidence in suggestion */
  confidence: z.number().min(0).max(1),
  /** Reason for suggestion */
  reason: z.string(),
  /** When this occurred */
  createdAt: z.coerce.date(),
});

export type PruneHistoryRecord = z.infer<typeof PruneHistoryRecordSchema>;

/**
 * File-based persistence format for purchase history.
 */
export const PurchaseHistoryFileSchema = z.object({
  /** All purchase records */
  records: z.array(PurchaseRecordSchema),
  /** When this file was last updated */
  lastUpdated: z.coerce.date(),
});

export type PurchaseHistoryFile = z.infer<typeof PurchaseHistoryFileSchema>;

/**
 * File-based persistence format for restock profiles.
 */
export const RestockProfilesFileSchema = z.object({
  /** Map of productId to RestockProfile */
  profiles: z.record(z.string(), RestockProfileSchema),
  /** When this file was last updated */
  lastUpdated: z.coerce.date(),
});

export type RestockProfilesFile = z.infer<typeof RestockProfilesFileSchema>;

/**
 * File-based persistence format for user overrides.
 */
export const UserOverridesFileSchema = z.object({
  /** Map of productId to UserOverride */
  overrides: z.record(z.string(), UserOverrideSchema),
  /** When this file was last updated */
  lastUpdated: z.coerce.date(),
});

export type UserOverridesFile = z.infer<typeof UserOverridesFileSchema>;

// =============================================================================
// Category Detection Helpers
// =============================================================================

/**
 * Portuguese keywords for automatic category detection.
 * Used to infer ProductCategory from product names when no explicit category is available.
 */
export const CATEGORY_KEYWORDS: Record<ProductCategory, string[]> = {
  // Food categories
  [ProductCategory.FRESH_PRODUCE]: [
    'fruta', 'legume', 'vegetal', 'hortaliça', 'banana', 'maçã', 'tomate',
    'alface', 'cenoura', 'batata', 'cebola', 'laranja', 'pêra', 'fresh',
  ],
  [ProductCategory.DAIRY]: [
    'leite', 'iogurte', 'queijo', 'manteiga', 'nata', 'requeijão',
    'milk', 'yogurt', 'cheese', 'butter', 'cream',
  ],
  [ProductCategory.MEAT_FISH]: [
    'carne', 'peixe', 'frango', 'porco', 'vaca', 'bife', 'costeleta',
    'salmão', 'bacalhau', 'atum', 'meat', 'fish', 'chicken', 'beef', 'pork',
  ],
  [ProductCategory.BREAD_BAKERY]: [
    'pão', 'bolo', 'croissant', 'pastel', 'bread', 'cake', 'pastry',
  ],

  // Pantry staples
  [ProductCategory.PANTRY_STAPLES]: [
    'arroz', 'massa', 'azeite', 'óleo', 'farinha', 'açúcar', 'sal',
    'conserva', 'enlatado', 'rice', 'pasta', 'oil', 'flour', 'sugar',
    'canned', 'preserves',
  ],
  [ProductCategory.BEVERAGES]: [
    'café', 'chá', 'sumo', 'água', 'refrigerante', 'bebida',
    'coffee', 'tea', 'juice', 'water', 'soda', 'drink',
  ],
  [ProductCategory.SNACKS]: [
    'bolachas', 'snack', 'chocolate', 'batatas fritas', 'chips',
    'cookies', 'biscuits', 'candy',
  ],

  // Household consumables
  [ProductCategory.LAUNDRY]: [
    'detergente', 'roupa', 'lavar', 'amaciador', 'lixívia',
    'skip', 'persil', 'tide', 'ariel', 'laundry', 'softener', 'bleach',
  ],
  [ProductCategory.CLEANING]: [
    'limpeza', 'limpa', 'desinfetante', 'esfregona', 'pano',
    'lava tudo', 'fairy', 'cleaning', 'disinfectant', 'cleaner', 'mop',
  ],
  [ProductCategory.PAPER_PRODUCTS]: [
    'papel', 'guardanapo', 'toalha', 'lenço', 'papel higiénico',
    'papel cozinha', 'tissue', 'toilet paper', 'kitchen roll', 'napkin',
  ],
  [ProductCategory.PERSONAL_HYGIENE]: [
    'champô', 'gel de banho', 'sabonete', 'pasta de dentes', 'desodorizante',
    'shampoo', 'conditioner', 'soap', 'toothpaste', 'deodorant',
    'colgate', 'dove', 'nivea',
  ],

  // Baby & pet
  [ProductCategory.BABY_CARE]: [
    'bebé', 'fralda', 'toalhita', 'biberão', 'baby', 'diaper', 'wipes',
    'pampers', 'dodot',
  ],
  [ProductCategory.PET_SUPPLIES]: [
    'ração', 'comida para', 'areia de gato', 'pet', 'animal',
    'cão', 'gato', 'dog', 'cat', 'litter',
  ],

  // Unknown
  [ProductCategory.UNKNOWN]: [],
};
