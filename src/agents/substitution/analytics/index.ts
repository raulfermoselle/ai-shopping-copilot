/**
 * Substitution Analytics Module
 *
 * Exports for value analytics, price calculations, and LLM prompt building.
 */

// Types
export type {
  UnitType,
  ParsedSize,
  BrandTier,
  ProductValueAnalytics,
  ValueComparison,
  OriginalProductContext,
  SubstituteCandidateWithAnalytics,
  SubstitutionContext,
  UserPreferencesContext,
  ValueAnalyticsSummary,
} from './types.js';

// Value Calculator
export {
  parseSize,
  extractSizeFromName,
  calculatePricePerUnit,
  isStoreBrand,
  classifyBrandTier,
  buildValueAnalytics,
  buildOriginalAnalytics,
  compareValues,
  formatPricePerUnit,
  formatPriceChange,
  meetsValueCriteria,
} from './value-calculator.js';

// Prompt Builder
export {
  buildSubstitutionSystemPrompt,
  buildSubstitutionUserPrompt,
  buildQueryGenerationPrompt,
  shouldInvokeLLM,
  prepareSubstitutesForPrompt,
  DEFAULT_FILTER_CONFIG,
  type SubstitutionFilterConfig,
} from './prompt-builder.js';
