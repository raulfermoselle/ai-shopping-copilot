/**
 * StockPruner Agent
 *
 * Analyzes cart items against purchase history to suggest items
 * that likely don't need to be reordered yet.
 *
 * @module agents/stock-pruner
 */

// Main agent class and factory functions
export {
  StockPruner,
  createStockPruner,
  createConservativeStockPruner,
  createAggressiveStockPruner,
  type StockPrunerResult,
  type StockPrunerResultData,
  type StockPrunerRunInput,
} from './stock-pruner.js';

// Pure heuristic functions for testing and composition
export {
  // Category detection
  detectCategory,
  type CategoryDetectionResult,

  // Cadence calculation
  calculateRestockCadence,
  type CadenceCalculationResult,

  // Timing estimation
  estimateRestockTiming,
  type RestockTimingResult,

  // Pruning decisions
  shouldPruneItem,
  findItemHistory,
  findDuplicatesInCart,
  processCartItems,

  // Summary statistics
  summarizeDecisions,
  type PruningSummary,
  type CartItemForPruning,
} from './heuristics.js';

// Type definitions
export {
  // Enums
  ProductCategory,
  PruneReason,

  // Schemas (for validation)
  ProductCategorySchema,
  PurchaseRecordSchema,
  ItemPurchaseHistorySchema,
  RestockCadenceSourceSchema,
  RestockProfileSchema,
  HouseholdStockProfileSchema,
  UserOverrideSchema,
  PruneDecisionContextSchema,
  PruneDecisionSchema,
  HistoryAnalysisSummarySchema,
  RecommendedPruneSchema,
  UncertainItemSchema,
  StockPruneReportSchema,
  StockPrunerConfigSchema,
  PruneHistoryRecordSchema,
  PurchaseHistoryFileSchema,
  RestockProfilesFileSchema,
  UserOverridesFileSchema,

  // Constants
  CATEGORY_CADENCE_DEFAULTS,
  CATEGORY_KEYWORDS,

  // Types (inferred from schemas)
  type PurchaseRecord,
  type ItemPurchaseHistory,
  type RestockCadenceSource,
  type RestockProfile,
  type HouseholdStockProfile,
  type UserOverride,
  type PruneDecisionContext,
  type PruneDecision,
  type HistoryAnalysisSummary,
  type RecommendedPrune,
  type UncertainItem,
  type StockPruneReport,
  type StockPrunerConfig,
  type StockPrunerContext,
  type StockPrunerAgent,
  type PruneHistoryRecord,
  type PurchaseHistoryFile,
  type RestockProfilesFile,
  type UserOverridesFile,
} from './types.js';
