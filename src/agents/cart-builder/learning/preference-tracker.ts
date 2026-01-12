/**
 * Preference Tracker
 *
 * Tracks user decisions from Review Pack outcomes and updates preference data.
 * All functions are pure - they take state and return new state without side effects.
 *
 * Part of Sprint-CB-I-002: CartBuilder Preference Learning
 */

import type {
  UserDecision,
  ItemPreference,
  PreferenceStore,
  ReviewPackOutcome,
  QuantityHistoryEntry,
  PreferenceLearningConfig,
} from './types.js';
import {
  createItemPreference,
  createUserDecision,
  createEmptyStore,
  createDefaultConfig,
} from './types.js';

// =============================================================================
// Core Tracking Functions (Pure)
// =============================================================================

/**
 * Apply a single user decision to update an item preference.
 * Pure function - returns new ItemPreference without mutating inputs.
 *
 * @param preference - Existing preference (or undefined for new item)
 * @param decision - User decision to apply
 * @returns Updated ItemPreference
 */
export function applyDecisionToPreference(
  preference: ItemPreference | undefined,
  decision: UserDecision
): ItemPreference {
  // Create new preference if none exists
  const current = preference ?? createItemPreference(decision.productId, decision.productName);

  // Update approval/rejection counts based on decision type
  let approvalCount = current.approvalCount;
  let rejectionCount = current.rejectionCount;
  let quantityHistory = [...current.quantityHistory];

  switch (decision.decisionType) {
    case 'approved':
      approvalCount += 1;
      // Add quantity history entry for approved items
      quantityHistory = addQuantityHistoryEntry(quantityHistory, {
        quantity: decision.finalQuantity,
        timestamp: decision.timestamp,
        sessionId: decision.sessionId,
        suggestedQuantity: decision.originalQuantity,
      });
      break;

    case 'rejected':
      rejectionCount += 1;
      // No quantity history for rejected items
      break;

    case 'quantity_modified':
      // Quantity modification counts as implicit approval
      approvalCount += 1;
      quantityHistory = addQuantityHistoryEntry(quantityHistory, {
        quantity: decision.finalQuantity,
        timestamp: decision.timestamp,
        sessionId: decision.sessionId,
        suggestedQuantity: decision.originalQuantity,
      });
      break;

    case 'substituted':
      // Substitution is a form of rejection for the original item
      rejectionCount += 1;
      break;
  }

  return {
    ...current,
    productName: decision.productName, // Update name if changed
    approvalCount,
    rejectionCount,
    quantityHistory,
    lastDecision: decision.decisionType,
    lastDecisionAt: decision.timestamp,
    updatedAt: new Date(),
  };
}

/**
 * Add a quantity history entry, maintaining reasonable history size.
 * Pure function - returns new array.
 *
 * @param history - Existing quantity history
 * @param entry - New entry to add
 * @param maxEntries - Maximum entries to keep (default: 50)
 * @returns Updated quantity history
 */
export function addQuantityHistoryEntry(
  history: QuantityHistoryEntry[],
  entry: QuantityHistoryEntry,
  maxEntries: number = 50
): QuantityHistoryEntry[] {
  const newHistory = [...history, entry];

  // Trim to max entries, keeping most recent
  if (newHistory.length > maxEntries) {
    return newHistory.slice(-maxEntries);
  }

  return newHistory;
}

/**
 * Apply multiple user decisions to update a preference store.
 * Pure function - returns new PreferenceStore without mutating inputs.
 *
 * @param store - Existing preference store
 * @param decisions - Array of user decisions to apply
 * @returns Updated PreferenceStore
 */
export function applyDecisionsToStore(
  store: PreferenceStore,
  decisions: UserDecision[]
): PreferenceStore {
  // Start with a copy of existing preferences
  const preferences: Record<string, ItemPreference> = { ...store.preferences };

  // Apply each decision
  for (const decision of decisions) {
    const existing = preferences[decision.productId];
    preferences[decision.productId] = applyDecisionToPreference(existing, decision);
  }

  return {
    ...store,
    preferences,
    lastUpdated: new Date(),
    totalDecisions: store.totalDecisions + decisions.length,
  };
}

// =============================================================================
// Review Pack Outcome Processing
// =============================================================================

/**
 * Convert a Review Pack outcome into user decisions.
 * Pure function - extracts decisions from outcome data.
 *
 * @param outcome - Review Pack outcome from user
 * @returns Array of UserDecision records
 */
export function extractDecisionsFromOutcome(
  outcome: ReviewPackOutcome
): UserDecision[] {
  return outcome.decisions;
}

/**
 * Process a Review Pack outcome and update the preference store.
 * Combines extraction and application into a single operation.
 *
 * @param store - Existing preference store
 * @param outcome - Review Pack outcome from user
 * @returns Updated PreferenceStore
 */
export function processReviewPackOutcome(
  store: PreferenceStore,
  outcome: ReviewPackOutcome
): PreferenceStore {
  const decisions = extractDecisionsFromOutcome(outcome);
  return applyDecisionsToStore(store, decisions);
}

