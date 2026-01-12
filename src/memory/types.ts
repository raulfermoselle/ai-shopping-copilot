import { z } from 'zod';

// ============================================================================
// Schema Version
// ============================================================================

export const MEMORY_SCHEMA_VERSION = '1.0.0';

// ============================================================================
// Common Types
// ============================================================================

export const TimestampSchema = z.string().datetime();

export const HouseholdIdSchema = z.string().min(1);

export const ItemIdentifierSchema = z.object({
  sku: z.string().optional(),
  name: z.string(),
  barcode: z.string().optional(),
  category: z.string().optional(),
});

export type ItemIdentifier = z.infer<typeof ItemIdentifierSchema>;

// ============================================================================
// Household Preferences
// ============================================================================

export const DietaryRestrictionSchema = z.enum([
  'vegetarian',
  'vegan',
  'gluten-free',
  'lactose-intolerant',
  'kosher',
  'halal',
  'nut-free',
  'shellfish-free',
  'other',
]);

export type DietaryRestriction = z.infer<typeof DietaryRestrictionSchema>;

export const BrandPreferenceSchema = z.object({
  brand: z.string(),
  preference: z.enum(['preferred', 'acceptable', 'avoid']),
  reason: z.string().optional(),
  updatedAt: TimestampSchema,
});

export type BrandPreference = z.infer<typeof BrandPreferenceSchema>;

export const AllergySchema = z.object({
  allergen: z.string(),
  severity: z.enum(['severe', 'moderate', 'mild']),
  notes: z.string().optional(),
});

export type Allergy = z.infer<typeof AllergySchema>;

export const HouseholdPreferencesSchema = z.object({
  version: z.string(),
  householdId: HouseholdIdSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,

  // Dietary and health
  dietaryRestrictions: z.array(DietaryRestrictionSchema),
  allergies: z.array(AllergySchema),

  // Brand preferences
  brandPreferences: z.array(BrandPreferenceSchema),

  // Budget and quality
  budgetConstraints: z.object({
    maxTotalSpend: z.number().optional(),
    maxItemPrice: z.number().optional(),
    prioritizeDeals: z.boolean(),
  }).optional(),

  qualityPreferences: z.object({
    preferOrganic: z.boolean(),
    preferLocalProducts: z.boolean(),
    preferFreshOverFrozen: z.boolean(),
  }).optional(),

  // Delivery preferences
  deliveryPreferences: z.object({
    preferredDays: z.array(z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])),
    preferredTimeSlots: z.array(z.string()),
    avoidWeekends: z.boolean(),
  }).optional(),

  // Custom notes
  notes: z.string().optional(),
});

export type HouseholdPreferences = z.infer<typeof HouseholdPreferencesSchema>;

// ============================================================================
// Item Signals
// ============================================================================

export const PurchaseRecordSchema = z.object({
  date: TimestampSchema,
  quantity: z.number(),
  price: z.number().optional(),
  orderId: z.string().optional(),
});

export type PurchaseRecord = z.infer<typeof PurchaseRecordSchema>;

export const ItemSignalSchema = z.object({
  item: ItemIdentifierSchema,

  // Purchase history
  purchaseHistory: z.array(PurchaseRecordSchema),

  // Computed signals
  averageQuantity: z.number().optional(),
  typicalPrice: z.number().optional(),
  purchaseFrequency: z.number().optional(), // purchases per month

  // Preferences
  preferredVariant: z.string().optional(),
  lastPurchasedAt: TimestampSchema.optional(),

  // Metadata
  updatedAt: TimestampSchema,
});

export type ItemSignal = z.infer<typeof ItemSignalSchema>;

export const ItemSignalsStoreSchema = z.object({
  version: z.string(),
  householdId: HouseholdIdSchema,
  updatedAt: TimestampSchema,
  signals: z.array(ItemSignalSchema),
});

export type ItemSignalsStore = z.infer<typeof ItemSignalsStoreSchema>;

// ============================================================================
// Substitution History
// ============================================================================

export const SubstitutionOutcomeSchema = z.enum([
  'accepted',
  'rejected',
  'auto-approved',
  'expired',
]);

export type SubstitutionOutcome = z.infer<typeof SubstitutionOutcomeSchema>;

export const SubstitutionRecordSchema = z.object({
  id: z.string(),
  timestamp: TimestampSchema,

  // Original item
  originalItem: ItemIdentifierSchema,

  // Substitute item
  substituteItem: ItemIdentifierSchema,

  // Context
  reason: z.string(), // e.g., "out-of-stock", "price-better", "preferred-brand"

  // Price difference
  originalPrice: z.number().optional(),
  substitutePrice: z.number().optional(),
  priceDelta: z.number().optional(), // positive = more expensive
  priceDeltaPercent: z.number().optional(),

  // Outcome
  outcome: SubstitutionOutcomeSchema,
  userFeedback: z.string().optional(),

  // Learning signals
  sameBrand: z.boolean(),
  sameCategory: z.boolean(),
  similarQuality: z.boolean().optional(),

  // Session context
  runId: z.string().optional(),
});

export type SubstitutionRecord = z.infer<typeof SubstitutionRecordSchema>;

export const SubstitutionHistoryStoreSchema = z.object({
  version: z.string(),
  householdId: HouseholdIdSchema,
  updatedAt: TimestampSchema,
  records: z.array(SubstitutionRecordSchema),
});

export type SubstitutionHistoryStore = z.infer<typeof SubstitutionHistoryStoreSchema>;

// ============================================================================
// Cadence Signals
// ============================================================================

