/**
 * Slot Scout Worker Types
 *
 * Types for scouting and reporting delivery slot options.
 */

import { z } from 'zod';

// =============================================================================
// Delivery Slot
// =============================================================================

/**
 * Status of a delivery slot
 */
export const SlotStatusSchema = z.enum([
  'available',
  'limited', // Few spots left
  'full',
  'unavailable',
  'unknown',
]);

export type SlotStatus = z.infer<typeof SlotStatusSchema>;

/**
 * Delivery type
 */
export const DeliveryTypeSchema = z.enum([
  'standard', // Regular home delivery
  'express', // Same-day or faster
  'pickup', // Click & collect
  'unknown',
]);

export type DeliveryType = z.infer<typeof DeliveryTypeSchema>;

/**
 * A single delivery slot
 */
export const DeliverySlotSchema = z.object({
  /** Unique slot identifier */
  slotId: z.string().optional(),
  /** Date of delivery */
  date: z.date(),
  /** Day of week (0=Sunday, 6=Saturday) */
  dayOfWeek: z.number().int().min(0).max(6),
  /** Start time (HH:MM format) */
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  /** End time (HH:MM format) */
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  /** Slot availability status */
  status: SlotStatusSchema,
  /** Delivery cost in euros */
  deliveryCost: z.number().nonnegative().optional(),
  /** Whether delivery is free above a threshold */
  freeAboveThreshold: z.boolean().optional(),
  /** Threshold for free delivery */
  freeDeliveryThreshold: z.number().nonnegative().optional(),
  /** Type of delivery */
  deliveryType: DeliveryTypeSchema.default('standard'),
  /** Any special notes about this slot */
  note: z.string().optional(),
});

export type DeliverySlot = z.infer<typeof DeliverySlotSchema>;

/**
 * Slots grouped by date
 */
export const DaySlotGroupSchema = z.object({
  /** Date string (YYYY-MM-DD) */
  dateString: z.string(),
  /** Full date */
  date: z.date(),
  /** Day name (e.g., "Segunda-feira") */
  dayName: z.string(),
  /** Available slots for this day */
  slots: z.array(DeliverySlotSchema),
  /** Number of available slots */
  availableCount: z.number().int().nonnegative(),
  /** Whether any slots are available */
  hasAvailability: z.boolean(),
});

export type DaySlotGroup = z.infer<typeof DaySlotGroupSchema>;

// =============================================================================
// Slot Preferences
// =============================================================================

/**
 * Time window preference
 */
export const TimeWindowPreferenceSchema = z.object({
  /** Earliest acceptable time (HH:MM) */
  earliest: z.string().regex(/^\d{2}:\d{2}$/).default('08:00'),
  /** Latest acceptable time (HH:MM) */
  latest: z.string().regex(/^\d{2}:\d{2}$/).default('20:00'),
});

export type TimeWindowPreference = z.infer<typeof TimeWindowPreferenceSchema>;

/**
 * User preferences for slot selection
 */
export const SlotPreferencesSchema = z.object({
  /** Preferred days (0=Sunday, 6=Saturday) */
  preferredDays: z.array(z.number().int().min(0).max(6)).optional(),
  /** Days to avoid */
  avoidDays: z.array(z.number().int().min(0).max(6)).optional(),
  /** Preferred time window */
  timeWindow: TimeWindowPreferenceSchema.optional(),
  /** Prefer morning slots */
  preferMorning: z.boolean().optional(),
  /** Prefer evening slots */
  preferEvening: z.boolean().optional(),
  /** Maximum days to wait for delivery */
  maxDaysAhead: z.number().int().positive().default(14),
  /** Prefer free delivery */
  preferFreeDelivery: z.boolean().default(true),
  /** Maximum delivery cost willing to pay */
  maxDeliveryCost: z.number().nonnegative().optional(),
  /** Preferred delivery type */
  preferredDeliveryType: DeliveryTypeSchema.optional(),
});

export type SlotPreferences = z.infer<typeof SlotPreferencesSchema>;

// =============================================================================
// Slot Scoring
// =============================================================================

/**
 * Score breakdown for a slot
 */
