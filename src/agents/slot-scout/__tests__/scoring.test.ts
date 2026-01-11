/**
 * Unit Tests for Slot Scout Scoring Functions
 *
 * Tests pure scoring functions that rank delivery slots based on user preferences.
 * All functions are deterministic (except urgency which depends on current date).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  scoreDayPreference,
  scoreTimePreference,
  scoreCost,
  scoreAvailability,
  scoreUrgency,
  scoreSlot,
  generateReason,
  rankSlots,
} from '../scoring.js';
import type {
  DeliverySlot,
  SlotPreferences,
  SlotScoutConfig,
  SlotScore,
} from '../types.js';

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a minimal delivery slot with required fields.
 */
function createSlot(overrides?: Partial<DeliverySlot>): DeliverySlot {
  return {
    date: new Date('2026-01-15'),
    dayOfWeek: 4, // Thursday
    startTime: '10:00',
    endTime: '12:00',
    status: 'available',
    deliveryType: 'standard',
    ...overrides,
  };
}

/**
 * Create slot preferences with optional overrides.
 */
function createPreferences(overrides?: Partial<SlotPreferences>): SlotPreferences {
  return {
    maxDaysAhead: 14,
    preferFreeDelivery: true,
    ...overrides,
  };
}

/**
 * Create scoring config with custom weights.
 */
function createConfig(weights?: Partial<SlotScoutConfig['weights']>): SlotScoutConfig {
  return {
    daysAhead: 14,
    maxSlots: 10,
    pageTimeout: 30000,
    weights: {
      day: 0.2,
      time: 0.25,
      cost: 0.2,
      availability: 0.15,
      urgency: 0.2,
      ...weights,
    },
  };
}

// =============================================================================
// scoreDayPreference Tests
// =============================================================================

describe('scoreDayPreference', () => {
  describe('preferred days', () => {
    it('should return 1.0 for a preferred day', () => {
      const slot = createSlot({ dayOfWeek: 6 }); // Saturday
      const preferences = createPreferences({ preferredDays: [6, 0] }); // Weekend

      const score = scoreDayPreference(slot, preferences);

      expect(score).toBe(1.0);
    });

    it('should return 1.0 when slot day is first in preferred list', () => {
      const slot = createSlot({ dayOfWeek: 1 }); // Monday
      const preferences = createPreferences({ preferredDays: [1, 2, 3] });

      const score = scoreDayPreference(slot, preferences);

      expect(score).toBe(1.0);
    });

    it('should return 1.0 when slot day is last in preferred list', () => {
      const slot = createSlot({ dayOfWeek: 5 }); // Friday
      const preferences = createPreferences({ preferredDays: [1, 3, 5] });

      const score = scoreDayPreference(slot, preferences);

      expect(score).toBe(1.0);
    });
  });

  describe('avoided days', () => {
    it('should return 0.0 for an avoided day', () => {
      const slot = createSlot({ dayOfWeek: 0 }); // Sunday
      const preferences = createPreferences({ avoidDays: [0, 6] }); // Avoid weekend

      const score = scoreDayPreference(slot, preferences);

      expect(score).toBe(0.0);
    });

    it('should return 0.0 when avoided even if also in preferred', () => {
      // Avoid takes precedence - slot is both preferred and avoided
      const slot = createSlot({ dayOfWeek: 6 }); // Saturday
      const preferences = createPreferences({
        preferredDays: [6],
        avoidDays: [6],
      });

      const score = scoreDayPreference(slot, preferences);

      expect(score).toBe(0.0);
    });
  });

  describe('neutral days', () => {
    it('should return 0.5 for a neutral day (not preferred or avoided)', () => {
      const slot = createSlot({ dayOfWeek: 3 }); // Wednesday
      const preferences = createPreferences({
        preferredDays: [1, 5], // Monday, Friday
        avoidDays: [0, 6], // Weekend
      });

      const score = scoreDayPreference(slot, preferences);

      expect(score).toBe(0.5);
    });

    it('should return 0.5 when preferredDays is empty', () => {
      const slot = createSlot({ dayOfWeek: 2 }); // Tuesday
      const preferences = createPreferences({ preferredDays: [] });

      const score = scoreDayPreference(slot, preferences);

      expect(score).toBe(0.5);
    });

    it('should return 0.5 when no preferences are provided', () => {
      const slot = createSlot({ dayOfWeek: 4 }); // Thursday

      const score = scoreDayPreference(slot, undefined);

      expect(score).toBe(0.5);
    });

    it('should return 0.5 when preferences object has no day settings', () => {
      const slot = createSlot({ dayOfWeek: 4 });
      const preferences = createPreferences();

      const score = scoreDayPreference(slot, preferences);

      expect(score).toBe(0.5);
    });
  });

  describe('edge cases', () => {
    it('should handle Sunday (day 0) correctly', () => {
      const slot = createSlot({ dayOfWeek: 0 });
      const preferences = createPreferences({ preferredDays: [0] });

      const score = scoreDayPreference(slot, preferences);

      expect(score).toBe(1.0);
    });

    it('should handle Saturday (day 6) correctly', () => {
      const slot = createSlot({ dayOfWeek: 6 });
      const preferences = createPreferences({ preferredDays: [6] });

      const score = scoreDayPreference(slot, preferences);

      expect(score).toBe(1.0);
    });

    it('should handle all days being avoided', () => {
      const slot = createSlot({ dayOfWeek: 3 });
      const preferences = createPreferences({ avoidDays: [0, 1, 2, 3, 4, 5, 6] });

      const score = scoreDayPreference(slot, preferences);

      expect(score).toBe(0.0);
    });
  });
});

