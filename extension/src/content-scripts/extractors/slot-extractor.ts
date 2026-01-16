/**
 * Delivery Slots Extractor
 *
 * Extracts delivery slot information from Auchan.pt slot selection page.
 * Uses verified selectors from data/selectors/pages/delivery-slots/v1.json
 *
 * Pattern: Pure DOM extraction (no Chrome APIs)
 */

import type { DeliverySlot, SlotExtractionResult } from '../../types/slots';

/**
 * Extract all delivery slots from the current page
 *
 * Reads slot data from DOM using verified BEM selectors.
 * Handles both available and unavailable slots across all visible days.
 *
 * @returns {SlotExtractionResult} Extracted slots with metadata
 */
export function extractDeliverySlots(): SlotExtractionResult {
  const slots: DeliverySlot[] = [];
  let availableCount = 0;
  let unavailableCount = 0;

  // Extract all available days from day tabs
  const dayDates = extractAvailableDays();

  // Get currently selected/visible day
  const currentDate = getCurrentSelectedDate();

  // Extract all time slots for current day
  const timeSlotElements = document.querySelectorAll('.auc-book-slot__slot');

  for (const slotElement of Array.from(timeSlotElements)) {
    const slot = extractSlotData(slotElement as HTMLElement, currentDate);
    if (slot) {
      slots.push(slot);
      if (slot.available) {
        availableCount++;
      } else {
        unavailableCount++;
      }
    }
  }

  // Determine date range
  const dateRange = {
    start: dayDates.length > 0 ? dayDates[0] : currentDate,
    end: dayDates.length > 0 ? dayDates[dayDates.length - 1] : currentDate,
  };

  return {
    slots,
    dateRange,
    availableCount,
    unavailableCount,
    extractedAt: Date.now(),
  };
}

/**
 * Extract available delivery days from day tabs
 *
 * @returns {string[]} Array of ISO dates (YYYY-MM-DD)
 */
function extractAvailableDays(): string[] {
  const dates: string[] = [];

  // Find all day date elements with data-date attribute
  const dayDateElements = document.querySelectorAll('.auc-run-day-month[data-date]');

  for (const element of Array.from(dayDateElements)) {
    const date = element.getAttribute('data-date');
    if (date) {
      dates.push(date);
    }
  }

  return dates;
}

/**
 * Get currently selected day's date
 *
 * @returns {string} ISO date (YYYY-MM-DD) or empty string if not found
 */
function getCurrentSelectedDate(): string {
  // Try to find the active day tab's date element
  const activeTab = document.querySelector('.nav-link-tab.nav-link.active');
  if (activeTab) {
    const dateElement = activeTab.querySelector('.auc-run-day-month[data-date]');
    if (dateElement) {
      const date = dateElement.getAttribute('data-date');
      if (date) return date;
    }
  }

  // Fallback: get first available date
  const firstDateElement = document.querySelector('.auc-run-day-month[data-date]');
  if (firstDateElement) {
    const date = firstDateElement.getAttribute('data-date');
    if (date) return date;
  }

  // Last resort: use current date
  const today = new Date();
  return today.toISOString().split('T')[0];
}

/**
 * Extract slot data from a time slot element
 *
 * @param {HTMLElement} slotElement - The slot DOM element
 * @param {string} date - The date this slot belongs to (YYYY-MM-DD)
 * @returns {DeliverySlot | null} Extracted slot or null if invalid
 */
function extractSlotData(slotElement: HTMLElement, date: string): DeliverySlot | null {
  // Get data attributes
  const timeData = slotElement.getAttribute('data-time');
  const priceData = slotElement.getAttribute('data-price');
  const isFreeAttr = slotElement.getAttribute('data-is-free');
  const hasSlotsAttr = slotElement.getAttribute('data-has-slots-to-book');

  if (!timeData) {
    return null; // Invalid slot, no time data
  }

  // Parse time range
  const { timeStart, timeEnd } = parseTimeRange(timeData);

  // Parse price
  const isFree = isFreeAttr === 'true';
  const fee = isFree ? 0 : parsePrice(priceData || '0');

  // Check availability
  const available = hasSlotsAttr === 'true';

  // Generate unique ID
  const id = `${date}-${timeStart}`;

  // Get day of week
  const dayOfWeek = getDayOfWeek(date);

  return {
    id,
    date,
    dayOfWeek,
    timeStart,
    timeEnd,
    fee,
    available,
    isFree,
  };
}

