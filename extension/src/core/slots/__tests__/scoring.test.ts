/**
 * Slot Scoring Tests
 *
 * Comprehensive tests for slot scoring logic.
 */

import { describe, it, expect } from 'vitest';
import {
  scoreSlot,
  scoreSlots,
  recommendSlots,
  calculateDayScore,
  calculateTimeScore,
  calculateFeeScore,
  calculateAvailabilityScore,
} from '../scoring.js';
import type {
  DeliverySlot,
  SlotPreferences,
  ScoredSlot,
} from '../../../types/slots.js';
import { DEFAULT_SLOT_PREFERENCES } from '../../../types/slots.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const createSlot = (overrides: Partial<DeliverySlot> = {}): DeliverySlot => ({
  id: 'test-slot-1',
  date: '2026-01-18',
  dayOfWeek: 'saturday',
  timeStart: '10:00',
  timeEnd: '12:00',
  fee: 2.99,
  available: true,
  ...overrides,
});

const createPreferences = (
  overrides: Partial<SlotPreferences> = {}
): SlotPreferences => ({
  ...DEFAULT_SLOT_PREFERENCES,
  ...overrides,
});

// ============================================================================
// calculateDayScore Tests
// ============================================================================

describe('calculateDayScore', () => {
  it('returns 100 for a preferred day', () => {
    expect(calculateDayScore('saturday', ['saturday', 'sunday'])).toBe(100);
    expect(calculateDayScore('sunday', ['saturday', 'sunday'])).toBe(100);
  });

  it('returns 50 for a day adjacent to preferred days', () => {
    // Friday is adjacent to Saturday
    expect(calculateDayScore('friday', ['saturday'])).toBe(50);
    // Monday is adjacent to Sunday
    expect(calculateDayScore('monday', ['sunday'])).toBe(50);
  });

  it('returns 20 for non-preferred, non-adjacent days', () => {
    // Wednesday is not adjacent to weekend
    expect(calculateDayScore('wednesday', ['saturday', 'sunday'])).toBe(20);
    // Tuesday is not adjacent to weekend
    expect(calculateDayScore('tuesday', ['saturday', 'sunday'])).toBe(20);
  });

  it('returns 50 when no preferred days are specified', () => {
    expect(calculateDayScore('monday', [])).toBe(50);
    expect(calculateDayScore('friday', [])).toBe(50);
  });

  it('handles case-insensitive day names', () => {
    expect(calculateDayScore('SATURDAY', ['saturday'])).toBe(100);
    expect(calculateDayScore('Saturday', ['saturday'])).toBe(100);
  });
});

// ============================================================================
// calculateTimeScore Tests
// ============================================================================

describe('calculateTimeScore', () => {
  it('returns 100 for full overlap with preferred window', () => {
    // Slot 10:00-12:00, preferred 10:00-14:00 = full overlap
    expect(calculateTimeScore('10:00', '12:00', '10:00', '14:00')).toBe(100);
  });

  it('returns partial score for partial overlap', () => {
    // Slot 09:00-11:00, preferred 10:00-14:00 = 1 hour overlap out of 2
    const score = calculateTimeScore('09:00', '11:00', '10:00', '14:00');
    expect(score).toBe(50);
  });

  it('returns decreasing score for slots outside preferred window', () => {
    // Slot 08:00-09:00, preferred 10:00-14:00 = 1 hour before
    const score1 = calculateTimeScore('08:00', '09:00', '10:00', '14:00');
    expect(score1).toBeGreaterThan(0);
    expect(score1).toBeLessThan(80);

    // Slot 06:00-07:00, preferred 10:00-14:00 = 3 hours before
    const score2 = calculateTimeScore('06:00', '07:00', '10:00', '14:00');
    expect(score2).toBeLessThan(score1);
  });

  it('returns 0 for slots very far from preferred window', () => {
    // Slot 06:00-07:00, preferred 18:00-20:00 = 11 hours away
    const score = calculateTimeScore('06:00', '07:00', '18:00', '20:00');
    expect(score).toBe(0);
  });

  it('handles evening slots correctly', () => {
    // Slot 18:00-20:00, preferred 18:00-21:00 = full overlap
    expect(calculateTimeScore('18:00', '20:00', '18:00', '21:00')).toBe(100);
  });
});

