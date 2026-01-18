/**
 * LLM Tool Definitions
 *
 * Tool definitions for Claude to use during agentic interactions.
 * These are NOT the Playwright RPA tools - they are internal reasoning
 * tools that Claude uses to structure its decision-making process.
 *
 * The ReAct pattern: Thought -> Tool Call -> Observation -> Repeat
 */

import type { ToolDefinition, ToolInputSchema } from './types.js';

// =============================================================================
// StockPruner Analysis Tools
// =============================================================================

/**
 * Tool for analyzing a cart item's pruning potential.
 */
export const analyzeCartItemTool: ToolDefinition = {
  name: 'analyze_cart_item',
  description: `Analyze a single cart item to determine if it should be pruned based on purchase history and household patterns.

Use this tool to evaluate each item systematically before making a final recommendation.

Important considerations:
- Be CONSERVATIVE: when uncertain, recommend keeping the item
- High-consequence items (baby formula, medication, pet food) should almost never be pruned
- Consider seasonal patterns and special occasions
- Factor in the confidence of available data`,
  input_schema: {
    type: 'object',
    properties: {
      productName: {
        type: 'string',
        description: 'The product name to analyze',
      },
      daysSinceLastPurchase: {
        type: 'integer',
        description: 'Days since this product was last purchased (if known)',
      },
      typicalCadenceDays: {
        type: 'integer',
        description: 'Typical restock cadence in days for this product category',
      },
      purchaseCount: {
        type: 'integer',
        description: 'Number of times this product has been purchased historically',
      },
      category: {
        type: 'string',
        description: 'Product category (e.g., dairy, cleaning, baby-care)',
      },
    },
    required: ['productName'],
  } satisfies ToolInputSchema,
};

/**
 * Tool for classifying product category.
 */
export const classifyProductCategoryTool: ToolDefinition = {
  name: 'classify_product_category',
  description: `Classify a product into a category based on its name.

Categories:
- fresh-produce: Fruits, vegetables, salads (3-7 day cadence)
- dairy: Milk, yogurt, cheese, butter (7-10 day cadence)
- meat-fish: Fresh meat, fish, seafood (7-10 day cadence)
- bread-bakery: Bread, pastries, baked goods (3-5 day cadence)
- pantry-staples: Rice, pasta, canned goods, oil (30-45 day cadence)
- beverages: Coffee, tea, juices, soft drinks (14-21 day cadence)
- snacks: Cookies, chips, chocolate (14-21 day cadence)
- laundry: Detergent, softener, stain remover (30-60 day cadence)
- cleaning: Dish soap, cleaners, disinfectants (30-60 day cadence)
- paper-products: Toilet paper, paper towels, tissues (30-45 day cadence)
- personal-hygiene: Shampoo, soap, toothpaste (30-60 day cadence)
- baby-care: Diapers, wipes, baby food (14-30 day cadence, HIGH CONSEQUENCE)
- pet-supplies: Pet food, litter (21-30 day cadence, HIGH CONSEQUENCE)
- unknown: Cannot determine category (use conservative 21 day cadence)`,
  input_schema: {
    type: 'object',
    properties: {
      productName: {
        type: 'string',
        description: 'The product name to classify',
      },
    },
    required: ['productName'],
  } satisfies ToolInputSchema,
};

/**
 * Tool for making a final prune decision.
 */
export const makePruneDecisionTool: ToolDefinition = {
  name: 'make_prune_decision',
  description: `Make a final prune decision for a product after analysis.

Decision guidelines:
- PRUNE if: item was purchased very recently (< 50% of typical cadence) AND confidence is high
- KEEP if: item is overdue for restocking, high-consequence, or uncertain
- When in doubt, KEEP the item

The user will review all decisions, so err on the side of caution.`,
  input_schema: {
    type: 'object',
    properties: {
      productName: {
        type: 'string',
        description: 'The product name',
      },
      shouldPrune: {
        type: 'boolean',
        description: 'true to suggest pruning, false to keep',
      },
      confidence: {
        type: 'number',
        description: 'Confidence in this decision (0-1)',
      },
      reason: {
        type: 'string',
        description: 'Human-readable reason for the decision',
      },
      isHighConsequence: {
        type: 'boolean',
        description: 'Whether this is a high-consequence item',
      },
    },
    required: ['productName', 'shouldPrune', 'confidence', 'reason', 'isHighConsequence'],
  } satisfies ToolInputSchema,
};