export const CategoryCadenceSchema = z.object({
  category: z.string(),

  // Learned intervals
  typicalRestockDays: z.number(), // average days between purchases
  minRestockDays: z.number(), // minimum observed
  maxRestockDays: z.number(), // maximum observed

  // Confidence
  sampleSize: z.number(), // number of observations
  confidence: z.number(), // 0-1, based on variance and sample size

  // Last purchase
  lastPurchasedAt: TimestampSchema.optional(),

  // Metadata
  updatedAt: TimestampSchema,
});

export type CategoryCadence = z.infer<typeof CategoryCadenceSchema>;

export const ItemCadenceSchema = z.object({
  item: ItemIdentifierSchema,

  // Learned intervals
  typicalRestockDays: z.number(),
  minRestockDays: z.number(),
  maxRestockDays: z.number(),

  // Confidence
  sampleSize: z.number(),
  confidence: z.number(),

  // Last purchase
  lastPurchasedAt: TimestampSchema.optional(),

  // Override category default
  overridesCategoryDefault: z.boolean(),

  // Metadata
  updatedAt: TimestampSchema,
});

export type ItemCadence = z.infer<typeof ItemCadenceSchema>;

export const CadenceSignalsStoreSchema = z.object({
  version: z.string(),
  householdId: HouseholdIdSchema,
  updatedAt: TimestampSchema,

  // Category-level cadence (default for items in that category)
  categoryCadences: z.array(CategoryCadenceSchema),

  // Item-level cadence (overrides category default)
  itemCadences: z.array(ItemCadenceSchema),
});

export type CadenceSignalsStore = z.infer<typeof CadenceSignalsStoreSchema>;

// ============================================================================
// Episodic Memory
// ============================================================================

export const RunPhaseSchema = z.enum([
  'init',
  'login',
  'cart-build',
  'substitution',
  'stock-prune',
  'slot-scout',
  'review',
  'complete',
  'error',
]);

export type RunPhase = z.infer<typeof RunPhaseSchema>;

export const RunOutcomeSchema = z.enum([
  'success',
  'partial-success',
  'user-cancelled',
  'error',
  'timeout',
]);

export type RunOutcome = z.infer<typeof RunOutcomeSchema>;

export const ItemActionSchema = z.object({
  item: ItemIdentifierSchema,
  action: z.enum(['added', 'removed', 'quantity-changed', 'substituted', 'pruned']),
  reason: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type ItemAction = z.infer<typeof ItemActionSchema>;

export const EpisodicMemoryRecordSchema = z.object({
  runId: z.string(),
  householdId: HouseholdIdSchema,

  // Timing
  startedAt: TimestampSchema,
  completedAt: TimestampSchema.optional(),
  durationMs: z.number().optional(),

  // Outcome
  outcome: RunOutcomeSchema,
  finalPhase: RunPhaseSchema,

  // Actions taken
  itemsAdded: z.number(),
  itemsRemoved: z.number(),
  substitutionsMade: z.number(),
  substitutionsAccepted: z.number(),
  substitutionsRejected: z.number(),
  itemsPruned: z.number(),

  // Details
  actions: z.array(ItemActionSchema),

  // Slot selection
  selectedSlot: z.object({
    date: z.string(),
    timeRange: z.string(),
    price: z.number().optional(),
  }).optional(),

  // Cart summary
  finalCartItemCount: z.number().optional(),
  finalCartTotal: z.number().optional(),

  // User feedback
  userApproved: z.boolean().optional(),
  userFeedback: z.string().optional(),

  // Errors
  errors: z.array(z.object({
    phase: RunPhaseSchema,
    error: z.string(),
    timestamp: TimestampSchema,
  })).optional(),

  // Metadata
  agentVersion: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type EpisodicMemoryRecord = z.infer<typeof EpisodicMemoryRecordSchema>;

export const EpisodicMemoryStoreSchema = z.object({
  version: z.string(),
  householdId: HouseholdIdSchema,
  updatedAt: TimestampSchema,
  records: z.array(EpisodicMemoryRecordSchema),
});

export type EpisodicMemoryStore = z.infer<typeof EpisodicMemoryStoreSchema>;

// ============================================================================
// Store Initialization Helpers
// ============================================================================

export function createEmptyHouseholdPreferences(householdId: string): HouseholdPreferences {
  const now = new Date().toISOString();
  return {
    version: MEMORY_SCHEMA_VERSION,
    householdId,
    createdAt: now,
    updatedAt: now,
    dietaryRestrictions: [],
    allergies: [],
    brandPreferences: [],
  };
}

export function createEmptyItemSignalsStore(householdId: string): ItemSignalsStore {
  return {
    version: MEMORY_SCHEMA_VERSION,
    householdId,
    updatedAt: new Date().toISOString(),
    signals: [],
  };
}

export function createEmptySubstitutionHistoryStore(householdId: string): SubstitutionHistoryStore {
  return {
    version: MEMORY_SCHEMA_VERSION,
    householdId,
    updatedAt: new Date().toISOString(),
    records: [],
  };
}

export function createEmptyCadenceSignalsStore(householdId: string): CadenceSignalsStore {
  return {
    version: MEMORY_SCHEMA_VERSION,
    householdId,
    updatedAt: new Date().toISOString(),
    categoryCadences: [],
    itemCadences: [],
  };
}

export function createEmptyEpisodicMemoryStore(householdId: string): EpisodicMemoryStore {
  return {
    version: MEMORY_SCHEMA_VERSION,
    householdId,
    updatedAt: new Date().toISOString(),
    records: [],
  };
}