// ============================================================================
// calculateFeeScore Tests
// ============================================================================

describe('calculateFeeScore', () => {
  it('returns 100 for free delivery', () => {
    expect(calculateFeeScore(0, 5.99)).toBe(100);
    expect(calculateFeeScore(0, 5.99, true)).toBe(100);
  });

  it('returns 100 when isFree flag is set regardless of fee', () => {
    expect(calculateFeeScore(2.99, 5.99, true)).toBe(100);
  });

  it('returns 50 for fee at maxFee', () => {
    const score = calculateFeeScore(5.99, 5.99);
    expect(score).toBe(50);
  });

  it('returns 0 for fee at maxFee * 2', () => {
    const score = calculateFeeScore(11.98, 5.99);
    expect(score).toBe(0);
  });

  it('returns proportional scores for intermediate fees', () => {
    const maxFee = 10;
    // Fee of 5 = 75 (halfway to maxFee)
    expect(calculateFeeScore(5, maxFee)).toBe(75);
    // Fee of 10 = 50 (at maxFee)
    expect(calculateFeeScore(10, maxFee)).toBe(50);
    // Fee of 15 = 25 (halfway to maxFee*2)
    expect(calculateFeeScore(15, maxFee)).toBe(25);
  });

  it('never returns negative scores', () => {
    expect(calculateFeeScore(100, 5.99)).toBe(0);
    expect(calculateFeeScore(1000, 5.99)).toBe(0);
  });
});

// ============================================================================
// calculateAvailabilityScore Tests
// ============================================================================

describe('calculateAvailabilityScore', () => {
  it('returns 100 for available slots', () => {
    expect(calculateAvailabilityScore(true)).toBe(100);
  });

  it('returns 0 for unavailable slots', () => {
    expect(calculateAvailabilityScore(false)).toBe(0);
  });
});

// ============================================================================
// scoreSlot Tests
// ============================================================================

describe('scoreSlot', () => {
  it('scores a perfect match slot highly', () => {
    const slot = createSlot({
      dayOfWeek: 'saturday',
      timeStart: '10:00',
      timeEnd: '12:00',
      fee: 0,
      available: true,
    });

    const preferences = createPreferences({
      preferredDays: ['saturday'],
      preferredTimeStart: '10:00',
      preferredTimeEnd: '14:00',
    });

    const scored = scoreSlot(slot, preferences);

    expect(scored.score).toBeGreaterThanOrEqual(95);
    expect(scored.scoreBreakdown.dayScore).toBe(100);
    expect(scored.scoreBreakdown.timeScore).toBe(100);
    expect(scored.scoreBreakdown.feeScore).toBe(100);
    expect(scored.scoreBreakdown.availabilityScore).toBe(100);
  });

  it('returns 0 for unavailable slots', () => {
    const slot = createSlot({
      available: false,
    });

    const preferences = createPreferences();
    const scored = scoreSlot(slot, preferences);

    expect(scored.score).toBe(0);
    expect(scored.scoreBreakdown.availabilityScore).toBe(0);
  });

  it('uses default weights when not specified', () => {
    const slot = createSlot();
    const preferences: SlotPreferences = {
      preferredDays: ['saturday'],
      preferredTimeStart: '10:00',
      preferredTimeEnd: '14:00',
      maxFee: 5.99,
      // No weights specified
    };

    const scored = scoreSlot(slot, preferences);

    // Should use defaults: day=0.4, time=0.3, fee=0.3
    expect(scored.score).toBeGreaterThan(0);
  });

  it('respects custom weights', () => {
    const slot = createSlot({
      dayOfWeek: 'saturday', // 100 day score
      timeStart: '08:00', // Lower time score
      timeEnd: '09:00',
      fee: 0, // 100 fee score
    });

    const preferencesHighDay = createPreferences({
      preferredDays: ['saturday'],
      preferredTimeStart: '14:00',
      preferredTimeEnd: '18:00',
      dayWeight: 0.8,
      timeWeight: 0.1,
      feeWeight: 0.1,
    });

    const preferencesHighTime = createPreferences({
      preferredDays: ['saturday'],
      preferredTimeStart: '14:00',
      preferredTimeEnd: '18:00',
      dayWeight: 0.1,
      timeWeight: 0.8,
      feeWeight: 0.1,
    });

    const scoredHighDay = scoreSlot(slot, preferencesHighDay);
    const scoredHighTime = scoreSlot(slot, preferencesHighTime);

    // High day weight should result in higher score (day matches perfectly)
    expect(scoredHighDay.score).toBeGreaterThan(scoredHighTime.score);
  });

  it('generates appropriate reason for preferred day', () => {
    const slot = createSlot({
      dayOfWeek: 'saturday',
      timeStart: '10:00',
      timeEnd: '12:00',
    });

    const preferences = createPreferences({
      preferredDays: ['saturday'],
    });

    const scored = scoreSlot(slot, preferences);
    expect(scored.reason).toContain('Saturday');
  });

  it('generates reason for free delivery', () => {
    const slot = createSlot({
      fee: 0,
      isFree: true,
    });

    const scored = scoreSlot(slot, createPreferences());
    expect(scored.reason.toLowerCase()).toContain('free');
  });

  it('preserves all original slot properties', () => {
    const slot = createSlot({
      id: 'unique-id-123',
      date: '2026-02-15',
      remainingCapacity: 'low',
    });

    const scored = scoreSlot(slot, createPreferences());

    expect(scored.id).toBe('unique-id-123');
    expect(scored.date).toBe('2026-02-15');
    expect(scored.remainingCapacity).toBe('low');
  });
});

