/**
 * Slot Scoring Functions
 *
 * Pure functions for scoring and ranking delivery slots based on preferences.
 */

import type {
  DeliverySlot,
  SlotPreferences,
  SlotScore,
  SlotScoutConfig,
  RankedSlot,
} from './types.js';

/**
 * Default scoring weights
 */
const DEFAULT_WEIGHTS = {
  day: 0.2,
  time: 0.25,
  cost: 0.2,
  availability: 0.15,
  urgency: 0.2,
};

/**
 * Score a slot's day preference match.
 *
 * @param slot - The delivery slot
 * @param preferences - User preferences
 * @returns Score from 0-1 (1 = preferred day, 0 = avoided day, 0.5 = neutral)
 */
export function scoreDayPreference(slot: DeliverySlot, preferences?: SlotPreferences): number {
  if (!preferences) return 0.5;

  const { dayOfWeek } = slot;
  const { preferredDays = [], avoidDays = [] } = preferences;

  // Check if day is explicitly avoided
  if (avoidDays.includes(dayOfWeek)) {
    return 0.0;
  }

  // Check if day is preferred
  if (preferredDays.length > 0 && preferredDays.includes(dayOfWeek)) {
    return 1.0;
  }

  // Neutral if no preferences or day not mentioned
  return 0.5;
}

/**
 * Score a slot's time window match.
 *
 * @param slot - The delivery slot
 * @param preferences - User preferences
 * @returns Score from 0-1 (1 = perfect time match)
 */
export function scoreTimePreference(slot: DeliverySlot, preferences?: SlotPreferences): number {
  if (!preferences) return 0.5;

  const { startTime, endTime } = slot;
  const { timeWindow, preferMorning, preferEvening } = preferences;

  // Parse time strings to hours (HH:MM -> numeric hour)
  const slotStartHour = parseInt(startTime.split(':')[0] ?? '0', 10);
  const slotEndHour = parseInt(endTime.split(':')[0] ?? '0', 10);

  // Check against explicit time window if provided
  if (timeWindow) {
    const earliestHour = parseInt(timeWindow.earliest.split(':')[0] ?? '0', 10);
    const latestHour = parseInt(timeWindow.latest.split(':')[0] ?? '0', 10);

    // Slot must start after earliest and end before latest
    const startsInWindow = slotStartHour >= earliestHour;
    const endsInWindow = slotEndHour <= latestHour;

    if (!startsInWindow || !endsInWindow) {
      return 0.0; // Outside acceptable window
    }

    // Full score if within window
    return 1.0;
  }

  // Check morning/evening preferences
  if (preferMorning && slotStartHour < 12) {
    return 1.0;
  }

  if (preferEvening && slotStartHour >= 17) {
    return 1.0;
  }

  // Neutral if no specific time preferences
  return 0.5;
}

/**
 * Score a slot's cost.
 *
 * @param slot - The delivery slot
 * @param preferences - User preferences
 * @returns Score from 0-1 (1 = free delivery, lower for higher cost)
 */
export function scoreCost(slot: DeliverySlot, preferences?: SlotPreferences): number {
  const { deliveryCost = 0, freeAboveThreshold } = slot;
  const { preferFreeDelivery = true, maxDeliveryCost } = preferences ?? {};

  // Perfect score for free delivery
  if (deliveryCost === 0 || freeAboveThreshold) {
    return 1.0;
  }

  // Zero score if cost exceeds maximum willing to pay
  if (maxDeliveryCost !== undefined && deliveryCost > maxDeliveryCost) {
    return 0.0;
  }

  // Score based on cost (normalized)
  // Assume max reasonable cost is €10, scale accordingly
  if (preferFreeDelivery) {
    // Penalize paid delivery more heavily
    const maxCost = maxDeliveryCost ?? 10;
    return Math.max(0, 1 - deliveryCost / maxCost);
  }

  // More lenient if free delivery not strongly preferred
  const maxCost = maxDeliveryCost ?? 15;
  return Math.max(0, 1 - deliveryCost / maxCost);
}

/**
 * Score a slot's availability status.
 *
 * @param slot - The delivery slot
 * @returns Score from 0-1 (1 = available, 0.5 = limited, 0 = full/unavailable)
 */
export function scoreAvailability(slot: DeliverySlot): number {
  const { status } = slot;

  switch (status) {
    case 'available':
      return 1.0;
    case 'limited':
      return 0.5;
    case 'full':
    case 'unavailable':
      return 0.0;
    case 'unknown':
    default:
      return 0.3; // Pessimistic for unknown
  }
}

