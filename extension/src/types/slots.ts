/**
 * Delivery Slot Types
 *
 * Types for delivery slot extraction and scoring.
 */

/**
 * Delivery slot information
 */
export interface DeliverySlot {
  /** Unique slot ID */
  id: string;
  /** Delivery date (YYYY-MM-DD) */
  date: string;
  /** Day of week */
  dayOfWeek: string;
  /** Start time (HH:MM) */
  timeStart: string;
  /** End time (HH:MM) */
  timeEnd: string;
  /** Delivery fee */
  fee: number;
  /** Whether slot is available */
  available: boolean;
  /** Whether slot is on promotion/free */
  isFree?: boolean;
  /** Original fee (if discounted) */
  originalFee?: number;
  /** Remaining capacity (if shown) */
  remainingCapacity?: 'high' | 'medium' | 'low';
}

/**
 * Delivery slot with scoring
 */
export interface ScoredSlot extends DeliverySlot {
  /** Overall preference score (0-100) */
  score: number;
  /** Score breakdown */
  scoreBreakdown: {
    /** Day preference score */
    dayScore: number;
    /** Time preference score */
    timeScore: number;
    /** Fee score (lower is better) */
    feeScore: number;
    /** Availability score */
    availabilityScore: number;
  };
  /** Why this slot was recommended */
  reason: string;
}

/**
 * User preferences for slot scoring
 */
export interface SlotPreferences {
  /** Preferred days of week */
  preferredDays: string[];
  /** Preferred time range start (HH:MM) */
  preferredTimeStart: string;
  /** Preferred time range end (HH:MM) */
  preferredTimeEnd: string;
  /** Maximum acceptable fee */
  maxFee: number;
  /** Weight for day preference (0-1) */
  dayWeight?: number;
  /** Weight for time preference (0-1) */
  timeWeight?: number;
  /** Weight for fee (0-1) */
  feeWeight?: number;
}

/**
 * Default slot preferences
 */
export const DEFAULT_SLOT_PREFERENCES: SlotPreferences = {
  preferredDays: ['saturday', 'sunday'],
  preferredTimeStart: '10:00',
  preferredTimeEnd: '14:00',
  maxFee: 5.99,
  dayWeight: 0.4,
  timeWeight: 0.3,
  feeWeight: 0.3,
};

/**
 * Slot extraction result
 */
export interface SlotExtractionResult {
  /** All available slots */
  slots: DeliverySlot[];
  /** Date range covered */
  dateRange: {
    start: string;
    end: string;
  };
  /** Total available slots */
  availableCount: number;
  /** Total unavailable slots shown */
  unavailableCount: number;
  /** Extraction timestamp */
  extractedAt: number;
}

/**
 * Slot recommendation
 */
export interface SlotRecommendation {
  /** Top recommended slots (max 3) */
  recommended: ScoredSlot[];
  /** All scored slots */
  allSlots: ScoredSlot[];
  /** Best free slot (if any) */
  bestFreeSlot?: ScoredSlot;
  /** Cheapest slot */
  cheapestSlot?: ScoredSlot;
  /** Soonest available slot */
  soonestSlot?: ScoredSlot;
}