// =============================================================================
// scoreTimePreference Tests
// =============================================================================

describe('scoreTimePreference', () => {
  describe('time window matching', () => {
    it('should return 1.0 when slot is within time window', () => {
      const slot = createSlot({ startTime: '10:00', endTime: '12:00' });
      const preferences = createPreferences({
        timeWindow: { earliest: '09:00', latest: '18:00' },
      });

      const score = scoreTimePreference(slot, preferences);

      expect(score).toBe(1.0);
    });

    it('should return 1.0 when slot exactly matches time window', () => {
      const slot = createSlot({ startTime: '09:00', endTime: '18:00' });
      const preferences = createPreferences({
        timeWindow: { earliest: '09:00', latest: '18:00' },
      });

      const score = scoreTimePreference(slot, preferences);

      expect(score).toBe(1.0);
    });

    it('should return 0.0 when slot starts before earliest time', () => {
      const slot = createSlot({ startTime: '07:00', endTime: '09:00' });
      const preferences = createPreferences({
        timeWindow: { earliest: '09:00', latest: '18:00' },
      });

      const score = scoreTimePreference(slot, preferences);

      expect(score).toBe(0.0);
    });

    it('should return 0.0 when slot ends after latest time', () => {
      const slot = createSlot({ startTime: '17:00', endTime: '20:00' });
      const preferences = createPreferences({
        timeWindow: { earliest: '09:00', latest: '18:00' },
      });

      const score = scoreTimePreference(slot, preferences);

      expect(score).toBe(0.0);
    });

    it('should return 0.0 when slot is entirely outside window', () => {
      const slot = createSlot({ startTime: '20:00', endTime: '22:00' });
      const preferences = createPreferences({
        timeWindow: { earliest: '09:00', latest: '18:00' },
      });

      const score = scoreTimePreference(slot, preferences);

      expect(score).toBe(0.0);
    });
  });

  describe('morning preference', () => {
    it('should return 1.0 for morning slot when preferMorning is true', () => {
      const slot = createSlot({ startTime: '08:00', endTime: '10:00' });
      const preferences = createPreferences({ preferMorning: true });

      const score = scoreTimePreference(slot, preferences);

      expect(score).toBe(1.0);
    });

    it('should return 1.0 for 10:00 slot when preferMorning is true', () => {
      const slot = createSlot({ startTime: '10:00', endTime: '12:00' });
      const preferences = createPreferences({ preferMorning: true });

      const score = scoreTimePreference(slot, preferences);

      expect(score).toBe(1.0);
    });

    it('should return 1.0 for 11:00 slot when preferMorning is true', () => {
      const slot = createSlot({ startTime: '11:00', endTime: '13:00' });
      const preferences = createPreferences({ preferMorning: true });

      const score = scoreTimePreference(slot, preferences);

      expect(score).toBe(1.0);
    });

    it('should return 0.5 for afternoon slot when preferMorning is true', () => {
      const slot = createSlot({ startTime: '14:00', endTime: '16:00' });
      const preferences = createPreferences({ preferMorning: true });

      const score = scoreTimePreference(slot, preferences);

      expect(score).toBe(0.5);
    });

    it('should return 0.5 for 12:00 slot when preferMorning is true (boundary)', () => {
      const slot = createSlot({ startTime: '12:00', endTime: '14:00' });
      const preferences = createPreferences({ preferMorning: true });

      const score = scoreTimePreference(slot, preferences);

      expect(score).toBe(0.5);
    });
  });

  describe('evening preference', () => {
    it('should return 1.0 for evening slot when preferEvening is true', () => {
      const slot = createSlot({ startTime: '18:00', endTime: '20:00' });
      const preferences = createPreferences({ preferEvening: true });

      const score = scoreTimePreference(slot, preferences);

      expect(score).toBe(1.0);
    });

    it('should return 1.0 for 17:00 slot when preferEvening is true', () => {
      const slot = createSlot({ startTime: '17:00', endTime: '19:00' });
      const preferences = createPreferences({ preferEvening: true });

      const score = scoreTimePreference(slot, preferences);

      expect(score).toBe(1.0);
    });

    it('should return 0.5 for afternoon slot when preferEvening is true', () => {
      const slot = createSlot({ startTime: '14:00', endTime: '16:00' });
      const preferences = createPreferences({ preferEvening: true });

      const score = scoreTimePreference(slot, preferences);

      expect(score).toBe(0.5);
    });

    it('should return 0.5 for 16:00 slot when preferEvening is true (boundary)', () => {
      const slot = createSlot({ startTime: '16:00', endTime: '18:00' });
      const preferences = createPreferences({ preferEvening: true });

      const score = scoreTimePreference(slot, preferences);

      expect(score).toBe(0.5);
    });
  });

  describe('neutral time', () => {
    it('should return 0.5 when no time preferences are set', () => {
      const slot = createSlot({ startTime: '14:00', endTime: '16:00' });
      const preferences = createPreferences();

      const score = scoreTimePreference(slot, preferences);

      expect(score).toBe(0.5);
    });

    it('should return 0.5 when preferences are undefined', () => {
      const slot = createSlot({ startTime: '14:00', endTime: '16:00' });

      const score = scoreTimePreference(slot, undefined);

      expect(score).toBe(0.5);
    });
  });

  describe('time window takes precedence', () => {
    it('should use timeWindow over preferMorning when both are set', () => {
      const slot = createSlot({ startTime: '08:00', endTime: '10:00' });
      const preferences = createPreferences({
        timeWindow: { earliest: '14:00', latest: '20:00' },
        preferMorning: true,
      });

      // timeWindow says 08:00 is too early
      const score = scoreTimePreference(slot, preferences);

      expect(score).toBe(0.0);
    });
  });
});

