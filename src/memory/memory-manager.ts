import { HouseholdPreferencesStore } from './stores/household-preferences.js';
import { ItemSignalsStoreClass } from './stores/item-signals.js';
import { SubstitutionHistoryStoreClass } from './stores/substitution-history.js';
import { CadenceSignalsStoreClass } from './stores/cadence-signals.js';
import { EpisodicMemoryStoreClass } from './stores/episodic-memory.js';
import { ItemIdentifier } from './types.js';

// ============================================================================
// Memory Manager Configuration
// ============================================================================

export interface MemoryManagerConfig {
  householdId: string;
  dataDir?: string;
  autoLoad?: boolean;
}

// ============================================================================
// Household Context
// ============================================================================

export interface HouseholdContext {
  householdId: string;
  preferences: {
    dietaryRestrictions: string[];
    allergies: Array<{ allergen: string; severity: string }>;
    preferredBrands: string[];
    avoidedBrands: string[];
    budgetConstraints?: {
      maxTotalSpend?: number;
      maxItemPrice?: number;
      prioritizeDeals: boolean;
    };
    deliveryPreferences?: {
      preferredDays: string[];
      preferredTimeSlots: string[];
      avoidWeekends: boolean;
    };
  };
  recentItems: Array<{
    item: ItemIdentifier;
    lastPurchased: string;
    typicalQuantity: number;
    typicalPrice?: number;
  }>;
  frequentItems: Array<{
    item: ItemIdentifier;
    purchaseFrequency: number;
    averageQuantity: number;
  }>;
  substitutionInsights: {
    acceptanceRate: number;
    priceDeltaTolerance: number;
    brandTolerance: Array<{ brand: string; acceptanceRate: number }>;
  };
  lastRunSummary?: {
    runId: string;
    completedAt: string;
    outcome: string;
    itemsInCart: number;
    userApproved?: boolean;
  };
}

// ============================================================================
// Memory Manager
// ============================================================================

/**
 * Unified access point for all persistent memory stores.
 * Provides high-level operations and context loading for agents.
 */
export class MemoryManager {
  private readonly config: MemoryManagerConfig;

  // Store instances (lazy-loaded)
  private _householdPreferences?: HouseholdPreferencesStore;
  private _itemSignals?: ItemSignalsStoreClass;
  private _substitutionHistory?: SubstitutionHistoryStoreClass;
  private _cadenceSignals?: CadenceSignalsStoreClass;
  private _episodicMemory?: EpisodicMemoryStoreClass;

  constructor(config: MemoryManagerConfig) {
    this.config = {
      autoLoad: true,
      ...config,
    };
  }

  // ============================================================================
  // Store Accessors
  // ============================================================================

  /**
   * Get household preferences store.
   */
  async getHouseholdPreferences(): Promise<HouseholdPreferencesStore> {
    if (!this._householdPreferences) {
      const storeConfig = this.config.dataDir
        ? { householdId: this.config.householdId, dataDir: this.config.dataDir }
        : { householdId: this.config.householdId };
      this._householdPreferences = new HouseholdPreferencesStore(storeConfig);

      if (this.config.autoLoad) {
        await this._householdPreferences.load();
      }
    }

    return this._householdPreferences;
  }

  /**
   * Get item signals store.
   */
  async getItemSignals(): Promise<ItemSignalsStoreClass> {
    if (!this._itemSignals) {
      const storeConfig = this.config.dataDir
        ? { householdId: this.config.householdId, dataDir: this.config.dataDir }
        : { householdId: this.config.householdId };
      this._itemSignals = new ItemSignalsStoreClass(storeConfig);

      if (this.config.autoLoad) {
        await this._itemSignals.load();
      }
    }

    return this._itemSignals;
  }

  /**
   * Get substitution history store.
   */
  async getSubstitutionHistory(): Promise<SubstitutionHistoryStoreClass> {
    if (!this._substitutionHistory) {
      const storeConfig = this.config.dataDir
        ? { householdId: this.config.householdId, dataDir: this.config.dataDir }
        : { householdId: this.config.householdId };
      this._substitutionHistory = new SubstitutionHistoryStoreClass(storeConfig);

      if (this.config.autoLoad) {
        await this._substitutionHistory.load();
      }
    }

    return this._substitutionHistory;
  }