// =============================================================================
// Substitution Analysis Tools
// =============================================================================

/**
 * Tool for comparing two products as potential substitutes.
 */
export const compareProductsTool: ToolDefinition = {
  name: 'compare_products',
  description: `Compare an unavailable product with a potential substitute.

Consider:
- Brand equivalence (same brand, competing brand, store brand)
- Size/quantity similarity
- Price tier (budget, standard, premium)
- Key attributes (organic, sugar-free, etc.)
- Dietary restrictions compatibility`,
  input_schema: {
    type: 'object',
    properties: {
      originalProduct: {
        type: 'string',
        description: 'The unavailable product name',
      },
      substituteProduct: {
        type: 'string',
        description: 'The potential substitute product name',
      },
      originalPrice: {
        type: 'number',
        description: 'Original product price (if known)',
      },
      substitutePrice: {
        type: 'number',
        description: 'Substitute product price (if known)',
      },
      originalSize: {
        type: 'string',
        description: 'Original product size/quantity (if known)',
      },
      substituteSize: {
        type: 'string',
        description: 'Substitute product size/quantity (if known)',
      },
    },
    required: ['originalProduct', 'substituteProduct'],
  } satisfies ToolInputSchema,
};

/**
 * Tool for ranking substitution options.
 */
export const rankSubstitutesTool: ToolDefinition = {
  name: 'rank_substitutes',
  description: `Rank a list of potential substitutes for an unavailable product.

Ranking criteria (in order of importance):
1. Functional equivalence (same purpose, similar attributes)
2. Brand preference (same brand > equivalent brand > any brand)
3. Price similarity (within 20% is ideal)
4. Size/quantity match
5. User's historical preferences (if known)`,
  input_schema: {
    type: 'object',
    properties: {
      unavailableProduct: {
        type: 'string',
        description: 'The product that is unavailable',
      },
      candidates: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            price: { type: 'number' },
            size: { type: 'string' },
            brand: { type: 'string' },
          },
          required: ['name'],
        },
        description: 'List of candidate substitute products',
      },
    },
    required: ['unavailableProduct', 'candidates'],
  } satisfies ToolInputSchema,
};

/**
 * Tool for making a substitution decision with value optimization.
 */
export const makeSubstitutionDecisionTool: ToolDefinition = {
  name: 'make_substitution_decision',
  description: `Evaluate a substitute product with value optimization for a Portuguese household.

Value Heuristics:
1. STORE BRAND PREFERENCE: Prefer Auchan/Polegar when quality is equivalent
2. PRICE-PER-UNIT: Compare €/kg or €/L, not just absolute price
3. PRICE TOLERANCE: Max 20% increase unless no alternatives

Decision Ratings:
- strongly_recommend: Store brand or better value, under original price
- recommend: Good match, within 10% price increase
- acceptable: Adequate match, up to 20% price increase
- poor: Weak match, >20% price increase
- reject: Safety concern, dietary mismatch, or unacceptable price`,
  input_schema: {
    type: 'object',
    properties: {
      candidateName: {
        type: 'string',
        description: 'Name of the substitute candidate being evaluated',
      },
      recommendation: {
        type: 'string',
        enum: ['strongly_recommend', 'recommend', 'acceptable', 'poor', 'reject'],
        description: 'Recommendation level for this substitute',
      },
      confidence: {
        type: 'number',
        description: 'Confidence in this recommendation (0-1)',
      },
      valueRating: {
        type: 'string',
        enum: ['excellent', 'good', 'acceptable', 'poor'],
        description: 'Value-for-money rating',
      },
      reasoning: {
        type: 'string',
        description: 'Explanation of why this substitute is/isn\'t recommended',
      },
      pricePerUnitAssessment: {
        type: 'string',
        description: 'Assessment of price-per-unit compared to original',
      },
      storeBrandNote: {
        type: 'string',
        description: 'Note about store brand preference if applicable',
      },
      safetyFlags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Any safety/dietary concerns to flag',
      },
    },
    required: ['candidateName', 'recommendation', 'confidence', 'valueRating', 'reasoning'],
  } satisfies ToolInputSchema,
};

