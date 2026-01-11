/**
 * Substitution Agent
 *
 * Finds replacements for unavailable items in the cart.
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