  /**
   * Get cadence signals store.
   */
  async getCadenceSignals(): Promise<CadenceSignalsStoreClass> {
    if (!this._cadenceSignals) {
      const storeConfig = this.config.dataDir
        ? { householdId: this.config.householdId, dataDir: this.config.dataDir }
        : { householdId: this.config.householdId };
      this._cadenceSignals = new CadenceSignalsStoreClass(storeConfig);

      if (this.config.autoLoad) {
        await this._cadenceSignals.load();
      }
    }

    return this._cadenceSignals;
  }

  /**
   * Get episodic memory store.
   */
  async getEpisodicMemory(): Promise<EpisodicMemoryStoreClass> {
    if (!this._episodicMemory) {
      const storeConfig = this.config.dataDir
        ? { householdId: this.config.householdId, dataDir: this.config.dataDir }
        : { householdId: this.config.householdId };
      this._episodicMemory = new EpisodicMemoryStoreClass(storeConfig);

      if (this.config.autoLoad) {
        await this._episodicMemory.load();
      }
    }

    return this._episodicMemory;
  }

  // ============================================================================
  // High-Level Operations
  // ============================================================================

  /**
   * Load complete household context for agent use.
   * This is the primary method agents call to bootstrap their memory.
   */
  async loadHouseholdContext(): Promise<HouseholdContext> {
    const preferences = await this.getHouseholdPreferences();
    const itemSignals = await this.getItemSignals();
    const substitutionHistory = await this.getSubstitutionHistory();
    const episodicMemory = await this.getEpisodicMemory();

    // Load preferences
    const prefs = await preferences.getPreferences();
    const brandPrefs = await preferences.getBrandPreferences();

    // Load recent items (last 30 days)
    const recentItems = await itemSignals.getRecentItems(30);

    // Load frequent items (top 50)
    const frequentItems = await itemSignals.getFrequentItems(50);

    // Load substitution insights
    const subStats = await substitutionHistory.getStatistics();
    const priceTolerance = await substitutionHistory.getPriceDeltaTolerance();
    const brandTolerance = await substitutionHistory.getBrandToleranceScores();

    // Load last run summary
    const lastRun = await episodicMemory.getLastSuccessfulRun();

    // Build preferences context object, only including optional properties if they exist
    const prefsContext: HouseholdContext['preferences'] = {
      dietaryRestrictions: prefs.dietaryRestrictions,
      allergies: prefs.allergies.map((a) => ({
        allergen: a.allergen,
        severity: a.severity,
      })),
      preferredBrands: brandPrefs
        .filter((b) => b.preference === 'preferred')
        .map((b) => b.brand),
      avoidedBrands: brandPrefs
        .filter((b) => b.preference === 'avoid')
        .map((b) => b.brand),
    };
    if (prefs.budgetConstraints) {
      const bc: {
        maxTotalSpend?: number;
        maxItemPrice?: number;
        prioritizeDeals: boolean;
      } = { prioritizeDeals: prefs.budgetConstraints.prioritizeDeals };
      if (prefs.budgetConstraints.maxTotalSpend !== undefined) {
        bc.maxTotalSpend = prefs.budgetConstraints.maxTotalSpend;
      }
      if (prefs.budgetConstraints.maxItemPrice !== undefined) {
        bc.maxItemPrice = prefs.budgetConstraints.maxItemPrice;
      }
      prefsContext.budgetConstraints = bc;
    }
    if (prefs.deliveryPreferences) {
      prefsContext.deliveryPreferences = prefs.deliveryPreferences;
    }

    const context: HouseholdContext = {
      householdId: this.config.householdId,
      preferences: prefsContext,
      recentItems: recentItems.map((signal) => {
        const item: {
          item: ItemIdentifier;
          lastPurchased: string;
          typicalQuantity: number;
          typicalPrice?: number;
        } = {
          item: signal.item,
          lastPurchased: signal.lastPurchasedAt || '',
          typicalQuantity: signal.averageQuantity || 1,
        };
        if (signal.typicalPrice !== undefined) {
          item.typicalPrice = signal.typicalPrice;
        }
        return item;
      }),
      frequentItems: frequentItems.map((signal) => ({
        item: signal.item,
        purchaseFrequency: signal.purchaseFrequency || 0,
        averageQuantity: signal.averageQuantity || 1,
      })),
      substitutionInsights: {
        acceptanceRate: subStats.acceptanceRate,
        priceDeltaTolerance: priceTolerance.maxAcceptedPercent,
        brandTolerance: brandTolerance.slice(0, 10),
      },
    };

    // Add lastRunSummary only if we have a last run
    if (lastRun) {
      const summary: {
        runId: string;
        completedAt: string;
        outcome: string;
        itemsInCart: number;
        userApproved?: boolean;
      } = {
        runId: lastRun.runId,
        completedAt: lastRun.completedAt || lastRun.startedAt,
        outcome: lastRun.outcome,
        itemsInCart: lastRun.finalCartItemCount || 0,
      };
      if (lastRun.userApproved !== undefined) {
        summary.userApproved = lastRun.userApproved;
      }
      context.lastRunSummary = summary;
    }

    return context;
  }

