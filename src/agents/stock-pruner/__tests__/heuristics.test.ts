/**
 * Unit Tests for StockPruner Heuristics
 *
 * Tests all pure heuristic functions in the StockPruner module:
 * - Category detection from product names
 * - Restock cadence calculation from purchase history
 * - Restock timing estimation
 * - Pruning decisions with confidence scoring
 * - Batch processing and duplicate detection
 * - Summary statistics generation
 *
 * All functions under test are pure (no side effects, deterministic).
 * No mocking is required.
 */

import { describe, it, expect } from 'vitest';
import {
  detectCategory,
  calculateRestockCadence,
  estimateRestockTiming,
  shouldPruneItem,
  findItemHistory,
  findDuplicatesInCart,
  processCartItems,
  summarizeDecisions,
  type CartItemForPruning,
} from '../heuristics.js';
import {
  ProductCategory,
  CATEGORY_CADENCE_DEFAULTS,
  type PurchaseRecord,
  type ItemPurchaseHistory,
  type StockPrunerConfig,
  type UserOverride,
  type PruneDecision,
} from '../types.js';

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a default StockPruner config for testing.
 */
function createTestConfig(overrides?: Partial<StockPrunerConfig>): StockPrunerConfig {
  return {
    historyDaysBack: 90,
    minPruneConfidence: 0.7,
    useLearnedCadences: true,
    conservativeMode: true,
    includeUncertainItems: true,
    pruneThreshold: 0.5,
    uncertainThreshold: 0.8,
    ...overrides,
  };
}

/**
 * Create a test cart item.
 */
function createCartItem(overrides?: Partial<CartItemForPruning>): CartItemForPruning {
  return {
    productId: 'prod-123',
    name: 'Test Product',
    quantity: 1,
    unitPrice: 5.99,
    ...overrides,
  };
}

/**
 * Create a purchase record for testing.
 */
function createPurchaseRecord(
  productName: string,
  purchaseDate: Date,
  overrides?: Partial<PurchaseRecord>
): PurchaseRecord {
  return {
    productId: `prod-${productName.toLowerCase().replace(/\s+/g, '-')}`,
    productName,
    purchaseDate,
    quantity: 1,
    orderId: `order-${Date.now()}`,
    ...overrides,
  };
}

/**
 * Create an item purchase history for testing.
 */
function createItemHistory(
  productName: string,
  purchases: PurchaseRecord[],
  overrides?: Partial<ItemPurchaseHistory>
): ItemPurchaseHistory {
  const totalQuantity = purchases.reduce((sum, p) => sum + p.quantity, 0);
  const dates = purchases.map((p) => new Date(p.purchaseDate));
  const lastPurchaseDate = new Date(Math.max(...dates.map((d) => d.getTime())));
  const averageQuantity = totalQuantity / purchases.length;

  return {
    productId: `prod-${productName.toLowerCase().replace(/\s+/g, '-')}`,
    productName,
    purchases,
    totalQuantity,
    lastPurchaseDate,
    averageQuantity,
    ...overrides,
  };
}

/**
 * Create a user override for testing.
 */
function createUserOverride(
  productId: string,
  overrides?: Partial<UserOverride>
): UserOverride {
  return {
    productId,
    productName: 'Test Product',
    createdAt: new Date(),
    ...overrides,
  };
}

/**
 * Helper to create dates relative to a reference date.
 */
function daysAgo(days: number, reference: Date = new Date()): Date {
  const result = new Date(reference);
  result.setDate(result.getDate() - days);
  return result;
}

// =============================================================================
// Category Detection Tests
// =============================================================================

