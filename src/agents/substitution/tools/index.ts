/**
 * Substitution Tools
 *
 * Tool exports for Substitution agent.
 */

export * from './types.js';
export { checkAvailabilityTool } from './check-availability.js';
export { searchProductsTool } from './search-products.js';
export { extractProductInfoTool } from './extract-product-info.js';
export {
  navigateToReplacementsPageTool,
  type NavigateToReplacementsInput,
  type NavigateToReplacementsOutput,
} from './navigate-to-replacements.js';
export {
  generateSearchQueries,
  generateQueriesWithLLM,
  extractSimpleQuery,
  extractSimpleQueries,
  generateSearchQueryToolDef,
  type GenerateSearchQueryInput,
  type GenerateSearchQueryOutput,
} from './generate-search-query.js';
export {
  addToCartTool,
  type AddToCartInput,
  type AddToCartOutput,
  type AddToCartResult,
  AddToCartInputSchema,
} from './add-to-cart.js';