  /**
   * Import purchase history (bulk load from Auchan orders).
   */
  async importPurchaseHistory(
    orders: Array<{
      orderId: string;
      date: string;
      items: Array<{
        item: ItemIdentifier;
        quantity: number;
        price?: number;
      }>;
    }>
  ): Promise<void> {
    const itemSignals = await this.getItemSignals();
    const cadenceSignals = await this.getCadenceSignals();

    // Prepare bulk purchases
    const bulkPurchases: Array<{
      item: ItemIdentifier;
      purchase: {
        date: string;
        quantity: number;
        price?: number;
        orderId?: string;
      };
    }> = [];

    for (const order of orders) {
      for (const orderItem of order.items) {
        const purchase: {
          date: string;
          quantity: number;
          price?: number;
          orderId?: string;
        } = {
          date: order.date,
          quantity: orderItem.quantity,
          orderId: order.orderId,
        };
        if (orderItem.price !== undefined) {
          purchase.price = orderItem.price;
        }
        bulkPurchases.push({
          item: orderItem.item,
          purchase,
        });
      }
    }

    // Add to item signals
    await itemSignals.bulkAddPurchases(bulkPurchases);

    // Learn cadence patterns
    const itemPurchaseMap = new Map<string, string[]>();

    for (const order of orders) {
      for (const orderItem of order.items) {
        const key = orderItem.item.sku || orderItem.item.name;
        const dates = itemPurchaseMap.get(key) || [];
        dates.push(order.date);
        itemPurchaseMap.set(key, dates);
      }
    }

    const historyData: Array<{ item: ItemIdentifier; dates: string[] }> = [];
    for (const order of orders) {
      for (const orderItem of order.items) {
        const key = orderItem.item.sku || orderItem.item.name;
        const dates = itemPurchaseMap.get(key) || [];
        if (dates.length >= 2) {
          historyData.push({
            item: orderItem.item,
            dates,
          });
        }
      }
    }

    await cadenceSignals.learnFromPurchaseHistory(historyData);
  }

  /**
   * Record a substitution outcome.
   */
  async recordSubstitution(
    originalItem: ItemIdentifier,
    substituteItem: ItemIdentifier,
    options: {
      reason: string;
      originalPrice?: number;
      substitutePrice?: number;
      outcome: 'accepted' | 'rejected' | 'auto-approved';
      userFeedback?: string;
      runId?: string;
    }
  ): Promise<void> {
    const substitutionHistory = await this.getSubstitutionHistory();

    const priceDelta =
      options.originalPrice && options.substitutePrice
        ? options.substitutePrice - options.originalPrice
        : undefined;

    const priceDeltaPercent =
      priceDelta && options.originalPrice
        ? (priceDelta / options.originalPrice) * 100
        : undefined;

    await substitutionHistory.addRecord({
      originalItem,
      substituteItem,
      reason: options.reason,
      originalPrice: options.originalPrice,
      substitutePrice: options.substitutePrice,
      priceDelta,
      priceDeltaPercent,
      outcome: options.outcome,
      userFeedback: options.userFeedback,
      sameBrand: this.sameBrand(originalItem, substituteItem),
      sameCategory: originalItem.category === substituteItem.category,
      runId: options.runId,
    });
  }

