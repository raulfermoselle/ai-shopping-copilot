/**
 * Feedback Store
 *
 * Persistent storage for post-run feedback as episodic memory.
 * Extends the BaseStore pattern for consistent file-based persistence.
 *
 * Features:
 * - Links feedback to specific sessions and items
 * - Tracks feedback patterns over time
 * - Supports querying unprocessed feedback
 * - Thread-safe atomic writes
 */

import path from 'path';
import { randomUUID } from 'crypto';
import {
  type FeedbackStore,
  FeedbackStoreSchema,
  type SessionFeedback,
  type ItemFeedback,
  type FeedbackType,
  createEmptyFeedbackStore,
  createSessionFeedback,
  createItemFeedback,
  type SubmitItemFeedbackInput,
} from './types.js';
import {
  readJsonFile,
  writeJsonFile,
} from '../../../memory/utils/file-operations.js';

// =============================================================================
// Configuration
// =============================================================================

export interface FeedbackStoreConfig {
  /** Household identifier */
  householdId: string;
  /** Base directory for data storage */
  dataDir?: string;
  /** File name for the feedback store */
  fileName?: string;
}

const DEFAULT_DATA_DIR = path.join(process.cwd(), 'data', 'feedback');
const DEFAULT_FILE_NAME = 'feedback.json';

// =============================================================================
// Feedback Store Class
// =============================================================================

/**
 * FeedbackStore manages persistent storage of post-run feedback.
 *
 * Responsibilities:
 * - Load/save feedback to disk
 * - Add item feedback to sessions
 * - Query feedback by session, item, or processing status
 * - Track feedback patterns for learning
 */
export class FeedbackStoreManager {
  private readonly householdId: string;
  private readonly filePath: string;
  private data: FeedbackStore | null = null;

  constructor(config: FeedbackStoreConfig) {
    this.householdId = config.householdId;
    const dataDir = config.dataDir ?? DEFAULT_DATA_DIR;
    const fileName = config.fileName ?? DEFAULT_FILE_NAME;
    this.filePath = path.join(dataDir, config.householdId, fileName);
  }

  // ===========================================================================
  // Lifecycle Methods
  // ===========================================================================

  /**
   * Load the feedback store from disk.
   * Creates an empty store if the file doesn't exist.
   */
  async load(): Promise<void> {
    const fileData = await readJsonFile<unknown>(this.filePath);

    if (fileData === null) {
      this.data = createEmptyFeedbackStore(this.householdId);
      return;
    }

    const parsed = FeedbackStoreSchema.safeParse(fileData);
    if (!parsed.success) {
      throw new Error(`Invalid feedback store data: ${parsed.error.message}`);
    }

    this.data = parsed.data;
  }

  /**
   * Save the feedback store to disk atomically.
   */
  async save(): Promise<void> {
    if (this.data === null) {
      throw new Error('Cannot save: store not loaded');
    }

    this.data.updatedAt = new Date();
    await writeJsonFile(this.filePath, this.data, {
      ensureDir: true,
      backup: true,
    });
  }

  /**
   * Ensure the store is loaded.
   */
  async ensureLoaded(): Promise<void> {
    if (this.data === null) {
      await this.load();
    }
  }

  /**
   * Check if the store is loaded.
   */
  isLoaded(): boolean {
    return this.data !== null;
  }

  /**
   * Get the file path for this store.
   */
  getFilePath(): string {
    return this.filePath;
  }

  // ===========================================================================
  // Session Management
  // ===========================================================================

  /**
   * Get or create a SessionFeedback for a session.
   */
  async getOrCreateSession(sessionId: string): Promise<SessionFeedback> {
    await this.ensureLoaded();

    let session = this.data!.sessions.find((s) => s.sessionId === sessionId);
    if (!session) {
      session = createSessionFeedback(sessionId, this.householdId);
      this.data!.sessions.push(session);
    }

    return session;
  }

