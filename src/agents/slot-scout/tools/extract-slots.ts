/**
 * ExtractSlotsTool
 *
 * Extracts delivery slot data from the slot selection page.
 * Uses VERIFIED selectors from data/selectors/pages/delivery-slots/v1.json
 *
 * Key selectors:
 * - .auc-book-slot__container - page container
 * - .auc-book-slot__week-days-tabs - day tabs
 * - .nav-link-tab.nav-link - individual day tab
 * - .auc-book-slot__slot - time slot with data attributes
 *   - data-time, data-price, data-is-free, data-express
 *
 * CRITICAL: Uses PORTUGUESE_DAY_NAMES for day parsing.
 */

import type { Tool, ToolResult, ToolContext, ToolError } from '../../../types/tool.js';
import type { ExtractSlotsInput, ExtractSlotsOutput } from './types.js';
import type { DeliverySlot, SlotStatus, DeliveryType } from '../types.js';
import { PORTUGUESE_DAY_NAMES } from '../types.js';

// =============================================================================
// Verified Selectors (from data/selectors/pages/delivery-slots/v1.json)
// =============================================================================

const VERIFIED_SELECTORS = {
  pageContainer: '.auc-book-slot__container',
  dayTabsContainer: '.auc-book-slot__week-days-tabs',
  dayTab: '.nav-link-tab.nav-link',
  dayTabActive: '.nav-link-tab.nav-link.active',
  dayTabDate: '.auc-run-day-month[data-date]',
  timeSlotsContainer: '.auc-book-slot__slots',
  timeSlot: '.auc-book-slot__slot',
  slotTime: '.auc-slot__time',
  slotPrice: '.auc-slot__desc',
} as const;

// =============================================================================
// Legacy Text Parsing Functions (for fallback scenarios)
// =============================================================================

/**
 * Parse slot status from text indicators (fallback for non-data-attribute pages)
 */
export function parseSlotStatusFromText(text: string): SlotStatus {
  const lowerText = text.toLowerCase();

  if (
    lowerText.includes('disponível') ||
    lowerText.includes('available') ||
    lowerText.includes('livre')
  ) {
    return 'available';
  }

  if (
    lowerText.includes('poucos') ||
    lowerText.includes('limitado') ||
    lowerText.includes('limited')
  ) {
    return 'limited';
  }

  if (
    lowerText.includes('esgotado') ||
    lowerText.includes('completo') ||
    lowerText.includes('full') ||
    lowerText.includes('cheio')
  ) {
    return 'full';
  }

  if (lowerText.includes('indisponível') || lowerText.includes('unavailable')) {
    return 'unavailable';
  }

  return 'unknown';
}

/**
 * Parse delivery type from text (fallback)
 */
export function parseDeliveryTypeFromText(text: string): DeliveryType {
  const lowerText = text.toLowerCase();

  if (lowerText.includes('expresso') || lowerText.includes('express')) {
    return 'express';
  }

  if (
    lowerText.includes('recolha') ||
    lowerText.includes('pickup') ||
    lowerText.includes('click')
  ) {
    return 'pickup';
  }

  if (lowerText.includes('standard') || lowerText.includes('normal')) {
    return 'standard';
  }

  return 'standard'; // Default to standard
}

/**
 * Parse delivery cost from text (e.g., "€3,50" or "Grátis") - fallback
 */
export function parseDeliveryCostFromText(text: string): {
  cost: number;
  freeAboveThreshold?: boolean;
  threshold?: number;
} {
  const lowerText = text.toLowerCase();

  // Check for free delivery
  if (
    lowerText.includes('grátis') ||
    lowerText.includes('gratuito') ||
    lowerText.includes('free')
  ) {
    // Check if there's a threshold mentioned
    const thresholdMatch = text.match(/€\s*(\d+(?:[.,]\d+)?)/);
    if (thresholdMatch?.[1]) {
      return {
        cost: 0,
        freeAboveThreshold: true,
        threshold: parseFloat(thresholdMatch[1].replace(',', '.')),
      };
    }

    return { cost: 0 };
  }

  // Parse cost amount
  const costMatch = text.match(/€\s*(\d+(?:[.,]\d+)?)/);
  if (costMatch?.[1]) {
    return { cost: parseFloat(costMatch[1].replace(',', '.')) };
  }

  return { cost: 0 }; // Default to 0 if can't parse
}

/**
 * Parse date from Portuguese day name and date string (fallback)
 */