  /**
   * Check if two items are the same brand (heuristic).
   */
  private sameBrand(a: ItemIdentifier, b: ItemIdentifier): boolean {
    const extractFirstWord = (name: string) =>
      name.trim().split(/\s+/)[0]?.toLowerCase();
    return extractFirstWord(a.name) === extractFirstWord(b.name);
  }

  /**
   * Start tracking a coordinator run.
   */
  async startRun(runId: string, agentVersion?: string): Promise<void> {
    const episodicMemory = await this.getEpisodicMemory();
    await episodicMemory.startRun(runId, agentVersion);
  }

  /**
   * Complete a coordinator run.
   */
  async completeRun(
    runId: string,
    outcome: 'success' | 'error' | 'timeout' | 'user-cancelled' | 'partial-success',
    finalPhase: string
  ): Promise<void> {
    const episodicMemory = await this.getEpisodicMemory();
    await episodicMemory.completeRun(
      runId,
      outcome,
      finalPhase as Parameters<EpisodicMemoryStoreClass['completeRun']>[2]
    );
  }

  /**
   * Get statistics across all stores.
   */
  async getOverallStatistics(): Promise<{
    items: {
      totalTracked: number;
      recentItems: number;
      highConfidenceCadence: number;
    };
    substitutions: {
      total: number;
      acceptanceRate: number;
    };
    runs: {
      total: number;
      successRate: number;
      avgDurationMs: number;
    };
  }> {
    const itemSignals = await this.getItemSignals();
    const substitutionHistory = await this.getSubstitutionHistory();
    const cadenceSignals = await this.getCadenceSignals();
    const episodicMemory = await this.getEpisodicMemory();

    const allItems = await itemSignals.getAllSignals();
    const recentItems = await itemSignals.getRecentItems(30);
    const cadenceStats = await cadenceSignals.getStatistics();

    const subStats = await substitutionHistory.getStatistics();
    const runStats = await episodicMemory.getStatistics();

    return {
      items: {
        totalTracked: allItems.length,
        recentItems: recentItems.length,
        highConfidenceCadence: cadenceStats.highConfidenceItemsCount,
      },
      substitutions: {
        total: subStats.totalSubstitutions,
        acceptanceRate: subStats.acceptanceRate,
      },
      runs: {
        total: runStats.totalRuns,
        successRate: runStats.successRate,
        avgDurationMs: runStats.avgDurationMs,
      },
    };
  }

  /**
   * Perform data cleanup on all stores.
   */
  async cleanup(options?: {
    keepItemPurchases?: number;
    keepSubstitutionDays?: number;
    keepEpisodicDays?: number;
  }): Promise<void> {
    const itemSignals = await this.getItemSignals();
    const substitutionHistory = await this.getSubstitutionHistory();
    const episodicMemory = await this.getEpisodicMemory();

    await itemSignals.cleanupOldPurchases(options?.keepItemPurchases || 50);
    await substitutionHistory.cleanupOldRecords(options?.keepSubstitutionDays || 365);
    await episodicMemory.cleanupOldRecords(options?.keepEpisodicDays || 180);
  }

  /**
   * Reload all stores from disk.
   */
  async reloadAll(): Promise<void> {
    if (this._householdPreferences) {
      await this._householdPreferences.reload();
    }
    if (this._itemSignals) {
      await this._itemSignals.reload();
    }
    if (this._substitutionHistory) {
      await this._substitutionHistory.reload();
    }
    if (this._cadenceSignals) {
      await this._cadenceSignals.reload();
    }
    if (this._episodicMemory) {
      await this._episodicMemory.reload();
    }
  }
}
