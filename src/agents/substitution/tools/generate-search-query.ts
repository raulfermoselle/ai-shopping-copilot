/**
 * Generate Search Query Tool
 *
 * Uses LLM to generate intelligent Portuguese search queries for Auchan.pt.
 * This is a FALLBACK tool used when:
 * 1. Simple query extraction fails (no results)
 * 2. Product name is complex (abbreviations, regional names)
 * 3. Retry attempt after initial query returned few results
 *
 * The LLM understands Portuguese product naming conventions and can:
 * - Extract core product types from complex names
 * - Generate alternative category terms
 * - Handle brand variations and abbreviations
 *
 * IMPORTANT: This is a pure computation tool - no browser interaction.
 */

import type { ToolDefinition } from '../../../llm/types.js';
import type { LLMClient } from '../../../llm/types.js';
import { generateSearchQueriesToolDef } from '../../../llm/tools.js';
import { buildQueryGenerationPrompt } from '../analytics/prompt-builder.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Input for query generation.
 */
export interface GenerateSearchQueryInput {
  /** Full product name to generate queries for */
  productName: string;
  /** Brand name if known */
  brand?: string;
  /** Product category if known */
  category?: string;
  /** Previous query that failed (for retry context) */
  previousQuery?: string;
  /** Result count from previous query (0 = no results) */
  previousResultCount?: number;
}

/**
 * Output from query generation.
 */
export interface GenerateSearchQueryOutput {
  /** Generated search queries (best first) */
  queries: string[];
  /** LLM's reasoning for these queries */
  reasoning?: string;
  /** Whether LLM was used (vs simple extraction) */
  wasLLMGenerated: boolean;
  /** Error message if generation failed */
  error?: string;
}

// =============================================================================
// Simple Query Extraction (Fallback)
// =============================================================================

/**
 * Patterns to remove from product names for simple query extraction.
 */
const REMOVE_PATTERNS = [
  // Sizes with units
  /\d+(?:[,.]?\d+)?\s*(?:g|gr|kg|ml|cl|l|lt|un|unidades?)\b/gi,
  // Pack indicators (e.g., "6x330ml")
  /\d+\s*x\s*\d+(?:[,.]?\d+)?\s*(?:g|gr|kg|ml|cl|l)\b/gi,
  // Percentage (e.g., "2% gordura")
  /\d+(?:[,.]?\d+)?%\s*(?:gordura|matéria gorda|m\.g\.?|mg)/gi,
  // UHT and processing indicators at end
  /\b(?:uht|pasteurizado|ultrapasteurizado)\s*$/gi,
];

/**
 * Common Portuguese brand names to optionally remove.
 */
const COMMON_BRANDS = [
  'auchan',
  'polegar',
  'mimosa',
  'terra nostra',
  'continente',
  'pingo doce',
  'agros',
  'vigor',
  'danone',
  'nestlé',
  'unilever',
];

/**
 * Simple query extraction from product name.
 * Used as fallback when LLM is not available.
 */
export function extractSimpleQuery(productName: string): string {
  let query = productName.toLowerCase();

  // Remove size/quantity patterns
  for (const pattern of REMOVE_PATTERNS) {
    query = query.replace(pattern, '');
  }

  // Optionally remove common brands for broader search
  for (const brand of COMMON_BRANDS) {
    query = query.replace(new RegExp(`\\b${brand}\\b`, 'gi'), '');
  }

  // Clean up whitespace
  query = query.replace(/\s+/g, ' ').trim();

  // If query is too short, use first 2-3 words of original
  if (query.length < 4) {
    const words = productName.toLowerCase().split(/\s+/).slice(0, 3);
    query = words.join(' ');
  }

  return query;
}

/**
 * Generate multiple query variations from simple extraction.
 */
