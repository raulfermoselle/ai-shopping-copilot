import {
  SubstitutionHistoryStore,
  SubstitutionHistoryStoreSchema,
  createEmptySubstitutionHistoryStore,
  SubstitutionRecord,
  SubstitutionOutcome,
  ItemIdentifier,
} from '../types.js';
import { BaseStore, BaseStoreConfig } from './base-store.js';
import { randomUUID } from 'crypto';

// ============================================================================
// Substitution Analysis Types
// ============================================================================

export interface SubstitutionPattern {
  originalItem: ItemIdentifier;
  substituteItem: ItemIdentifier;
  timesAccepted: number;
  timesRejected: number;
  acceptanceRate: number;
  avgPriceDelta: number;
  lastSubstitutedAt: string;
}

export interface BrandToleranceScore {
  brand: string;
  acceptanceRate: number;
  sampleSize: number;
}

export interface PriceDeltaTolerance {
  avgAcceptedDelta: number;
  avgRejectedDelta: number;
  maxAcceptedDelta: number;
  maxAcceptedPercent: number;
}

// ============================================================================
// Substitution History Store
// ============================================================================

export class SubstitutionHistoryStoreClass extends BaseStore<typeof SubstitutionHistoryStoreSchema> {
  constructor(config: Omit<BaseStoreConfig, 'fileName'>) {
    super(
      { ...config, fileName: 'substitution-history.json' },
      SubstitutionHistoryStoreSchema
    );
  }

  protected createEmpty(): SubstitutionHistoryStore {
    return createEmptySubstitutionHistoryStore(this.householdId);
  }

  // ============================================================================
  // Read Operations
  // ============================================================================

  /**
   * Get all substitution records.
   */
  async getAllRecords(): Promise<SubstitutionRecord[]> {
    await this.ensureLoaded();
    return this.getData().records;
  }

  /**
   * Get records for a specific original item.
   */
  async getRecordsForItem(item: ItemIdentifier): Promise<SubstitutionRecord[]> {
    await this.ensureLoaded();
    const records = this.getData().records;

    return records.filter(
      (r) =>
        r.originalItem.name.toLowerCase() === item.name.toLowerCase() ||
        (item.sku && r.originalItem.sku === item.sku) ||
        (item.barcode && r.originalItem.barcode === item.barcode)
    );
  }

  /**
   * Get records by outcome.
   */
  async getRecordsByOutcome(outcome: SubstitutionOutcome): Promise<SubstitutionRecord[]> {
    await this.ensureLoaded();
    const records = this.getData().records;
    return records.filter((r) => r.outcome === outcome);
  }

  /**
   * Get recent substitutions (last N days).
   */
  async getRecentSubstitutions(days: number): Promise<SubstitutionRecord[]> {
    await this.ensureLoaded();
    const records = this.getData().records;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return records.filter((r) => {
      const recordDate = new Date(r.timestamp);
      return recordDate >= cutoff;
    });
  }

  /**
   * Get substitution patterns (what substitutes were accepted/rejected).
   */
  async getSubstitutionPatterns(): Promise<SubstitutionPattern[]> {
    await this.ensureLoaded();
    const records = this.getData().records;

    // Group by original item + substitute item
    const patterns = new Map<string, SubstitutionPattern>();

    for (const record of records) {
      const key = `${record.originalItem.name}|${record.substituteItem.name}`;

      let pattern = patterns.get(key);
      if (!pattern) {
        pattern = {
          originalItem: record.originalItem,
          substituteItem: record.substituteItem,
          timesAccepted: 0,
          timesRejected: 0,
          acceptanceRate: 0,
          avgPriceDelta: 0,
          lastSubstitutedAt: record.timestamp,
        };
        patterns.set(key, pattern);
      }

      if (record.outcome === 'accepted' || record.outcome === 'auto-approved') {
        pattern.timesAccepted++;
      } else if (record.outcome === 'rejected') {
        pattern.timesRejected++;
      }

      if (new Date(record.timestamp) > new Date(pattern.lastSubstitutedAt)) {
        pattern.lastSubstitutedAt = record.timestamp;
      }
    }

    // Calculate rates and averages
    for (const pattern of patterns.values()) {
      const total = pattern.timesAccepted + pattern.timesRejected;
      pattern.acceptanceRate = total > 0 ? pattern.timesAccepted / total : 0;

      // Calculate average price delta for this pattern
      const relevantRecords = records.filter(
        (r) =>
          r.originalItem.name === pattern.originalItem.name &&
          r.substituteItem.name === pattern.substituteItem.name &&
          r.priceDelta !== undefined
      );

      if (relevantRecords.length > 0) {
        const sumDelta = relevantRecords.reduce(
          (sum, r) => sum + (r.priceDelta || 0),
          0
        );
        pattern.avgPriceDelta = sumDelta / relevantRecords.length;
      }
    }

    return Array.from(patterns.values());
  }