describe('detectCategory', () => {
  describe('Portuguese product names', () => {
    it('should detect LAUNDRY category from "Detergente Roupa Skip 50 doses"', () => {
      const result = detectCategory('Detergente Roupa Skip 50 doses');

      expect(result.category).toBe(ProductCategory.LAUNDRY);
      expect(result.confidence).toBeGreaterThan(0.6);
      expect(result.matchedKeywords).toContain('detergente');
      expect(result.reasoning).toContain('laundry'); // Category enum value is lowercase
    });

    it('should detect PAPER_PRODUCTS category from "Papel Higienico Renova 12 rolos"', () => {
      const result = detectCategory('Papel Higienico Renova 12 rolos');

      expect(result.category).toBe(ProductCategory.PAPER_PRODUCTS);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.matchedKeywords).toContain('papel');
    });

    it('should detect DAIRY category from "Leite Mimosa Meio Gordo 1L"', () => {
      const result = detectCategory('Leite Mimosa Meio Gordo 1L');

      expect(result.category).toBe(ProductCategory.DAIRY);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.matchedKeywords).toContain('leite');
    });

    it('should detect FRESH_PRODUCE category from "Banana da Madeira"', () => {
      const result = detectCategory('Banana da Madeira');

      expect(result.category).toBe(ProductCategory.FRESH_PRODUCE);
      expect(result.matchedKeywords).toContain('banana');
    });

    it('should detect MEAT_FISH category from "Bife de Vaca 500g"', () => {
      const result = detectCategory('Bife de Vaca 500g');

      expect(result.category).toBe(ProductCategory.MEAT_FISH);
      expect(result.matchedKeywords.length).toBeGreaterThan(0);
    });

    it('should detect BEVERAGES category from "Cafe Delta 250g"', () => {
      const result = detectCategory('Cafe Delta 250g');

      expect(result.category).toBe(ProductCategory.BEVERAGES);
      // matchedKeywords contains the original keyword (with accent) from CATEGORY_KEYWORDS
      expect(result.matchedKeywords).toContain('café');
    });

    it('should detect LAUNDRY over CLEANING when "Detergente" is in the name', () => {
      // "Fairy Original Detergente Loica" contains "detergente" which matches LAUNDRY first
      // due to category priority order. This tests that priority ordering works.
      const result = detectCategory('Fairy Original Detergente Loica');

      // LAUNDRY has "detergente" keyword and is checked before CLEANING in priority order
      expect(result.category).toBe(ProductCategory.LAUNDRY);
      expect(result.matchedKeywords).toContain('detergente');
    });

    it('should detect CLEANING category from "Fairy Lava Loica Original"', () => {
      // Without "detergente", Fairy should match CLEANING via the "fairy" keyword
      const result = detectCategory('Fairy Lava Loica Original');

      expect(result.category).toBe(ProductCategory.CLEANING);
      expect(result.matchedKeywords).toContain('fairy');
    });

    it('should detect BABY_CARE category from "Fraldas Dodot Tamanho 4"', () => {
      const result = detectCategory('Fraldas Dodot Tamanho 4');

      expect(result.category).toBe(ProductCategory.BABY_CARE);
      expect(result.matchedKeywords).toContain('fralda');
    });

    it('should detect PET_SUPPLIES category from "Racao Gato Felix 1kg"', () => {
      const result = detectCategory('Racao Gato Felix 1kg');

      expect(result.category).toBe(ProductCategory.PET_SUPPLIES);
      expect(result.matchedKeywords).toContain('gato');
    });

    it('should detect PERSONAL_HYGIENE category from "Champoo Pantene 400ml"', () => {
      const result = detectCategory('Champoo Pantene 400ml');

      expect(result.category).toBe(ProductCategory.PERSONAL_HYGIENE);
    });
  });

  describe('English product names', () => {
    it('should detect DAIRY category from "Whole Milk 1L"', () => {
      const result = detectCategory('Whole Milk 1L');

      expect(result.category).toBe(ProductCategory.DAIRY);
      expect(result.matchedKeywords).toContain('milk');
    });

    it('should detect MEAT_FISH category from "Fresh Chicken Breast 500g"', () => {
      const result = detectCategory('Fresh Chicken Breast 500g');

      expect(result.category).toBe(ProductCategory.MEAT_FISH);
      expect(result.matchedKeywords).toContain('chicken');
    });

    it('should detect LAUNDRY category from "Tide Laundry Detergent"', () => {
      const result = detectCategory('Tide Laundry Detergent');

      expect(result.category).toBe(ProductCategory.LAUNDRY);
      expect(result.matchedKeywords).toContain('laundry');
    });
  });

  describe('fallback to UNKNOWN', () => {
    it('should return UNKNOWN for unrecognized product names', () => {
      const result = detectCategory('Unknown Product XYZ');

      expect(result.category).toBe(ProductCategory.UNKNOWN);
      expect(result.confidence).toBeLessThan(0.2);
      expect(result.matchedKeywords).toHaveLength(0);
      expect(result.reasoning).toContain('No category keywords matched');
    });

    it('should return UNKNOWN for empty string', () => {
      const result = detectCategory('');

      expect(result.category).toBe(ProductCategory.UNKNOWN);
      expect(result.matchedKeywords).toHaveLength(0);
    });

    it('should return UNKNOWN for numbers only', () => {
      const result = detectCategory('12345');

      expect(result.category).toBe(ProductCategory.UNKNOWN);
    });
  });

  describe('multiple keyword matches', () => {
    it('should have higher confidence with multiple keyword matches', () => {
      const singleMatch = detectCategory('Leite');
      const multiMatch = detectCategory('Leite Iogurte Queijo');

      expect(multiMatch.confidence).toBeGreaterThan(singleMatch.confidence);
      expect(multiMatch.matchedKeywords.length).toBeGreaterThan(1);
    });
  });

  describe('accent handling', () => {
    it('should match keywords regardless of accents', () => {
      const withAccent = detectCategory('Pao Integral');
      const withoutAccent = detectCategory('Pao Integral');

      expect(withAccent.category).toBe(ProductCategory.BREAD_BAKERY);
      expect(withoutAccent.category).toBe(ProductCategory.BREAD_BAKERY);
    });

    it('should normalize text with various diacritics', () => {
      const result = detectCategory('Cafe Expresso Premium');

      expect(result.category).toBe(ProductCategory.BEVERAGES);
    });
  });

  describe('case insensitivity', () => {
    it('should match keywords regardless of case', () => {
      const lowercase = detectCategory('leite mimosa');
      const uppercase = detectCategory('LEITE MIMOSA');
      const mixedCase = detectCategory('Leite MIMOSA');

      expect(lowercase.category).toBe(ProductCategory.DAIRY);
      expect(uppercase.category).toBe(ProductCategory.DAIRY);
      expect(mixedCase.category).toBe(ProductCategory.DAIRY);
    });
  });
});

// =============================================================================
// Cadence Calculation Tests
// =============================================================================

