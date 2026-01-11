/**
 * Substitution Worker Types
 *
 * Types for finding substitute products when items are unavailable.
 */

import { z } from 'zod';

// =============================================================================
// Product Availability
// =============================================================================

/**
 * Availability status for a product
 */
export const AvailabilityStatusSchema = z.enum([
  'available',
  'low_stock',
  'out_of_stock',
  'discontinued',
  'unknown',
]);

export type AvailabilityStatus = z.infer<typeof AvailabilityStatusSchema>;

/**
 * Availability check result for a single product
 */
export const AvailabilityResultSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  productUrl: z.string().url().optional(),
  status: AvailabilityStatusSchema,
  /** Quantity available if known */
  quantityAvailable: z.number().int().nonnegative().optional(),
  /** When the availability was checked */
  checkedAt: z.date(),
  /** Additional notes (e.g., "Expected back in stock May 15") */
  note: z.string().optional(),
});

export type AvailabilityResult = z.infer<typeof AvailabilityResultSchema>;

// =============================================================================
// Substitute Products
// =============================================================================

/**
 * A candidate substitute product
 */
export const SubstituteCandidateSchema = z.object({
  /** Auchan product ID */
  productId: z.string(),
  /** Product name */
  name: z.string(),
  /** Product URL */
  productUrl: z.string().url().optional(),
  /** Unit price in euros */
  unitPrice: z.number().nonnegative(),
  /** Price per unit (e.g., "€2.50/kg") */
  pricePerUnit: z.string().optional(),
  /** Product image URL */
  imageUrl: z.string().url().optional(),
  /** Brand name */
  brand: z.string().optional(),
  /** Size/weight (e.g., "500g", "1L") */
  size: z.string().optional(),
  /** Whether this product is available */
  available: z.boolean(),
});

export type SubstituteCandidate = z.infer<typeof SubstituteCandidateSchema>;

/**
 * Scoring factors for substitute ranking
 */
export const SubstituteScoreSchema = z.object({
  /** How similar the brand is (0-1, 1 = same brand) */
  brandSimilarity: z.number().min(0).max(1),
  /** How similar the size/quantity is (0-1, 1 = exact match) */
  sizeSimilarity: z.number().min(0).max(1),
  /** Price similarity (0-1, 1 = same price) */
  priceSimilarity: z.number().min(0).max(1),
  /** Category/type match (0-1) */
  categoryMatch: z.number().min(0).max(1),
  /** User preference score if available (0-1) */
  userPreference: z.number().min(0).max(1).optional(),
  /** Overall weighted score (0-1) */
  overall: z.number().min(0).max(1),
});

export type SubstituteScore = z.infer<typeof SubstituteScoreSchema>;

/**
 * A ranked substitute with scoring
 */
export const RankedSubstituteSchema = z.object({
  /** The substitute candidate */
  candidate: SubstituteCandidateSchema,
  /** Scoring breakdown */
  score: SubstituteScoreSchema,
  /** Why this substitute was chosen */
  reason: z.string(),
  /** Price difference from original */
  priceDelta: z.number(),
});

export type RankedSubstitute = z.infer<typeof RankedSubstituteSchema>;

// =============================================================================
// Substitution Request/Response
// =============================================================================

/**
 * Request to find substitutes for an unavailable item
 */
export const SubstitutionRequestSchema = z.object({
  /** The original product that needs a substitute */
  originalProduct: z.object({
    productId: z.string().optional(),
    name: z.string(),
    brand: z.string().optional(),
    size: z.string().optional(),
    unitPrice: z.number().nonnegative().optional(),
    category: z.string().optional(),
  }),
  /** Maximum number of substitutes to return */
  maxSubstitutes: z.number().int().positive().default(5),
  /** Maximum price increase allowed (as percentage, e.g., 0.2 = 20%) */
  maxPriceIncrease: z.number().min(0).max(1).default(0.3),
  /** Prefer same brand? */
  preferSameBrand: z.boolean().default(true),
  /** Prefer similar size? */
  preferSimilarSize: z.boolean().default(true),
});

export type SubstitutionRequest = z.infer<typeof SubstitutionRequestSchema>;

/**
 * Result of a substitution search
 */
export const SubstitutionResultSchema = z.object({
  /** The original product */
  originalProduct: z.object({
    productId: z.string().optional(),
    name: z.string(),
  }),
  /** Availability status of original */
  originalAvailability: AvailabilityStatusSchema,
  /** Ranked list of substitutes (best first) */
  substitutes: z.array(RankedSubstituteSchema),
  /** Whether any acceptable substitutes were found */
  hasSubstitutes: z.boolean(),
  /** Search query used */
  searchQuery: z.string().optional(),
  /** When the search was performed */
  searchedAt: z.date(),
});

export type SubstitutionResult = z.infer<typeof SubstitutionResultSchema>;

// =============================================================================
// Substitution Worker Interface
// =============================================================================

/**
 * Configuration for the Substitution Worker
 */
export const SubstitutionWorkerConfigSchema = z.object({
  /** Maximum substitutes to find per item */
  maxSubstitutesPerItem: z.number().int().positive().default(5),
  /** Default max price increase */
  defaultMaxPriceIncrease: z.number().min(0).max(1).default(0.3),
  /** Timeout for availability checks (ms) */
  availabilityCheckTimeout: z.number().int().positive().default(10000),
  /** Timeout for substitute search (ms) */
  searchTimeout: z.number().int().positive().default(30000),
  /** Brand similarity weight in scoring */
  brandWeight: z.number().min(0).max(1).default(0.3),
  /** Size similarity weight in scoring */
  sizeWeight: z.number().min(0).max(1).default(0.2),
  /** Price similarity weight in scoring */
  priceWeight: z.number().min(0).max(1).default(0.3),
  /** Category match weight in scoring */
  categoryWeight: z.number().min(0).max(1).default(0.2),
});

export type SubstitutionWorkerConfig = z.infer<typeof SubstitutionWorkerConfigSchema>;

/**
 * Input to the Substitution Worker
 */
export const SubstitutionWorkerInputSchema = z.object({
  /** Items to check availability for */
  items: z.array(
    z.object({
      productId: z.string().optional(),
      name: z.string(),
      productUrl: z.string().url().optional(),
      brand: z.string().optional(),
      size: z.string().optional(),
      unitPrice: z.number().nonnegative().optional(),
      quantity: z.number().int().positive(),
    })
  ),
  /** Configuration overrides */
  config: SubstitutionWorkerConfigSchema.partial().optional(),
});

export type SubstitutionWorkerInput = z.infer<typeof SubstitutionWorkerInputSchema>;

/**
 * Output from the Substitution Worker
 */
export const SubstitutionWorkerOutputSchema = z.object({
  /** Availability results for all items */
  availabilityResults: z.array(AvailabilityResultSchema),
  /** Substitution results for unavailable items */
  substitutionResults: z.array(SubstitutionResultSchema),
  /** Summary counts */
  summary: z.object({
    totalItems: z.number().int().nonnegative(),
    availableItems: z.number().int().nonnegative(),
    unavailableItems: z.number().int().nonnegative(),
    itemsWithSubstitutes: z.number().int().nonnegative(),
    itemsWithoutSubstitutes: z.number().int().nonnegative(),
  }),
  /** When the check was completed */
  completedAt: z.date(),
});

export type SubstitutionWorkerOutput = z.infer<typeof SubstitutionWorkerOutputSchema>;