// ============================================================================
// scoreSlots Tests
// ============================================================================

describe('scoreSlots', () => {
  it('returns slots sorted by score descending', () => {
    const slots: DeliverySlot[] = [
      createSlot({ id: 'low', dayOfWeek: 'wednesday', fee: 10 }),
      createSlot({ id: 'high', dayOfWeek: 'saturday', fee: 0 }),
      createSlot({ id: 'medium', dayOfWeek: 'friday', fee: 3 }),
    ];

    const preferences = createPreferences({
      preferredDays: ['saturday'],
    });

    const scored = scoreSlots(slots, preferences);

    expect(scored[0]!.id).toBe('high');
    expect(scored[0]!.score).toBeGreaterThan(scored[1]!.score);
    expect(scored[1]!.score).toBeGreaterThan(scored[2]!.score);
  });

  it('breaks ties by date (earlier first)', () => {
    const slots: DeliverySlot[] = [
      createSlot({ id: 'later', date: '2026-01-20' }),
      createSlot({ id: 'earlier', date: '2026-01-18' }),
    ];

    const scored = scoreSlots(slots, createPreferences());

    // Same score, earlier date should be first
    expect(scored[0]!.id).toBe('earlier');
    expect(scored[1]!.id).toBe('later');
  });

  it('breaks ties by time (earlier first)', () => {
    const slots: DeliverySlot[] = [
      createSlot({ id: 'afternoon', date: '2026-01-18', timeStart: '14:00' }),
      createSlot({ id: 'morning', date: '2026-01-18', timeStart: '10:00' }),
    ];

    const scored = scoreSlots(slots, createPreferences());

    expect(scored[0]!.id).toBe('morning');
    expect(scored[1]!.id).toBe('afternoon');
  });

  it('returns empty array for empty input', () => {
    const scored = scoreSlots([], createPreferences());
    expect(scored).toEqual([]);
  });

  it('handles single slot', () => {
    const slots = [createSlot()];
    const scored = scoreSlots(slots, createPreferences());

    expect(scored.length).toBe(1);
    expect(scored[0]!.score).toBeGreaterThan(0);
  });
});

// ============================================================================
// recommendSlots Tests
// ============================================================================