/**
 * Tool for generating Portuguese search queries for Auchan.pt.
 */
export const generateSearchQueriesToolDef: ToolDefinition = {
  name: 'generate_search_queries',
  description: `Generate Portuguese search queries for Auchan.pt grocery search.
Extract key product terms, consider alternative names/brands, and generate
multiple query options ordered by likelihood of success.

Examples:
- "Queijo Fresco Magro Auchan 200g" → ["queijo fresco", "queijo magro"]
- "Leite Mimosa UHT Meio Gordo 1L" → ["leite meio gordo", "leite uht"]
- "Iogurte Grego Natural 500g" → ["iogurte grego", "iogurte natural"]

Rules:
- Remove size/weight units
- Extract core product type
- Include category terms
- Try brand alternatives if known
- Portuguese terms only`,
  input_schema: {
    type: 'object',
    properties: {
      queries: {
        type: 'array',
        items: { type: 'string' },
        description: 'Search queries to try (best first, 2-4 queries)',
      },
      reasoning: {
        type: 'string',
        description: 'Brief explanation of query strategy',
      },
    },
    required: ['queries', 'reasoning'],
  } satisfies ToolInputSchema,
};

// =============================================================================
// General Reasoning Tools
// =============================================================================

/**
 * Tool for documenting reasoning steps.
 */
export const documentReasoningTool: ToolDefinition = {
  name: 'document_reasoning',
  description: `Document a step in the reasoning process.

Use this to record:
- Key observations about the data
- Inferences made and their confidence
- Decisions and their justifications
- Uncertainties or concerns`,
  input_schema: {
    type: 'object',
    properties: {
      step: {
        type: 'string',
        description: 'Description of this reasoning step',
      },
      observations: {
        type: 'array',
        items: { type: 'string' },
        description: 'Key observations made',
      },
      confidence: {
        type: 'number',
        description: 'Confidence in this step (0-1)',
      },
      concerns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Any concerns or uncertainties',
      },
    },
    required: ['step'],
  } satisfies ToolInputSchema,
};

/**
 * Tool for flagging items that need user attention.
 */
export const flagForUserReviewTool: ToolDefinition = {
  name: 'flag_for_user_review',
  description: `Flag an item that requires explicit user review.

Flag items when:
- Confidence is low (< 0.7)
- Item is high-consequence (baby, medication, pet)
- The decision is borderline
- There are special circumstances (seasonal, one-time purchase)`,
  input_schema: {
    type: 'object',
    properties: {
      productName: {
        type: 'string',
        description: 'The product to flag',
      },
      reason: {
        type: 'string',
        description: 'Why this needs user review',
      },
      suggestedAction: {
        type: 'string',
        enum: ['keep', 'remove', 'ask_user'],
        description: 'Suggested action for the user to consider',
      },
      urgency: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: 'How urgently this needs attention',
      },
    },
    required: ['productName', 'reason', 'suggestedAction'],
  } satisfies ToolInputSchema,
};

// =============================================================================
// Tool Collections
// =============================================================================

/**
 * All tools available for StockPruner analysis.
 */
export const stockPrunerTools: ToolDefinition[] = [
  analyzeCartItemTool,
  classifyProductCategoryTool,
  makePruneDecisionTool,
  documentReasoningTool,
  flagForUserReviewTool,
];

/**
 * All tools available for Substitution analysis.
 */
export const substitutionTools: ToolDefinition[] = [
  makeSubstitutionDecisionTool,
  generateSearchQueriesToolDef,
  compareProductsTool,
  rankSubstitutesTool,
  documentReasoningTool,
  flagForUserReviewTool,
];

/**
 * All available LLM tools.
 */
export const allTools: ToolDefinition[] = [
  analyzeCartItemTool,
  classifyProductCategoryTool,
  makePruneDecisionTool,
  makeSubstitutionDecisionTool,
  generateSearchQueriesToolDef,
  compareProductsTool,
  rankSubstitutesTool,
  documentReasoningTool,
  flagForUserReviewTool,
];

/**
 * Get tool definition by name.
 */
export function getToolByName(name: string): ToolDefinition | undefined {
  return allTools.find((tool) => tool.name === name);
}
