/**
 * Value Calculator
 *
 * Calculates value metrics for product comparison:
 * - Size parsing (grams, liters, units)
 * - Price per unit normalization
 * - Store brand detection
 * - Brand tier classification
 * - Value comparison between products
 */

import type { SubstituteCandidate } from '../types.js';
import type {
  ParsedSize,
  BrandTier,
  ProductValueAnalytics,
  ValueComparison,
  OriginalProductContext,
} from './types.js';

// =============================================================================
// Constants
// =============================================================================

/**
 * Auchan store brands and budget brands.
 */
const STORE_BRANDS = [
  'auchan',
  'polegar',
  'mmm!',
  'rik & rok',
  'cultivar',
  'actuel',
  'qilive',
  'in\'extenso',
  'baby',
  'cosmia',
];

/**
 * Known budget brands (not store brand, but value-oriented).
 */
const BUDGET_BRANDS = [
  'continente',
  'pingo doce',
  'marca branca',
  'hacendado',
  'dia',
];

/**
 * Known premium brands (higher quality tier).
 */
const PREMIUM_BRANDS = [
  'delta',
  'mimosa',
  'gresso',
  'lusiaves',
  'nobre',
  'izidoro',
  'compal',
  'sumol',
  'fairy',
  'skip',
  'persil',
];

/**
 * Weight unit conversions to grams.
 */
const WEIGHT_TO_GRAMS: Record<string, number> = {
  'g': 1,
  'gr': 1,
  'grs': 1,
  'kg': 1000,
  'kgs': 1000,
  'mg': 0.001,
};

/**
 * Volume unit conversions to milliliters.
 */
const VOLUME_TO_ML: Record<string, number> = {
  'ml': 1,
  'l': 1000,
  'lt': 1000,
  'lts': 1000,
  'cl': 10,
  'dl': 100,
};

/**
 * Default price tolerance (20%).
 */
const DEFAULT_PRICE_TOLERANCE = 0.20;

// =============================================================================
// Size Parsing
// =============================================================================

/**
 * Parse a size string into structured size information.
 *
 * Handles formats like:
 * - "500g", "1.5kg", "250ml", "1l"
 * - "6x33cl", "4x1l" (packs)
 * - "12 unidades", "6 un"
 *
 * @param sizeString - Raw size string from product
 * @returns Parsed size or null if parsing fails
 */
export function parseSize(sizeString: string | undefined): ParsedSize | null {
  if (!sizeString) return null;

  const normalized = sizeString.toLowerCase().trim();

  // Check for pack format first (e.g., "6x33cl", "4x1l")
  const packMatch = normalized.match(/(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(g|gr|grs|kg|kgs|mg|ml|l|lt|lts|cl|dl)/i);
  if (packMatch) {
    const packQty = parseInt(packMatch[1]!, 10);
    const unitValue = parseFloat(packMatch[2]!.replace(',', '.'));
    const unit = packMatch[3]!.toLowerCase();

    // Determine unit type
    if (unit in WEIGHT_TO_GRAMS) {
      const totalGrams = unitValue * WEIGHT_TO_GRAMS[unit]! * packQty;
      return {
        rawValue: unitValue,
        rawUnit: unit,
        unitType: 'weight',
        normalizedGrams: totalGrams,
        isPack: true,
        packQuantity: packQty,
      };
    } else if (unit in VOLUME_TO_ML) {
      const totalMl = unitValue * VOLUME_TO_ML[unit]! * packQty;
      return {
        rawValue: unitValue,
        rawUnit: unit,
        unitType: 'volume',
        normalizedMl: totalMl,
        isPack: true,
        packQuantity: packQty,
      };
    }
  }

  // Check for single unit weight/volume (e.g., "500g", "1.5l")
  const singleMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*(g|gr|grs|kg|kgs|mg|ml|l|lt|lts|cl|dl)/i);
  if (singleMatch) {
    const value = parseFloat(singleMatch[1]!.replace(',', '.'));
    const unit = singleMatch[2]!.toLowerCase();

    if (unit in WEIGHT_TO_GRAMS) {
      return {
        rawValue: value,
        rawUnit: unit,
        unitType: 'weight',
        normalizedGrams: value * WEIGHT_TO_GRAMS[unit]!,
      };
    } else if (unit in VOLUME_TO_ML) {
      return {
        rawValue: value,
        rawUnit: unit,
        unitType: 'volume',
        normalizedMl: value * VOLUME_TO_ML[unit]!,
      };
    }
  }

  // Check for count/units (e.g., "12 unidades", "6 un")
  const countMatch = normalized.match(/(\d+)\s*(un|unidades|unid|pcs|pieces|units)/i);
  if (countMatch) {
    const count = parseInt(countMatch[1]!, 10);
    return {
      rawValue: count,
      rawUnit: countMatch[2]!,
      unitType: 'count',
      count,
    };
  }

  return null;
}

