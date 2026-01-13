/**
 * Product Analytics Module
 *
 * Rich statistical analysis for LLM-powered StockPruner decisions.
 */

// Types
export type {
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

// Engine
export {
  ProductAnalyticsEngine,
  createAnalyticsEngine,
  normalizeProductName,
} from './engine.js';

export type { AnalyticsEngineConfig } from './engine.js';

// Prompt Builder
export {
  buildAnalyticsSystemPrompt,
  buildRichBatchPrompt,
  prepareItemsForPrompt,
} from './prompt-builder.js';

// Statistics utilities (for testing/extension)
export {
  mean,
  median,
  mode,
  variance,
  stdDev,
  coefficientOfVariation,
  zScore,
  linearRegression,
  calculateIntervals,
  daysBetween,
  calculateLift,
} from './statistics.js';
