/**
 * Substitution Tracker - Pure Functions
 *
 * Tracks substitution decisions and maintains the learning store.
 * All functions are pure: no side effects, deterministic, operate only on inputs.
 *
 * Key operations:
 * - Recording new decisions (accepted, rejected, different_chosen)
 * - Querying decision history
 * - Filtering and aggregating decisions
 */

import type {
  SubstitutionDecision,
  SubstitutionLearningStore,
  ProductReference,
  DecisionType,
  LearningConfig,
} from './types.js';
import { createSubstitutionDecision, LEARNING_SCHEMA_VERSION } from './types.js';

// =============================================================================
// Decision Recording
// =============================================================================

/**
 * Record a new substitution decision in the store.
 *
 * Pure function - returns a new store with the decision added.
 *
 * @param store - Current learning store
 * @param decision - Decision parameters (id and timestamp will be auto-generated)
 * @returns New store with decision added
 *
 * @example
 * const newStore = recordDecision(store, {
 *   originalProduct: { id: '123', name: 'Milk A', brand: 'BrandA', price: 1.50, category: 'dairy' },
 *   proposedSubstitute: { id: '456', name: 'Milk B', brand: 'BrandB', price: 1.60, category: 'dairy' },
 *   decision: 'accepted',
 * });
 */