/**
 * Extract size from product name if not provided separately.
 */
export function extractSizeFromName(productName: string): string | undefined {
  // Match patterns like "500g", "1.5kg", "250ml", "1l", "6x33cl"
  const match = productName.match(/(\d+(?:[.,]\d+)?\s*(?:x\s*\d+(?:[.,]\d+)?)?\s*(?:g|gr|grs|kg|kgs|mg|ml|l|lt|lts|cl|dl|un|unidades|unid))/i);
  return match?.[1];
}

// =============================================================================
// Price Per Unit Calculation
// =============================================================================

/**
 * Calculate price per standard unit.
 *
 * @param price - Product price in euros
 * @param size - Parsed size information
 * @returns Price per standard unit (€/100g or €/L) or null
 */
export function calculatePricePerUnit(
  price: number,
  size: ParsedSize | null
): { pricePerUnit: number; label: string } | null {
  if (!size || price <= 0) return null;

  if (size.unitType === 'weight' && size.normalizedGrams) {
    // Calculate €/100g
    const pricePer100g = (price / size.normalizedGrams) * 100;
    return {
      pricePerUnit: pricePer100g,
      label: '€/100g',
    };
  }

  if (size.unitType === 'volume' && size.normalizedMl) {
    // Calculate €/L
    const pricePerL = (price / size.normalizedMl) * 1000;
    return {
      pricePerUnit: pricePerL,
      label: '€/L',
    };
  }

  if (size.unitType === 'count' && size.count) {
    // Calculate €/unit
    const pricePerUnit = price / size.count;
    return {
      pricePerUnit,
      label: '€/un',
    };
  }

  return null;
}

// =============================================================================
// Brand Classification
// =============================================================================

/**
 * Check if a brand is an Auchan store brand.
 */
export function isStoreBrand(brand: string | undefined): boolean {
  if (!brand) return false;
  const normalized = brand.toLowerCase().trim();
  return STORE_BRANDS.some(sb => normalized.includes(sb));
}

/**
 * Classify a brand into a tier.
 */
export function classifyBrandTier(brand: string | undefined): BrandTier {
  if (!brand) return 'unknown';

  const normalized = brand.toLowerCase().trim();

  // Check store brands first
  if (STORE_BRANDS.some(sb => normalized.includes(sb))) {
    return 'store';
  }

  // Check budget brands
  if (BUDGET_BRANDS.some(bb => normalized.includes(bb))) {
    return 'budget';
  }

  // Check premium brands
  if (PREMIUM_BRANDS.some(pb => normalized.includes(pb))) {
    return 'premium';
  }

  // Default to standard
  return 'standard';
}

// =============================================================================
// Product Value Analytics
// =============================================================================

/**
 * Build value analytics for a substitute candidate.
 */
export function buildValueAnalytics(candidate: SubstituteCandidate): ProductValueAnalytics {
  // Parse size from candidate or extract from name
  const sizeString = candidate.size || extractSizeFromName(candidate.name);
  const parsedSize = parseSize(sizeString);

  // Calculate price per unit
  const pricePerUnitResult = calculatePricePerUnit(candidate.unitPrice, parsedSize);

  return {
    productId: candidate.productId,
    productName: candidate.name,
    unitPrice: candidate.unitPrice,
    normalizedPricePerUnit: pricePerUnitResult?.pricePerUnit ?? null,
    pricePerUnitLabel: pricePerUnitResult?.label ?? null,
    unitType: parsedSize?.unitType ?? 'unknown',
    parsedSize,
    isStoreBrand: isStoreBrand(candidate.brand),
    brandTier: classifyBrandTier(candidate.brand),
    ...(candidate.brand !== undefined && { brand: candidate.brand }),
  };
}

/**
 * Build value analytics for an original product context.
 */
export function buildOriginalAnalytics(original: OriginalProductContext): ProductValueAnalytics {
  const sizeString = original.size || extractSizeFromName(original.name);
  const parsedSize = parseSize(sizeString);
  const pricePerUnitResult = calculatePricePerUnit(original.price, parsedSize);

  return {
    productId: original.productId ?? 'original',
    productName: original.name,
    unitPrice: original.price,
    normalizedPricePerUnit: pricePerUnitResult?.pricePerUnit ?? null,
    pricePerUnitLabel: pricePerUnitResult?.label ?? null,
    unitType: parsedSize?.unitType ?? 'unknown',
    parsedSize,
    isStoreBrand: isStoreBrand(original.brand),
    brandTier: classifyBrandTier(original.brand),
    ...(original.brand !== undefined && { brand: original.brand }),
  };
}