export function parseSlotDateFromText(dayName: string, dateStr?: string): Date | null {
  const now = new Date();

  // If we have a full date string (e.g., "12/01/2026"), parse it
  if (dateStr) {
    const dateMatch = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dateMatch) {
      const day = parseInt(dateMatch[1] ?? '0', 10);
      const month = parseInt(dateMatch[2] ?? '0', 10) - 1; // JS months are 0-indexed
      const year = parseInt(dateMatch[3] ?? '0', 10);
      return new Date(year, month, day);
    }
  }

  // Otherwise, try to find the day name in PORTUGUESE_DAY_NAMES
  const dayIndex = PORTUGUESE_DAY_NAMES.findIndex(
    (name) => name.toLowerCase() === dayName.toLowerCase()
  );

  if (dayIndex === -1) {
    return null; // Unknown day name
  }

  // Find the next occurrence of this day
  const currentDayOfWeek = now.getDay();
  let daysUntil = dayIndex - currentDayOfWeek;

  if (daysUntil <= 0) {
    daysUntil += 7; // Next week
  }

  const targetDate = new Date(now);
  targetDate.setDate(targetDate.getDate() + daysUntil);
  targetDate.setHours(0, 0, 0, 0);

  return targetDate;
}

/**
 * ExtractSlotsTool implementation.
 *
 * Attempts to extract delivery slots from the current page.
 * Handles multiple possible UI layouts (calendar, list, grid).
 *
 * NOTE: Since there's no checkout selector registry yet, this uses
 * heuristic selectors based on common patterns. May need refinement.
 *
 * @example
 * const result = await extractSlotsTool.execute(
 *   { daysAhead: 7, maxSlots: 50 },
 *   context
 * );
 */