/**
 * Parse time range from slot time text
 *
 * Handles formats like:
 * - "10:00 - 12:00"
 * - "10:00-12:00"
 * - "10:00 – 12:00" (en dash)
 *
 * @param {string} text - Time range text
 * @returns {{ timeStart: string; timeEnd: string }}
 */
function parseTimeRange(text: string): { timeStart: string; timeEnd: string } {
  // Match time pattern with flexible separator
  const match = text.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);

  if (match) {
    return {
      timeStart: match[1],
      timeEnd: match[2],
    };
  }

  // Fallback: try to find just a single time
  const singleTimeMatch = text.match(/(\d{1,2}:\d{2})/);
  if (singleTimeMatch) {
    return {
      timeStart: singleTimeMatch[1],
      timeEnd: singleTimeMatch[1],
    };
  }

  // Last resort: return placeholder
  return {
    timeStart: '00:00',
    timeEnd: '00:00',
  };
}

/**
 * Parse price from data attribute or text
 *
 * Handles formats like:
 * - "5.99"
 * - "5,99"
 * - "+ 5,99 €"
 * - "5,99 €"
 *
 * @param {string} priceText - Price text
 * @returns {number} Price as number
 */
function parsePrice(priceText: string): number {
  if (!priceText) return 0;

  // Remove currency symbols and whitespace
  const cleaned = priceText.replace(/[+€\s]/g, '');

  // Replace comma with dot for parsing
  const normalized = cleaned.replace(',', '.');

  // Extract first number
  const match = normalized.match(/\d+\.?\d*/);
  if (match) {
    const price = parseFloat(match[0]);
    return isNaN(price) ? 0 : price;
  }

  return 0;
}

/**
 * Get day of week from ISO date
 *
 * @param {string} isoDate - ISO date string (YYYY-MM-DD)
 * @returns {string} Day name in lowercase (monday, tuesday, etc.)
 */
function getDayOfWeek(isoDate: string): string {
  const date = new Date(isoDate + 'T12:00:00'); // Use noon to avoid timezone issues
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[date.getDay()];
}

/**
 * Validate if current page is the delivery slots page
 *
 * @returns {boolean} True if on slots page
 */
export function isOnSlotsPage(): boolean {
  // Check URL pattern
  const url = window.location.href;
  const urlPattern = /^https:\/\/(www\.)?auchan\.pt\/pt\/(escolher-horario-entrega|checkout|entrega|delivery)/;

  if (!urlPattern.test(url)) {
    return false;
  }

  // Check for slot container
  const slotContainer = document.querySelector('.auc-book-slot__container');
  return !!slotContainer;
}

/**
 * Extract all slots across all days (requires tab clicking)
 *
 * NOTE: This function is async and requires clicking day tabs.
 * Use extractDeliverySlots() for current day only (synchronous).
 *
 * @param {number} delayBetweenTabs - Delay in ms between tab clicks (default 500ms)
 * @returns {Promise<SlotExtractionResult>} All slots from all days
 */
export async function extractAllDaysSlots(delayBetweenTabs = 500): Promise<SlotExtractionResult> {
  const allSlots: DeliverySlot[] = [];
  let totalAvailable = 0;
  let totalUnavailable = 0;

  // Get all day tabs
  const dayTabs = Array.from(document.querySelectorAll('.nav-link-tab.nav-link'));
  const dayDates = extractAvailableDays();

  // Extract slots from each day
  for (let i = 0; i < dayTabs.length; i++) {
    const tab = dayTabs[i] as HTMLElement;

    // Click tab if not already active
    if (!tab.classList.contains('active')) {
      tab.click();
      // Wait for DOM to update
      await new Promise(resolve => setTimeout(resolve, delayBetweenTabs));
    }

    // Extract slots for this day
    const result = extractDeliverySlots();
    allSlots.push(...result.slots);
    totalAvailable += result.availableCount;
    totalUnavailable += result.unavailableCount;
  }

  return {
    slots: allSlots,
    dateRange: {
      start: dayDates[0] || '',
      end: dayDates[dayDates.length - 1] || '',
    },
    availableCount: totalAvailable,
    unavailableCount: totalUnavailable,
    extractedAt: Date.now(),
  };
}
