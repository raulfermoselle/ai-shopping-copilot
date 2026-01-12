import {
  CadenceSignalsStore,
  CadenceSignalsStoreSchema,
  createEmptyCadenceSignalsStore,
  CategoryCadence,
  ItemCadence,
  ItemIdentifier,
} from '../types.js';
import { BaseStore, BaseStoreConfig } from './base-store.js';

// ============================================================================
// Cadence Calculation Utilities
// ============================================================================

/**
 * Calculate restock cadence from purchase dates.
 */
function calculateCadence(dates: string[]): {
  typical: number;
  min: number;
  max: number;
  confidence: number;
} {
  if (dates.length < 2) {
    return { typical: 0, min: 0, max: 0, confidence: 0 };
  }

  // Sort dates
  const sorted = dates.map((d) => new Date(d).getTime()).sort((a, b) => a - b);

  // Calculate intervals between consecutive purchases
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const previous = sorted[i - 1];
    if (current !== undefined && previous !== undefined) {
      const daysDiff = (current - previous) / (1000 * 60 * 60 * 24);
      intervals.push(daysDiff);
    }
  }

  // Calculate statistics
  const min = Math.min(...intervals);
  const max = Math.max(...intervals);
  const avg = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;

  // Calculate variance for confidence
  const variance =
    intervals.reduce((sum, i) => sum + Math.pow(i - avg, 2), 0) / intervals.length;
  const stdDev = Math.sqrt(variance);

  // Confidence based on coefficient of variation and sample size
  const cv = stdDev / avg; // Coefficient of variation
  const sampleFactor = Math.min(intervals.length / 10, 1); // More samples = higher confidence
  const consistencyFactor = Math.max(0, 1 - cv / 2); // Lower CV = higher confidence
  const confidence = sampleFactor * consistencyFactor;

  return {
    typical: Math.round(avg),
    min: Math.round(min),
    max: Math.round(max),
    confidence: Math.min(1, Math.max(0, confidence)),
  };
}

// ============================================================================
// Cadence Signals Store
// ============================================================================

export class CadenceSignalsStoreClass extends BaseStore<typeof CadenceSignalsStoreSchema> {
  constructor(config: Omit<BaseStoreConfig, 'fileName'>) {
    super(
      { ...config, fileName: 'cadence-signals.json' },
      CadenceSignalsStoreSchema
    );
  }

  protected createEmpty(): CadenceSignalsStore {
    return createEmptyCadenceSignalsStore(this.householdId);
  }

  // ============================================================================
  // Read Operations
  // ============================================================================

  /**
   * Get cadence for a specific category.
   */
  async getCategoryCadence(category: string): Promise<CategoryCadence | null> {
    await this.ensureLoaded();
    const data = this.getData();

    return (
      data.categoryCadences.find(
        (c) => c.category.toLowerCase() === category.toLowerCase()
      ) || null
    );
  }

  /**
   * Get cadence for a specific item.
   */
  async getItemCadence(item: ItemIdentifier): Promise<ItemCadence | null> {
    await this.ensureLoaded();
    const data = this.getData();

    // Try exact SKU match first
    if (item.sku) {
      const match = data.itemCadences.find((c) => c.item.sku === item.sku);
      if (match) return match;
    }

    // Try exact barcode match
    if (item.barcode) {
      const match = data.itemCadences.find((c) => c.item.barcode === item.barcode);
      if (match) return match;
    }

    // Try exact name match
    return (
      data.itemCadences.find(
        (c) => c.item.name.toLowerCase() === item.name.toLowerCase()
      ) || null
    );
  }

  /**
   * Get effective cadence for an item (item-level or fallback to category).
   */
  async getEffectiveCadence(item: ItemIdentifier): Promise<{
    typicalRestockDays: number;
    minRestockDays: number;
    maxRestockDays: number;
    confidence: number;
    source: 'item' | 'category' | 'none';
  }> {
    // Try item-specific cadence first
    const itemCadence = await this.getItemCadence(item);
    if (itemCadence) {
      return {
        typicalRestockDays: itemCadence.typicalRestockDays,
        minRestockDays: itemCadence.minRestockDays,
        maxRestockDays: itemCadence.maxRestockDays,
        confidence: itemCadence.confidence,
        source: 'item',
      };
    }

    // Fallback to category cadence
    if (item.category) {
      const categoryCadence = await this.getCategoryCadence(item.category);
      if (categoryCadence) {
        return {
          typicalRestockDays: categoryCadence.typicalRestockDays,
          minRestockDays: categoryCadence.minRestockDays,
          maxRestockDays: categoryCadence.maxRestockDays,
          confidence: categoryCadence.confidence,
          source: 'category',
        };
      }
    }

    // No cadence data available
    return {
      typicalRestockDays: 0,
      minRestockDays: 0,
      maxRestockDays: 0,
      confidence: 0,
      source: 'none',
    };
  }

  /**
   * Check if an item is likely due for restock.
   */
  async isDueForRestock(
    item: ItemIdentifier,
    daysSinceLastPurchase: number,
    threshold = 0.8
  ): Promise<boolean> {
    const cadence = await this.getEffectiveCadence(item);

    if (cadence.source === 'none' || cadence.confidence < 0.3) {
      // No reliable cadence data, assume due for restock
      return true;
    }

    // Due for restock if days since last purchase >= threshold * typical restock days
    return daysSinceLastPurchase >= cadence.typicalRestockDays * threshold;
  }

