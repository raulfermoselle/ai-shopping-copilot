/**
 * LLM Structured Output Schemas
 *
 * Zod schemas for structured outputs from Claude.
 * These schemas define the expected response formats for
 * various agent decision-making tasks.
 */

import { z } from 'zod';
import { ProductCategory } from '../agents/stock-pruner/types.js';

// =============================================================================
// Common Schemas
// =============================================================================

/**
 * Confidence level with explanation.
 * Used across all LLM decisions to provide transparency.
 */
export const ConfidenceExplanationSchema = z.object({
  /** Confidence score (0-1) */
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('Confidence in the decision (0 = no confidence, 1 = certain)'),

  /** Human-readable explanation of the reasoning */
  explanation: z
    .string()
    .min(1)
    .describe('Clear explanation of why this confidence level was assigned'),

  /** Key factors that influenced the decision */
  keyFactors: z
    .array(z.string())
    .min(1)
    .describe('Main factors that influenced this decision'),

  /** Any caveats or uncertainties */
  caveats: z
    .array(z.string())
    .optional()
    .describe('Uncertainties or limitations in the analysis'),
});

export type ConfidenceExplanation = z.infer<typeof ConfidenceExplanationSchema>;

// =============================================================================
// StockPruner Schemas
// =============================================================================

/**
 * Single prune decision from LLM.
 */
export const LLMPruneDecisionSchema = z.object({
  /** Product name (must match input exactly) */
  productName: z.string().min(1).describe('The product name from the cart'),

  /** Whether to suggest pruning this item */
  shouldPrune: z
    .boolean()
    .describe('true = suggest removing from cart, false = keep in cart'),

  /** Confidence in this decision (0-1) */
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe(
      'Confidence in the prune decision (0 = very uncertain, 1 = highly confident)',
    ),

  /** Human-readable reason for the decision */
  reason: z
    .string()
    .min(1)
    .describe('Clear, concise explanation for why to prune or keep'),

  /** Detected or inferred product category */
  inferredCategory: z
    .nativeEnum(ProductCategory)
    .optional()
    .describe('Product category inferred from the name'),

  /** Whether this is a high-consequence item (baby, medication, etc.) */
  isHighConsequence: z
    .boolean()
    .optional()
    .describe('true if this item could have serious consequences if missing'),

  /** If high-consequence, explain why extra caution is needed */
  highConsequenceReason: z
    .string()
    .nullish()
    .describe('Explanation for high-consequence classification'),
});

export type LLMPruneDecision = z.infer<typeof LLMPruneDecisionSchema>;

/**
 * Complete prune decision response from LLM.
 */
export const LLMPruneResponseSchema = z.object({
  /** Individual prune decisions for each item */
  decisions: z
    .array(LLMPruneDecisionSchema)
    .min(1)
    .describe('Prune decisions for each cart item'),

  /** Overall analysis summary */
  summary: z.string().describe('Brief summary of the pruning analysis'),

  /** Items that need user attention (uncertain or high-consequence) */
  itemsNeedingReview: z
    .array(z.string())
    .describe('Product names that should be explicitly reviewed by user'),

  /** Any warnings about the analysis quality */
  analysisWarnings: z
    .array(z.string())
    .optional()
    .describe('Warnings about limited data or uncertain inferences'),
});

export type LLMPruneResponse = z.infer<typeof LLMPruneResponseSchema>;

// =============================================================================
// Substitution Schemas
// =============================================================================

/**
 * Similarity assessment between products.
 */
export const ProductSimilaritySchema = z.object({
  /** Overall similarity score (0-1) */
  overallScore: z
    .number()
    .min(0)
    .max(1)
    .describe('Overall similarity to the original product'),

  /** Brand similarity consideration */
  brandMatch: z.enum(['same', 'equivalent', 'different', 'unknown']),

  /** Size/quantity comparison */
  sizeMatch: z.enum(['same', 'larger', 'smaller', 'unknown']),

  /** Price comparison */
  priceComparison: z.enum(['cheaper', 'similar', 'more_expensive', 'unknown']),

  /** Quality tier comparison */
  qualityTier: z.enum(['premium', 'standard', 'budget', 'unknown']),
});

