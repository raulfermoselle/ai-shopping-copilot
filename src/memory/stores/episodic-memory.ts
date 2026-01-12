import {
  EpisodicMemoryStore,
  EpisodicMemoryStoreSchema,
  createEmptyEpisodicMemoryStore,
  EpisodicMemoryRecord,
  RunOutcome,
  RunPhase,
  ItemAction,
} from '../types.js';
import { BaseStore, BaseStoreConfig } from './base-store.js';

// ============================================================================
// Query Types
// ============================================================================

export interface RunStatistics {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  successRate: number;
  avgDurationMs: number;
  avgItemsAdded: number;
  avgItemsRemoved: number;
  avgSubstitutions: number;
  totalSubstitutionsAccepted: number;
  totalSubstitutionsRejected: number;
  substitutionAcceptanceRate: number;
}

export interface PhasePerformance {
  phase: RunPhase;
  totalRuns: number;
  successfulRuns: number;
  avgDurationMs: number;
  errorCount: number;
}

// ============================================================================
// Episodic Memory Store
// ============================================================================

export class EpisodicMemoryStoreClass extends BaseStore<typeof EpisodicMemoryStoreSchema> {
  constructor(config: Omit<BaseStoreConfig, 'fileName'>) {
    super(
      { ...config, fileName: 'episodic-memory.json' },
      EpisodicMemoryStoreSchema
    );
  }

  protected createEmpty(): EpisodicMemoryStore {
    return createEmptyEpisodicMemoryStore(this.householdId);
  }

  // ============================================================================
  // Read Operations
  // ============================================================================

  /**
   * Get all episodic records.
   */
  async getAllRecords(): Promise<EpisodicMemoryRecord[]> {
    await this.ensureLoaded();
    return this.getData().records;
  }

  /**
   * Get a specific run by ID.
   */
  async getRunById(runId: string): Promise<EpisodicMemoryRecord | null> {
    await this.ensureLoaded();
    const records = this.getData().records;
    return records.find((r) => r.runId === runId) || null;
  }

  /**
   * Get recent runs (last N runs).
   */
  async getRecentRuns(limit = 10): Promise<EpisodicMemoryRecord[]> {
    await this.ensureLoaded();
    const records = this.getData().records;
    return records.slice(0, limit);
  }

  /**
   * Get runs within a date range.
   */
  async getRunsInDateRange(
    startDate: string,
    endDate: string
  ): Promise<EpisodicMemoryRecord[]> {
    await this.ensureLoaded();
    const records = this.getData().records;

    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();

    return records.filter((r) => {
      const runDate = new Date(r.startedAt).getTime();
      return runDate >= start && runDate <= end;
    });
  }

  /**
   * Get runs by outcome.
   */
  async getRunsByOutcome(outcome: RunOutcome): Promise<EpisodicMemoryRecord[]> {
    await this.ensureLoaded();
    const records = this.getData().records;
    return records.filter((r) => r.outcome === outcome);
  }

  /**
   * Get successful runs only.
   */
  async getSuccessfulRuns(): Promise<EpisodicMemoryRecord[]> {
    return this.getRunsByOutcome('success');
  }

  /**
   * Get failed runs only.
   */
  async getFailedRuns(): Promise<EpisodicMemoryRecord[]> {
    await this.ensureLoaded();
    const records = this.getData().records;
    return records.filter((r) => r.outcome === 'error' || r.outcome === 'timeout');
  }

  /**
   * Get runs with user approval.
   */
  async getApprovedRuns(): Promise<EpisodicMemoryRecord[]> {
    await this.ensureLoaded();
    const records = this.getData().records;
    return records.filter((r) => r.userApproved === true);
  }

  /**
   * Get last successful run.
   */
  async getLastSuccessfulRun(): Promise<EpisodicMemoryRecord | null> {
    const successful = await this.getSuccessfulRuns();
    return successful.length > 0 ? (successful[0] ?? null) : null;
  }

  /**
   * Get statistics for all runs.
   */
  async getStatistics(days?: number): Promise<RunStatistics> {
    await this.ensureLoaded();
    let records = this.getData().records;

    // Filter by date range if specified
    if (days !== undefined) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      records = records.filter((r) => new Date(r.startedAt) >= cutoff);
    }

    const totalRuns = records.length;
    const successfulRuns = records.filter((r) => r.outcome === 'success').length;
    const failedRuns = records.filter(
      (r) => r.outcome === 'error' || r.outcome === 'timeout'
    ).length;

    const successRate = totalRuns > 0 ? successfulRuns / totalRuns : 0;

    // Calculate averages
    const recordsWithDuration = records.filter((r) => r.durationMs !== undefined);
    const avgDurationMs =
      recordsWithDuration.length > 0
        ? recordsWithDuration.reduce((sum, r) => sum + (r.durationMs || 0), 0) /
          recordsWithDuration.length
        : 0;

