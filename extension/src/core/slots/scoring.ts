/**
 * Slot Scoring Logic
 *
 * Pure functions for scoring and ranking delivery slots based on user preferences.
 * All functions are deterministic and side-effect free.
 *
 * @module core/slots/scoring
 */

import type {
  DeliverySlot,
  ScoredSlot,
  SlotPreferences,
  SlotRecommendation,
} from '../../types/slots.js';

/**
 * Day adjacency mapping for partial matches.
 * Adjacent days get a bonus score.
 */
const DAY_ADJACENCY: Record<string, string[]> = {
  monday: ['sunday', 'tuesday'],
  tuesday: ['monday', 'wednesday'],
  wednesday: ['tuesday', 'thursday'],
  thursday: ['wednesday', 'friday'],
  friday: ['thursday', 'saturday'],
  saturday: ['friday', 'sunday'],
  sunday: ['saturday', 'monday'],
};

/**
 * Parse time string (HH:MM) to minutes since midnight.
 *
 * @param time - Time string in HH:MM format
 * @returns Minutes since midnight (0-1439)
 */
function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map((x) => parseInt(x, 10));
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/**
 * Calculate day preference score.
 *
 * @param dayOfWeek - The slot's day of week (lowercase)
 * @param preferredDays - User's preferred days
 * @returns Score from 0-100: 100 if preferred, 50 if adjacent, 20 otherwise
 */
export function calculateDayScore(
  dayOfWeek: string,
  preferredDays: string[]
): number {
  // No preference means all days are equal
  if (preferredDays.length === 0) {
    return 50;
  }

  const normalizedDay = dayOfWeek.toLowerCase();

  // Perfect match
  if (preferredDays.includes(normalizedDay)) {
    return 100;
  }

  // Check if adjacent to a preferred day
  const adjacentDays = DAY_ADJACENCY[normalizedDay] ?? [];
  const isAdjacent = preferredDays.some((preferred) =>
    adjacentDays.includes(preferred.toLowerCase())
  );

  if (isAdjacent) {
    return 50;
  }

  // Not preferred and not adjacent
  return 20;
}

/**
 * Calculate time preference score based on overlap with preferred window.
 *
 * @param slotStart - Slot start time (HH:MM)
 * @param slotEnd - Slot end time (HH:MM)
 * @param preferredStart - Preferred window start (HH:MM)
 * @param preferredEnd - Preferred window end (HH:MM)
 * @returns Score from 0-100: 100 for full overlap, decreasing with distance
 */
export function calculateTimeScore(
  slotStart: string,
  slotEnd: string,
  preferredStart: string,
  preferredEnd: string
): number {
  const slotStartMins = parseTimeToMinutes(slotStart);
  const slotEndMins = parseTimeToMinutes(slotEnd);
  const prefStartMins = parseTimeToMinutes(preferredStart);
  const prefEndMins = parseTimeToMinutes(preferredEnd);

  // Calculate overlap
  const overlapStart = Math.max(slotStartMins, prefStartMins);
  const overlapEnd = Math.min(slotEndMins, prefEndMins);
  const overlapMinutes = Math.max(0, overlapEnd - overlapStart);

  const slotDuration = slotEndMins - slotStartMins;

  // Full overlap = 100
  if (overlapMinutes > 0) {
    // Score based on how much of the slot overlaps with preference
    const overlapRatio = overlapMinutes / slotDuration;
    return Math.round(100 * overlapRatio);
  }

  // No overlap - score based on distance from preferred window
  // Calculate distance in hours (30 min units)
  let distance: number;
  if (slotEndMins <= prefStartMins) {
    // Slot ends before preferred window starts
    distance = prefStartMins - slotEndMins;
  } else {
    // Slot starts after preferred window ends
    distance = slotStartMins - prefEndMins;
  }

  // Score decreases with distance (each hour away = -20 points)
  const hourDistance = distance / 60;
  const score = Math.max(0, 80 - hourDistance * 20);
  return Math.round(score);
}