// =============================================================================
// scoreCost Tests
// =============================================================================

describe('scoreCost', () => {
  describe('free delivery', () => {
    it('should return 1.0 for free delivery (cost = 0)', () => {
      const slot = createSlot({ deliveryCost: 0 });
      const preferences = createPreferences();

      const score = scoreCost(slot, preferences);

      expect(score).toBe(1.0);
    });

    it('should return 1.0 when delivery is free above threshold', () => {
      const slot = createSlot({
        deliveryCost: 5.0,
        freeAboveThreshold: true,
        freeDeliveryThreshold: 50.0,
      });
      const preferences = createPreferences();

      const score = scoreCost(slot, preferences);

      expect(score).toBe(1.0);
    });

    it('should return 1.0 when deliveryCost is undefined (treated as 0)', () => {
      const slot = createSlot({ deliveryCost: undefined });
      const preferences = createPreferences();

      const score = scoreCost(slot, preferences);

      expect(score).toBe(1.0);
    });
  });

  describe('paid delivery with max cost limit', () => {
    it('should return 0.0 when cost exceeds maxDeliveryCost', () => {
      const slot = createSlot({ deliveryCost: 8.0 });
      const preferences = createPreferences({ maxDeliveryCost: 5.0 });

      const score = scoreCost(slot, preferences);

      expect(score).toBe(0.0);
    });

    it('should return score when cost equals maxDeliveryCost', () => {
      const slot = createSlot({ deliveryCost: 5.0 });
      const preferences = createPreferences({
        maxDeliveryCost: 5.0,
        preferFreeDelivery: true,
      });

      const score = scoreCost(slot, preferences);

      // Score = 1 - 5/5 = 0
      expect(score).toBe(0.0);
    });

    it('should return positive score when cost is below maxDeliveryCost', () => {
      const slot = createSlot({ deliveryCost: 2.5 });
      const preferences = createPreferences({
        maxDeliveryCost: 5.0,
        preferFreeDelivery: true,
      });

      const score = scoreCost(slot, preferences);

      // Score = 1 - 2.5/5 = 0.5
      expect(score).toBe(0.5);
    });
  });

  describe('linear interpolation with preferFreeDelivery', () => {
    it('should calculate linear score based on cost when preferFreeDelivery is true', () => {
      const slot = createSlot({ deliveryCost: 5.0 });
      const preferences = createPreferences({
        preferFreeDelivery: true,
        maxDeliveryCost: 10,
      });

      const score = scoreCost(slot, preferences);

      // Score = 1 - 5/10 = 0.5
      expect(score).toBe(0.5);
    });

    it('should use default max cost of 10 when preferFreeDelivery and no maxDeliveryCost', () => {
      const slot = createSlot({ deliveryCost: 3.0 });
      const preferences = createPreferences({ preferFreeDelivery: true });

      const score = scoreCost(slot, preferences);

      // Score = 1 - 3/10 = 0.7
      expect(score).toBe(0.7);
    });

    it('should return 0 when cost equals default max cost', () => {
      const slot = createSlot({ deliveryCost: 10.0 });
      const preferences = createPreferences({ preferFreeDelivery: true });

      const score = scoreCost(slot, preferences);

      expect(score).toBe(0.0);
    });

    it('should clamp to 0 when cost exceeds max', () => {
      const slot = createSlot({ deliveryCost: 15.0 });
      const preferences = createPreferences({ preferFreeDelivery: true });

      const score = scoreCost(slot, preferences);

      // Math.max(0, 1 - 15/10) = Math.max(0, -0.5) = 0
      expect(score).toBe(0.0);
    });
  });

  describe('linear interpolation without preferFreeDelivery', () => {
    it('should use lenient max cost of 15 when preferFreeDelivery is false', () => {
      const slot = createSlot({ deliveryCost: 7.5 });
      const preferences = createPreferences({ preferFreeDelivery: false });

      const score = scoreCost(slot, preferences);

      // Score = 1 - 7.5/15 = 0.5
      expect(score).toBe(0.5);
    });

    it('should use maxDeliveryCost when provided even if preferFreeDelivery is false', () => {
      const slot = createSlot({ deliveryCost: 5.0 });
      const preferences = createPreferences({
        preferFreeDelivery: false,
        maxDeliveryCost: 20,
      });

      const score = scoreCost(slot, preferences);

      // Score = 1 - 5/20 = 0.75
      expect(score).toBe(0.75);
    });
  });

  describe('edge cases', () => {
    it('should return 0.5 score when preferences are undefined (default maxCost=10)', () => {
      const slot = createSlot({ deliveryCost: 5.0 });

      const score = scoreCost(slot, undefined);

      // preferFreeDelivery defaults to true, maxCost=10
      // Score = 1 - 5/10 = 0.5
      expect(score).toBe(0.5);
    });

    it('should handle very small delivery costs', () => {
      const slot = createSlot({ deliveryCost: 0.01 });
      const preferences = createPreferences({ preferFreeDelivery: true });

      const score = scoreCost(slot, preferences);

      expect(score).toBeCloseTo(0.999, 2);
    });
  });
});