// =============================================================================
// Value Comparison
// =============================================================================

/**
 * Calculate value rating based on comparison metrics.
 */
function calculateValueRating(
  priceChangePercent: number,
  isBetterValuePerUnit: boolean | null,
  isStoreBrandSwitch: boolean,
  priceTolerance: number
): 'excellent' | 'good' | 'acceptable' | 'poor' {
  // Excellent: Cheaper or same price, or store brand switch with better value
  if (priceChangePercent <= 0 && (isBetterValuePerUnit === true || isBetterValuePerUnit === null)) {
    return 'excellent';
  }

  // Excellent: Store brand switch even with slight price increase
  if (isStoreBrandSwitch && priceChangePercent <= 5) {
    return 'excellent';
  }

  // Good: Better value per unit even with some price increase
  if (isBetterValuePerUnit === true && priceChangePercent <= 10) {
    return 'good';
  }

  // Good: Within 10% price increase
  if (priceChangePercent <= 10) {
    return 'good';
  }

  // Acceptable: Within tolerance
  if (priceChangePercent <= priceTolerance * 100) {
    return 'acceptable';
  }

  // Poor: Exceeds tolerance
  return 'poor';
}

/**
 * Compare values between original product and a substitute.
 */
export function compareValues(
  original: ProductValueAnalytics,
  substitute: ProductValueAnalytics,
  priceTolerance: number = DEFAULT_PRICE_TOLERANCE
): ValueComparison {
  // Price comparison
  const priceDelta = substitute.unitPrice - original.unitPrice;
  const priceChangePercent = original.unitPrice > 0
    ? (priceDelta / original.unitPrice) * 100
    : 0;

  // Price per unit comparison (only if same unit type)
  let pricePerUnitDelta: number | null = null;
  let pricePerUnitChangePercent: number | null = null;
  let isBetterValuePerUnit: boolean | null = null;

  if (
    original.normalizedPricePerUnit !== null &&
    substitute.normalizedPricePerUnit !== null &&
    original.unitType === substitute.unitType &&
    original.unitType !== 'unknown'
  ) {
    pricePerUnitDelta = substitute.normalizedPricePerUnit - original.normalizedPricePerUnit;
    pricePerUnitChangePercent = original.normalizedPricePerUnit > 0
      ? (pricePerUnitDelta / original.normalizedPricePerUnit) * 100
      : 0;
    isBetterValuePerUnit = pricePerUnitDelta < 0;
  }

  // Brand switches
  const isStoreBrandSwitch = !original.isStoreBrand && substitute.isStoreBrand;
  const isStoreBrandDeparture = original.isStoreBrand && !substitute.isStoreBrand;

  // Tolerance check
  const exceedsPriceTolerance = priceChangePercent > priceTolerance * 100;

  // Value rating
  const valueRating = calculateValueRating(
    priceChangePercent,
    isBetterValuePerUnit,
    isStoreBrandSwitch,
    priceTolerance
  );

  return {
    original,
    substitute,
    priceDelta,
    priceChangePercent,
    pricePerUnitDelta,
    pricePerUnitChangePercent,
    isBetterValuePerUnit,
    isStoreBrandSwitch,
    isStoreBrandDeparture,
    exceedsPriceTolerance,
    valueRating,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format price per unit for display.
 */
export function formatPricePerUnit(
  pricePerUnit: number | null,
  label: string | null
): string {
  if (pricePerUnit === null || label === null) {
    return 'N/A';
  }
  return `${pricePerUnit.toFixed(2)} ${label}`;
}

/**
 * Format price change for display.
 */
export function formatPriceChange(priceChangePercent: number): string {
  const sign = priceChangePercent >= 0 ? '+' : '';
  return `${sign}${priceChangePercent.toFixed(1)}%`;
}

/**
 * Check if a substitute meets minimum value criteria.
 */
export function meetsValueCriteria(
  comparison: ValueComparison,
  config: {
    maxPriceIncrease?: number;
    preferStoreBrand?: boolean;
  } = {}
): boolean {
  const maxIncrease = config.maxPriceIncrease ?? DEFAULT_PRICE_TOLERANCE * 100;

  // Always accept if cheaper
  if (comparison.priceChangePercent <= 0) {
    return true;
  }

  // Accept store brand switches with slightly higher tolerance
  if (comparison.isStoreBrandSwitch && comparison.priceChangePercent <= maxIncrease + 5) {
    return true;
  }

  // Accept if within tolerance
  return comparison.priceChangePercent <= maxIncrease;
}
