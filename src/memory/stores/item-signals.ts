import {
  ItemSignalsStore,
  ItemSignalsStoreSchema,
  createEmptyItemSignalsStore,
  ItemSignal,
  ItemIdentifier,
  PurchaseRecord,
} from '../types.js';
import { BaseStore, BaseStoreConfig } from './base-store.js';

// ============================================================================
// Item Matching Utilities
// ============================================================================

/**
 * Calculate similarity score between two items (0-1).
 */
function calculateItemSimilarity(a: ItemIdentifier, b: ItemIdentifier): number {
  let score = 0;
  let factors = 0;

  // Exact SKU match is strongest signal
  if (a.sku && b.sku) {
    factors++;
    if (a.sku === b.sku) {
      score += 1.0;
    }
  }

  // Exact barcode match is also very strong
  if (a.barcode && b.barcode) {
    factors++;
    if (a.barcode === b.barcode) {
      score += 1.0;
    }
  }

  // Name similarity (fuzzy)
  if (a.name && b.name) {
    factors++;
    const nameSimilarity = calculateStringSimilarity(
      a.name.toLowerCase(),
      b.name.toLowerCase()
    );
    score += nameSimilarity;
  }

  // Category match
  if (a.category && b.category) {
    factors++;
    if (a.category === b.category) {
      score += 0.8; // Category match is decent but not perfect
    }
  }

  return factors > 0 ? score / factors : 0;
}

/**
 * Simple string similarity using Levenshtein-like approach.
 * Returns 0-1 where 1 is identical.
 */
function calculateStringSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (a.length === 0 || b.length === 0) return 0;

  // Simple approach: count matching characters in order
  let matches = 0;
  let aIdx = 0;
  let bIdx = 0;

  while (aIdx < a.length && bIdx < b.length) {
    if (a[aIdx] === b[bIdx]) {
      matches++;
      aIdx++;
      bIdx++;
    } else {
      aIdx++;
    }
  }

  const maxLen = Math.max(a.length, b.length);
  return matches / maxLen;
}

// ============================================================================
// Item Signals Store
// ============================================================================

export class ItemSignalsStoreClass extends BaseStore<typeof ItemSignalsStoreSchema> {
  constructor(config: Omit<BaseStoreConfig, 'fileName'>) {
    super(
      { ...config, fileName: 'item-signals.json' },
      ItemSignalsStoreSchema
    );
  }

  protected createEmpty(): ItemSignalsStore {
    return createEmptyItemSignalsStore(this.householdId);
  }

  // ============================================================================
  // Read Operations
  // ============================================================================

  /**
   * Get all item signals.
   */
  async getAllSignals(): Promise<ItemSignal[]> {
    await this.ensureLoaded();
    return this.getData().signals;
  }

  /**
   * Find item signal by exact match.
   */
  async findExactSignal(item: ItemIdentifier): Promise<ItemSignal | null> {
    await this.ensureLoaded();
    const signals = this.getData().signals;

    // Try exact SKU match first
    if (item.sku) {
      const match = signals.find((s) => s.item.sku === item.sku);
      if (match) return match;
    }

    // Try exact barcode match
    if (item.barcode) {
      const match = signals.find((s) => s.item.barcode === item.barcode);
      if (match) return match;
    }

    // Try exact name match
    const match = signals.find(
      (s) => s.item.name.toLowerCase() === item.name.toLowerCase()
    );
    if (match) return match;

    return null;
  }

  /**
   * Find item signals by fuzzy matching.
   * Returns matches above the threshold, sorted by similarity.
   */
  async findSimilarSignals(
    item: ItemIdentifier,
    threshold = 0.7
  ): Promise<Array<{ signal: ItemSignal; similarity: number }>> {
    await this.ensureLoaded();
    const signals = this.getData().signals;

    const matches: Array<{ signal: ItemSignal; similarity: number }> = [];

    for (const signal of signals) {
      const similarity = calculateItemSimilarity(item, signal.item);
      if (similarity >= threshold) {
        matches.push({ signal, similarity });
      }
    }

    // Sort by similarity (highest first)
    matches.sort((a, b) => b.similarity - a.similarity);

    return matches;
  }

  /**
   * Get purchase history for an item.
   */
  async getPurchaseHistory(item: ItemIdentifier): Promise<PurchaseRecord[]> {
    const signal = await this.findExactSignal(item);
    return signal?.purchaseHistory || [];
  }

  /**
   * Get average quantity for an item.
   */
  async getAverageQuantity(item: ItemIdentifier): Promise<number | null> {
    const signal = await this.findExactSignal(item);
    return signal?.averageQuantity || null;
  }

  /**
   * Get typical price for an item.
   */
  async getTypicalPrice(item: ItemIdentifier): Promise<number | null> {
    const signal = await this.findExactSignal(item);
    return signal?.typicalPrice || null;
  }

  /**
   * Get purchase frequency (purchases per month).
   */
  async getPurchaseFrequency(item: ItemIdentifier): Promise<number | null> {
    const signal = await this.findExactSignal(item);
    return signal?.purchaseFrequency || null;
  }

  /**
   * Get items purchased in the last N days.
   */
  async getRecentItems(days: number): Promise<ItemSignal[]> {
    await this.ensureLoaded();
    const signals = this.getData().signals;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return signals.filter((s) => {
      if (!s.lastPurchasedAt) return false;
      const lastPurchase = new Date(s.lastPurchasedAt);
      return lastPurchase >= cutoff;
    });
  }