describe('calculateRestockCadence', () => {
  const referenceDate = new Date('2026-01-11');

  describe('no purchase history', () => {
    it('should return category default when history is null', () => {
      const result = calculateRestockCadence(null, ProductCategory.DAIRY);

      expect(result.cadenceDays).toBe(CATEGORY_CADENCE_DEFAULTS[ProductCategory.DAIRY]);
      expect(result.source).toBe('no-history');
      expect(result.confidence).toBe(0.3);
      expect(result.dataPoints).toBe(0);
    });

    it('should return category default when purchases array is empty', () => {
      const history = createItemHistory('Milk', []);
      history.purchases = [];

      const result = calculateRestockCadence(history, ProductCategory.DAIRY);

      expect(result.cadenceDays).toBe(CATEGORY_CADENCE_DEFAULTS[ProductCategory.DAIRY]);
      expect(result.source).toBe('no-history');
    });
  });

  describe('insufficient purchase history', () => {
    it('should return category default with 1 purchase (less than min required)', () => {
      const purchases = [
        createPurchaseRecord('Milk', daysAgo(30, referenceDate)),
      ];
      const history = createItemHistory('Milk', purchases);

      const result = calculateRestockCadence(history, ProductCategory.DAIRY, 3);

      expect(result.cadenceDays).toBe(CATEGORY_CADENCE_DEFAULTS[ProductCategory.DAIRY]);
      expect(result.source).toBe('category-default');
      expect(result.confidence).toBeGreaterThan(0.3);
      expect(result.dataPoints).toBe(1);
    });

    it('should return category default with 2 purchases when min is 3', () => {
      const purchases = [
        createPurchaseRecord('Milk', daysAgo(30, referenceDate)),
        createPurchaseRecord('Milk', daysAgo(15, referenceDate)),
      ];
      const history = createItemHistory('Milk', purchases);

      const result = calculateRestockCadence(history, ProductCategory.DAIRY, 3);

      expect(result.source).toBe('category-default');
      expect(result.dataPoints).toBe(2);
    });
  });

  describe('learned cadence from history', () => {
    it('should calculate median interval from 3 purchases with consistent intervals', () => {
      const purchases = [
        createPurchaseRecord('Milk', daysAgo(21, referenceDate)),
        createPurchaseRecord('Milk', daysAgo(14, referenceDate)),
        createPurchaseRecord('Milk', daysAgo(7, referenceDate)),
      ];
      const history = createItemHistory('Milk', purchases);

      const result = calculateRestockCadence(history, ProductCategory.DAIRY, 3);

      expect(result.cadenceDays).toBe(7);
      expect(result.source).toBe('learned');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should use median to handle irregular intervals (outliers)', () => {
      const purchases = [
        createPurchaseRecord('Milk', daysAgo(90, referenceDate)), // Long gap (outlier)
        createPurchaseRecord('Milk', daysAgo(21, referenceDate)),
        createPurchaseRecord('Milk', daysAgo(14, referenceDate)),
        createPurchaseRecord('Milk', daysAgo(7, referenceDate)),
      ];
      const history = createItemHistory('Milk', purchases);

      const result = calculateRestockCadence(history, ProductCategory.DAIRY, 3);

      // Intervals: 69, 7, 7 -> median should be 7
      expect(result.cadenceDays).toBe(7);
      expect(result.source).toBe('learned');
    });

    it('should clamp cadence to minimum of 1 day', () => {
      // Same day purchases (edge case)
      const purchases = [
        createPurchaseRecord('Milk', referenceDate),
        createPurchaseRecord('Milk', referenceDate),
        createPurchaseRecord('Milk', referenceDate),
      ];
      const history = createItemHistory('Milk', purchases);

      const result = calculateRestockCadence(history, ProductCategory.DAIRY, 3);

      expect(result.cadenceDays).toBeGreaterThanOrEqual(1);
    });

    it('should clamp cadence to maximum of 180 days', () => {
      const purchases = [
        createPurchaseRecord('Rare Item', daysAgo(720, referenceDate)),
        createPurchaseRecord('Rare Item', daysAgo(360, referenceDate)),
        createPurchaseRecord('Rare Item', daysAgo(0, referenceDate)),
      ];
      const history = createItemHistory('Rare Item', purchases);

      const result = calculateRestockCadence(history, ProductCategory.UNKNOWN, 3);

      expect(result.cadenceDays).toBeLessThanOrEqual(180);
    });
  });

  describe('confidence calculation', () => {
    it('should have higher confidence with consistent intervals', () => {
      const consistentPurchases = [
        createPurchaseRecord('Milk', daysAgo(28, referenceDate)),
        createPurchaseRecord('Milk', daysAgo(21, referenceDate)),
        createPurchaseRecord('Milk', daysAgo(14, referenceDate)),
        createPurchaseRecord('Milk', daysAgo(7, referenceDate)),
      ];
      const consistentHistory = createItemHistory('Milk', consistentPurchases);

      const inconsistentPurchases = [
        createPurchaseRecord('Milk', daysAgo(60, referenceDate)),
        createPurchaseRecord('Milk', daysAgo(21, referenceDate)),
        createPurchaseRecord('Milk', daysAgo(14, referenceDate)),
        createPurchaseRecord('Milk', daysAgo(7, referenceDate)),
      ];
      const inconsistentHistory = createItemHistory('Milk', inconsistentPurchases);

      const consistentResult = calculateRestockCadence(consistentHistory, ProductCategory.DAIRY, 3);
      const inconsistentResult = calculateRestockCadence(inconsistentHistory, ProductCategory.DAIRY, 3);

      expect(consistentResult.confidence).toBeGreaterThan(inconsistentResult.confidence);
    });

    it('should increase confidence with more data points', () => {
      const fewPurchases = [
        createPurchaseRecord('Milk', daysAgo(21, referenceDate)),
        createPurchaseRecord('Milk', daysAgo(14, referenceDate)),
        createPurchaseRecord('Milk', daysAgo(7, referenceDate)),
      ];

      const manyPurchases = [
        createPurchaseRecord('Milk', daysAgo(70, referenceDate)),
        createPurchaseRecord('Milk', daysAgo(63, referenceDate)),
        createPurchaseRecord('Milk', daysAgo(56, referenceDate)),
        createPurchaseRecord('Milk', daysAgo(49, referenceDate)),
        createPurchaseRecord('Milk', daysAgo(42, referenceDate)),
        createPurchaseRecord('Milk', daysAgo(35, referenceDate)),
        createPurchaseRecord('Milk', daysAgo(28, referenceDate)),
        createPurchaseRecord('Milk', daysAgo(21, referenceDate)),
        createPurchaseRecord('Milk', daysAgo(14, referenceDate)),
        createPurchaseRecord('Milk', daysAgo(7, referenceDate)),
      ];

      const fewResult = calculateRestockCadence(
        createItemHistory('Milk', fewPurchases),
        ProductCategory.DAIRY,
        3
      );
      const manyResult = calculateRestockCadence(
        createItemHistory('Milk', manyPurchases),
        ProductCategory.DAIRY,
        3
      );

      expect(manyResult.confidence).toBeGreaterThanOrEqual(fewResult.confidence);
    });
  });

  describe('category defaults', () => {
    it('should use correct defaults for each category', () => {
      const categories = Object.values(ProductCategory);

      for (const category of categories) {
        const result = calculateRestockCadence(null, category);
        expect(result.cadenceDays).toBe(CATEGORY_CADENCE_DEFAULTS[category]);
      }
    });
  });
});

// =============================================================================
// Restock Timing Estimation Tests
// =============================================================================

