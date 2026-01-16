/**
 * Substitution Agent
 *
 * Finds replacements for unavailable items in the cart.
 * Learns from user decisions to improve future recommendations.
 *
 * CRITICAL: This agent is READ-ONLY. It never places orders or modifies cart.
 */

// Export types
export * from './types.js';

// Export agent class and factory
export {
  Substitution,
  createSubstitution,
  type SubstitutionResultData,
  type SubstitutionAgentResult,
} from './substitution.js';

// Export tools
export {
  checkAvailabilityTool,
  searchProductsTool,
  extractProductInfoTool,
  navigateToReplacementsPageTool,
  type NavigateToReplacementsInput,
  type NavigateToReplacementsOutput,
  generateSearchQueries,
  generateQueriesWithLLM,
  extractSimpleQuery,
  extractSimpleQueries,
  generateSearchQueryToolDef,
  type GenerateSearchQueryInput,
  type GenerateSearchQueryOutput,
  addToCartTool,
  type AddToCartInput,
  type AddToCartOutput,
  type AddToCartResult,
  AddToCartInputSchema,
} from './tools/index.js';

// Export LLM enhancer
export {
  SubstitutionLLMEnhancer,
  createSubstitutionLLMEnhancer,
  type SubstitutionLLMEnhancerConfig,
  type EnhancedSubstituteDecision,
  type SubstitutionLLMEnhancementResult,
  type RecommendationLevel,
  type ValueRating,
  DEFAULT_SUBSTITUTION_LLM_CONFIG,
} from './llm-enhancer.js';

// Export analytics
export * as analytics from './analytics/index.js';

// Export learning module
export * as learning from './learning/index.js';

// Re-export key learning types and functions for convenience
export {
  // Types
  type SubstitutionLearningStore,
  type LearningConfig,
  type SubstitutionDecision,
  type CategoryTolerance,
  type BrandTolerancePattern,
  type ProductLearningSignal,
  type RankingAdjustmentResult,
  type ProductReference,
  type DecisionType,

  // Factory functions
  createEmptyLearningStore,
  createDefaultLearningConfig,
  createSubstitutionDecision,

  // Decision recording
  recordAccepted,
  recordRejected,
  recordDifferentChosen,

  // Learning updates
  refreshAllLearnings,
} from './learning/index.js';