/**
 * Score a slot's urgency (how soon it is).
 *
 * @param slot - The delivery slot
 * @param preferences - User preferences
 * @returns Score from 0-1 (1 = tomorrow, decreasing for later dates)
 */
export function scoreUrgency(slot: DeliverySlot, preferences?: SlotPreferences): number {
  const { date } = slot;
  const { maxDaysAhead = 14 } = preferences ?? {};

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const slotDate = new Date(date);
  slotDate.setHours(0, 0, 0, 0);

  const daysAway = Math.floor((slotDate.getTime() - tomorrow.getTime()) / (1000 * 60 * 60 * 24));

  // Perfect score for tomorrow
  if (daysAway <= 0) {
    return 1.0;
  }

  // Linear decay over maxDaysAhead
  // 0 days = 1.0, maxDaysAhead = 0.0
  const score = Math.max(0, 1 - daysAway / maxDaysAhead);
  return score;
}

/**
 * Calculate complete score for a slot.
 *
 * @param slot - The delivery slot
 * @param preferences - User preferences
 * @param config - Scoring configuration with weights
 * @returns Complete score breakdown
 */
export function scoreSlot(
  slot: DeliverySlot,
  preferences?: SlotPreferences,
  config?: SlotScoutConfig
): SlotScore {
  const weights = config?.weights ?? DEFAULT_WEIGHTS;

  const dayScore = scoreDayPreference(slot, preferences);
  const timeScore = scoreTimePreference(slot, preferences);
  const costScore = scoreCost(slot, preferences);
  const availabilityScore = scoreAvailability(slot);
  const urgencyScore = scoreUrgency(slot, preferences);

  // Weighted sum
  const overall =
    dayScore * weights.day +
    timeScore * weights.time +
    costScore * weights.cost +
    availabilityScore * weights.availability +
    urgencyScore * weights.urgency;

  return {
    dayScore,
    timeScore,
    costScore,
    availabilityScore,
    urgencyScore,
    overall,
  };
}

/**
 * Generate a human-readable reason for a slot's score.
 *
 * @param slot - The delivery slot
 * @param score - The slot's score
 * @param preferences - User preferences
 * @returns Reason string explaining the score
 */
export function generateReason(
  _slot: DeliverySlot,
  score: SlotScore,
  _preferences?: SlotPreferences
): string {
  const reasons: string[] = [];

  // Day preference
  if (score.dayScore === 1.0) {
    reasons.push('preferred day');
  } else if (score.dayScore === 0.0) {
    reasons.push('avoided day');
  }

  // Time preference
  if (score.timeScore === 1.0) {
    reasons.push('ideal time');
  } else if (score.timeScore === 0.0) {
    reasons.push('outside preferred hours');
  }

  // Cost
  if (score.costScore === 1.0) {
    reasons.push('free delivery');
  } else if (score.costScore < 0.3) {
    reasons.push('expensive delivery');
  }

  // Availability
  if (score.availabilityScore === 1.0) {
    reasons.push('available');
  } else if (score.availabilityScore === 0.5) {
    reasons.push('limited availability');
  } else if (score.availabilityScore === 0.0) {
    reasons.push('fully booked');
  }

  // Urgency
  if (score.urgencyScore === 1.0) {
    reasons.push('soonest available');
  } else if (score.urgencyScore < 0.3) {
    reasons.push('far in advance');
  }

  if (reasons.length === 0) {
    return 'neutral match';
  }

  return reasons.join(', ');
}

/**
 * Rank slots by score.
 *
 * @param slots - Array of delivery slots to rank
 * @param preferences - User preferences
 * @param config - Scoring configuration
 * @returns Ranked slots sorted by score (highest first)
 */
export function rankSlots(
  slots: DeliverySlot[],
  preferences?: SlotPreferences,
  config?: SlotScoutConfig
): RankedSlot[] {
  // Score all slots
  const scored = slots.map((slot) => {
    const score = scoreSlot(slot, preferences, config);
    const reason = generateReason(slot, score, preferences);

    return {
      slot,
      score,
      reason,
    };
  });

  // Sort by overall score descending
  scored.sort((a, b) => b.score.overall - a.score.overall);

  // Assign ranks
  const ranked: RankedSlot[] = scored.map((item, index) => ({
    ...item,
    rank: index + 1,
  }));

  return ranked;
}