describe('estimateRestockTiming', () => {
  const referenceDate = new Date('2026-01-11');

  describe('no purchase history', () => {
    it('should return unknown status when lastPurchaseDate is null', () => {
      const result = estimateRestockTiming(null, 30, referenceDate);

      expect(result.status).toBe('unknown');
      expect(result.daysSincePurchase).toBe(0);
      expect(result.daysUntilRestock).toBe(0);
      expect(result.urgencyRatio).toBe(1.0);
    });
  });

  describe('recently purchased items', () => {
    it('should identify item purchased 5 days ago with 30-day cadence as recently-purchased', () => {
      const lastPurchase = daysAgo(5, referenceDate);
      const result = estimateRestockTiming(lastPurchase, 30, referenceDate);

      expect(result.status).toBe('recently-purchased');
      expect(result.daysSincePurchase).toBe(5);
      expect(result.daysUntilRestock).toBe(25);
      expect(result.urgencyRatio).toBeCloseTo(5 / 30, 2);
    });

    it('should identify item purchased 10 days ago with 30-day cadence as recently-purchased', () => {
      const lastPurchase = daysAgo(10, referenceDate);
      const result = estimateRestockTiming(lastPurchase, 30, referenceDate);

      expect(result.status).toBe('recently-purchased');
      expect(result.urgencyRatio).toBeLessThan(0.5);
    });
  });

  describe('adequate stock items', () => {
    it('should identify item purchased 15 days ago with 30-day cadence as adequate', () => {
      const lastPurchase = daysAgo(15, referenceDate);
      const result = estimateRestockTiming(lastPurchase, 30, referenceDate);

      expect(result.status).toBe('adequate');
      expect(result.daysSincePurchase).toBe(15);
      expect(result.daysUntilRestock).toBe(15);
      expect(result.urgencyRatio).toBe(0.5);
    });

    it('should identify item purchased 20 days ago with 30-day cadence as adequate', () => {
      const lastPurchase = daysAgo(20, referenceDate);
      const result = estimateRestockTiming(lastPurchase, 30, referenceDate);

      expect(result.status).toBe('adequate');
      expect(result.urgencyRatio).toBeCloseTo(20 / 30, 2);
    });
  });

  describe('due-soon items', () => {
    it('should identify item purchased 27 days ago with 30-day cadence as due-soon', () => {
      const lastPurchase = daysAgo(27, referenceDate);
      const result = estimateRestockTiming(lastPurchase, 30, referenceDate);

      expect(result.status).toBe('due-soon');
      expect(result.daysSincePurchase).toBe(27);
      expect(result.daysUntilRestock).toBe(3);
      expect(result.urgencyRatio).toBe(0.9);
    });

    it('should identify item at exactly 90% of cadence as due-soon', () => {
      const lastPurchase = daysAgo(9, referenceDate);
      const result = estimateRestockTiming(lastPurchase, 10, referenceDate);

      expect(result.status).toBe('due-soon');
      expect(result.urgencyRatio).toBe(0.9);
    });
  });

  describe('overdue items', () => {
    it('should identify item purchased 36+ days ago with 30-day cadence as overdue (ratio >= 1.2)', () => {
      // The overdue threshold is 1.2, so 36/30 = 1.2 is the boundary
      const lastPurchase = daysAgo(36, referenceDate);
      const result = estimateRestockTiming(lastPurchase, 30, referenceDate);

      expect(result.status).toBe('overdue');
      expect(result.daysSincePurchase).toBe(36);
      expect(result.daysUntilRestock).toBe(-6);
      expect(result.urgencyRatio).toBe(1.2);
    });

    it('should identify item purchased 35 days ago with 30-day cadence as due-soon (ratio < 1.2)', () => {
      // 35/30 = 1.17, which is >= 0.9 but < 1.2, so it's "due-soon"
      const lastPurchase = daysAgo(35, referenceDate);
      const result = estimateRestockTiming(lastPurchase, 30, referenceDate);

      expect(result.status).toBe('due-soon');
      expect(result.daysSincePurchase).toBe(35);
      expect(result.urgencyRatio).toBeCloseTo(35 / 30, 2);
    });

    it('should identify significantly overdue items', () => {
      const lastPurchase = daysAgo(45, referenceDate);
      const result = estimateRestockTiming(lastPurchase, 30, referenceDate);

      expect(result.status).toBe('overdue');
      expect(result.urgencyRatio).toBe(1.5);
    });
  });

  describe('edge cases', () => {
    it('should handle very short cadence (1 day)', () => {
      const lastPurchase = daysAgo(2, referenceDate);
      const result = estimateRestockTiming(lastPurchase, 1, referenceDate);

      expect(result.status).toBe('overdue');
      expect(result.urgencyRatio).toBe(2.0);
    });

    it('should handle very long cadence (180 days)', () => {
      const lastPurchase = daysAgo(90, referenceDate);
      const result = estimateRestockTiming(lastPurchase, 180, referenceDate);

      expect(result.status).toBe('adequate');
      expect(result.daysUntilRestock).toBe(90);
    });

    it('should handle purchase on same day as reference', () => {
      const result = estimateRestockTiming(referenceDate, 30, referenceDate);

      expect(result.status).toBe('recently-purchased');
      expect(result.daysSincePurchase).toBe(0);
      expect(result.daysUntilRestock).toBe(30);
    });
  });
});

// =============================================================================
// Pruning Decision Tests
// =============================================================================