// =============================================================================
// Decision Extraction from Cart Comparison
// =============================================================================

/**
 * Cart item for comparison (before/after review).
 */
export interface CartComparisonItem {
  productId: string;
  productName: string;
  quantity: number;
  sourceOrders?: string[];
}

/**
 * Extract user decisions by comparing cart before and after review.
 * Pure function - compares two cart states to infer decisions.
 *
 * This is useful when we don't have explicit decision events but
 * can compare cart snapshots before and after user review.
 *
 * @param cartBefore - Cart items before user review
 * @param cartAfter - Cart items after user review
 * @param sessionId - Session identifier
 * @returns Array of inferred UserDecision records
 */
export function extractDecisionsFromCartComparison(
  cartBefore: CartComparisonItem[],
  cartAfter: CartComparisonItem[],
  sessionId: string
): UserDecision[] {
  const decisions: UserDecision[] = [];

  // Create lookup map for after-cart
  const afterMap = new Map(cartAfter.map((item) => [item.productId, item]));

  // Process each item from before-cart
  for (const beforeItem of cartBefore) {
    const afterItem = afterMap.get(beforeItem.productId);

    if (!afterItem) {
      // Item was removed - rejection
      decisions.push(
        createUserDecision(
          beforeItem.productId,
          beforeItem.productName,
          'rejected',
          beforeItem.quantity,
          0,
          sessionId,
          beforeItem.sourceOrders
        )
      );
    } else if (afterItem.quantity !== beforeItem.quantity) {
      // Quantity changed - modification
      decisions.push(
        createUserDecision(
          beforeItem.productId,
          beforeItem.productName,
          'quantity_modified',
          beforeItem.quantity,
          afterItem.quantity,
          sessionId,
          beforeItem.sourceOrders
        )
      );
      // Remove from afterMap so we don't double-count
      afterMap.delete(beforeItem.productId);
    } else {
      // Item kept with same quantity - approval
      decisions.push(
        createUserDecision(
          beforeItem.productId,
          beforeItem.productName,
          'approved',
          beforeItem.quantity,
          afterItem.quantity,
          sessionId,
          beforeItem.sourceOrders
        )
      );
      afterMap.delete(beforeItem.productId);
    }
  }

  // Any items remaining in afterMap are new additions
  // (not learning signals from CartBuilder - these are user additions)
  // We don't create decisions for these as they weren't in our suggestions

  return decisions;
}

// =============================================================================
// Preference Pruning (Age-based cleanup)
// =============================================================================

/**
 * Prune old quantity history entries based on configuration.
 * Pure function - returns new ItemPreference with pruned history.
 *
 * @param preference - Item preference to prune
 * @param config - Learning configuration
 * @param referenceDate - Reference date for age calculation (default: now)
 * @returns Pruned ItemPreference
 */
export function pruneQuantityHistory(
  preference: ItemPreference,
  config: PreferenceLearningConfig,
  referenceDate: Date = new Date()
): ItemPreference {
  const cutoffTime = referenceDate.getTime() - config.maxDecisionAgeDays * 24 * 60 * 60 * 1000;

  const prunedHistory = preference.quantityHistory.filter(
    (entry) => entry.timestamp.getTime() >= cutoffTime
  );

  // Only update if history actually changed
  if (prunedHistory.length === preference.quantityHistory.length) {
    return preference;
  }

  return {
    ...preference,
    quantityHistory: prunedHistory,
    updatedAt: new Date(),
  };
}

/**
 * Prune old data from entire preference store.
 * Pure function - returns new PreferenceStore with pruned data.
 *
 * @param store - Preference store to prune
 * @param config - Learning configuration
 * @param referenceDate - Reference date for age calculation
 * @returns Pruned PreferenceStore
 */
export function prunePreferenceStore(
  store: PreferenceStore,
  config: PreferenceLearningConfig,
  referenceDate: Date = new Date()
): PreferenceStore {
  const prunedPreferences: Record<string, ItemPreference> = {};

  for (const [productId, preference] of Object.entries(store.preferences)) {
    prunedPreferences[productId] = pruneQuantityHistory(preference, config, referenceDate);
  }

  return {
    ...store,
    preferences: prunedPreferences,
    lastUpdated: new Date(),
  };
}

// =============================================================================
// Query Functions
// =============================================================================

/**
 * Get preference for a specific product.
 * Pure function - simple lookup.
 *
 * @param store - Preference store
 * @param productId - Product to look up
 * @returns ItemPreference or undefined if not found
 */
export function getPreference(
  store: PreferenceStore,
  productId: string
): ItemPreference | undefined {
  return store.preferences[productId];
}

/**
 * Get preferences for multiple products.
 * Pure function - batch lookup.
 *
 * @param store - Preference store
 * @param productIds - Products to look up
 * @returns Map of productId to ItemPreference (only includes found items)
 */
export function getPreferences(
  store: PreferenceStore,
  productIds: string[]
): Map<string, ItemPreference> {
  const result = new Map<string, ItemPreference>();

  for (const productId of productIds) {
    const preference = store.preferences[productId];
    if (preference) {
      result.set(productId, preference);
    }
  }

  return result;
}