export type ProductSimilarity = z.infer<typeof ProductSimilaritySchema>;

/**
 * Single substitution suggestion from LLM.
 */
export const LLMSubstitutionSuggestionSchema = z.object({
  /** Original unavailable product name */
  originalProduct: z.string().min(1),

  /** Suggested substitute product name */
  substituteProduct: z.string().min(1),

  /** Similarity assessment */
  similarity: ProductSimilaritySchema,

  /** Recommendation strength (0-1) */
  recommendationStrength: z
    .number()
    .min(0)
    .max(1)
    .describe('How strongly we recommend this substitute'),

  /** Human-readable reason for the suggestion */
  reason: z.string().min(1).describe('Why this is a good substitute'),

  /** Potential concerns with this substitution */
  concerns: z
    .array(z.string())
    .optional()
    .describe('Any concerns the user should be aware of'),

  /** Whether this substitute requires user confirmation */
  requiresConfirmation: z
    .boolean()
    .describe('true if user should explicitly approve this substitution'),
});

export type LLMSubstitutionSuggestion = z.infer<
  typeof LLMSubstitutionSuggestionSchema
>;

/**
 * Ranked list of substitutions for an unavailable product.
 */
export const LLMSubstitutionRankingSchema = z.object({
  /** The unavailable product */
  unavailableProduct: z.string().min(1),

  /** Ranked substitution suggestions (best first) */
  rankedSubstitutes: z
    .array(LLMSubstitutionSuggestionSchema)
    .describe('Substitutes ranked from best to worst'),

  /** Whether any acceptable substitute was found */
  hasAcceptableSubstitute: z.boolean(),

  /** If no good substitute, explain why */
  noSubstituteReason: z.string().optional(),
});

export type LLMSubstitutionRanking = z.infer<typeof LLMSubstitutionRankingSchema>;

// =============================================================================
// Category Classification Schemas
// =============================================================================

/**
 * Product category classification result.
 */
export const CategoryClassificationSchema = z.object({
  /** The product name that was classified */
  productName: z.string().min(1),

  /** Primary category */
  primaryCategory: z.nativeEnum(ProductCategory),

  /** Confidence in classification (0-1) */
  confidence: z.number().min(0).max(1),

  /** Alternative categories that might apply */
  alternativeCategories: z.array(z.nativeEnum(ProductCategory)).optional(),

  /** Keywords that influenced the classification */
  matchedKeywords: z.array(z.string()).optional(),
});

export type CategoryClassification = z.infer<typeof CategoryClassificationSchema>;

/**
 * Batch category classification response.
 */
export const BatchCategoryClassificationSchema = z.object({
  classifications: z.array(CategoryClassificationSchema),
  /** Products that could not be classified */
  unclassified: z.array(z.string()).optional(),
});

export type BatchCategoryClassification = z.infer<
  typeof BatchCategoryClassificationSchema
>;

// =============================================================================
// Restock Cadence Schemas
// =============================================================================

/**
 * LLM-estimated restock cadence for a product.
 */
export const LLMRestockEstimateSchema = z.object({
  /** Product name */
  productName: z.string().min(1),

  /** Estimated restock cadence in days */
  estimatedCadenceDays: z
    .number()
    .int()
    .positive()
    .describe('Typical days between purchases for a household'),

  /** Confidence in this estimate (0-1) */
  confidence: z.number().min(0).max(1),

  /** Reasoning for the estimate */
  reasoning: z.string(),

  /** Factors that could affect this estimate */
  variabilityFactors: z
    .array(z.string())
    .optional()
    .describe('Household factors that might change this cadence'),
});

export type LLMRestockEstimate = z.infer<typeof LLMRestockEstimateSchema>;

// =============================================================================
// JSON Schema Converters
// =============================================================================

/**
 * Convert a Zod schema to JSON Schema format for Claude tool definitions.
 * This is a simplified converter that handles common Zod types.
 *
 * @param schema - Zod schema to convert
 * @param description - Optional description override
 * @returns JSON Schema object
 */