// =============================================================================
// scoreAvailability Tests
// =============================================================================

describe('scoreAvailability', () => {
  it('should return 1.0 for available status', () => {
    const slot = createSlot({ status: 'available' });

    const score = scoreAvailability(slot);

    expect(score).toBe(1.0);
  });

  it('should return 0.5 for limited status', () => {
    const slot = createSlot({ status: 'limited' });

    const score = scoreAvailability(slot);

    expect(score).toBe(0.5);
  });

  it('should return 0.0 for full status', () => {
    const slot = createSlot({ status: 'full' });

    const score = scoreAvailability(slot);

    expect(score).toBe(0.0);
  });

  it('should return 0.0 for unavailable status', () => {
    const slot = createSlot({ status: 'unavailable' });

    const score = scoreAvailability(slot);

    expect(score).toBe(0.0);
  });

  it('should return 0.3 for unknown status', () => {
    const slot = createSlot({ status: 'unknown' });

    const score = scoreAvailability(slot);

    expect(score).toBe(0.3);
  });
});

// =============================================================================
// scoreUrgency Tests
// =============================================================================

describe('scoreUrgency', () => {
  // Mock the current date for deterministic tests
  beforeEach(() => {
    // Set current date to Jan 14, 2026 for all urgency tests
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-14T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('tomorrow slots', () => {
    it('should return 1.0 for tomorrow slot', () => {
      // Tomorrow is Jan 15, 2026
      const slot = createSlot({ date: new Date('2026-01-15') });
      const preferences = createPreferences({ maxDaysAhead: 14 });

      const score = scoreUrgency(slot, preferences);

      expect(score).toBe(1.0);
    });

    it('should return 1.0 for today slot (daysAway <= 0)', () => {
      // Today is Jan 14, 2026
      const slot = createSlot({ date: new Date('2026-01-14') });
      const preferences = createPreferences({ maxDaysAhead: 14 });

      const score = scoreUrgency(slot, preferences);

      expect(score).toBe(1.0);
    });
  });

  describe('linear decay', () => {
    it('should return ~0.5 for slot 7 days away with maxDaysAhead=14', () => {
      // 7 days from tomorrow = Jan 22, 2026
      const slot = createSlot({ date: new Date('2026-01-22') });
      const preferences = createPreferences({ maxDaysAhead: 14 });

      const score = scoreUrgency(slot, preferences);

      // daysAway = 7, score = 1 - 7/14 = 0.5
      expect(score).toBe(0.5);
    });

    it('should return ~0.0 for slot at maxDaysAhead boundary', () => {
      // 14 days from tomorrow = Jan 29, 2026
      const slot = createSlot({ date: new Date('2026-01-29') });
      const preferences = createPreferences({ maxDaysAhead: 14 });

      const score = scoreUrgency(slot, preferences);

      // daysAway = 14, score = 1 - 14/14 = 0
      expect(score).toBe(0.0);
    });

    it('should return 0.0 for slot beyond maxDaysAhead', () => {
      // 20 days from tomorrow = Feb 4, 2026
      const slot = createSlot({ date: new Date('2026-02-04') });
      const preferences = createPreferences({ maxDaysAhead: 14 });

      const score = scoreUrgency(slot, preferences);

      // Math.max(0, 1 - 20/14) = 0
      expect(score).toBe(0.0);
    });

    it('should calculate correct score for 3 days away', () => {
      // 3 days from tomorrow = Jan 18, 2026
      const slot = createSlot({ date: new Date('2026-01-18') });
      const preferences = createPreferences({ maxDaysAhead: 14 });

      const score = scoreUrgency(slot, preferences);

      // daysAway = 3, score = 1 - 3/14 ~= 0.786
      expect(score).toBeCloseTo(0.786, 2);
    });
  });

  describe('custom maxDaysAhead', () => {
    it('should use custom maxDaysAhead from preferences', () => {
      // 5 days from tomorrow = Jan 20, 2026
      const slot = createSlot({ date: new Date('2026-01-20') });
      const preferences = createPreferences({ maxDaysAhead: 10 });

      const score = scoreUrgency(slot, preferences);

      // daysAway = 5, score = 1 - 5/10 = 0.5
      expect(score).toBe(0.5);
    });

    it('should use default maxDaysAhead=14 when preferences undefined', () => {
      // 7 days from tomorrow = Jan 22, 2026
      const slot = createSlot({ date: new Date('2026-01-22') });

      const score = scoreUrgency(slot, undefined);

      // daysAway = 7, score = 1 - 7/14 = 0.5
      expect(score).toBe(0.5);
    });
  });
});

// =============================================================================
// scoreSlot Tests (Combined Weighted Score)
// =============================================================================

describe('scoreSlot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-14T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('default weights', () => {
    it('should calculate overall score with default weights', () => {
      const slot = createSlot({
        date: new Date('2026-01-15'), // Tomorrow - urgency = 1.0
        dayOfWeek: 6, // Saturday
        startTime: '10:00',
        endTime: '12:00',
        status: 'available', // availability = 1.0
        deliveryCost: 0, // cost = 1.0
      });
      const preferences = createPreferences({
        preferredDays: [6], // day = 1.0
        preferMorning: true, // time = 1.0
      });

      const score = scoreSlot(slot, preferences);

      // All scores = 1.0
      // Overall = 0.2*1 + 0.25*1 + 0.2*1 + 0.15*1 + 0.2*1 = 1.0
      expect(score.dayScore).toBe(1.0);
      expect(score.timeScore).toBe(1.0);
      expect(score.costScore).toBe(1.0);
      expect(score.availabilityScore).toBe(1.0);
      expect(score.urgencyScore).toBe(1.0);
      expect(score.overall).toBe(1.0);
    });

    it('should calculate mixed score with default weights', () => {
      const slot = createSlot({
        date: new Date('2026-01-22'), // 7 days away - urgency = 0.5
        dayOfWeek: 3, // Wednesday - neutral
        startTime: '14:00',
        endTime: '16:00', // Afternoon - neutral
        status: 'limited', // availability = 0.5
        deliveryCost: 5.0, // cost = 0.5
      });
      const preferences = createPreferences({
        preferredDays: [6],
        preferFreeDelivery: true,
      });

      const score = scoreSlot(slot, preferences);

      expect(score.dayScore).toBe(0.5); // neutral day
      expect(score.timeScore).toBe(0.5); // neutral time
      expect(score.costScore).toBe(0.5); // 5/10 cost
      expect(score.availabilityScore).toBe(0.5); // limited
      expect(score.urgencyScore).toBe(0.5); // 7 days

      // Overall = 0.2*0.5 + 0.25*0.5 + 0.2*0.5 + 0.15*0.5 + 0.2*0.5 = 0.5
      expect(score.overall).toBe(0.5);
    });

    it('should return all zeros for worst case slot', () => {
      const slot = createSlot({
        date: new Date('2026-02-15'), // Far future - urgency = 0
        dayOfWeek: 0, // Sunday - avoided
        startTime: '06:00',
        endTime: '08:00', // Before window
        status: 'full', // availability = 0
        deliveryCost: 15.0, // cost = 0
      });
      const preferences = createPreferences({
        avoidDays: [0],
        timeWindow: { earliest: '10:00', latest: '18:00' },
        preferFreeDelivery: true,
      });

      const score = scoreSlot(slot, preferences);

      expect(score.dayScore).toBe(0.0);
      expect(score.timeScore).toBe(0.0);
      expect(score.costScore).toBe(0.0);
      expect(score.availabilityScore).toBe(0.0);
      expect(score.urgencyScore).toBe(0.0);
      expect(score.overall).toBe(0.0);
    });
  });

  describe('custom weights', () => {
    it('should use custom weights from config', () => {
      const slot = createSlot({
        date: new Date('2026-01-15'), // Tomorrow
        dayOfWeek: 6,
        status: 'available',
        deliveryCost: 0,
      });
      const preferences = createPreferences({
        preferredDays: [6],
        preferMorning: true,
      });
      const config = createConfig({
        day: 0.5, // Heavy weight on day
        time: 0.1,
        cost: 0.1,
        availability: 0.1,
        urgency: 0.2,
      });

      const score = scoreSlot(slot, preferences, config);

      // All component scores = 1.0
      // Overall = 0.5*1 + 0.1*1 + 0.1*1 + 0.1*1 + 0.2*1 = 1.0
      expect(score.overall).toBe(1.0);
    });

    it('should handle zero weights', () => {
      const slot = createSlot({
        date: new Date('2026-01-15'),
        dayOfWeek: 0, // Sunday - would be avoided
        status: 'full', // Would be 0
        deliveryCost: 0,
      });
      const preferences = createPreferences({
        avoidDays: [0],
        preferMorning: true,
      });
      const config = createConfig({
        day: 0, // Ignore day
        time: 0.5,
        cost: 0.5,
        availability: 0, // Ignore availability
        urgency: 0,
      });

      const score = scoreSlot(slot, preferences, config);

      // Day and availability are 0 but have 0 weight
      // time = 1.0, cost = 1.0
      // Overall = 0*0 + 0.5*1 + 0.5*1 + 0*0 + 0*1 = 1.0
      expect(score.overall).toBe(1.0);
    });
  });

  describe('without preferences', () => {
    it('should return neutral scores when no preferences provided', () => {
      const slot = createSlot({
        date: new Date('2026-01-15'),
        status: 'available',
        deliveryCost: 5.0,
      });

      const score = scoreSlot(slot);

      expect(score.dayScore).toBe(0.5);
      expect(score.timeScore).toBe(0.5);
      expect(score.availabilityScore).toBe(1.0);
      expect(score.urgencyScore).toBe(1.0);
    });
  });
});