export function extractSimpleQueries(productName: string, brand?: string): string[] {
  const queries: string[] = [];
  const baseName = productName.toLowerCase();

  // 1. Full name with size removed
  const cleaned = extractSimpleQuery(productName);
  if (cleaned.length >= 3) {
    queries.push(cleaned);
  }

  // 2. First 2-3 words (core product type)
  const words = baseName
    .replace(/[^\wàáâãéêíóôõúçÀÁÂÃÉÊÍÓÔÕÚÇ\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2);

  if (words.length >= 2) {
    const twoWords = words.slice(0, 2).join(' ');
    if (!queries.includes(twoWords)) {
      queries.push(twoWords);
    }
  }

  // 3. Brand + first word (if brand provided)
  if (brand && words.length > 0) {
    const brandQuery = `${brand.toLowerCase()} ${words[0]}`;
    if (!queries.includes(brandQuery)) {
      queries.push(brandQuery);
    }
  }

  return queries.slice(0, 4);
}

// =============================================================================
// LLM Query Generation
// =============================================================================

/**
 * System prompt for query generation.
 */
const QUERY_GENERATION_SYSTEM_PROMPT = `You are a Portuguese grocery search expert helping generate search queries for Auchan.pt.

Your task: Convert product names into effective search queries.

Rules:
1. Remove size/weight units (g, kg, ml, L, cl, un)
2. Extract the CORE product type (e.g., "leite meio gordo" from "Leite Mimosa UHT Meio Gordo 1L")
3. Use Portuguese terms only
4. Keep queries 2-4 words for best results
5. Consider alternative names for the same product
6. If brand is known, consider brand-specific and generic alternatives

Call generate_search_queries with your suggested queries, best ones first.`;

/**
 * Generate search queries using LLM.
 */
export async function generateQueriesWithLLM(
  input: GenerateSearchQueryInput,
  llmClient: LLMClient
): Promise<GenerateSearchQueryOutput> {
  const userPrompt = buildQueryGenerationPrompt(
    input.productName,
    input.brand,
    input.category,
    input.previousQuery,
    input.previousResultCount
  );

  // Include system prompt in the user message for context
  const fullPrompt = `${QUERY_GENERATION_SYSTEM_PROMPT}\n\n${userPrompt}`;

  try {
    // Call LLM with tool-use pattern
    const result = await llmClient.invokeWithTools(
      [{ role: 'user', content: fullPrompt }],
      [generateSearchQueriesToolDef]
    );

    // Find the generate_search_queries tool call
    const queryCall = result.toolCalls.find(
      (call) => call.name === 'generate_search_queries'
    );

    if (queryCall) {
      const toolInput = queryCall.input as { queries?: string[]; reasoning?: string };
      const queries = toolInput.queries || [];
      const reasoning = toolInput.reasoning;

      if (queries.length > 0) {
        return {
          queries,
          ...(reasoning !== undefined && { reasoning }),
          wasLLMGenerated: true,
        };
      }
    }

    // Fallback if LLM didn't return proper queries
    return {
      queries: extractSimpleQueries(input.productName, input.brand),
      reasoning: 'LLM response did not contain valid queries, using simple extraction',
      wasLLMGenerated: false,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      queries: extractSimpleQueries(input.productName, input.brand),
      error: errorMessage,
      wasLLMGenerated: false,
    };
  }
}

// =============================================================================
// Main Function
// =============================================================================

/**
 * Generate search queries for a product.
 * Uses LLM if available, falls back to simple extraction.
 *
 * @param input - Query generation input
 * @param llmClient - Optional LLM client for intelligent generation
 * @returns Generated queries with metadata
 */
export async function generateSearchQueries(
  input: GenerateSearchQueryInput,
  llmClient?: LLMClient
): Promise<GenerateSearchQueryOutput> {
  // If LLM client provided, use it
  if (llmClient) {
    return generateQueriesWithLLM(input, llmClient);
  }

  // Otherwise, use simple extraction
  const queries = extractSimpleQueries(input.productName, input.brand);
  return {
    queries,
    wasLLMGenerated: false,
  };
}

// =============================================================================
// Tool Definition (for use in agent orchestration)
// =============================================================================

/**
 * Tool definition for the generate search query tool.
 * This is used by the Substitution agent's orchestration layer.
 */
export const generateSearchQueryToolDef: ToolDefinition = {
  name: 'generate_search_query',
  description: `Generate Portuguese search queries for finding substitute products on Auchan.pt.

Use this tool when:
1. Simple search returned no results
2. Product name is complex or has abbreviations
3. Retrying after initial query failed

The tool generates multiple query variations:
- Core product type (without size/brand)
- Alternative Portuguese terms
- Category-based queries`,
  input_schema: {
    type: 'object',
    properties: {
      productName: {
        type: 'string',
        description: 'Full product name to generate queries for',
      },
      brand: {
        type: 'string',
        description: 'Product brand if known',
      },
      category: {
        type: 'string',
        description: 'Product category if known',
      },
      previousQuery: {
        type: 'string',
        description: 'Previous query that failed or returned few results',
      },
      previousResultCount: {
        type: 'integer',
        description: 'Number of results from previous query (0 = no results)',
      },
    },
    required: ['productName'],
  },
};