export function zodToJsonSchema(
  schema: z.ZodTypeAny,
  description?: string,
): Record<string, unknown> {
  const jsonSchema = zodSchemaToJson(schema);
  if (description) {
    jsonSchema.description = description;
  }
  return jsonSchema;
}

/**
 * Internal recursive converter for Zod to JSON Schema.
 */
function zodSchemaToJson(schema: z.ZodTypeAny): Record<string, unknown> {
  // Handle ZodOptional - unwrap and mark as not required
  if (schema instanceof z.ZodOptional) {
    return zodSchemaToJson(schema.unwrap());
  }

  // Handle ZodNullable
  if (schema instanceof z.ZodNullable) {
    const inner = zodSchemaToJson(schema.unwrap());
    return { ...inner, nullable: true };
  }

  // Handle ZodDefault - unwrap the inner type
  if (schema instanceof z.ZodDefault) {
    const inner = zodSchemaToJson(schema._def.innerType);
    return { ...inner, default: schema._def.defaultValue() };
  }

  // Handle ZodString
  if (schema instanceof z.ZodString) {
    const result: Record<string, unknown> = { type: 'string' };
    if (schema.description) result.description = schema.description;
    return result;
  }

  // Handle ZodNumber
  if (schema instanceof z.ZodNumber) {
    const result: Record<string, unknown> = { type: 'number' };
    if (schema.description) result.description = schema.description;
    return result;
  }

  // Handle ZodBoolean
  if (schema instanceof z.ZodBoolean) {
    const result: Record<string, unknown> = { type: 'boolean' };
    if (schema.description) result.description = schema.description;
    return result;
  }

  // Handle ZodEnum
  if (schema instanceof z.ZodEnum) {
    const result: Record<string, unknown> = {
      type: 'string',
      enum: schema._def.values,
    };
    if (schema.description) result.description = schema.description;
    return result;
  }

  // Handle ZodNativeEnum
  if (schema instanceof z.ZodNativeEnum) {
    const values = Object.values(schema._def.values).filter(
      (v) => typeof v === 'string',
    );
    const result: Record<string, unknown> = {
      type: 'string',
      enum: values,
    };
    if (schema.description) result.description = schema.description;
    return result;
  }

  // Handle ZodArray
  if (schema instanceof z.ZodArray) {
    const result: Record<string, unknown> = {
      type: 'array',
      items: zodSchemaToJson(schema._def.type),
    };
    if (schema.description) result.description = schema.description;
    return result;
  }

  // Handle ZodObject
  if (schema instanceof z.ZodObject) {
    const shape = schema._def.shape();
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodSchemaToJson(value as z.ZodTypeAny);
      // Check if field is required (not optional)
      if (!(value instanceof z.ZodOptional)) {
        required.push(key);
      }
    }

    const result: Record<string, unknown> = {
      type: 'object',
      properties,
    };

    if (required.length > 0) {
      result.required = required;
    }

    if (schema.description) result.description = schema.description;
    return result;
  }

  // Handle ZodLiteral
  if (schema instanceof z.ZodLiteral) {
    const value = schema._def.value;
    const result: Record<string, unknown> = {
      type: typeof value === 'number' ? 'number' : 'string',
      const: value,
    };
    if (schema.description) result.description = schema.description;
    return result;
  }

  // Handle ZodUnion (simple case - string literals become enum)
  if (schema instanceof z.ZodUnion) {
    const options = schema._def.options;
    const allLiterals = options.every(
      (opt: z.ZodTypeAny) => opt instanceof z.ZodLiteral,
    );

    if (allLiterals) {
      const values = options.map(
        (opt: z.ZodLiteral<unknown>) => opt._def.value,
      );
      const result: Record<string, unknown> = {
        type: 'string',
        enum: values,
      };
      if (schema.description) result.description = schema.description;
      return result;
    }

    // For complex unions, use anyOf
    return {
      anyOf: options.map((opt: z.ZodTypeAny) => zodSchemaToJson(opt)),
    };
  }

  // Default fallback
  return { type: 'string' };
}