  /**
   * Get brand tolerance scores.
   */
  async getBrandToleranceScores(): Promise<BrandToleranceScore[]> {
    await this.ensureLoaded();
    const records = this.getData().records.filter((r) => !r.sameBrand);

    // Group by substitute brand
    const brandScores = new Map<string, { accepted: number; rejected: number }>();

    for (const record of records) {
      // Extract brand from substitute item name (heuristic)
      const brand = this.extractBrand(record.substituteItem.name);
      if (!brand) continue;

      let score = brandScores.get(brand);
      if (!score) {
        score = { accepted: 0, rejected: 0 };
        brandScores.set(brand, score);
      }

      if (record.outcome === 'accepted' || record.outcome === 'auto-approved') {
        score.accepted++;
      } else if (record.outcome === 'rejected') {
        score.rejected++;
      }
    }

    // Convert to array with acceptance rates
    const scores: BrandToleranceScore[] = [];
    for (const [brand, score] of brandScores.entries()) {
      const total = score.accepted + score.rejected;
      if (total > 0) {
        scores.push({
          brand,
          acceptanceRate: score.accepted / total,
          sampleSize: total,
        });
      }
    }

    // Sort by sample size (more data = more reliable)
    scores.sort((a, b) => b.sampleSize - a.sampleSize);

    return scores;
  }

  /**
   * Extract brand from item name (simple heuristic).
   */
  private extractBrand(name: string): string | null {
    // Take first word as brand (naive approach)
    const words = name.trim().split(/\s+/);
    return words[0] || null;
  }

  /**
   * Get price delta tolerance.
   */
  async getPriceDeltaTolerance(): Promise<PriceDeltaTolerance> {
    await this.ensureLoaded();
    const records = this.getData().records.filter((r) => r.priceDelta !== undefined);

    const accepted = records.filter(
      (r) => r.outcome === 'accepted' || r.outcome === 'auto-approved'
    );
    const rejected = records.filter((r) => r.outcome === 'rejected');

    const avgAcceptedDelta =
      accepted.length > 0
        ? accepted.reduce((sum, r) => sum + (r.priceDelta || 0), 0) / accepted.length
        : 0;

    const avgRejectedDelta =
      rejected.length > 0
        ? rejected.reduce((sum, r) => sum + (r.priceDelta || 0), 0) / rejected.length
        : 0;

    const maxAcceptedDelta =
      accepted.length > 0
        ? Math.max(...accepted.map((r) => r.priceDelta || 0))
        : 0;

    const acceptedPercents = accepted
      .filter((r) => r.priceDeltaPercent !== undefined)
      .map((r) => r.priceDeltaPercent || 0);

    const maxAcceptedPercent =
      acceptedPercents.length > 0 ? Math.max(...acceptedPercents) : 0;

    return {
      avgAcceptedDelta,
      avgRejectedDelta,
      maxAcceptedDelta,
      maxAcceptedPercent,
    };
  }

  /**
   * Check if a substitution has been accepted before.
   */
  async hasBeenAcceptedBefore(
    originalItem: ItemIdentifier,
    substituteItem: ItemIdentifier
  ): Promise<boolean> {
    const patterns = await this.getSubstitutionPatterns();

    return patterns.some(
      (p) =>
        p.originalItem.name === originalItem.name &&
        p.substituteItem.name === substituteItem.name &&
        p.timesAccepted > 0
    );
  }

  // ============================================================================
  // Write Operations
  // ============================================================================

  /**
   * Add a substitution record.
   */
  async addRecord(
    record: Omit<SubstitutionRecord, 'id' | 'timestamp'>
  ): Promise<SubstitutionRecord> {
    await this.ensureLoaded();
    const data = this.getData();

    const fullRecord: SubstitutionRecord = {
      ...record,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    };

    data.records.push(fullRecord);

    // Sort by timestamp (most recent first)
    data.records.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    await this.save();

    return fullRecord;
  }

  /**
   * Update record outcome.
   */
  async updateRecordOutcome(
    id: string,
    outcome: SubstitutionOutcome,
    userFeedback?: string
  ): Promise<void> {
    await this.ensureLoaded();
    const data = this.getData();

    const record = data.records.find((r) => r.id === id);
    if (record) {
      record.outcome = outcome;
      if (userFeedback !== undefined) {
        record.userFeedback = userFeedback;
      }
      await this.save();
    }
  }

  /**
   * Delete old records (data cleanup).
   * Keeps only records from the last N days.
   */
  async cleanupOldRecords(keepDays = 365): Promise<void> {
    await this.ensureLoaded();
    const data = this.getData();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - keepDays);

    data.records = data.records.filter((r) => {
      const recordDate = new Date(r.timestamp);
      return recordDate >= cutoff;
    });

    await this.save();
  }

  /**
   * Get statistics summary.
   */
  async getStatistics(): Promise<{
    totalSubstitutions: number;
    acceptedCount: number;
    rejectedCount: number;
    acceptanceRate: number;
    avgPriceDelta: number;
    sameBrandRate: number;
  }> {
    await this.ensureLoaded();
    const records = this.getData().records;

    const totalSubstitutions = records.length;
    const acceptedCount = records.filter(
      (r) => r.outcome === 'accepted' || r.outcome === 'auto-approved'
    ).length;
    const rejectedCount = records.filter((r) => r.outcome === 'rejected').length;

    const acceptanceRate =
      totalSubstitutions > 0 ? acceptedCount / totalSubstitutions : 0;

    const recordsWithPrice = records.filter((r) => r.priceDelta !== undefined);
    const avgPriceDelta =
      recordsWithPrice.length > 0
        ? recordsWithPrice.reduce((sum, r) => sum + (r.priceDelta || 0), 0) /
          recordsWithPrice.length
        : 0;

    const sameBrandCount = records.filter((r) => r.sameBrand).length;
    const sameBrandRate = totalSubstitutions > 0 ? sameBrandCount / totalSubstitutions : 0;

    return {
      totalSubstitutions,
      acceptedCount,
      rejectedCount,
      acceptanceRate,
      avgPriceDelta,
      sameBrandRate,
    };
  }
}