export const extractSlotsTool: Tool<ExtractSlotsInput, ExtractSlotsOutput> = {
  name: 'extractSlots',
  description: 'Extract delivery slot data from slot selection page',

  async execute(
    input: ExtractSlotsInput,
    context: ToolContext
  ): Promise<ToolResult<ExtractSlotsOutput>> {
    const start = Date.now();
    const { page, logger, screenshot } = context;
    const { daysAhead = 7, maxSlots = 100, captureScreenshots = true } = input;

    const screenshots: string[] = [];
    const slots: DeliverySlot[] = [];

    try {
      logger.info('ExtractSlotsTool starting', {
        currentUrl: page.url(),
        daysAhead,
        maxSlots,
      });

      const sourceUrl = page.url();

      if (captureScreenshots) {
        const initialScreenshot = await screenshot('extract-slots-initial');
        screenshots.push(initialScreenshot);
      }

      // =======================================================================
      // Strategy: Use VERIFIED selectors with data attributes
      // =======================================================================

      // First check if we're on the right page
      const pageContainer = await page.$(VERIFIED_SELECTORS.pageContainer);
      if (!pageContainer) {
        logger.warn('Not on delivery slots page - container not found', {
          selector: VERIFIED_SELECTORS.pageContainer,
        });

        if (captureScreenshots) {
          const noPageScreenshot = await screenshot('extract-slots-wrong-page');
          screenshots.push(noPageScreenshot);
        }

        return {
          success: true,
          data: {
            slots: [],
            daysChecked: 0,
            sourceUrl,
            screenshots,
          },
          screenshots,
          duration: Date.now() - start,
        };
      }

      logger.info('Found delivery slots page container');

      // Extract available days from day tabs
      const dayTabs = await page.$$(VERIFIED_SELECTORS.dayTabDate);
      const availableDays: Array<{ date: string; displayText: string }> = [];

      for (const tab of dayTabs) {
        const dateAttr = await tab.getAttribute('data-date');
        const displayText = await tab.textContent();
        if (dateAttr) {
          availableDays.push({
            date: dateAttr,
            displayText: displayText?.trim() ?? '',
          });
        }
      }

      logger.info('Found available days', {
        count: availableDays.length,
        days: availableDays.map(d => d.date),
      });

      // Extract slots using data attributes
      const slotElements = await page.$$(VERIFIED_SELECTORS.timeSlot);
      logger.info('Found time slot elements', { count: slotElements.length });

      if (slotElements.length === 0) {
        logger.warn('No slot elements found');

        if (captureScreenshots) {
          const noSlotsScreenshot = await screenshot('extract-slots-no-elements');
          screenshots.push(noSlotsScreenshot);
        }

        return {
          success: true,
          data: {
            slots: [],
            daysChecked: availableDays.length,
            sourceUrl,
            screenshots,
          },
          screenshots,
          duration: Date.now() - start,
        };
      }

      // Parse each slot using data attributes
      let daysChecked = 0;
      const seenDates = new Set<string>();

      // Get current active day tab to know which date the slots belong to
      const activeTab = await page.$(VERIFIED_SELECTORS.dayTabActive);
      let currentDate: string | null = null;

      if (activeTab) {
        const dateEl = await activeTab.$(VERIFIED_SELECTORS.dayTabDate.replace('.auc-run-day-month', ''));
        if (dateEl) {
          currentDate = await dateEl.getAttribute('data-date');
        }
      }

      // If we couldn't get current date, use the first available day
      if (!currentDate && availableDays.length > 0) {
        currentDate = availableDays[0]?.date ?? null;
      }

      // Default to today if still no date
      if (!currentDate) {
        currentDate = new Date().toISOString().split('T')[0] ?? '';
      }

      logger.info('Extracting slots for date', { currentDate });

      for (const element of slotElements) {
        if (slots.length >= maxSlots) {
          logger.info('Reached maxSlots limit', { maxSlots });
          break;
        }

        // Extract data attributes
        const timeAttr = await element.getAttribute('data-time');
        const priceAttr = await element.getAttribute('data-price');
        const isFreeAttr = await element.getAttribute('data-is-free');
        const isExpressAttr = await element.getAttribute('data-express');
        const hasSlotsAttr = await element.getAttribute('data-has-slots-to-book');
        const storeIdAttr = await element.getAttribute('data-slot-store-id');

        if (!timeAttr) {
          logger.debug('Slot element missing data-time attribute');
          continue;
        }

        // Parse time range (e.g., "12:30 - 14:30")
        const timeMatch = timeAttr.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
        if (!timeMatch) {
          logger.debug('Could not parse time from data-time', { timeAttr });
          continue;
        }

        const startHour = timeMatch[1] ?? '00';
        const startMin = timeMatch[2] ?? '00';
        const endHour = timeMatch[3] ?? '00';
        const endMin = timeMatch[4] ?? '00';

        const startTime = `${startHour.padStart(2, '0')}:${startMin}`;
        const endTime = `${endHour.padStart(2, '0')}:${endMin}`;

        // Parse date
        const date = new Date(currentDate + 'T00:00:00');
        const dayOfWeek = date.getDay();

        // Track days
        const dateKey = currentDate;
        if (dateKey && !seenDates.has(dateKey)) {
          seenDates.add(dateKey);
          daysChecked++;
        }

        // Parse price (e.g., "5,99 €")
        let cost = 0;
        if (priceAttr) {
          const priceMatch = priceAttr.match(/(\d+(?:[.,]\d+)?)/);
          if (priceMatch?.[1]) {
            cost = parseFloat(priceMatch[1].replace(',', '.'));
          }
        }

        // Parse status from data attributes
        const isFree = isFreeAttr === 'true';
        const hasSlots = hasSlotsAttr === 'true';
        const isExpress = isExpressAttr === 'true';

        let status: SlotStatus = 'unknown';
        if (hasSlots) {
          status = 'available';
        } else {
          status = 'full';
        }

        // Parse delivery type
        const deliveryType: DeliveryType = isExpress ? 'express' : 'standard';

        // Create slot
        const slot: DeliverySlot = {
          slotId: storeIdAttr ?? undefined,
          date,
          dayOfWeek,
          startTime,
          endTime,
          status,
          deliveryCost: isFree ? 0 : cost,
          freeAboveThreshold: isFree,
          deliveryType,
        };

        slots.push(slot);
        logger.debug('Extracted slot from data attributes', {
          time: timeAttr,
          price: priceAttr,
          isFree,
          hasSlots,
        });
      }

      // Look for minimum order value in page text
      let minimumOrder: number | undefined;
      try {
        const bodyText = await page.textContent('body', { timeout: 2000 }).catch(() => null);
        if (bodyText) {
          const match = bodyText.match(/mínima?:?\s*€?\s*(\d+(?:[.,]\d+)?)/i);
          if (match?.[1]) {
            minimumOrder = parseFloat(match[1].replace(',', '.'));
          }
        }
      } catch {
        // Ignore
      }

      if (captureScreenshots) {
        const finalScreenshot = await screenshot('extract-slots-complete');
        screenshots.push(finalScreenshot);
      }

      logger.info('ExtractSlotsTool completed', {
        slotsExtracted: slots.length,
        daysChecked,
        minimumOrder,
      });

      return {
        success: true,
        data: {
          slots,
          daysChecked,
          ...(minimumOrder !== undefined && { minimumOrder }),
          sourceUrl,
          screenshots,
        },
        screenshots,
        duration: Date.now() - start,
      };
    } catch (err) {
      logger.error('ExtractSlotsTool execution failed', {
        error: err instanceof Error ? err.message : String(err),
      });

      const errorScreenshot = await screenshot('extract-slots-error').catch(() => '');
      if (errorScreenshot) {
        screenshots.push(errorScreenshot);
      }

      const toolError: ToolError = {
        message:
          err instanceof Error ? err.message : 'Unknown error during slot extraction',
        code:
          err instanceof Error && err.message.includes('Timeout')
            ? 'TIMEOUT_ERROR'
            : 'UNKNOWN_ERROR',
        recoverable: true,
      };

      if (err instanceof Error) {
        toolError.cause = err;
      }

      return {
        success: false,
        error: toolError,
        screenshots,
        duration: Date.now() - start,
      };
    }
  },
};