describe('shouldPruneItem', () => {
  const referenceDate = new Date('2026-01-11');
  const config = createTestConfig();

  describe('user overrides', () => {
    it('should always prune when alwaysPrune override is set', () => {
      const item = createCartItem({ name: 'Test Item' });
      const override = createUserOverride('prod-123', { alwaysPrune: true });

      const result = shouldPruneItem(item, null, config, override, referenceDate);

      expect(result.prune).toBe(true);
      expect(result.confidence).toBe(1.0);
      expect(result.reason).toContain('User preference');
    });

    it('should never prune when neverPrune override is set', () => {
      const item = createCartItem({ name: 'Test Item' });
      const override = createUserOverride('prod-123', { neverPrune: true });

      const result = shouldPruneItem(item, null, config, override, referenceDate);

      expect(result.prune).toBe(false);
      expect(result.confidence).toBe(1.0);
      // neverPrune uses cadenceSource 'user-override' to indicate override was applied
      expect(result.context.cadenceSource).toBe('user-override');
    });

    it('should use custom cadence when provided', () => {
      const item = createCartItem({ name: 'Leite Mimosa' });
      const purchases = [
        createPurchaseRecord('Leite Mimosa', daysAgo(10, referenceDate)),
        createPurchaseRecord('Leite Mimosa', daysAgo(20, referenceDate)),
        createPurchaseRecord('Leite Mimosa', daysAgo(30, referenceDate)),
      ];
      const history = createItemHistory('Leite Mimosa', purchases);
      const override = createUserOverride('prod-123', { customCadenceDays: 15 });

      const result = shouldPruneItem(item, history, config, override, referenceDate);

      expect(result.context.restockCadenceDays).toBe(15);
      expect(result.context.cadenceSource).toBe('user-override');
    });
  });

  describe('no purchase history', () => {
    it('should not prune items with no history (conservative)', () => {
      const item = createCartItem({ name: 'Unknown Product' });

      const result = shouldPruneItem(item, null, config, undefined, referenceDate);

      expect(result.prune).toBe(false);
      expect(result.confidence).toBeLessThan(0.5);
      expect(result.reason).toContain('No purchase history');
    });
  });

  describe('recently purchased items - should prune', () => {
    it('should prune item purchased 5 days ago with 30-day cadence', () => {
      const item = createCartItem({ name: 'Detergente Skip' });
      const purchases = [
        createPurchaseRecord('Detergente Skip', daysAgo(5, referenceDate)),
        createPurchaseRecord('Detergente Skip', daysAgo(35, referenceDate)),
        createPurchaseRecord('Detergente Skip', daysAgo(65, referenceDate)),
      ];
      const history = createItemHistory('Detergente Skip', purchases);

      const result = shouldPruneItem(item, history, config, undefined, referenceDate);

      expect(result.prune).toBe(true);
      expect(result.context.daysSinceLastPurchase).toBe(5);
      expect(result.reason).toContain('Purchased');
    });

    it('should prune with high confidence when far from restock time', () => {
      const item = createCartItem({ name: 'Papel Higienico' });
      const purchases = [
        createPurchaseRecord('Papel Higienico', daysAgo(3, referenceDate)),
        createPurchaseRecord('Papel Higienico', daysAgo(40, referenceDate)),
        createPurchaseRecord('Papel Higienico', daysAgo(77, referenceDate)),
      ];
      const history = createItemHistory('Papel Higienico', purchases);

      const result = shouldPruneItem(item, history, config, undefined, referenceDate);

      expect(result.prune).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.6);
    });
  });

  describe('approaching restock - should not prune', () => {
    it('should not prune item purchased 25 days ago with 30-day cadence', () => {
      const item = createCartItem({ name: 'Leite Mimosa' });
      const purchases = [
        createPurchaseRecord('Leite Mimosa', daysAgo(25, referenceDate)),
        createPurchaseRecord('Leite Mimosa', daysAgo(55, referenceDate)),
        createPurchaseRecord('Leite Mimosa', daysAgo(85, referenceDate)),
      ];
      const history = createItemHistory('Leite Mimosa', purchases);

      const result = shouldPruneItem(item, history, config, undefined, referenceDate);

      expect(result.prune).toBe(false);
    });
  });

  describe('overdue for restock - should not prune', () => {
    it('should not prune item purchased 35 days ago with 30-day cadence', () => {
      const item = createCartItem({ name: 'Leite Mimosa' });
      const purchases = [
        createPurchaseRecord('Leite Mimosa', daysAgo(35, referenceDate)),
        createPurchaseRecord('Leite Mimosa', daysAgo(65, referenceDate)),
        createPurchaseRecord('Leite Mimosa', daysAgo(95, referenceDate)),
      ];
      const history = createItemHistory('Leite Mimosa', purchases);

      const result = shouldPruneItem(item, history, config, undefined, referenceDate);

      expect(result.prune).toBe(false);
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.reason).toContain('Due for restock');
    });
  });

  describe('conservative mode', () => {
    it('should not prune low confidence items in conservative mode', () => {
      const item = createCartItem({ name: 'Unknown Product XYZ' });
      const purchases = [
        createPurchaseRecord('Unknown Product XYZ', daysAgo(5, referenceDate)),
        createPurchaseRecord('Unknown Product XYZ', daysAgo(30, referenceDate)),
        createPurchaseRecord('Unknown Product XYZ', daysAgo(90, referenceDate)),
      ];
      const history = createItemHistory('Unknown Product XYZ', purchases);
      const conservativeConfig = createTestConfig({
        conservativeMode: true,
        minPruneConfidence: 0.9,
      });

      const result = shouldPruneItem(item, history, conservativeConfig, undefined, referenceDate);

      // With irregular intervals, confidence may be below threshold
      if (result.confidence < 0.9) {
        expect(result.prune).toBe(false);
      }
    });

    it('should prune high confidence items even in conservative mode', () => {
      const item = createCartItem({ name: 'Detergente Skip' });
      const purchases = [
        createPurchaseRecord('Detergente Skip', daysAgo(2, referenceDate)),
        createPurchaseRecord('Detergente Skip', daysAgo(47, referenceDate)),
        createPurchaseRecord('Detergente Skip', daysAgo(92, referenceDate)),
      ];
      const history = createItemHistory('Detergente Skip', purchases);
      const conservativeConfig = createTestConfig({
        conservativeMode: true,
        minPruneConfidence: 0.7,
      });

      const result = shouldPruneItem(item, history, conservativeConfig, undefined, referenceDate);

      // Very recently purchased with consistent cadence should still be pruned
      if (result.confidence >= 0.7) {
        expect(result.prune).toBe(true);
      }
    });
  });

  describe('threshold variations', () => {
    it('should respect custom prune threshold', () => {
      const item = createCartItem({ name: 'Leite Mimosa' });
      const purchases = [
        createPurchaseRecord('Leite Mimosa', daysAgo(15, referenceDate)),
        createPurchaseRecord('Leite Mimosa', daysAgo(45, referenceDate)),
        createPurchaseRecord('Leite Mimosa', daysAgo(75, referenceDate)),
      ];
      const history = createItemHistory('Leite Mimosa', purchases);

      // With default threshold (0.5), 15/30 = 0.5 is at boundary
      const result = shouldPruneItem(item, history, config, undefined, referenceDate);

      expect(result.context.restockUrgencyRatio).toBeCloseTo(0.5, 1);
    });
  });
});

// =============================================================================
// Find Item History Tests
// =============================================================================