  /**
   * Get SessionFeedback for a session (returns null if not found).
   */
  async getSession(sessionId: string): Promise<SessionFeedback | null> {
    await this.ensureLoaded();
    return this.data!.sessions.find((s) => s.sessionId === sessionId) ?? null;
  }

  /**
   * Update overall session feedback (rating, comments, approval).
   */
  async updateSessionFeedback(
    sessionId: string,
    updates: {
      overallRating?: 1 | 2 | 3 | 4 | 5;
      generalComments?: string;
      cartApproved?: boolean;
    }
  ): Promise<SessionFeedback> {
    await this.ensureLoaded();

    const session = await this.getOrCreateSession(sessionId);

    if (updates.overallRating !== undefined) {
      session.overallRating = updates.overallRating;
    }
    if (updates.generalComments !== undefined) {
      session.generalComments = updates.generalComments;
    }
    if (updates.cartApproved !== undefined) {
      session.cartApproved = updates.cartApproved;
    }

    await this.save();
    return session;
  }

  /**
   * Mark session feedback collection as complete.
   */
  async completeSession(sessionId: string): Promise<SessionFeedback | null> {
    await this.ensureLoaded();

    const session = this.data!.sessions.find((s) => s.sessionId === sessionId);
    if (!session) {
      return null;
    }

    session.completedAt = new Date();
    this.updateSessionSummary(session);

    await this.save();
    return session;
  }

  // ===========================================================================
  // Item Feedback Management
  // ===========================================================================

  /**
   * Add item feedback to a session.
   */
  async addItemFeedback(input: SubmitItemFeedbackInput): Promise<ItemFeedback> {
    await this.ensureLoaded();

    const feedbackId = randomUUID();
    const feedback = createItemFeedback(input, feedbackId);

    const session = await this.getOrCreateSession(input.sessionId);
    session.itemFeedback.push(feedback);
    this.updateSessionSummary(session);

    await this.save();
    return feedback;
  }

  /**
   * Get all item feedback for a session.
   */
  async getItemFeedback(sessionId: string): Promise<ItemFeedback[]> {
    await this.ensureLoaded();

    const session = this.data!.sessions.find((s) => s.sessionId === sessionId);
    return session?.itemFeedback ?? [];
  }

  /**
   * Get item feedback by feedback ID.
   */
  async getFeedbackById(feedbackId: string): Promise<ItemFeedback | null> {
    await this.ensureLoaded();

    for (const session of this.data!.sessions) {
      const feedback = session.itemFeedback.find((f) => f.feedbackId === feedbackId);
      if (feedback) {
        return feedback;
      }
    }
    return null;
  }

  // ===========================================================================
  // Query Methods
  // ===========================================================================

  /**
   * Get all unprocessed feedback across all sessions.
   */
  async getUnprocessedFeedback(): Promise<ItemFeedback[]> {
    await this.ensureLoaded();

    const unprocessed: ItemFeedback[] = [];
    for (const session of this.data!.sessions) {
      for (const feedback of session.itemFeedback) {
        if (!feedback.processed) {
          unprocessed.push(feedback);
        }
      }
    }
    return unprocessed;
  }

  /**
   * Get feedback for a specific product across all sessions.
   */
  async getFeedbackByProduct(productName: string): Promise<ItemFeedback[]> {
    await this.ensureLoaded();

    const results: ItemFeedback[] = [];
    const normalizedName = productName.toLowerCase();

    for (const session of this.data!.sessions) {
      for (const feedback of session.itemFeedback) {
        if (feedback.productName.toLowerCase().includes(normalizedName)) {
          results.push(feedback);
        }
      }
    }
    return results;
  }