/**
 * Calculate fee score.
 *
 * @param fee - Delivery fee in euros
 * @param maxFee - Maximum acceptable fee
 * @param isFree - Whether slot is marked as free
 * @returns Score from 0-100: 100 if free, linear scale to 0 at maxFee*2
 */
export function calculateFeeScore(
  fee: number,
  maxFee: number,
  isFree: boolean = false
): number {
  // Free delivery = perfect score
  if (isFree || fee === 0) {
    return 100;
  }

  // Negative fees (promotional credits) get max score
  if (fee < 0) {
    return 100;
  }

  // Linear scale: 100 at 0, 50 at maxFee, 0 at maxFee*2
  const maxThreshold = maxFee * 2;
  const score = Math.max(0, 100 * (1 - fee / maxThreshold));
  return Math.round(score);
}

/**
 * Calculate availability score.
 *
 * @param available - Whether the slot is available
 * @returns 100 if available, 0 if not
 */
export function calculateAvailabilityScore(available: boolean): number {
  return available ? 100 : 0;
}

/**
 * Generate human-readable reason for slot recommendation.
 *
 * @param slot - The scored slot
 * @param breakdown - Score breakdown
 * @param preferences - User preferences
 * @returns Descriptive reason string
 */
function generateReason(
  slot: DeliverySlot,
  breakdown: ScoredSlot['scoreBreakdown'],
  preferences: SlotPreferences
): string {
  const reasons: string[] = [];

  // Check day match
  if (
    breakdown.dayScore === 100 &&
    preferences.preferredDays.length > 0
  ) {
    const dayName = slot.dayOfWeek.charAt(0).toUpperCase() + slot.dayOfWeek.slice(1);
    reasons.push(dayName);
  }

  // Check time match
  if (breakdown.timeScore >= 80) {
    const startHour = parseInt(slot.timeStart.split(':')[0] ?? '0', 10);
    if (startHour < 12) {
      reasons.push('morning');
    } else if (startHour < 17) {
      reasons.push('afternoon');
    } else {
      reasons.push('evening');
    }
  }

  // Check fee
  if (slot.isFree || slot.fee === 0) {
    return 'Free delivery slot';
  }

  // Build reason string
  if (reasons.length > 0) {
    return `Best match for ${reasons.join(' ')}`;
  }

  if (!slot.available) {
    return 'Unavailable';
  }

  return 'Available slot';
}

/**
 * Score a single slot against user preferences.
 *
 * @param slot - The delivery slot to score
 * @param preferences - User's slot preferences
 * @returns Scored slot with breakdown and reason
 *
 * @example
 * ```typescript
 * const slot: DeliverySlot = {
 *   id: 'slot-1',
 *   date: '2026-01-18',
 *   dayOfWeek: 'saturday',
 *   timeStart: '10:00',
 *   timeEnd: '12:00',
 *   fee: 2.99,
 *   available: true
 * };
 *
 * const preferences: SlotPreferences = {
 *   preferredDays: ['saturday'],
 *   preferredTimeStart: '10:00',
 *   preferredTimeEnd: '14:00',
 *   maxFee: 5.99
 * };
 *
 * const scored = scoreSlot(slot, preferences);
 * // scored.score = 95 (high match)
 * // scored.reason = "Best match for Saturday morning"
 * ```
 */
export function scoreSlot(
  slot: DeliverySlot,
  preferences: SlotPreferences
): ScoredSlot {
  // Get weights with defaults
  const dayWeight = preferences.dayWeight ?? 0.4;
  const timeWeight = preferences.timeWeight ?? 0.3;
  const feeWeight = preferences.feeWeight ?? 0.3;

  // Calculate individual scores
  const dayScore = calculateDayScore(slot.dayOfWeek, preferences.preferredDays);
  const timeScore = calculateTimeScore(
    slot.timeStart,
    slot.timeEnd,
    preferences.preferredTimeStart,
    preferences.preferredTimeEnd
  );
  const feeScore = calculateFeeScore(slot.fee, preferences.maxFee, slot.isFree);
  const availabilityScore = calculateAvailabilityScore(slot.available);

  const scoreBreakdown = {
    dayScore,
    timeScore,
    feeScore,
    availabilityScore,
  };

  // Combined score: weighted sum multiplied by availability (0 or 1)
  const weightedScore =
    dayScore * dayWeight + timeScore * timeWeight + feeScore * feeWeight;

  // Availability acts as a multiplier (unavailable = 0)
  const finalScore = Math.round(weightedScore * (slot.available ? 1 : 0));

  const reason = generateReason(slot, scoreBreakdown, preferences);

  return {
    ...slot,
    score: finalScore,
    scoreBreakdown,
    reason,
  };
}