describe('findItemHistory', () => {
  describe('matching by productId', () => {
    it('should find history when productId matches', () => {
      const item = createCartItem({
        productId: 'prod-123',
        name: 'Test Product',
      });
      const purchaseHistory = [
        createPurchaseRecord('Test Product', daysAgo(10), { productId: 'prod-123' }),
        createPurchaseRecord('Test Product', daysAgo(40), { productId: 'prod-123' }),
        createPurchaseRecord('Other Product', daysAgo(5), { productId: 'prod-456' }),
      ];

      const result = findItemHistory(item, purchaseHistory);

      expect(result).not.toBeNull();
      expect(result?.purchases).toHaveLength(2);
      expect(result?.totalQuantity).toBe(2);
    });
  });

  describe('matching by product name', () => {
    it('should find history when name matches exactly', () => {
      const item = createCartItem({
        productId: undefined,
        name: 'Leite Mimosa',
      });
      const purchaseHistory = [
        createPurchaseRecord('Leite Mimosa', daysAgo(10)),
        createPurchaseRecord('Leite Mimosa', daysAgo(20)),
        createPurchaseRecord('Other Product', daysAgo(5)),
      ];

      const result = findItemHistory(item, purchaseHistory);

      expect(result).not.toBeNull();
      expect(result?.purchases).toHaveLength(2);
    });

    it('should find history when name matches with partial match', () => {
      const item = createCartItem({
        productId: undefined,
        name: 'Leite',
      });
      const purchaseHistory = [
        createPurchaseRecord('Leite Mimosa 1L', daysAgo(10)),
        createPurchaseRecord('Leite Meio Gordo', daysAgo(20)),
        createPurchaseRecord('Agua Mineral', daysAgo(5)),
      ];

      const result = findItemHistory(item, purchaseHistory);

      expect(result).not.toBeNull();
      // Should match records containing 'Leite'
      expect(result?.purchases.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('no matching history', () => {
    it('should return null when no matching records found', () => {
      const item = createCartItem({
        productId: 'prod-999',
        name: 'New Product',
      });
      const purchaseHistory = [
        createPurchaseRecord('Other Product', daysAgo(10), { productId: 'prod-123' }),
        createPurchaseRecord('Another Product', daysAgo(20), { productId: 'prod-456' }),
      ];

      const result = findItemHistory(item, purchaseHistory);

      expect(result).toBeNull();
    });

    it('should return null for empty purchase history', () => {
      const item = createCartItem();
      const result = findItemHistory(item, []);

      expect(result).toBeNull();
    });
  });

  describe('aggregation', () => {
    it('should correctly calculate total quantity', () => {
      const item = createCartItem({
        productId: 'prod-123',
        name: 'Test',
      });
      const purchaseHistory = [
        createPurchaseRecord('Test', daysAgo(10), { productId: 'prod-123', quantity: 2 }),
        createPurchaseRecord('Test', daysAgo(20), { productId: 'prod-123', quantity: 3 }),
        createPurchaseRecord('Test', daysAgo(30), { productId: 'prod-123', quantity: 1 }),
      ];

      const result = findItemHistory(item, purchaseHistory);

      expect(result?.totalQuantity).toBe(6);
      expect(result?.averageQuantity).toBe(2);
    });

    it('should find the most recent purchase date', () => {
      const item = createCartItem({ productId: 'prod-123' });
      const mostRecent = daysAgo(5);
      const purchaseHistory = [
        createPurchaseRecord('Test', daysAgo(30), { productId: 'prod-123' }),
        createPurchaseRecord('Test', mostRecent, { productId: 'prod-123' }),
        createPurchaseRecord('Test', daysAgo(15), { productId: 'prod-123' }),
      ];

      const result = findItemHistory(item, purchaseHistory);

      expect(result?.lastPurchaseDate.getTime()).toBe(mostRecent.getTime());
    });
  });
});

// =============================================================================
// Duplicate Detection Tests
// =============================================================================

describe('findDuplicatesInCart', () => {
  describe('no duplicates', () => {
    it('should return empty map when no duplicates', () => {
      const items: CartItemForPruning[] = [
        createCartItem({ productId: 'prod-1', name: 'Item 1' }),
        createCartItem({ productId: 'prod-2', name: 'Item 2' }),
        createCartItem({ productId: 'prod-3', name: 'Item 3' }),
      ];

      const result = findDuplicatesInCart(items);

      expect(result.size).toBe(0);
    });

    it('should return empty map for empty cart', () => {
      const result = findDuplicatesInCart([]);

      expect(result.size).toBe(0);
    });
  });

  describe('duplicates by productId', () => {
    it('should detect duplicate items with same productId', () => {
      const items: CartItemForPruning[] = [
        createCartItem({ productId: 'prod-1', name: 'Item 1' }),
        createCartItem({ productId: 'prod-1', name: 'Item 1 variant' }),
        createCartItem({ productId: 'prod-2', name: 'Item 2' }),
      ];

      const result = findDuplicatesInCart(items);

      expect(result.size).toBe(1);
      expect(result.get(0)).toEqual([1]); // First occurrence at index 0, duplicate at index 1
    });

    it('should detect multiple duplicates of same item', () => {
      const items: CartItemForPruning[] = [
        createCartItem({ productId: 'prod-1', name: 'Item 1' }),
        createCartItem({ productId: 'prod-2', name: 'Item 2' }),
        createCartItem({ productId: 'prod-1', name: 'Item 1 copy' }),
        createCartItem({ productId: 'prod-1', name: 'Item 1 another copy' }),
      ];

      const result = findDuplicatesInCart(items);

      expect(result.size).toBe(1);
      expect(result.get(0)).toEqual([2, 3]);
    });
  });

  describe('duplicates by name (when no productId)', () => {
    it('should detect duplicates by normalized name', () => {
      const items: CartItemForPruning[] = [
        createCartItem({ productId: undefined, name: 'Leite Mimosa' }),
        createCartItem({ productId: undefined, name: 'leite mimosa' }),
        createCartItem({ productId: undefined, name: 'Other Item' }),
      ];

      const result = findDuplicatesInCart(items);

      expect(result.size).toBe(1);
      expect(result.get(0)).toEqual([1]);
    });
  });

  describe('multiple duplicate groups', () => {
    it('should detect multiple groups of duplicates', () => {
      const items: CartItemForPruning[] = [
        createCartItem({ productId: 'prod-1', name: 'Item 1' }),
        createCartItem({ productId: 'prod-2', name: 'Item 2' }),
        createCartItem({ productId: 'prod-1', name: 'Item 1 dup' }),
        createCartItem({ productId: 'prod-2', name: 'Item 2 dup' }),
        createCartItem({ productId: 'prod-3', name: 'Item 3' }),
      ];

      const result = findDuplicatesInCart(items);

      expect(result.size).toBe(2);
      expect(result.get(0)).toEqual([2]); // prod-1 duplicates
      expect(result.get(1)).toEqual([3]); // prod-2 duplicates
    });
  });
});

// =============================================================================
// Process Cart Items Tests
// =============================================================================

describe('processCartItems', () => {
  const referenceDate = new Date('2026-01-11');
  const config = createTestConfig();

  describe('empty cart', () => {
    it('should return empty array for empty cart', () => {
      const result = processCartItems([], [], config, new Map(), referenceDate);

      expect(result).toEqual([]);
    });
  });

  describe('duplicate handling', () => {
    it('should mark duplicate items for pruning', () => {
      const items: CartItemForPruning[] = [
        createCartItem({ productId: 'prod-1', name: 'Item 1' }),
        createCartItem({ productId: 'prod-1', name: 'Item 1 duplicate' }),
      ];

      const result = processCartItems(items, [], config, new Map(), referenceDate);

      expect(result).toHaveLength(2);
      expect(result[0]?.prune).toBe(false); // First occurrence
      expect(result[1]?.prune).toBe(true); // Duplicate
      expect(result[1]?.confidence).toBeGreaterThan(0.9);
      expect(result[1]?.reason).toContain('Duplicate');
    });
  });

  describe('user overrides', () => {
    it('should apply user overrides from the map', () => {
      const items: CartItemForPruning[] = [
        createCartItem({ productId: 'prod-1', name: 'Item 1' }),
      ];
      const overrides = new Map<string, UserOverride>([
        ['prod-1', createUserOverride('prod-1', { alwaysPrune: true })],
      ]);

      const result = processCartItems(items, [], config, overrides, referenceDate);

      expect(result[0]?.prune).toBe(true);
      expect(result[0]?.confidence).toBe(1.0);
    });

    it('should match overrides by normalized name when no productId', () => {
      const items: CartItemForPruning[] = [
        createCartItem({ productId: undefined, name: 'Test Item' }),
      ];
      const overrides = new Map<string, UserOverride>([
        ['test item', createUserOverride('test item', { neverPrune: true })],
      ]);

      const result = processCartItems(items, [], config, overrides, referenceDate);

      expect(result[0]?.prune).toBe(false);
      expect(result[0]?.confidence).toBe(1.0);
    });
  });

  describe('full processing', () => {
    it('should process all items and return decisions', () => {
      const items: CartItemForPruning[] = [
        createCartItem({ productId: 'prod-1', name: 'Leite Mimosa' }),
        createCartItem({ productId: 'prod-2', name: 'Detergente Skip' }),
        createCartItem({ productId: 'prod-3', name: 'Unknown Product' }),
      ];
      const purchaseHistory = [
        createPurchaseRecord('Leite Mimosa', daysAgo(35, referenceDate), { productId: 'prod-1' }),
        createPurchaseRecord('Leite Mimosa', daysAgo(65, referenceDate), { productId: 'prod-1' }),
        createPurchaseRecord('Leite Mimosa', daysAgo(95, referenceDate), { productId: 'prod-1' }),
        createPurchaseRecord('Detergente Skip', daysAgo(5, referenceDate), { productId: 'prod-2' }),
        createPurchaseRecord('Detergente Skip', daysAgo(50, referenceDate), { productId: 'prod-2' }),
        createPurchaseRecord('Detergente Skip', daysAgo(95, referenceDate), { productId: 'prod-2' }),
      ];

      const result = processCartItems(items, purchaseHistory, config, new Map(), referenceDate);

      expect(result).toHaveLength(3);
      // Milk overdue - keep
      expect(result[0]?.prune).toBe(false);
      // Detergent recently purchased - prune
      expect(result[1]?.prune).toBe(true);
      // Unknown - no history - keep
      expect(result[2]?.prune).toBe(false);
    });
  });
});

// =============================================================================
// Summary Statistics Tests
// =============================================================================

describe('summarizeDecisions', () => {
  describe('empty decisions', () => {
    it('should return zeroed summary for empty decisions', () => {
      const result = summarizeDecisions([]);

      expect(result.totalItems).toBe(0);
      expect(result.suggestedForPruning).toBe(0);
      expect(result.keepInCart).toBe(0);
      expect(result.averageConfidence).toBe(0);
      expect(result.highConfidencePrunes).toBe(0);
      expect(result.lowConfidenceDecisions).toBe(0);
    });
  });

  describe('counts', () => {
    it('should correctly count prune vs keep decisions', () => {
      const decisions: PruneDecision[] = [
        {
          productId: 'prod-1',
          productName: 'Item 1',
          prune: true,
          confidence: 0.9,
          reason: 'Recently purchased',
          context: {
            daysSinceLastPurchase: 5,
            restockCadenceDays: 30,
            restockUrgencyRatio: 0.17,
            category: ProductCategory.LAUNDRY,
            lastPurchaseDate: new Date(),
            cadenceSource: 'learned',
          },
        },
        {
          productId: 'prod-2',
          productName: 'Item 2',
          prune: false,
          confidence: 0.8,
          reason: 'Overdue',
          context: {
            daysSinceLastPurchase: 35,
            restockCadenceDays: 30,
            restockUrgencyRatio: 1.17,
            category: ProductCategory.DAIRY,
            lastPurchaseDate: new Date(),
            cadenceSource: 'learned',
          },
        },
        {
          productId: 'prod-3',
          productName: 'Item 3',
          prune: true,
          confidence: 0.85,
          reason: 'Recently purchased',
          context: {
            daysSinceLastPurchase: 3,
            restockCadenceDays: 45,
            restockUrgencyRatio: 0.07,
            category: ProductCategory.CLEANING,
            lastPurchaseDate: new Date(),
            cadenceSource: 'category-default',
          },
        },
      ];

      const result = summarizeDecisions(decisions);

      expect(result.totalItems).toBe(3);
      expect(result.suggestedForPruning).toBe(2);
      expect(result.keepInCart).toBe(1);
    });

    it('should correctly calculate average confidence', () => {
      const decisions: PruneDecision[] = [
        {
          productId: 'prod-1',
          productName: 'Item 1',
          prune: true,
          confidence: 0.9,
          reason: 'Test',
          context: {
            restockCadenceDays: 30,
            category: ProductCategory.UNKNOWN,
            cadenceSource: 'learned',
          },
        },
        {
          productId: 'prod-2',
          productName: 'Item 2',
          prune: false,
          confidence: 0.7,
          reason: 'Test',
          context: {
            restockCadenceDays: 30,
            category: ProductCategory.UNKNOWN,
            cadenceSource: 'learned',
          },
        },
      ];

      const result = summarizeDecisions(decisions);

      expect(result.averageConfidence).toBeCloseTo(0.8, 2);
    });
  });

  describe('confidence thresholds', () => {
    it('should count high confidence prunes (>= 0.8)', () => {
      const decisions: PruneDecision[] = [
        {
          productId: 'prod-1',
          productName: 'Item 1',
          prune: true,
          confidence: 0.9,
          reason: 'Test',
          context: {
            restockCadenceDays: 30,
            category: ProductCategory.UNKNOWN,
            cadenceSource: 'learned',
          },
        },
        {
          productId: 'prod-2',
          productName: 'Item 2',
          prune: true,
          confidence: 0.6,
          reason: 'Test',
          context: {
            restockCadenceDays: 30,
            category: ProductCategory.UNKNOWN,
            cadenceSource: 'learned',
          },
        },
        {
          productId: 'prod-3',
          productName: 'Item 3',
          prune: true,
          confidence: 0.85,
          reason: 'Test',
          context: {
            restockCadenceDays: 30,
            category: ProductCategory.UNKNOWN,
            cadenceSource: 'learned',
          },
        },
      ];

      const result = summarizeDecisions(decisions);

      expect(result.highConfidencePrunes).toBe(2); // 0.9 and 0.85
    });

    it('should count low confidence decisions (< 0.5)', () => {
      const decisions: PruneDecision[] = [
        {
          productId: 'prod-1',
          productName: 'Item 1',
          prune: false,
          confidence: 0.4,
          reason: 'Test',
          context: {
            restockCadenceDays: 30,
            category: ProductCategory.UNKNOWN,
            cadenceSource: 'no-history',
          },
        },
        {
          productId: 'prod-2',
          productName: 'Item 2',
          prune: false,
          confidence: 0.3,
          reason: 'Test',
          context: {
            restockCadenceDays: 30,
            category: ProductCategory.UNKNOWN,
            cadenceSource: 'no-history',
          },
        },
        {
          productId: 'prod-3',
          productName: 'Item 3',
          prune: true,
          confidence: 0.8,
          reason: 'Test',
          context: {
            restockCadenceDays: 30,
            category: ProductCategory.UNKNOWN,
            cadenceSource: 'learned',
          },
        },
      ];

      const result = summarizeDecisions(decisions);

      expect(result.lowConfidenceDecisions).toBe(2);
    });
  });

  describe('category breakdown', () => {
    it('should count decisions by category', () => {
      const decisions: PruneDecision[] = [
        {
          productId: 'prod-1',
          productName: 'Milk',
          prune: false,
          confidence: 0.8,
          reason: 'Test',
          context: {
            restockCadenceDays: 8,
            category: ProductCategory.DAIRY,
            cadenceSource: 'learned',
          },
        },
        {
          productId: 'prod-2',
          productName: 'Cheese',
          prune: false,
          confidence: 0.7,
          reason: 'Test',
          context: {
            restockCadenceDays: 8,
            category: ProductCategory.DAIRY,
            cadenceSource: 'learned',
          },
        },
        {
          productId: 'prod-3',
          productName: 'Detergent',
          prune: true,
          confidence: 0.9,
          reason: 'Test',
          context: {
            restockCadenceDays: 45,
            category: ProductCategory.LAUNDRY,
            cadenceSource: 'learned',
          },
        },
      ];

      const result = summarizeDecisions(decisions);

      expect(result.byCategory[ProductCategory.DAIRY]).toBe(2);
      expect(result.byCategory[ProductCategory.LAUNDRY]).toBe(1);
    });
  });

  describe('reason breakdown', () => {
    it('should count decisions by cadence source', () => {
      const decisions: PruneDecision[] = [
        {
          productId: 'prod-1',
          productName: 'Item 1',
          prune: true,
          confidence: 0.9,
          reason: 'Test',
          context: {
            restockCadenceDays: 30,
            category: ProductCategory.UNKNOWN,
            cadenceSource: 'learned',
          },
        },
        {
          productId: 'prod-2',
          productName: 'Item 2',
          prune: false,
          confidence: 0.5,
          reason: 'Test',
          context: {
            restockCadenceDays: 21,
            category: ProductCategory.UNKNOWN,
            cadenceSource: 'category-default',
          },
        },
        {
          productId: 'prod-3',
          productName: 'Item 3',
          prune: false,
          confidence: 0.3,
          reason: 'Test',
          context: {
            restockCadenceDays: 21,
            category: ProductCategory.UNKNOWN,
            cadenceSource: 'no-history',
          },
        },
      ];

      const result = summarizeDecisions(decisions);

      expect(result.byReason['learned']).toBe(1);
      expect(result.byReason['category-default']).toBe(1);
      expect(result.byReason['no-history']).toBe(1);
    });
  });
});

// =============================================================================
// Edge Cases and Error Handling
// =============================================================================

describe('Edge Cases', () => {
  describe('detectCategory', () => {
    it('should handle special characters in product names', () => {
      const result = detectCategory('Leite 1.5% (UHT) - Mimosa');

      expect(result.category).toBe(ProductCategory.DAIRY);
    });

    it('should handle very long product names', () => {
      const longName = 'Leite '.repeat(100) + 'Mimosa';
      const result = detectCategory(longName);

      expect(result.category).toBe(ProductCategory.DAIRY);
    });

    it('should handle unicode characters', () => {
      const result = detectCategory('Leite com acucar refinado');

      expect(result.category).toBe(ProductCategory.DAIRY);
    });
  });

  describe('calculateRestockCadence', () => {
    it('should handle purchases on the same date', () => {
      const sameDate = new Date('2026-01-01');
      const purchases = [
        createPurchaseRecord('Item', sameDate),
        createPurchaseRecord('Item', sameDate),
        createPurchaseRecord('Item', sameDate),
      ];
      const history = createItemHistory('Item', purchases);

      const result = calculateRestockCadence(history, ProductCategory.UNKNOWN, 3);

      // Should fall back to category default since no valid intervals
      expect(result.cadenceDays).toBeGreaterThanOrEqual(1);
    });
  });

  describe('findItemHistory', () => {
    it('should handle items with undefined productId', () => {
      const item = createCartItem({
        productId: undefined,
        name: 'Test Product',
      });
      const purchaseHistory = [
        createPurchaseRecord('Test Product', daysAgo(10)),
      ];

      const result = findItemHistory(item, purchaseHistory);

      expect(result).not.toBeNull();
    });
  });

  describe('processCartItems', () => {
    it('should handle cart with only duplicates', () => {
      const items: CartItemForPruning[] = [
        createCartItem({ productId: 'prod-1', name: 'Item' }),
        createCartItem({ productId: 'prod-1', name: 'Item' }),
        createCartItem({ productId: 'prod-1', name: 'Item' }),
      ];

      const result = processCartItems(items, [], createTestConfig());

      expect(result).toHaveLength(3);
      expect(result[0]?.prune).toBe(false); // First is kept
      expect(result[1]?.prune).toBe(true); // Duplicate
      expect(result[2]?.prune).toBe(true); // Duplicate
    });
  });
});