    const avgItemsAdded =
      totalRuns > 0
        ? records.reduce((sum, r) => sum + r.itemsAdded, 0) / totalRuns
        : 0;

    const avgItemsRemoved =
      totalRuns > 0
        ? records.reduce((sum, r) => sum + r.itemsRemoved, 0) / totalRuns
        : 0;

    const avgSubstitutions =
      totalRuns > 0
        ? records.reduce((sum, r) => sum + r.substitutionsMade, 0) / totalRuns
        : 0;

    const totalSubstitutionsAccepted = records.reduce(
      (sum, r) => sum + r.substitutionsAccepted,
      0
    );

    const totalSubstitutionsRejected = records.reduce(
      (sum, r) => sum + r.substitutionsRejected,
      0
    );

    const totalSubstitutions =
      totalSubstitutionsAccepted + totalSubstitutionsRejected;
    const substitutionAcceptanceRate =
      totalSubstitutions > 0
        ? totalSubstitutionsAccepted / totalSubstitutions
        : 0;

    return {
      totalRuns,
      successfulRuns,
      failedRuns,
      successRate,
      avgDurationMs,
      avgItemsAdded,
      avgItemsRemoved,
      avgSubstitutions,
      totalSubstitutionsAccepted,
      totalSubstitutionsRejected,
      substitutionAcceptanceRate,
    };
  }

  /**
   * Get phase-level performance metrics.
   */
  async getPhasePerformance(): Promise<PhasePerformance[]> {
    await this.ensureLoaded();
    const records = this.getData().records;

    // Group by phase
    const phaseMap = new Map<
      RunPhase,
      {
        totalRuns: number;
        successfulRuns: number;
        totalDuration: number;
        errorCount: number;
      }
    >();

    for (const record of records) {
      const phase = record.finalPhase;

      let phaseData = phaseMap.get(phase);
      if (!phaseData) {
        phaseData = {
          totalRuns: 0,
          successfulRuns: 0,
          totalDuration: 0,
          errorCount: 0,
        };
        phaseMap.set(phase, phaseData);
      }

      phaseData.totalRuns++;

      if (record.outcome === 'success') {
        phaseData.successfulRuns++;
      }

      if (record.durationMs) {
        phaseData.totalDuration += record.durationMs;
      }

      if (record.errors && record.errors.length > 0) {
        phaseData.errorCount += record.errors.filter(
          (e) => e.phase === phase
        ).length;
      }
    }

    // Convert to array
    const performance: PhasePerformance[] = [];
    for (const [phase, data] of phaseMap.entries()) {
      performance.push({
        phase,
        totalRuns: data.totalRuns,
        successfulRuns: data.successfulRuns,
        avgDurationMs: data.totalRuns > 0 ? data.totalDuration / data.totalRuns : 0,
        errorCount: data.errorCount,
      });
    }

    return performance;
  }

  /**
   * Get most common errors.
   */
  async getMostCommonErrors(limit = 10): Promise<Array<{ error: string; count: number }>> {
    await this.ensureLoaded();
    const records = this.getData().records;

    const errorCounts = new Map<string, number>();

    for (const record of records) {
      if (record.errors) {
        for (const err of record.errors) {
          const count = errorCounts.get(err.error) || 0;
          errorCounts.set(err.error, count + 1);
        }
      }
    }

    // Convert to array and sort
    const errors = Array.from(errorCounts.entries())
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    return errors;
  }

  // ============================================================================
  // Write Operations
  // ============================================================================

  /**
   * Start a new run (create initial record).
   */
  async startRun(runId: string, agentVersion?: string): Promise<void> {
    await this.ensureLoaded();
    const data = this.getData();

    const record: EpisodicMemoryRecord = {
      runId,
      householdId: this.householdId,
      startedAt: new Date().toISOString(),
      outcome: 'success', // Will be updated when run completes
      finalPhase: 'init',
      itemsAdded: 0,
      itemsRemoved: 0,
      substitutionsMade: 0,
      substitutionsAccepted: 0,
      substitutionsRejected: 0,
      itemsPruned: 0,
      actions: [],
      agentVersion,
    };

    data.records.unshift(record); // Add to beginning (most recent first)

    await this.save();
  }

  /**
   * Update a run record.
   */
  async updateRun(
    runId: string,
    updates: Partial<Omit<EpisodicMemoryRecord, 'runId' | 'householdId' | 'startedAt'>>
  ): Promise<void> {
    await this.ensureLoaded();
    const data = this.getData();

    const record = data.records.find((r) => r.runId === runId);
    if (!record) {
      throw new Error(`Run not found: ${runId}`);
    }

    Object.assign(record, updates);

    await this.save();
  }

  /**
   * Complete a run (set outcome, duration, etc.).
   */
  async completeRun(
    runId: string,
    outcome: RunOutcome,
    finalPhase: RunPhase
  ): Promise<void> {
    await this.ensureLoaded();
    const data = this.getData();

    const record = data.records.find((r) => r.runId === runId);
    if (!record) {
      throw new Error(`Run not found: ${runId}`);
    }

    record.outcome = outcome;
    record.finalPhase = finalPhase;
    record.completedAt = new Date().toISOString();

    // Calculate duration
    const startTime = new Date(record.startedAt).getTime();
    const endTime = new Date(record.completedAt).getTime();
    record.durationMs = endTime - startTime;

    await this.save();
  }

  /**
   * Add an action to a run.
   */
  async addAction(runId: string, action: ItemAction): Promise<void> {
    await this.ensureLoaded();
    const data = this.getData();

    const record = data.records.find((r) => r.runId === runId);
    if (!record) {
      throw new Error(`Run not found: ${runId}`);
    }

    record.actions.push(action);

    // Update counters
    switch (action.action) {
      case 'added':
        record.itemsAdded++;
        break;
      case 'removed':
        record.itemsRemoved++;
        break;
      case 'substituted':
        record.substitutionsMade++;
        break;
      case 'pruned':
        record.itemsPruned++;
        break;
    }

    await this.save();
  }

  /**
   * Add an error to a run.
   */
  async addError(runId: string, phase: RunPhase, error: string): Promise<void> {
    await this.ensureLoaded();
    const data = this.getData();

    const record = data.records.find((r) => r.runId === runId);
    if (!record) {
      throw new Error(`Run not found: ${runId}`);
    }

    if (!record.errors) {
      record.errors = [];
    }

    record.errors.push({
      phase,
      error,
      timestamp: new Date().toISOString(),
    });

    await this.save();
  }

  /**
   * Set user approval status.
   */
  async setUserApproval(
    runId: string,
    approved: boolean,
    feedback?: string
  ): Promise<void> {
    await this.ensureLoaded();
    const data = this.getData();

    const record = data.records.find((r) => r.runId === runId);
    if (!record) {
      throw new Error(`Run not found: ${runId}`);
    }

    record.userApproved = approved;
    if (feedback !== undefined) {
      record.userFeedback = feedback;
    }

    await this.save();
  }

  /**
   * Delete old records (data cleanup).
   * Keeps only records from the last N days.
   */
  async cleanupOldRecords(keepDays = 180): Promise<void> {
    await this.ensureLoaded();
    const data = this.getData();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - keepDays);

    data.records = data.records.filter((r) => {
      const recordDate = new Date(r.startedAt);
      return recordDate >= cutoff;
    });

    await this.save();
  }

  /**
   * Get learning insights from recent runs.
   */
  async getLearningInsights(days = 30): Promise<{
    avgCartSize: number;
    avgCartTotal: number;
    mostCommonSlotTimes: string[];
    topRejectedSubstitutions: string[];
    userApprovalRate: number;
  }> {
    const recentRuns = await this.getRecentRuns(days);

    // Average cart size and total
    const cartsWithData = recentRuns.filter((r) => r.finalCartItemCount);
    const avgCartSize =
      cartsWithData.length > 0
        ? cartsWithData.reduce((sum, r) => sum + (r.finalCartItemCount || 0), 0) /
          cartsWithData.length
        : 0;

    const cartsWithTotal = recentRuns.filter((r) => r.finalCartTotal);
    const avgCartTotal =
      cartsWithTotal.length > 0
        ? cartsWithTotal.reduce((sum, r) => sum + (r.finalCartTotal || 0), 0) /
          cartsWithTotal.length
        : 0;

    // Most common slot times
    const slotTimes = recentRuns
      .filter((r) => r.selectedSlot)
      .map((r) => r.selectedSlot!.timeRange);
    const slotCounts = new Map<string, number>();
    for (const time of slotTimes) {
      slotCounts.set(time, (slotCounts.get(time) || 0) + 1);
    }
    const mostCommonSlotTimes = Array.from(slotCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([time]) => time);

    // Top rejected substitutions (from actions)
    const rejectedSubstitutions = recentRuns.flatMap((r) =>
      r.actions
        .filter((a) => a.action === 'substituted' && a.metadata?.rejected)
        .map((a) => a.item.name)
    );
    const rejectionCounts = new Map<string, number>();
    for (const item of rejectedSubstitutions) {
      rejectionCounts.set(item, (rejectionCounts.get(item) || 0) + 1);
    }
    const topRejectedSubstitutions = Array.from(rejectionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([item]) => item);

    // User approval rate
    const approvedCount = recentRuns.filter((r) => r.userApproved === true).length;
    const userApprovalRate = recentRuns.length > 0 ? approvedCount / recentRuns.length : 0;

    return {
      avgCartSize,
      avgCartTotal,
      mostCommonSlotTimes,
      topRejectedSubstitutions,
      userApprovalRate,
    };
  }
}
