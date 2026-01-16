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
 * Extract slots for a specific day from the currently visible slot container.
 *
 * @param page - Playwright page
 * @param dateStr - ISO date string (e.g., "2026-01-15")
 * @param logger - Logger instance
 * @param maxSlots - Maximum number of slots to extract
 * @returns Array of DeliverySlot objects
 */
async function extractSlotsForDay(
  page: import('playwright').Page,
  dateStr: string,
  logger: { debug: (msg: string, ctx?: Record<string, unknown>) => void },
  maxSlots: number
): Promise<DeliverySlot[]> {
  const slots: DeliverySlot[] = [];

  const slotElements = await page.$$(VERIFIED_SELECTORS.timeSlot);

  for (const element of slotElements) {
    if (slots.length >= maxSlots) break;

    // Extract data attributes
    const timeAttr = await element.getAttribute('data-time');
    const priceAttr = await element.getAttribute('data-price');
    const isFreeAttr = await element.getAttribute('data-is-free');
    const isExpressAttr = await element.getAttribute('data-express');
    const hasSlotsAttr = await element.getAttribute('data-has-slots-to-book');
    const storeIdAttr = await element.getAttribute('data-slot-store-id');

    // Get time from data-time attribute OR from innerText
    let timeSource = timeAttr;
    if (!timeSource) {
      const innerText = await element.textContent();
      if (innerText) {
        timeSource = innerText.trim();
      }
    }

    if (!timeSource) {
      logger.debug('Slot element missing time information');
      continue;
    }

    // Parse time range (e.g., "12:30 - 14:30")
    const timeMatch = timeSource.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
    if (!timeMatch) {
      logger.debug('Could not parse time', { timeSource: timeSource.substring(0, 30) });
      continue;
    }

    const startHour = timeMatch[1] ?? '00';
    const startMin = timeMatch[2] ?? '00';
    const endHour = timeMatch[3] ?? '00';
    const endMin = timeMatch[4] ?? '00';

    const startTime = `${startHour.padStart(2, '0')}:${startMin}`;
    const endTime = `${endHour.padStart(2, '0')}:${endMin}`;

    // Parse date from the provided dateStr
    const date = new Date(dateStr + 'T00:00:00');
    const dayOfWeek = date.getDay();

    // Parse price
    let cost = 0;
    if (priceAttr) {
      const priceMatch = priceAttr.match(/(\d+(?:[.,]\d+)?)/);
      if (priceMatch?.[1]) {
        cost = parseFloat(priceMatch[1].replace(',', '.'));
      }
    }

    // Parse status
    const isFree = isFreeAttr === 'true';
    const hasSlots = hasSlotsAttr === 'true';
    const isExpress = isExpressAttr === 'true';

    let status: SlotStatus = 'unknown';
    if (hasSlots) {
      status = 'available';
    } else {
      status = 'full';
    }

    const deliveryType: DeliveryType = isExpress ? 'express' : 'standard';

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
  }

  return slots;
}

/**
 * ExtractSlotsTool implementation.
 *
 * Attempts to extract delivery slots from the current page.
 * Handles multiple possible UI layouts (calendar, list, grid).
 *
 * Now supports MULTI-DAY extraction by clicking through day tabs.
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

      // Debug: Log what elements we can find on the page
      // Reserved for future debugging use
      void await page.evaluate(`
        (function() {
          const container = document.querySelector('.auc-book-slot__container');
          const dayTabs = document.querySelectorAll('.nav-link-tab.nav-link');
          const slots = document.querySelectorAll('.auc-book-slot__slot');
          const allSlotLike = document.querySelectorAll('[class*="slot"]');

          // Get any calendar/date related elements
          const dateElements = document.querySelectorAll('[data-date], [class*="date"], [class*="day"]');
          const timeElements = document.querySelectorAll('[data-time], [class*="time"], [class*="hour"]');

          return {
            hasContainer: !!container,
            containerClasses: container ? Array.from(container.classList).join(' ') : null,
            dayTabsCount: dayTabs.length,
            slotsCount: slots.length,
            allSlotLikeCount: allSlotLike.length,
            dateElementsCount: dateElements.length,
            timeElementsCount: timeElements.length,
            bodyClasses: document.body.className,
            // Get some sample slot-like elements
            slotLikeSamples: Array.from(allSlotLike).slice(0, 5).map(el => ({
              tagName: el.tagName,
              className: el.className.substring(0, 100),
              dataTime: el.getAttribute('data-time'),
              dataPrice: el.getAttribute('data-price'),
            })),
          };
        })()
      `);


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

      // =======================================================================
      // MULTI-DAY EXTRACTION: Click each day tab and extract slots
      // =======================================================================

      // Find all day tab links (clickable)
      const dayTabLinks = await page.$$(VERIFIED_SELECTORS.dayTab);
      const tabsToProcess = Math.min(dayTabLinks.length, daysAhead);

      logger.info('Starting multi-day slot extraction', {
        totalTabs: dayTabLinks.length,
        tabsToProcess,
        daysAhead,
      });

      // Process each day tab
      for (let tabIndex = 0; tabIndex < tabsToProcess; tabIndex++) {
        // Re-find tabs after each click (DOM may change)
        const currentDayTabs = await page.$$(VERIFIED_SELECTORS.dayTab);
        const tabToClick = currentDayTabs[tabIndex];

        if (!tabToClick) {
          logger.warn('Day tab not found at index', { tabIndex });
          continue;
        }

        // Get the date for this tab BEFORE clicking (from the data-date child element)
        const dateElement = await tabToClick.$(`.auc-run-day-month[data-date]`);
        let tabDate = dateElement ? await dateElement.getAttribute('data-date') : null;

        if (!tabDate && availableDays[tabIndex]) {
          tabDate = availableDays[tabIndex]?.date ?? null;
        }

        if (!tabDate) {
          logger.warn('Could not determine date for tab', { tabIndex });
          continue;
        }

        // Click the tab to load its slots (skip first tab if already active)
        const isActive = await tabToClick.evaluate(el => el.classList.contains('active'));

        if (!isActive || tabIndex > 0) {
          logger.debug('Clicking day tab', { tabIndex, date: tabDate });

          try {
            await tabToClick.click({ timeout: 5000 });
            // Wait for UI to update after clicking
            await page.waitForTimeout(800);

            // Wait for slots container to be stable
            await page.waitForSelector(VERIFIED_SELECTORS.timeSlotsContainer, {
              timeout: 5000,
              state: 'visible',
            }).catch(() => {
              logger.debug('Slots container wait timed out', { tabIndex });
            });
          } catch (clickErr) {
            logger.warn('Failed to click day tab', {
              tabIndex,
              date: tabDate,
              error: clickErr instanceof Error ? clickErr.message : String(clickErr),
            });
            continue;
          }
        }

        // Extract slots for this day
        const daySlotsExtracted = await extractSlotsForDay(page, tabDate, logger, maxSlots - slots.length);
        slots.push(...daySlotsExtracted);

        logger.info('Extracted slots for day', {
          date: tabDate,
          slotsFound: daySlotsExtracted.length,
          totalSoFar: slots.length,
        });

        // Check if we've hit the max slots limit
        if (slots.length >= maxSlots) {
          logger.info('Reached maxSlots limit', { maxSlots, tabsProcessed: tabIndex + 1 });
          break;
        }
      }

      // Update daysChecked to reflect actual tabs processed
      const daysChecked = new Set(slots.map(s => s.date.toISOString().split('T')[0])).size;

      // If no slots were extracted from multi-day process, return empty
      if (slots.length === 0) {
        logger.warn('No slot elements found across any day');

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