  /**
   * Get frequently purchased items (sorted by frequency).
   */
  async getFrequentItems(limit = 50): Promise<ItemSignal[]> {
    await this.ensureLoaded();
    const signals = this.getData().signals;

    return signals
      .filter((s) => s.purchaseFrequency && s.purchaseFrequency > 0)
      .sort((a, b) => (b.purchaseFrequency || 0) - (a.purchaseFrequency || 0))
      .slice(0, limit);
  }

  // ============================================================================
  // Write Operations
  // ============================================================================

  /**
   * Add a purchase record for an item.
   * Updates or creates the item signal.
   */
  async addPurchase(
    item: ItemIdentifier,
    purchase: PurchaseRecord
  ): Promise<void> {
    await this.ensureLoaded();
    const data = this.getData();

    // Find existing signal
    let signal = await this.findExactSignal(item);

    if (!signal) {
      // Create new signal
      signal = {
        item,
        purchaseHistory: [],
        updatedAt: new Date().toISOString(),
      };
      data.signals.push(signal);
    }

    // Add purchase to history
    signal.purchaseHistory.push(purchase);

    // Sort by date (most recent first)
    signal.purchaseHistory.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Update computed signals
    this.updateComputedSignals(signal);

    signal.updatedAt = new Date().toISOString();

    await this.save();
  }

  /**
   * Update computed signals (average quantity, typical price, frequency).
   */
  private updateComputedSignals(signal: ItemSignal): void {
    const history = signal.purchaseHistory;

    if (history.length === 0) return;

    // Average quantity
    const quantities = history.map((p) => p.quantity);
    signal.averageQuantity =
      quantities.reduce((sum, q) => sum + q, 0) / quantities.length;

    // Typical price (median of last 5 purchases)
    const recentPrices = history
      .slice(0, 5)
      .map((p) => p.price)
      .filter((p): p is number => p !== undefined);

    if (recentPrices.length > 0) {
      recentPrices.sort((a, b) => a - b);
      const mid = Math.floor(recentPrices.length / 2);
      signal.typicalPrice = recentPrices[mid];
    }

    // Purchase frequency (purchases per month)
    if (history.length >= 2) {
      const firstRecord = history[history.length - 1];
      const lastRecord = history[0];
      if (firstRecord && lastRecord) {
        const firstDate = new Date(firstRecord.date);
        const lastDate = new Date(lastRecord.date);
        const daysDiff = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);
        const monthsDiff = daysDiff / 30;

        if (monthsDiff > 0) {
          signal.purchaseFrequency = history.length / monthsDiff;
        }
      }
    }

    // Last purchased date
    const mostRecentRecord = history[0];
    if (mostRecentRecord) {
      signal.lastPurchasedAt = mostRecentRecord.date;
    }
  }

  /**
   * Set preferred variant for an item.
   */
  async setPreferredVariant(
    item: ItemIdentifier,
    variant: string
  ): Promise<void> {
    await this.ensureLoaded();
    const signal = await this.findExactSignal(item);

    if (signal) {
      signal.preferredVariant = variant;
      signal.updatedAt = new Date().toISOString();
      await this.save();
    }
  }

  /**
   * Merge or update an item signal.
   * Useful for bulk imports.
   */
  async mergeSignal(newSignal: ItemSignal): Promise<void> {
    await this.ensureLoaded();
    const data = this.getData();

    const existingIndex = data.signals.findIndex(
      (s) =>
        (s.item.sku && s.item.sku === newSignal.item.sku) ||
        (s.item.barcode && s.item.barcode === newSignal.item.barcode) ||
        s.item.name.toLowerCase() === newSignal.item.name.toLowerCase()
    );

    if (existingIndex !== -1) {
      // Merge purchase histories
      const existing = data.signals[existingIndex];
      if (existing) {
        const mergedHistory = [...existing.purchaseHistory, ...newSignal.purchaseHistory];

        // Deduplicate by date and orderId
        const uniqueHistory = Array.from(
          new Map(
            mergedHistory.map((p) => [`${p.date}_${p.orderId || 'none'}`, p])
          ).values()
        );

        existing.purchaseHistory = uniqueHistory;
        this.updateComputedSignals(existing);
        existing.updatedAt = new Date().toISOString();
      }
    } else {
      data.signals.push(newSignal);
    }

    await this.save();
  }

  /**
   * Bulk add purchases (optimized for imports).
   */
  async bulkAddPurchases(
    purchases: Array<{ item: ItemIdentifier; purchase: PurchaseRecord }>
  ): Promise<void> {
    await this.ensureLoaded();

    for (const { item, purchase } of purchases) {
      const data = this.getData();
      let signal = await this.findExactSignal(item);

      if (!signal) {
        signal = {
          item,
          purchaseHistory: [],
          updatedAt: new Date().toISOString(),
        };
        data.signals.push(signal);
      }

      signal.purchaseHistory.push(purchase);
      this.updateComputedSignals(signal);
      signal.updatedAt = new Date().toISOString();
    }

    await this.save();
  }

  /**
   * Remove old purchase records (data cleanup).
   * Keeps only the last N records per item.
   */
  async cleanupOldPurchases(keepCount = 50): Promise<void> {
    await this.ensureLoaded();
    const data = this.getData();

    for (const signal of data.signals) {
      if (signal.purchaseHistory.length > keepCount) {
        signal.purchaseHistory = signal.purchaseHistory.slice(0, keepCount);
        this.updateComputedSignals(signal);
        signal.updatedAt = new Date().toISOString();
      }
    }

    await this.save();
  }
}
