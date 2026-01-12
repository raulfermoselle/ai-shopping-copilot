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
} from './tools/index.js';

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