/**
 * Get all items with strong rejection signals.
 * Pure function - filters preferences by rejection ratio.
 *
 * @param store - Preference store
 * @param threshold - Rejection ratio threshold (default: 0.8)
 * @param minDecisions - Minimum decisions required (default: 3)
 * @returns Array of productIds with strong rejection signals
 */
export function getStrongRejections(
  store: PreferenceStore,
  threshold: number = 0.8,
  minDecisions: number = 3
): string[] {
  const rejections: string[] = [];

  for (const [productId, preference] of Object.entries(store.preferences)) {
    const total = preference.approvalCount + preference.rejectionCount;
    if (total >= minDecisions) {
      const rejectionRatio = preference.rejectionCount / total;
      if (rejectionRatio >= threshold) {
        rejections.push(productId);
      }
    }
  }

  return rejections;
}

/**
 * Get all items with strong inclusion signals.
 * Pure function - filters preferences by approval ratio.
 *
 * @param store - Preference store
 * @param threshold - Approval ratio threshold (default: 0.9)
 * @param minDecisions - Minimum decisions required (default: 3)
 * @returns Array of productIds with strong inclusion signals
 */
export function getStrongInclusions(
  store: PreferenceStore,
  threshold: number = 0.9,
  minDecisions: number = 3
): string[] {
  const inclusions: string[] = [];

  for (const [productId, preference] of Object.entries(store.preferences)) {
    const total = preference.approvalCount + preference.rejectionCount;
    if (total >= minDecisions) {
      const approvalRatio = preference.approvalCount / total;
      if (approvalRatio >= threshold) {
        inclusions.push(productId);
      }
    }
  }

  return inclusions;
}

// =============================================================================
// Statistics Functions
// =============================================================================

/**
 * Get statistics about a preference store.
 * Pure function - computes aggregate statistics.
 */
export interface PreferenceStoreStats {
  totalItems: number;
  itemsWithHistory: number;
  totalApprovals: number;
  totalRejections: number;
  averageApprovalRatio: number;
  itemsWithStrongRejection: number;
  itemsWithStrongInclusion: number;
}

/**
 * Compute statistics for a preference store.
 * Pure function.
 *
 * @param store - Preference store
 * @param config - Learning configuration
 * @returns Statistics about the store
 */
export function computeStoreStatistics(
  store: PreferenceStore,
  config: PreferenceLearningConfig = createDefaultConfig()
): PreferenceStoreStats {
  const preferences = Object.values(store.preferences);

  let totalApprovals = 0;
  let totalRejections = 0;
  let itemsWithHistory = 0;

  for (const pref of preferences) {
    totalApprovals += pref.approvalCount;
    totalRejections += pref.rejectionCount;
    if (pref.quantityHistory.length > 0) {
      itemsWithHistory++;
    }
  }

  const total = totalApprovals + totalRejections;
  const averageApprovalRatio = total > 0 ? totalApprovals / total : 0;

  const strongRejections = getStrongRejections(
    store,
    config.strongRejectThreshold,
    config.minDecisionsForConfidence
  );

  const strongInclusions = getStrongInclusions(
    store,
    config.strongIncludeThreshold,
    config.minDecisionsForConfidence
  );

  return {
    totalItems: preferences.length,
    itemsWithHistory,
    totalApprovals,
    totalRejections,
    averageApprovalRatio,
    itemsWithStrongRejection: strongRejections.length,
    itemsWithStrongInclusion: strongInclusions.length,
  };
}

// =============================================================================
// Persistence Interface (for memory layer integration)
// =============================================================================

/**
 * Interface for preference store persistence.
 * Implementations will be provided by the memory layer (Sprint-G-003).
 */
export interface PreferenceStorePersistence {
  /**
   * Load preference store for a household.
   * Returns empty store if none exists.
   */
  load(householdId: string): Promise<PreferenceStore>;

  /**
   * Save preference store for a household.
   */
  save(store: PreferenceStore): Promise<void>;

  /**
   * Check if a preference store exists for a household.
   */
  exists(householdId: string): Promise<boolean>;
}

/**
 * In-memory implementation of preference store persistence.
 * Useful for testing and development.
 */
export class InMemoryPreferenceStore implements PreferenceStorePersistence {
  private stores: Map<string, PreferenceStore> = new Map();

  load(householdId: string): Promise<PreferenceStore> {
    const existing = this.stores.get(householdId);
    if (existing) {
      // Return a deep copy to prevent external mutation
      return Promise.resolve(JSON.parse(JSON.stringify(existing)) as PreferenceStore);
    }
    return Promise.resolve(createEmptyStore(householdId));
  }

  save(store: PreferenceStore): Promise<void> {
    // Store a deep copy to prevent external mutation
    this.stores.set(store.householdId, JSON.parse(JSON.stringify(store)) as PreferenceStore);
    return Promise.resolve();
  }

  exists(householdId: string): Promise<boolean> {
    return Promise.resolve(this.stores.has(householdId));
  }

  /**
   * Clear all stores (for testing).
   */
  clear(): void {
    this.stores.clear();
  }
}