// =============================================================================
// generateReason Tests
// =============================================================================

describe('generateReason', () => {
  describe('day-related reasons', () => {
    it('should include "preferred day" for dayScore=1.0', () => {
      const slot = createSlot();
      const score: SlotScore = {
        dayScore: 1.0,
        timeScore: 0.5,
        costScore: 0.5,
        availabilityScore: 0.5,
        urgencyScore: 0.5,
        overall: 0.5,
      };

      const reason = generateReason(slot, score);

      expect(reason).toContain('preferred day');
    });

    it('should include "avoided day" for dayScore=0.0', () => {
      const slot = createSlot();
      const score: SlotScore = {
        dayScore: 0.0,
        timeScore: 0.5,
        costScore: 0.5,
        availabilityScore: 0.5,
        urgencyScore: 0.5,
        overall: 0.5,
      };

      const reason = generateReason(slot, score);

      expect(reason).toContain('avoided day');
    });
  });

  describe('time-related reasons', () => {
    it('should include "ideal time" for timeScore=1.0', () => {
      const slot = createSlot();
      const score: SlotScore = {
        dayScore: 0.5,
        timeScore: 1.0,
        costScore: 0.5,
        availabilityScore: 0.5,
        urgencyScore: 0.5,
        overall: 0.5,
      };

      const reason = generateReason(slot, score);

      expect(reason).toContain('ideal time');
    });

    it('should include "outside preferred hours" for timeScore=0.0', () => {
      const slot = createSlot();
      const score: SlotScore = {
        dayScore: 0.5,
        timeScore: 0.0,
        costScore: 0.5,
        availabilityScore: 0.5,
        urgencyScore: 0.5,
        overall: 0.5,
      };

      const reason = generateReason(slot, score);

      expect(reason).toContain('outside preferred hours');
    });
  });

  describe('cost-related reasons', () => {
    it('should include "free delivery" for costScore=1.0', () => {
      const slot = createSlot();
      const score: SlotScore = {
        dayScore: 0.5,
        timeScore: 0.5,
        costScore: 1.0,
        availabilityScore: 0.5,
        urgencyScore: 0.5,
        overall: 0.5,
      };

      const reason = generateReason(slot, score);

      expect(reason).toContain('free delivery');
    });

    it('should include "expensive delivery" for costScore<0.3', () => {
      const slot = createSlot();
      const score: SlotScore = {
        dayScore: 0.5,
        timeScore: 0.5,
        costScore: 0.2,
        availabilityScore: 0.5,
        urgencyScore: 0.5,
        overall: 0.5,
      };

      const reason = generateReason(slot, score);

      expect(reason).toContain('expensive delivery');
    });

    it('should not mention cost for moderate scores', () => {
      const slot = createSlot();
      const score: SlotScore = {
        dayScore: 0.5,
        timeScore: 0.5,
        costScore: 0.5,
        availabilityScore: 0.5,
        urgencyScore: 0.5,
        overall: 0.5,
      };

      const reason = generateReason(slot, score);

      expect(reason).not.toContain('delivery');
    });
  });

  describe('availability-related reasons', () => {
    it('should include "available" for availabilityScore=1.0', () => {
      const slot = createSlot();
      const score: SlotScore = {
        dayScore: 0.5,
        timeScore: 0.5,
        costScore: 0.5,
        availabilityScore: 1.0,
        urgencyScore: 0.5,
        overall: 0.5,
      };

      const reason = generateReason(slot, score);

      expect(reason).toContain('available');
    });

    it('should include "limited availability" for availabilityScore=0.5', () => {
      const slot = createSlot();
      const score: SlotScore = {
        dayScore: 0.5,
        timeScore: 0.5,
        costScore: 0.5,
        availabilityScore: 0.5,
        urgencyScore: 0.5,
        overall: 0.5,
      };

      const reason = generateReason(slot, score);

      expect(reason).toContain('limited availability');
    });

    it('should include "fully booked" for availabilityScore=0.0', () => {
      const slot = createSlot();
      const score: SlotScore = {
        dayScore: 0.5,
        timeScore: 0.5,
        costScore: 0.5,
        availabilityScore: 0.0,
        urgencyScore: 0.5,
        overall: 0.5,
      };

      const reason = generateReason(slot, score);

      expect(reason).toContain('fully booked');
    });
  });

  describe('urgency-related reasons', () => {
    it('should include "soonest available" for urgencyScore=1.0', () => {
      const slot = createSlot();
      const score: SlotScore = {
        dayScore: 0.5,
        timeScore: 0.5,
        costScore: 0.5,
        availabilityScore: 0.5,
        urgencyScore: 1.0,
        overall: 0.5,
      };

      const reason = generateReason(slot, score);

      expect(reason).toContain('soonest available');
    });

    it('should include "far in advance" for urgencyScore<0.3', () => {
      const slot = createSlot();
      const score: SlotScore = {
        dayScore: 0.5,
        timeScore: 0.5,
        costScore: 0.5,
        availabilityScore: 0.5,
        urgencyScore: 0.2,
        overall: 0.5,
      };

      const reason = generateReason(slot, score);

      expect(reason).toContain('far in advance');
    });
  });

  describe('combined reasons', () => {
    it('should combine multiple positive reasons', () => {
      const slot = createSlot();
      const score: SlotScore = {
        dayScore: 1.0,
        timeScore: 1.0,
        costScore: 1.0,
        availabilityScore: 1.0,
        urgencyScore: 1.0,
        overall: 1.0,
      };

      const reason = generateReason(slot, score);

      expect(reason).toContain('preferred day');
      expect(reason).toContain('ideal time');
      expect(reason).toContain('free delivery');
      expect(reason).toContain('available');
      expect(reason).toContain('soonest available');
    });

    it('should combine multiple negative reasons', () => {
      const slot = createSlot();
      const score: SlotScore = {
        dayScore: 0.0,
        timeScore: 0.0,
        costScore: 0.1,
        availabilityScore: 0.0,
        urgencyScore: 0.1,
        overall: 0.0,
      };

      const reason = generateReason(slot, score);

      expect(reason).toContain('avoided day');
      expect(reason).toContain('outside preferred hours');
      expect(reason).toContain('expensive delivery');
      expect(reason).toContain('fully booked');
      expect(reason).toContain('far in advance');
    });

    it('should return "neutral match" when no notable scores', () => {
      const slot = createSlot();
      const score: SlotScore = {
        dayScore: 0.5,
        timeScore: 0.5,
        costScore: 0.5,
        availabilityScore: 0.3, // Unknown status
        urgencyScore: 0.5,
        overall: 0.5,
      };

      const reason = generateReason(slot, score);

      expect(reason).toBe('neutral match');
    });
  });
});