export function recordDecision(
  store: SubstitutionLearningStore,
  decision: Omit<SubstitutionDecision, 'id' | 'timestamp'>
): SubstitutionLearningStore {
  const newDecision = createSubstitutionDecision(decision);

  return {
    ...store,
    decisions: [...store.decisions, newDecision],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Record an accepted substitution.
 *
 * @param store - Current learning store
 * @param originalProduct - The unavailable product
 * @param acceptedSubstitute - The substitute that was accepted
 * @param options - Additional context (sessionId, rank, score)
 * @returns New store with decision recorded
 */
export function recordAccepted(
  store: SubstitutionLearningStore,
  originalProduct: ProductReference,
  acceptedSubstitute: ProductReference,
  options?: { sessionId?: string; proposedRank?: number; proposedScore?: number }
): SubstitutionLearningStore {
  return recordDecision(store, {
    originalProduct,
    proposedSubstitute: acceptedSubstitute,
    decision: 'accepted',
    sessionId: options?.sessionId,
    proposedRank: options?.proposedRank,
    proposedScore: options?.proposedScore,
  });
}

/**
 * Record a rejected substitution.
 *
 * @param store - Current learning store
 * @param originalProduct - The unavailable product
 * @param rejectedSubstitute - The substitute that was rejected
 * @param options - Additional context (sessionId, rank, score)
 * @returns New store with decision recorded
 */
export function recordRejected(
  store: SubstitutionLearningStore,
  originalProduct: ProductReference,
  rejectedSubstitute: ProductReference,
  options?: { sessionId?: string; proposedRank?: number; proposedScore?: number }
): SubstitutionLearningStore {
  return recordDecision(store, {
    originalProduct,
    proposedSubstitute: rejectedSubstitute,
    decision: 'rejected',
    sessionId: options?.sessionId,
    proposedRank: options?.proposedRank,
    proposedScore: options?.proposedScore,
  });
}

/**
 * Record when user chose a different substitute than proposed.
 *
 * @param store - Current learning store
 * @param originalProduct - The unavailable product
 * @param proposedSubstitute - The substitute that was proposed but not chosen
 * @param actualChosen - The substitute the user actually selected
 * @param options - Additional context
 * @returns New store with decision recorded
 */
export function recordDifferentChosen(
  store: SubstitutionLearningStore,
  originalProduct: ProductReference,
  proposedSubstitute: ProductReference,
  actualChosen: ProductReference,
  options?: { sessionId?: string; proposedRank?: number; proposedScore?: number }
): SubstitutionLearningStore {
  return recordDecision(store, {
    originalProduct,
    proposedSubstitute,
    decision: 'different_chosen',
    actualChosen,
    sessionId: options?.sessionId,
    proposedRank: options?.proposedRank,
    proposedScore: options?.proposedScore,
  });
}

// =============================================================================
// Decision Querying
// =============================================================================

/**
 * Get all decisions for a specific category.
 *
 * @param store - Learning store
 * @param category - Category to filter by
 * @returns Decisions for that category
 */
export function getDecisionsByCategory(
  store: SubstitutionLearningStore,
  category: string
): SubstitutionDecision[] {
  return store.decisions.filter(
    (d) => d.originalProduct.category.toLowerCase() === category.toLowerCase()
  );
}

/**
 * Get all decisions involving a specific product (as original or substitute).
 *
 * @param store - Learning store
 * @param productId - Product ID to search for
 * @returns Decisions involving that product
 */
export function getDecisionsByProduct(
  store: SubstitutionLearningStore,
  productId: string
): SubstitutionDecision[] {
  return store.decisions.filter(
    (d) =>
      d.originalProduct.id === productId ||
      d.proposedSubstitute.id === productId ||
      d.actualChosen?.id === productId
  );
}

/**
 * Get all decisions for a specific brand (as substitute).
 *
 * @param store - Learning store
 * @param brand - Brand name to filter by
 * @returns Decisions where that brand was proposed as substitute
 */
export function getDecisionsBySubstituteBrand(
  store: SubstitutionLearningStore,
  brand: string
): SubstitutionDecision[] {
  const normalizedBrand = brand.toLowerCase();
  return store.decisions.filter(
    (d) => d.proposedSubstitute.brand?.toLowerCase() === normalizedBrand
  );
}

/**
 * Get decisions within a time range.
 *
 * @param store - Learning store
 * @param startDate - Start of range (inclusive)
 * @param endDate - End of range (inclusive)
 * @returns Decisions within the range
 */
export function getDecisionsInTimeRange(
  store: SubstitutionLearningStore,
  startDate: Date,
  endDate: Date
): SubstitutionDecision[] {
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();

  return store.decisions.filter((d) => {
    const decisionMs = new Date(d.timestamp).getTime();
    return decisionMs >= startMs && decisionMs <= endMs;
  });
}

/**
 * Get recent decisions (within maxAgeDays).
 *
 * @param store - Learning store
 * @param config - Learning config with maxDecisionAgeDays
 * @param referenceDate - Date to calculate from (defaults to now)
 * @returns Recent decisions
 */
export function getRecentDecisions(
  store: SubstitutionLearningStore,
  config: LearningConfig,
  referenceDate: Date = new Date()
): SubstitutionDecision[] {
  const cutoffMs = referenceDate.getTime() - config.maxDecisionAgeDays * 24 * 60 * 60 * 1000;

  return store.decisions.filter((d) => new Date(d.timestamp).getTime() >= cutoffMs);
}

/**
 * Get decisions by type.
 *
 * @param store - Learning store
 * @param decisionType - Type to filter by
 * @returns Decisions of that type
 */
export function getDecisionsByType(
  store: SubstitutionLearningStore,
  decisionType: DecisionType
): SubstitutionDecision[] {
  return store.decisions.filter((d) => d.decision === decisionType);
}

// =============================================================================
// Decision Aggregation
// =============================================================================

/**
 * Statistics about substitution decisions.
 */
export interface DecisionStats {
  /** Total number of decisions */
  total: number;
  /** Number of accepted substitutions */
  accepted: number;
  /** Number of rejected substitutions */
  rejected: number;
  /** Number where user chose differently */
  differentChosen: number;
  /** Overall acceptance rate */
  acceptanceRate: number;
  /** Rate at which user chose different substitute */
  differentChosenRate: number;
}

/**
 * Calculate decision statistics for a set of decisions.
 *
 * @param decisions - Decisions to analyze
 * @returns Aggregated statistics
 */
export function calculateDecisionStats(decisions: SubstitutionDecision[]): DecisionStats {
  const total = decisions.length;

  if (total === 0) {
    return {
      total: 0,
      accepted: 0,
      rejected: 0,
      differentChosen: 0,
      acceptanceRate: 0,
      differentChosenRate: 0,
    };
  }

  const accepted = decisions.filter((d) => d.decision === 'accepted').length;
  const rejected = decisions.filter((d) => d.decision === 'rejected').length;
  const differentChosen = decisions.filter((d) => d.decision === 'different_chosen').length;

  return {
    total,
    accepted,
    rejected,
    differentChosen,
    acceptanceRate: accepted / total,
    differentChosenRate: differentChosen / total,
  };
}

/**
 * Get statistics grouped by category.
 *
 * @param store - Learning store
 * @returns Map of category to stats
 */
export function getStatsByCategory(
  store: SubstitutionLearningStore
): Map<string, DecisionStats> {
  const byCategory = new Map<string, SubstitutionDecision[]>();

  // Group decisions by category
  for (const decision of store.decisions) {
    const category = decision.originalProduct.category.toLowerCase();
    const existing = byCategory.get(category) ?? [];
    existing.push(decision);
    byCategory.set(category, existing);
  }

  // Calculate stats for each category
  const statsMap = new Map<string, DecisionStats>();
  for (const [category, decisions] of byCategory) {
    statsMap.set(category, calculateDecisionStats(decisions));
  }

  return statsMap;
}

/**
 * Brand substitution pair statistics.
 */
export interface BrandPairStats {
  /** Original brand */
  fromBrand: string;
  /** Substitute brand */
  toBrand: string;
  /** Category */
  category: string;
  /** Number of acceptances */
  accepted: number;
  /** Number of rejections */
  rejected: number;
  /** Acceptance rate */
  acceptanceRate: number;
}

/**
 * Get statistics for brand-to-brand substitutions.
 *
 * @param decisions - Decisions to analyze
 * @returns Array of brand pair statistics
 */
export function getBrandPairStats(decisions: SubstitutionDecision[]): BrandPairStats[] {
  const pairMap = new Map<string, BrandPairStats>();

  for (const decision of decisions) {
    const fromBrand = decision.originalProduct.brand?.toLowerCase() ?? 'unknown';
    const toBrand = decision.proposedSubstitute.brand?.toLowerCase() ?? 'unknown';
    const category = decision.originalProduct.category.toLowerCase();

    // Skip if brands are the same or unknown
    if (fromBrand === toBrand || fromBrand === 'unknown' || toBrand === 'unknown') {
      continue;
    }

    const key = `${category}:${fromBrand}:${toBrand}`;
    const existing = pairMap.get(key) ?? {
      fromBrand,
      toBrand,
      category,
      accepted: 0,
      rejected: 0,
      acceptanceRate: 0,
    };

    if (decision.decision === 'accepted') {
      existing.accepted++;
    } else {
      // Both 'rejected' and 'different_chosen' count as rejection of the proposed substitute
      existing.rejected++;
    }

    existing.acceptanceRate =
      existing.accepted + existing.rejected > 0
        ? existing.accepted / (existing.accepted + existing.rejected)
        : 0;

    pairMap.set(key, existing);
  }

  return Array.from(pairMap.values());
}

/**
 * Product as substitute statistics.
 */
export interface ProductAsSubstituteStats {
  /** Product ID */
  productId: string;
  /** Product name */
  productName: string;
  /** Brand */
  brand: string | undefined;
  /** Category */
  category: string;
  /** Times accepted as substitute */
  timesAccepted: number;
  /** Times rejected as substitute */
  timesRejected: number;
  /** Times user explicitly chose this (when it wasn't top) */
  timesChosen: number;
  /** Acceptance rate when proposed */
  acceptanceRate: number;
}

/**
 * Get statistics for products when used as substitutes.
 *
 * @param decisions - Decisions to analyze
 * @returns Array of product statistics
 */
export function getProductAsSubstituteStats(
  decisions: SubstitutionDecision[]
): ProductAsSubstituteStats[] {
  const productMap = new Map<string, ProductAsSubstituteStats>();

  for (const decision of decisions) {
    // Track the proposed substitute
    const proposedId = decision.proposedSubstitute.id;
    const proposedStats = productMap.get(proposedId) ?? {
      productId: proposedId,
      productName: decision.proposedSubstitute.name,
      brand: decision.proposedSubstitute.brand,
      category: decision.originalProduct.category,
      timesAccepted: 0,
      timesRejected: 0,
      timesChosen: 0,
      acceptanceRate: 0,
    };

    if (decision.decision === 'accepted') {
      proposedStats.timesAccepted++;
    } else {
      proposedStats.timesRejected++;
    }

    proposedStats.acceptanceRate =
      proposedStats.timesAccepted + proposedStats.timesRejected > 0
        ? proposedStats.timesAccepted / (proposedStats.timesAccepted + proposedStats.timesRejected)
        : 0;

    productMap.set(proposedId, proposedStats);

    // Track the actually chosen product if different
    if (decision.decision === 'different_chosen' && decision.actualChosen) {
      const chosenId = decision.actualChosen.id;
      const chosenStats = productMap.get(chosenId) ?? {
        productId: chosenId,
        productName: decision.actualChosen.name,
        brand: decision.actualChosen.brand,
        category: decision.originalProduct.category,
        timesAccepted: 0,
        timesRejected: 0,
        timesChosen: 0,
        acceptanceRate: 0,
      };

      chosenStats.timesChosen++;
      productMap.set(chosenId, chosenStats);
    }
  }

  return Array.from(productMap.values());
}

// =============================================================================
// Store Maintenance
// =============================================================================

/**
 * Remove decisions older than maxAgeDays from the store.
 *
 * @param store - Current store
 * @param maxAgeDays - Maximum age in days
 * @param referenceDate - Date to calculate from
 * @returns New store with old decisions removed
 */
export function pruneOldDecisions(
  store: SubstitutionLearningStore,
  maxAgeDays: number,
  referenceDate: Date = new Date()
): SubstitutionLearningStore {
  const cutoffMs = referenceDate.getTime() - maxAgeDays * 24 * 60 * 60 * 1000;

  const prunedDecisions = store.decisions.filter(
    (d) => new Date(d.timestamp).getTime() >= cutoffMs
  );

  return {
    ...store,
    decisions: prunedDecisions,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Merge two stores (for syncing across devices/sessions).
 * Uses decision IDs to deduplicate.
 *
 * @param store1 - First store
 * @param store2 - Second store
 * @returns Merged store
 */
export function mergeStores(
  store1: SubstitutionLearningStore,
  store2: SubstitutionLearningStore
): SubstitutionLearningStore {
  // Verify same household
  if (store1.householdId !== store2.householdId) {
    throw new Error('Cannot merge stores from different households');
  }

  // Deduplicate decisions by ID
  const decisionMap = new Map<string, SubstitutionDecision>();
  for (const d of store1.decisions) {
    decisionMap.set(d.id, d);
  }
  for (const d of store2.decisions) {
    // Later decision wins if same ID
    decisionMap.set(d.id, d);
  }

  // Sort by timestamp
  const mergedDecisions = Array.from(decisionMap.values()).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return {
    version: LEARNING_SCHEMA_VERSION,
    householdId: store1.householdId,
    decisions: mergedDecisions,
    // Tolerances and signals will be recalculated
    categoryTolerances: [],
    brandPatterns: [],
    productSignals: [],
    updatedAt: new Date().toISOString(),
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Calculate the recency weight for a decision.
 * More recent decisions get higher weight.
 *
 * @param decision - The decision
 * @param config - Learning config with recencyBias
 * @param referenceDate - Date to calculate from
 * @returns Weight between 0 and 1
 */
export function calculateRecencyWeight(
  decision: SubstitutionDecision,
  config: LearningConfig,
  referenceDate: Date = new Date()
): number {
  const decisionAge = referenceDate.getTime() - new Date(decision.timestamp).getTime();
  const maxAgeMs = config.maxDecisionAgeDays * 24 * 60 * 60 * 1000;

  // If older than max age, weight is 0
  if (decisionAge >= maxAgeMs) {
    return 0;
  }

  // Linear decay from 1 to (1 - recencyBias) over maxAgeDays
  const ageRatio = decisionAge / maxAgeMs;
  const baseWeight = 1 - ageRatio * config.recencyBias;

  return Math.max(0, Math.min(1, baseWeight));
}

/**
 * Check if we have enough decisions to start learning for a category.
 *
 * @param store - Learning store
 * @param category - Category to check
 * @param config - Learning config with minDecisionsForLearning
 * @returns True if we have enough decisions
 */
export function hasEnoughDecisionsForLearning(
  store: SubstitutionLearningStore,
  category: string,
  config: LearningConfig
): boolean {
  const categoryDecisions = getDecisionsByCategory(store, category);
  return categoryDecisions.length >= config.minDecisionsForLearning;
}