  /**
   * Get all category cadences.
   */
  async getAllCategoryCadences(): Promise<CategoryCadence[]> {
    await this.ensureLoaded();
    return this.getData().categoryCadences;
  }

  /**
   * Get all item cadences.
   */
  async getAllItemCadences(): Promise<ItemCadence[]> {
    await this.ensureLoaded();
    return this.getData().itemCadences;
  }

  /**
   * Get items with high-confidence cadence data.
   */
  async getHighConfidenceItems(minConfidence = 0.7): Promise<ItemCadence[]> {
    await this.ensureLoaded();
    const data = this.getData();

    return data.itemCadences
      .filter((c) => c.confidence >= minConfidence)
      .sort((a, b) => b.confidence - a.confidence);
  }

  // ============================================================================
  // Write Operations
  // ============================================================================

  /**
   * Update or create category cadence from purchase dates.
   */
  async updateCategoryCadence(
    category: string,
    purchaseDates: string[]
  ): Promise<void> {
    await this.ensureLoaded();
    const data = this.getData();

    const cadence = calculateCadence(purchaseDates);

    const existingIndex = data.categoryCadences.findIndex(
      (c) => c.category.toLowerCase() === category.toLowerCase()
    );

    const categoryCadence: CategoryCadence = {
      category,
      typicalRestockDays: cadence.typical,
      minRestockDays: cadence.min,
      maxRestockDays: cadence.max,
      sampleSize: purchaseDates.length,
      confidence: cadence.confidence,
      lastPurchasedAt:
        purchaseDates.length > 0
          ? purchaseDates.sort().reverse()[0]
          : undefined,
      updatedAt: new Date().toISOString(),
    };

    if (existingIndex !== -1) {
      data.categoryCadences[existingIndex] = categoryCadence;
    } else {
      data.categoryCadences.push(categoryCadence);
    }

    await this.save();
  }

  /**
   * Update or create item cadence from purchase dates.
   */
  async updateItemCadence(
    item: ItemIdentifier,
    purchaseDates: string[]
  ): Promise<void> {
    await this.ensureLoaded();
    const data = this.getData();

    const cadence = calculateCadence(purchaseDates);

    // Check if this overrides category default
    let overridesCategoryDefault = false;
    if (item.category) {
      const categoryCadence = await this.getCategoryCadence(item.category);
      if (categoryCadence) {
        const difference = Math.abs(
          cadence.typical - categoryCadence.typicalRestockDays
        );
        // Override if difference > 20% of category cadence
        overridesCategoryDefault =
          difference > categoryCadence.typicalRestockDays * 0.2;
      }
    }

    const existingIndex = data.itemCadences.findIndex(
      (c) =>
        (c.item.sku && c.item.sku === item.sku) ||
        (c.item.barcode && c.item.barcode === item.barcode) ||
        c.item.name.toLowerCase() === item.name.toLowerCase()
    );

    const itemCadence: ItemCadence = {
      item,
      typicalRestockDays: cadence.typical,
      minRestockDays: cadence.min,
      maxRestockDays: cadence.max,
      sampleSize: purchaseDates.length,
      confidence: cadence.confidence,
      lastPurchasedAt:
        purchaseDates.length > 0
          ? purchaseDates.sort().reverse()[0]
          : undefined,
      overridesCategoryDefault,
      updatedAt: new Date().toISOString(),
    };

    if (existingIndex !== -1) {
      data.itemCadences[existingIndex] = itemCadence;
    } else {
      data.itemCadences.push(itemCadence);
    }

    await this.save();
  }

  /**
   * Bulk update cadences from purchase history.
   * Useful for learning from imported order data.
   */
  async learnFromPurchaseHistory(
    history: Array<{
      item: ItemIdentifier;
      dates: string[];
    }>
  ): Promise<void> {
    await this.ensureLoaded();

    // Group by category for category-level cadence
    const categoryPurchases = new Map<string, string[]>();

    for (const { item, dates } of history) {
      // Update item-level cadence
      if (dates.length >= 2) {
        await this.updateItemCadence(item, dates);
      }

      // Collect for category-level cadence
      if (item.category) {
        const existing = categoryPurchases.get(item.category) || [];
        categoryPurchases.set(item.category, [...existing, ...dates]);
      }
    }

    // Update category-level cadences
    for (const [category, dates] of categoryPurchases.entries()) {
      if (dates.length >= 2) {
        await this.updateCategoryCadence(category, dates);
      }
    }
  }

  /**
   * Get statistics summary.
   */
  async getStatistics(): Promise<{
    totalCategories: number;
    totalItems: number;
    avgCategoryConfidence: number;
    avgItemConfidence: number;
    highConfidenceItemsCount: number;
  }> {
    await this.ensureLoaded();
    const data = this.getData();

    const totalCategories = data.categoryCadences.length;
    const totalItems = data.itemCadences.length;

    const avgCategoryConfidence =
      totalCategories > 0
        ? data.categoryCadences.reduce((sum, c) => sum + c.confidence, 0) /
          totalCategories
        : 0;

    const avgItemConfidence =
      totalItems > 0
        ? data.itemCadences.reduce((sum, c) => sum + c.confidence, 0) / totalItems
        : 0;

    const highConfidenceItemsCount = data.itemCadences.filter(
      (c) => c.confidence >= 0.7
    ).length;

    return {
      totalCategories,
      totalItems,
      avgCategoryConfidence,
      avgItemConfidence,
      highConfidenceItemsCount,
    };
  }
}
