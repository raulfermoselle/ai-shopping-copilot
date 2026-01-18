/**
 * Slots Module
 *
 * Exports slot scoring and recommendation functions.
 *
 * @module core/slots
 */

export {
  scoreSlot,
  scoreSlots,
  recommendSlots,
  calculateDayScore,
  calculateTimeScore,
  calculateFeeScore,
  calculateAvailabilityScore,
} from './scoring.js';