export const SlotScoreSchema = z.object({
  /** Day preference match (0-1) */
  dayScore: z.number().min(0).max(1),
  /** Time preference match (0-1) */
  timeScore: z.number().min(0).max(1),
  /** Cost score (0-1, 1 = free) */
  costScore: z.number().min(0).max(1),
  /** Availability score (0-1, 1 = fully available) */
  availabilityScore: z.number().min(0).max(1),
  /** How soon (0-1, 1 = soonest) */
  urgencyScore: z.number().min(0).max(1),
  /** Overall weighted score */
  overall: z.number().min(0).max(1),
});

export type SlotScore = z.infer<typeof SlotScoreSchema>;

/**
 * A ranked slot option
 */
export const RankedSlotSchema = z.object({
  /** The slot */
  slot: DeliverySlotSchema,
  /** Score breakdown */
  score: SlotScoreSchema,
  /** Why this slot is recommended */
  reason: z.string(),
  /** Rank (1 = best) */
  rank: z.number().int().positive(),
  // Convenience fields (flattened from slot for display)
  /** Day name in Portuguese (e.g., "Quarta-feira") */
  dayName: z.string().optional(),
  /** Start time (HH:MM format) */
  startTime: z.string().optional(),
  /** End time (HH:MM format) */
  endTime: z.string().optional(),
  /** Delivery cost in euros */
  price: z.number().optional(),
  /** Date of delivery */
  date: z.date().optional(),
});

export type RankedSlot = z.infer<typeof RankedSlotSchema>;

// =============================================================================
// Slot Scout Worker Interface
// =============================================================================

/**
 * Configuration for the Slot Scout Worker
 */
export const SlotScoutConfigSchema = z.object({
  /** Number of days ahead to scout */
  daysAhead: z.number().int().positive().default(14),
  /** Maximum slots to return */
  maxSlots: z.number().int().positive().default(10),
  /** Timeout for slot page load (ms) */
  pageTimeout: z.number().int().positive().default(30000),
  /** Scoring weights */
  weights: z
    .object({
      day: z.number().min(0).max(1).default(0.2),
      time: z.number().min(0).max(1).default(0.25),
      cost: z.number().min(0).max(1).default(0.2),
      availability: z.number().min(0).max(1).default(0.15),
      urgency: z.number().min(0).max(1).default(0.2),
    })
    .optional(),
});

export type SlotScoutConfig = z.infer<typeof SlotScoutConfigSchema>;

/**
 * Input to the Slot Scout Worker
 */
export const SlotScoutInputSchema = z.object({
  /** User's slot preferences */
  preferences: SlotPreferencesSchema.optional(),
  /** Configuration overrides */
  config: SlotScoutConfigSchema.partial().optional(),
  /** Current cart total (for free delivery threshold) */
  cartTotal: z.number().nonnegative().optional(),
});

export type SlotScoutInput = z.infer<typeof SlotScoutInputSchema>;

/**
 * Output from the Slot Scout Worker
 */
export const SlotScoutOutputSchema = z.object({
  /** All available slots by day */
  slotsByDay: z.array(DaySlotGroupSchema),
  /** Top ranked slots */
  rankedSlots: z.array(RankedSlotSchema),
  /** Summary */
  summary: z.object({
    /** Total days checked */
    daysChecked: z.number().int().nonnegative(),
    /** Total slots found */
    totalSlots: z.number().int().nonnegative(),
    /** Total available slots */
    availableSlots: z.number().int().nonnegative(),
    /** Earliest available date */
    earliestAvailable: z.date().optional(),
    /** Cheapest delivery option */
    cheapestDelivery: z.number().nonnegative().optional(),
    /** Whether free delivery is available */
    freeDeliveryAvailable: z.boolean(),
  }),
  /** Minimum cart value for delivery (if applicable) */
  minimumOrder: z.number().nonnegative().optional(),
  /** URL where slots were found */
  sourceUrl: z.string().url().optional(),
  /** When the scout was completed */
  scoutedAt: z.date(),
});

export type SlotScoutOutput = z.infer<typeof SlotScoutOutputSchema>;

// =============================================================================
// Portuguese Day Names
// =============================================================================

/**
 * Day names in Portuguese
 */
export const PORTUGUESE_DAY_NAMES = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
] as const;

/**
 * Get Portuguese day name from day of week
 */
export function getPortugueseDayName(dayOfWeek: number): string {
  return PORTUGUESE_DAY_NAMES[dayOfWeek] ?? 'Unknown';
}
