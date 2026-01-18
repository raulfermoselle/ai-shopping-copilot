/**
 * Value Analytics Types
 *
 * Types for analyzing product value metrics including:
 * - Price per unit normalization (€/kg, €/L)
 * - Store brand detection
 * - Brand tier classification
 * - Value comparison between products
 */

import type { SubstituteCandidate, SubstituteScore, RankedSubstitute } from '../types.js';

// =============================================================================
// Size Parsing Types
// =============================================================================

/**
 * Unit types for size normalization.
 */
export type UnitType = 'weight' | 'volume' | 'count' | 'unknown';

/**
 * Parsed size information from product name or size string.
 */
export interface ParsedSize {
  /** Original raw value */
  rawValue: number;
  /** Original unit string */
  rawUnit: string;
  /** Unit type category */
  unitType: UnitType;
  /** Normalized value in grams (for weight) */
  normalizedGrams?: number;
  /** Normalized value in milliliters (for volume) */
  normalizedMl?: number;
  /** Count for countable items */
  count?: number;
  /** Whether this is a pack/bundle (e.g., "6x33cl") */
  isPack?: boolean;
  /** Pack quantity if isPack */
  packQuantity?: number;
}

// =============================================================================
// Brand Classification Types
// =============================================================================

/**
 * Brand tier classification.
 * Used for value optimization when comparing substitutes.
 */
export type BrandTier = 'store' | 'budget' | 'standard' | 'premium' | 'unknown';

// =============================================================================
// Value Analytics Types
// =============================================================================

/**
 * Value analytics for a single product.
 * Contains all price/value metrics for comparison.
 */
export interface ProductValueAnalytics {
  /** Product ID */
  productId: string;
  /** Product name */
  productName: string;
  /** Unit price (absolute) */
  unitPrice: number;
  /** Normalized price per standard unit (e.g., €/100g, €/L) */
  normalizedPricePerUnit: number | null;
  /** Standard unit for price per unit display */
  pricePerUnitLabel: string | null;
  /** Unit type (weight, volume, count) */
  unitType: UnitType;
  /** Parsed size information */
  parsedSize: ParsedSize | null;
  /** Whether this is a store brand (Auchan, Polegar, etc.) */
  isStoreBrand: boolean;
  /** Brand tier classification */
  brandTier: BrandTier;
  /** Original brand name */
  brand?: string;
}

/**
 * Value comparison between original product and a substitute.
 */
export interface ValueComparison {
  /** Original product analytics */
  original: ProductValueAnalytics;
  /** Substitute product analytics */
  substitute: ProductValueAnalytics;
  /** Absolute price difference (substitute - original) */
  priceDelta: number;
  /** Percentage price change ((substitute - original) / original * 100) */
  priceChangePercent: number;
  /** Price per unit delta (if both have same unit type) */
  pricePerUnitDelta: number | null;
  /** Percentage change in price per unit */
  pricePerUnitChangePercent: number | null;
  /** Whether substitute offers better value per unit */
  isBetterValuePerUnit: boolean | null;
  /** Whether this is a switch to store brand (original was not, substitute is) */
  isStoreBrandSwitch: boolean;
  /** Whether this is a switch away from store brand */
  isStoreBrandDeparture: boolean;
  /** Whether price increase exceeds the tolerance threshold */
  exceedsPriceTolerance: boolean;
  /** Value rating based on comparison */
  valueRating: 'excellent' | 'good' | 'acceptable' | 'poor';
}

// =============================================================================
// Substitute Context Types
// =============================================================================

/**
 * Original product context for substitution decisions.
 */
export interface OriginalProductContext {
  /** Product name */
  name: string;
  /** Product ID if available */
  productId?: string;
  /** Brand name */
  brand?: string;
  /** Price in euros */
  price: number;
  /** Price per unit display string (e.g., "5.89 €/Kg") */
  pricePerUnit?: string;
  /** Size string */
  size?: string;
  /** Detected category (optional - can be inferred from product name) */
  category?: string;
}

/**
 * Substitute candidate with full value analytics.
 */
export interface SubstituteCandidateWithAnalytics {
  /** Original candidate data */
  candidate: SubstituteCandidate;
  /** Value analytics for this candidate */
  valueAnalytics: ProductValueAnalytics;
  /** Value comparison with original */
  valueComparison: ValueComparison;
  /** Heuristic score components */
  heuristicScore: SubstituteScore;
  /** Heuristic reason string */
  heuristicReason: string;
}

/**
 * Full context for substitution decisions.
 * Passed to LLM for enhanced ranking.
 */
export interface SubstitutionContext {
  /** Original product information */
  original: OriginalProductContext;
  /** Candidates with full analytics */
  candidates: SubstituteCandidateWithAnalytics[];
  /** User's learned preferences (from learning module) */
  userPreferences?: UserPreferencesContext;
  /** Heuristic-ranked results for reference */
  heuristicRanking: RankedSubstitute[];
  /** Price tolerance threshold */
  priceTolerance: number;
}

/**
 * User preferences context from learning module.
 */
export interface UserPreferencesContext {
  /** How strict the user is about brands */
  brandTolerance: 'strict' | 'flexible' | 'any';
  /** Maximum acceptable price increase (as decimal, e.g., 0.2 = 20%) */
  maxPriceIncrease: number;
  /** Whether user prefers store brands */
  prefersStoreBrand: boolean;
  /** Confidence in these preferences */
  confidence: number;
}

// =============================================================================
// Analytics Summary Types
// =============================================================================

/**
 * Summary of value analytics for a substitution search.
 */
export interface ValueAnalyticsSummary {
  /** Number of candidates analyzed */
  candidateCount: number;
  /** Number with store brands */
  storeBrandCount: number;
  /** Number with better value per unit */
  betterValueCount: number;
  /** Number exceeding price tolerance */
  exceedingToleranceCount: number;
  /** Best value candidate (lowest €/unit) */
  bestValueCandidate?: string;
  /** Cheapest candidate */
  cheapestCandidate?: string;
  /** Most similar brand match */
  bestBrandMatch?: string;
}
