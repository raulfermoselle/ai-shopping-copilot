/**
 * Substitution Tool Type Definitions
 *
 * Input/output types for Substitution tools.
 * These define the contract for tool implementations.
 */

import { z } from 'zod';
import type { Tool, ToolResult } from '../../../types/tool.js';
import type {
  AvailabilityResult,
  SubstituteCandidate,
} from '../types.js';

// =============================================================================
// CheckAvailabilityTool
// =============================================================================

/**
 * Input for CheckAvailabilityTool.
 */
export const CheckAvailabilityInputSchema = z.object({
  /** Product ID to check */
  productId: z.string().optional(),
  /** Product name for searching if ID not available */
  productName: z.string(),
  /** Product URL if available */
  productUrl: z.string().url().optional(),
  /** Timeout in ms */
  timeout: z.number().int().positive().default(10000),
});

export type CheckAvailabilityInput = z.input<typeof CheckAvailabilityInputSchema>;

/**
 * Output from CheckAvailabilityTool.
 */
export interface CheckAvailabilityOutput {
  /** Availability result */
  availability: AvailabilityResult;
  /** Whether the check was performed via cart or product page */
  checkMethod: 'cart' | 'product-page' | 'search';
  /** Screenshot of availability state */
  screenshot?: string;
}

/**
 * CheckAvailabilityTool interface.
 * Checks if a product is available on the Auchan website.
 */
export type CheckAvailabilityTool = Tool<CheckAvailabilityInput, CheckAvailabilityOutput>;

// =============================================================================
// SearchProductsTool
// =============================================================================

/**
 * Input for SearchProductsTool.
 */
export const SearchProductsInputSchema = z.object({
  /** Search query (product name, keywords, etc.) */
  query: z.string().min(1),
  /** Category to filter by (optional) */
  category: z.string().optional(),
  /** Maximum results to return */
  maxResults: z.number().int().positive().default(10),
  /** Only return available products */
  availableOnly: z.boolean().default(true),
  /** Timeout in ms */
  timeout: z.number().int().positive().default(30000),
});

export type SearchProductsInput = z.input<typeof SearchProductsInputSchema>;

/**
 * Output from SearchProductsTool.
 */
export interface SearchProductsOutput {
  /** Products found in search results */
  products: SubstituteCandidate[];
  /** Total results found (may be more than maxResults) */
  totalFound: number;
  /** Search query used */
  searchQuery: string;
  /** Whether search returned results */
  hasResults: boolean;
  /** Screenshot of search results */
  screenshot?: string;
}

/**
 * SearchProductsTool interface.
 * Searches for products on Auchan.pt by name/keywords.
 */
export type SearchProductsTool = Tool<SearchProductsInput, SearchProductsOutput>;

// =============================================================================
// ExtractProductInfoTool
// =============================================================================

/**
 * Input for ExtractProductInfoTool.
 */
export const ExtractProductInfoInputSchema = z.object({
  /** Product URL to extract from */
  productUrl: z.string().url(),
  /** Whether to include detailed info (nutrition, ingredients, etc.) */
  includeDetails: z.boolean().default(false),
  /** Timeout in ms */
  timeout: z.number().int().positive().default(15000),
});

export type ExtractProductInfoInput = z.input<typeof ExtractProductInfoInputSchema>;

/**
 * Detailed product information
 */
export interface ProductDetails {
  /** Product description */
  description?: string;
  /** Ingredients list */
  ingredients?: string;
  /** Nutritional information */
  nutrition?: Record<string, string>;
  /** Product weight/volume */
  weight?: string;
  /** Country of origin */
  origin?: string;
  /** Allergens */
  allergens?: string[];
}

/**
 * Output from ExtractProductInfoTool.
 */
export interface ExtractProductInfoOutput {
  /** Product as substitute candidate */
  product: SubstituteCandidate;
  /** Additional details if requested */
  details?: ProductDetails;
  /** Product page URL */
  pageUrl: string;
  /** Screenshot of product page */
  screenshot?: string;
}

/**
 * ExtractProductInfoTool interface.
 * Extracts detailed product information from a product page.
 */
export type ExtractProductInfoTool = Tool<ExtractProductInfoInput, ExtractProductInfoOutput>;

// =============================================================================
// NavigateToSearchTool
// =============================================================================

/**
 * Input for NavigateToSearchTool.
 */
export const NavigateToSearchInputSchema = z.object({
  /** Search query */
  query: z.string().min(1),
  /** Wait for results to load */
  waitForResults: z.boolean().default(true),
  /** Timeout in ms */
  timeout: z.number().int().positive().default(30000),
});

export type NavigateToSearchInput = z.input<typeof NavigateToSearchInputSchema>;

/**
 * Output from NavigateToSearchTool.
 */
export interface NavigateToSearchOutput {
  /** Whether navigation succeeded */
  success: boolean;
  /** Final URL after navigation */
  url: string;
  /** Number of results found */
  resultCount: number;
  /** Screenshot of search page */
  screenshot?: string;
}

/**
 * NavigateToSearchTool interface.
 * Navigates to search results page for a query.
 */
export type NavigateToSearchTool = Tool<NavigateToSearchInput, NavigateToSearchOutput>;

// =============================================================================
// Result Type Aliases
// =============================================================================

export type CheckAvailabilityResult = ToolResult<CheckAvailabilityOutput>;
export type SearchProductsResult = ToolResult<SearchProductsOutput>;
export type ExtractProductInfoResult = ToolResult<ExtractProductInfoOutput>;
export type NavigateToSearchResult = ToolResult<NavigateToSearchOutput>;