/**
 * Score all slots and return sorted by score (highest first).
 *
 * @param slots - Array of delivery slots to score
 * @param preferences - User's slot preferences
 * @returns Array of scored slots, sorted by score descending
 *
 * @example
 * ```typescript
 * const slots: DeliverySlot[] = [...];
 * const scored = scoreSlots(slots, preferences);
 * console.log(scored[0]); // Highest scoring slot
 * ```
 */
export function scoreSlots(
  slots: DeliverySlot[],
  preferences: SlotPreferences
): ScoredSlot[] {
  // Score each slot
  const scoredSlots = slots.map((slot) => scoreSlot(slot, preferences));

  // Sort by score descending (highest first)
  // Secondary sort by date/time for tie-breaking
  scoredSlots.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // Tie-breaker: earlier date first
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) {
      return dateCompare;
    }
    // Tie-breaker: earlier time first
    return a.timeStart.localeCompare(b.timeStart);
  });

  return scoredSlots;
}

/**
 * Get slot recommendations including top 3, best free, cheapest, and soonest.
 *
 * @param scoredSlots - Array of already-scored slots
 * @returns Recommendation object with categorized slots
 *
 * @example
 * ```typescript
 * const scored = scoreSlots(slots, preferences);
 * const recommendations = recommendSlots(scored);
 *
 * console.log(recommendations.recommended); // Top 3 slots
 * console.log(recommendations.bestFreeSlot); // Best free option
 * console.log(recommendations.cheapestSlot); // Lowest fee
 * console.log(recommendations.soonestSlot); // Earliest delivery
 * ```
 */
export function recommendSlots(scoredSlots: ScoredSlot[]): SlotRecommendation {
  // Filter to available slots only for special recommendations
  const availableSlots = scoredSlots.filter((slot) => slot.available);

  // Top 3 recommended (already sorted by score)
  const recommended = availableSlots.slice(0, 3).map((slot) => ({
    ...slot,
    reason: slot.reason || 'Top recommendation',
  }));

  // Best free slot (highest score among free slots)
  const freeSlots = availableSlots.filter(
    (slot) => slot.isFree || slot.fee === 0
  );
  const bestFreeSlot = freeSlots.length > 0
    ? {
        ...freeSlots[0],
        reason: 'Free delivery slot',
      }
    : undefined;

  // Cheapest slot (lowest fee, then highest score for ties)
  let cheapestSlot: ScoredSlot | undefined;
  if (availableSlots.length > 0) {
    const sorted = [...availableSlots].sort((a, b) => {
      if (a.fee !== b.fee) {
        return a.fee - b.fee;
      }
      return b.score - a.score;
    });
    const first = sorted[0];
    if (first) {
      cheapestSlot = {
        ...first,
        reason: first.fee === 0 ? 'Free delivery' : 'Cheapest available option',
      };
    }
  }

  // Soonest slot (earliest date/time, then highest score for ties)
  let soonestSlot: ScoredSlot | undefined;
  if (availableSlots.length > 0) {
    const sorted = [...availableSlots].sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) {
        return dateCompare;
      }
      const timeCompare = a.timeStart.localeCompare(b.timeStart);
      if (timeCompare !== 0) {
        return timeCompare;
      }
      return b.score - a.score;
    });
    const first = sorted[0];
    if (first) {
      soonestSlot = {
        ...first,
        reason: 'Soonest delivery',
      };
    }
  }

  return {
    recommended,
    allSlots: scoredSlots,
    bestFreeSlot,
    cheapestSlot,
    soonestSlot,
  };
}