// =============================================================================
// rankSlots Tests
// =============================================================================

describe('rankSlots', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-14T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('sorting by score', () => {
    it('should sort slots by overall score descending', () => {
      const slots: DeliverySlot[] = [
        createSlot({
          slotId: 'low',
          date: new Date('2026-02-01'),
          status: 'limited',
          deliveryCost: 10,
        }),
        createSlot({
          slotId: 'high',
          date: new Date('2026-01-15'),
          status: 'available',
          deliveryCost: 0,
        }),
        createSlot({
          slotId: 'medium',
          date: new Date('2026-01-20'),
          status: 'available',
          deliveryCost: 5,
        }),
      ];

      const ranked = rankSlots(slots);

      expect(ranked[0]?.slot.slotId).toBe('high');
      expect(ranked[1]?.slot.slotId).toBe('medium');
      expect(ranked[2]?.slot.slotId).toBe('low');
    });

    it('should assign correct rank numbers', () => {
      const slots: DeliverySlot[] = [
        createSlot({ slotId: 'a', date: new Date('2026-01-15'), deliveryCost: 0 }),
        createSlot({ slotId: 'b', date: new Date('2026-01-20'), deliveryCost: 5 }),
        createSlot({ slotId: 'c', date: new Date('2026-01-25'), deliveryCost: 10 }),
      ];

      const ranked = rankSlots(slots);

      expect(ranked[0]?.rank).toBe(1);
      expect(ranked[1]?.rank).toBe(2);
      expect(ranked[2]?.rank).toBe(3);
    });
  });

  describe('preference-based ranking', () => {
    it('should rank preferred days higher', () => {
      const slots: DeliverySlot[] = [
        createSlot({
          slotId: 'weekday',
          date: new Date('2026-01-15'), // Thursday
          dayOfWeek: 4,
        }),
        createSlot({
          slotId: 'weekend',
          date: new Date('2026-01-17'), // Saturday
          dayOfWeek: 6,
        }),
      ];
      const preferences = createPreferences({ preferredDays: [6, 0] }); // Prefer weekend

      const ranked = rankSlots(slots, preferences);

      expect(ranked[0]?.slot.slotId).toBe('weekend');
    });

    it('should rank slots with free delivery higher', () => {
      const slots: DeliverySlot[] = [
        createSlot({ slotId: 'paid', date: new Date('2026-01-15'), deliveryCost: 5 }),
        createSlot({ slotId: 'free', date: new Date('2026-01-15'), deliveryCost: 0 }),
      ];
      const preferences = createPreferences({ preferFreeDelivery: true });

      const ranked = rankSlots(slots, preferences);

      expect(ranked[0]?.slot.slotId).toBe('free');
    });

    it('should rank available slots higher than limited', () => {
      const slots: DeliverySlot[] = [
        createSlot({ slotId: 'limited', date: new Date('2026-01-15'), status: 'limited' }),
        createSlot({ slotId: 'available', date: new Date('2026-01-15'), status: 'available' }),
      ];

      const ranked = rankSlots(slots);

      expect(ranked[0]?.slot.slotId).toBe('available');
    });
  });

  describe('with custom config', () => {
    it('should apply custom weights when ranking', () => {
      const slots: DeliverySlot[] = [
        createSlot({
          slotId: 'expensive-soon',
          date: new Date('2026-01-15'), // Tomorrow
          deliveryCost: 10,
        }),
        createSlot({
          slotId: 'cheap-later',
          date: new Date('2026-01-20'), // 5 days away
          deliveryCost: 0,
        }),
      ];
      const config = createConfig({
        cost: 0.8, // Heavy weight on cost
        urgency: 0.1, // Low weight on urgency
        day: 0.05,
        time: 0.025,
        availability: 0.025,
      });

      const ranked = rankSlots(slots, undefined, config);

      // Cheap slot should win because cost weight is high
      expect(ranked[0]?.slot.slotId).toBe('cheap-later');
    });
  });

  describe('edge cases', () => {
    it('should return empty array for empty input', () => {
      const ranked = rankSlots([]);

      expect(ranked).toEqual([]);
    });

    it('should handle single slot', () => {
      const slots = [createSlot({ slotId: 'only' })];

      const ranked = rankSlots(slots);

      expect(ranked).toHaveLength(1);
      expect(ranked[0]?.rank).toBe(1);
      expect(ranked[0]?.slot.slotId).toBe('only');
    });

    it('should handle slots with identical scores (stable sort)', () => {
      const slots: DeliverySlot[] = [
        createSlot({ slotId: 'first', date: new Date('2026-01-15'), deliveryCost: 0 }),
        createSlot({ slotId: 'second', date: new Date('2026-01-15'), deliveryCost: 0 }),
        createSlot({ slotId: 'third', date: new Date('2026-01-15'), deliveryCost: 0 }),
      ];

      const ranked = rankSlots(slots);

      // All should have same overall score
      expect(ranked[0]?.score.overall).toBe(ranked[1]?.score.overall);
      expect(ranked[1]?.score.overall).toBe(ranked[2]?.score.overall);

      // Each should have a unique rank
      expect(ranked[0]?.rank).toBe(1);
      expect(ranked[1]?.rank).toBe(2);
      expect(ranked[2]?.rank).toBe(3);
    });

    it('should include reason for each ranked slot', () => {
      const slots = [
        createSlot({ slotId: 'a', status: 'available', deliveryCost: 0 }),
        createSlot({ slotId: 'b', status: 'limited', deliveryCost: 5 }),
      ];

      const ranked = rankSlots(slots);

      expect(ranked[0]?.reason).toBeDefined();
      expect(ranked[1]?.reason).toBeDefined();
      expect(typeof ranked[0]?.reason).toBe('string');
    });

    it('should handle large number of slots', () => {
      const slots: DeliverySlot[] = [];
      for (let i = 0; i < 100; i++) {
        slots.push(
          createSlot({
            slotId: `slot-${i}`,
            date: new Date(`2026-01-${15 + Math.floor(i / 10)}`),
            deliveryCost: i % 10,
            status: i % 3 === 0 ? 'available' : 'limited',
          })
        );
      }

      const ranked = rankSlots(slots);

      expect(ranked).toHaveLength(100);

      // Verify descending order
      for (let i = 0; i < ranked.length - 1; i++) {
        expect(ranked[i]!.score.overall).toBeGreaterThanOrEqual(ranked[i + 1]!.score.overall);
      }

      // Verify ranks are sequential
      for (let i = 0; i < ranked.length; i++) {
        expect(ranked[i]?.rank).toBe(i + 1);
      }
    });
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Scoring Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-14T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should rank a realistic set of slots correctly', () => {
    const slots: DeliverySlot[] = [
      // Best slot: tomorrow, morning, free, available, Saturday
      createSlot({
        slotId: 'best',
        date: new Date('2026-01-17'), // Saturday
        dayOfWeek: 6,
        startTime: '10:00',
        endTime: '12:00',
        status: 'available',
        deliveryCost: 0,
      }),
      // Good slot: tomorrow, morning, cheap, available, weekday
      createSlot({
        slotId: 'good',
        date: new Date('2026-01-15'), // Thursday
        dayOfWeek: 4,
        startTime: '09:00',
        endTime: '11:00',
        status: 'available',
        deliveryCost: 2,
      }),
      // Average slot: few days, afternoon, moderate cost, limited
      createSlot({
        slotId: 'average',
        date: new Date('2026-01-20'),
        dayOfWeek: 2,
        startTime: '14:00',
        endTime: '16:00',
        status: 'limited',
        deliveryCost: 5,
      }),
      // Bad slot: far out, Sunday (avoided), expensive, full
      createSlot({
        slotId: 'bad',
        date: new Date('2026-01-26'), // Sunday
        dayOfWeek: 0,
        startTime: '18:00',
        endTime: '20:00',
        status: 'full',
        deliveryCost: 8,
      }),
    ];

    const preferences = createPreferences({
      preferredDays: [6], // Saturday
      avoidDays: [0], // Sunday
      preferMorning: true,
      preferFreeDelivery: true,
    });

    const ranked = rankSlots(slots, preferences);

    // Verify ranking order
    expect(ranked[0]?.slot.slotId).toBe('best');
    expect(ranked[3]?.slot.slotId).toBe('bad');

    // Best slot should have high overall score
    expect(ranked[0]?.score.overall).toBeGreaterThan(0.8);

    // Bad slot should have low overall score
    expect(ranked[3]?.score.overall).toBeLessThan(0.3);
  });

  it('should provide meaningful reasons for top slots', () => {
    const slots: DeliverySlot[] = [
      createSlot({
        slotId: 'perfect',
        date: new Date('2026-01-15'),
        dayOfWeek: 4,
        startTime: '10:00',
        endTime: '12:00',
        status: 'available',
        deliveryCost: 0,
      }),
    ];

    const preferences = createPreferences({
      preferredDays: [4], // Thursday
      preferMorning: true,
    });

    const ranked = rankSlots(slots, preferences);

    const reason = ranked[0]?.reason ?? '';
    expect(reason).toContain('preferred day');
    expect(reason).toContain('ideal time');
    expect(reason).toContain('free delivery');
    expect(reason).toContain('available');
    expect(reason).toContain('soonest available');
  });
});