  /**
   * Get feedback by type across all sessions.
   */
  async getFeedbackByType(feedbackType: FeedbackType): Promise<ItemFeedback[]> {
    await this.ensureLoaded();

    const results: ItemFeedback[] = [];
    for (const session of this.data!.sessions) {
      for (const feedback of session.itemFeedback) {
        if (feedback.feedbackType === feedbackType) {
          results.push(feedback);
        }
      }
    }
    return results;
  }

  /**
   * Get feedback statistics for the household.
   */
  async getStatistics(): Promise<{
    totalSessions: number;
    totalFeedbackItems: number;
    byType: Record<FeedbackType, number>;
    averageRating: number | null;
    processedCount: number;
    unprocessedCount: number;
  }> {
    await this.ensureLoaded();

    const byType: Record<FeedbackType, number> = {
      good: 0,
      remove_next_time: 0,
      wrong_substitution: 0,
      ran_out_early: 0,
    };

    let totalFeedbackItems = 0;
    let processedCount = 0;
    let ratingSum = 0;
    let ratingCount = 0;

    for (const session of this.data!.sessions) {
      if (session.overallRating) {
        ratingSum += session.overallRating;
        ratingCount++;
      }

      for (const feedback of session.itemFeedback) {
        totalFeedbackItems++;
        byType[feedback.feedbackType]++;
        if (feedback.processed) {
          processedCount++;
        }
      }
    }

    return {
      totalSessions: this.data!.sessions.length,
      totalFeedbackItems,
      byType,
      averageRating: ratingCount > 0 ? ratingSum / ratingCount : null,
      processedCount,
      unprocessedCount: totalFeedbackItems - processedCount,
    };
  }

  /**
   * Get recent sessions with feedback.
   */
  async getRecentSessions(limit: number = 10): Promise<SessionFeedback[]> {
    await this.ensureLoaded();

    return this.data!.sessions
      .slice()
      .sort((a, b) => new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime())
      .slice(0, limit);
  }

  // ===========================================================================
  // Processing Methods
  // ===========================================================================

  /**
   * Mark feedback as processed.
   */
  async markAsProcessed(feedbackIds: string[]): Promise<number> {
    await this.ensureLoaded();

    let markedCount = 0;
    const now = new Date();

    for (const session of this.data!.sessions) {
      for (const feedback of session.itemFeedback) {
        if (feedbackIds.includes(feedback.feedbackId) && !feedback.processed) {
          feedback.processed = true;
          feedback.processedAt = now;
          markedCount++;
        }
      }
    }

    if (markedCount > 0) {
      await this.save();
    }

    return markedCount;
  }

  /**
   * Reset processed status for all feedback (for reprocessing).
   */
  async resetProcessedStatus(): Promise<number> {
    await this.ensureLoaded();

    let resetCount = 0;

    for (const session of this.data!.sessions) {
      for (const feedback of session.itemFeedback) {
        if (feedback.processed) {
          feedback.processed = false;
          feedback.processedAt = undefined;
          resetCount++;
        }
      }
    }

    if (resetCount > 0) {
      await this.save();
    }

    return resetCount;
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Update session summary statistics.
   */
  private updateSessionSummary(session: SessionFeedback): void {
    const summary = {
      totalItemsReviewed: session.itemFeedback.length,
      goodFeedbackCount: 0,
      removeNextTimeCount: 0,
      wrongSubstitutionCount: 0,
      ranOutEarlyCount: 0,
    };

    for (const feedback of session.itemFeedback) {
      switch (feedback.feedbackType) {
        case 'good':
          summary.goodFeedbackCount++;
          break;
        case 'remove_next_time':
          summary.removeNextTimeCount++;
          break;
        case 'wrong_substitution':
          summary.wrongSubstitutionCount++;
          break;
        case 'ran_out_early':
          summary.ranOutEarlyCount++;
          break;
      }
    }

    session.summary = summary;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a FeedbackStoreManager instance.
 */
export function createFeedbackStore(config: FeedbackStoreConfig): FeedbackStoreManager {
  return new FeedbackStoreManager(config);
}