describe('recommendSlots', () => {
  const createScoredSlot = (
    overrides: Partial<ScoredSlot> = {}
  ): ScoredSlot => ({
    ...createSlot(),
    score: 80,
    scoreBreakdown: {
      dayScore: 100,
      timeScore: 80,
      feeScore: 75,
      availabilityScore: 100,
    },
    reason: 'Test slot',
    ...overrides,
  });

  it('returns top 3 slots in recommended', () => {
    const scoredSlots: ScoredSlot[] = [
      createScoredSlot({ id: '1', score: 95 }),
      createScoredSlot({ id: '2', score: 90 }),
      createScoredSlot({ id: '3', score: 85 }),
      createScoredSlot({ id: '4', score: 80 }),
      createScoredSlot({ id: '5', score: 75 }),
    ];

    const recommendations = recommendSlots(scoredSlots);

    expect(recommendations.recommended.length).toBe(3);
    expect(recommendations.recommended[0]!.id).toBe('1');
    expect(recommendations.recommended[1]!.id).toBe('2');
    expect(recommendations.recommended[2]!.id).toBe('3');
  });

  it('excludes unavailable slots from recommended', () => {
    const scoredSlots: ScoredSlot[] = [
      createScoredSlot({ id: 'available', score: 80, available: true }),
      createScoredSlot({ id: 'unavailable', score: 90, available: false }),
    ];

    const recommendations = recommendSlots(scoredSlots);

    expect(recommendations.recommended.length).toBe(1);
    expect(recommendations.recommended[0]!.id).toBe('available');
  });

  it('identifies best free slot', () => {
    const scoredSlots: ScoredSlot[] = [
      createScoredSlot({ id: 'paid', fee: 5.99, isFree: false }),
      createScoredSlot({ id: 'free', fee: 0, isFree: true }),
    ];

    const recommendations = recommendSlots(scoredSlots);

    expect(recommendations.bestFreeSlot).toBeDefined();
    expect(recommendations.bestFreeSlot?.id).toBe('free');
    expect(recommendations.bestFreeSlot?.reason).toContain('Free');
  });

  it('returns undefined for bestFreeSlot when none exist', () => {
    const scoredSlots: ScoredSlot[] = [
      createScoredSlot({ id: 'paid1', fee: 3.99 }),
      createScoredSlot({ id: 'paid2', fee: 5.99 }),
    ];

    const recommendations = recommendSlots(scoredSlots);

    expect(recommendations.bestFreeSlot).toBeUndefined();
  });

  it('identifies cheapest slot', () => {
    const scoredSlots: ScoredSlot[] = [
      createScoredSlot({ id: 'expensive', fee: 7.99 }),
      createScoredSlot({ id: 'cheap', fee: 1.99 }),
      createScoredSlot({ id: 'medium', fee: 4.99 }),
    ];

    const recommendations = recommendSlots(scoredSlots);

    expect(recommendations.cheapestSlot).toBeDefined();
    expect(recommendations.cheapestSlot?.id).toBe('cheap');
    expect(recommendations.cheapestSlot?.reason).toContain('Cheapest');
  });

  it('identifies soonest slot', () => {
    const scoredSlots: ScoredSlot[] = [
      createScoredSlot({
        id: 'later',
        date: '2026-01-25',
        timeStart: '10:00',
      }),
      createScoredSlot({
        id: 'earliest',
        date: '2026-01-18',
        timeStart: '09:00',
      }),
      createScoredSlot({
        id: 'sameday',
        date: '2026-01-18',
        timeStart: '14:00',
      }),
    ];

    const recommendations = recommendSlots(scoredSlots);

    expect(recommendations.soonestSlot).toBeDefined();
    expect(recommendations.soonestSlot?.id).toBe('earliest');
    expect(recommendations.soonestSlot?.reason).toContain('Soonest');
  });

  it('returns all slots in allSlots', () => {
    const scoredSlots: ScoredSlot[] = [
      createScoredSlot({ id: '1' }),
      createScoredSlot({ id: '2' }),
    ];

    const recommendations = recommendSlots(scoredSlots);

    expect(recommendations.allSlots.length).toBe(2);
    expect(recommendations.allSlots).toEqual(scoredSlots);
  });

  it('handles empty input', () => {
    const recommendations = recommendSlots([]);

    expect(recommendations.recommended).toEqual([]);
    expect(recommendations.allSlots).toEqual([]);
    expect(recommendations.bestFreeSlot).toBeUndefined();
    expect(recommendations.cheapestSlot).toBeUndefined();
    expect(recommendations.soonestSlot).toBeUndefined();
  });

  it('handles all unavailable slots', () => {
    const scoredSlots: ScoredSlot[] = [
      createScoredSlot({ id: '1', available: false }),
      createScoredSlot({ id: '2', available: false }),
    ];

    const recommendations = recommendSlots(scoredSlots);

    expect(recommendations.recommended).toEqual([]);
    expect(recommendations.cheapestSlot).toBeUndefined();
    expect(recommendations.soonestSlot).toBeUndefined();
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  it('handles slots with zero duration', () => {
    const slot = createSlot({
      timeStart: '10:00',
      timeEnd: '10:00',
    });

    // Should not crash, may return edge case scores
    const scored = scoreSlot(slot, createPreferences());
    expect(scored.score).toBeGreaterThanOrEqual(0);
  });

  it('handles negative fees (promotional credits)', () => {
    const slot = createSlot({
      fee: -1.0, // Credit
    });

    const scored = scoreSlot(slot, createPreferences());
    expect(scored.scoreBreakdown.feeScore).toBe(100); // Should cap at 100
  });

  it('handles very high fees', () => {
    const slot = createSlot({
      fee: 999.99,
    });

    const scored = scoreSlot(slot, createPreferences());
    expect(scored.scoreBreakdown.feeScore).toBe(0);
  });

  it('handles unusual day names gracefully', () => {
    const slot = createSlot({
      dayOfWeek: 'MONDAY',
    });

    const preferences = createPreferences({
      preferredDays: ['monday'],
    });

    const scored = scoreSlot(slot, preferences);
    expect(scored.scoreBreakdown.dayScore).toBe(100);
  });

  it('handles time format edge cases', () => {
    const slot = createSlot({
      timeStart: '00:00',
      timeEnd: '23:59',
    });

    const scored = scoreSlot(slot, createPreferences());
    expect(scored.scoreBreakdown.timeScore).toBeGreaterThan(0);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Integration: Full scoring flow', () => {
  it('scores and recommends a realistic set of slots', () => {
    const slots: DeliverySlot[] = [
      createSlot({
        id: 'sat-morning-free',
        dayOfWeek: 'saturday',
        date: '2026-01-18',
        timeStart: '10:00',
        timeEnd: '12:00',
        fee: 0,
        isFree: true,
        available: true,
      }),
      createSlot({
        id: 'sat-afternoon-paid',
        dayOfWeek: 'saturday',
        date: '2026-01-18',
        timeStart: '14:00',
        timeEnd: '16:00',
        fee: 3.99,
        available: true,
      }),
      createSlot({
        id: 'sun-morning-unavailable',
        dayOfWeek: 'sunday',
        date: '2026-01-19',
        timeStart: '10:00',
        timeEnd: '12:00',
        fee: 0,
        available: false,
      }),
      createSlot({
        id: 'mon-evening',
        dayOfWeek: 'monday',
        date: '2026-01-20',
        timeStart: '18:00',
        timeEnd: '20:00',
        fee: 5.99,
        available: true,
      }),
      createSlot({
        id: 'tue-cheap',
        dayOfWeek: 'tuesday',
        date: '2026-01-21',
        timeStart: '16:00',
        timeEnd: '18:00',
        fee: 1.99,
        available: true,
      }),
    ];

    const preferences = createPreferences({
      preferredDays: ['saturday', 'sunday'],
      preferredTimeStart: '10:00',
      preferredTimeEnd: '14:00',
      maxFee: 5.99,
    });

    const scored = scoreSlots(slots, preferences);
    const recommendations = recommendSlots(scored);

    // Saturday morning free should be best
    expect(recommendations.recommended[0]!.id).toBe('sat-morning-free');

    // Best free slot should be Saturday morning
    expect(recommendations.bestFreeSlot?.id).toBe('sat-morning-free');

    // Cheapest should be sat-morning-free (0) or tue-cheap (1.99)
    expect(recommendations.cheapestSlot?.fee).toBeLessThanOrEqual(1.99);

    // Soonest should be Saturday (earliest date)
    expect(recommendations.soonestSlot?.date).toBe('2026-01-18');

    // Unavailable slot should have score 0
    const unavailableSlot = scored.find(
      (s) => s.id === 'sun-morning-unavailable'
    );
    expect(unavailableSlot?.score).toBe(0);

    // All slots should be returned
    expect(recommendations.allSlots.length).toBe(5);
  });
});
