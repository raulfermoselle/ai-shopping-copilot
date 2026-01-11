/**
 * ExtractSlotsTool
 *
 * Extracts delivery slot data from the slot selection page.
 * Parses calendar/list view to collect available time windows.
 *
 * CRITICAL: Uses PORTUGUESE_DAY_NAMES for day parsing.
 */

import type { Tool, ToolResult, ToolContext, ToolError } from '../../../types/tool.js';
import type { ExtractSlotsInput, ExtractSlotsOutput } from './types.js';
import type { DeliverySlot, SlotStatus, DeliveryType } from '../types.js';
import { PORTUGUESE_DAY_NAMES } from '../types.js';

/**
 * Parse slot status from text indicators
 */
function parseSlotStatus(text: string): SlotStatus {
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
 * Parse delivery type from text
 */
function parseDeliveryType(text: string): DeliveryType {
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
 * Parse delivery cost from text (e.g., "€3,50" or "Grátis")
 */
function parseDeliveryCost(text: string): {
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
    if (thresholdMatch && thresholdMatch[1]) {
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
  if (costMatch && costMatch[1]) {
    return { cost: parseFloat(costMatch[1].replace(',', '.')) };
  }

  return { cost: 0 }; // Default to 0 if can't parse
}

/**
 * Parse date from Portuguese day name and date string
 */
function parseSlotDate(dayName: string, dateStr?: string): Date | null {
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

      // Strategy: Try multiple selector patterns to find slot elements
      // Common patterns:
      // - Calendar days with time slots
      // - List of time slots grouped by day
      // - Grid of delivery windows

      const slotContainerSelectors = [
        '[class*="slot"]',
        '[class*="delivery"]',
        '[class*="timeslot"]',
        '[class*="horario"]',
        '[data-testid*="slot"]',
        'div[role="button"]',
        'button[class*="slot"]',
      ];

      let slotElements: Array<{ element: any; text: string }> = [];

      // Try to find slot container elements
      for (const containerSelector of slotContainerSelectors) {
        try {
          const elements = await page.$$(containerSelector);

          if (elements.length > 0) {
            logger.info('Found potential slot elements', {
              selector: containerSelector,
              count: elements.length,
            });

            // Get text content for each element
            for (const element of elements) {
              const text = (await element.textContent()) ?? '';
              if (text.trim()) {
                slotElements.push({ element, text });
              }
            }

            if (slotElements.length > 0) {
              break; // Found valid elements
            }
          }
        } catch (err) {
          logger.debug('Selector failed', {
            selector: containerSelector,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (slotElements.length === 0) {
        logger.warn('No slot elements found on page');

        // Try to get page text to analyze
        const bodyText = await page.textContent('body').catch(() => '') ?? '';
        logger.debug('Page body text sample', {
          textSample: bodyText.slice(0, 500),
        });

        if (captureScreenshots) {
          const noSlotsScreenshot = await screenshot('extract-slots-no-elements');
          screenshots.push(noSlotsScreenshot);
        }

        // Return empty result but still success (page might be empty legitimately)
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

      logger.info('Processing slot elements', { count: slotElements.length });

      // Parse each slot element
      let daysChecked = 0;
      const seenDates = new Set<string>();

      for (const { text } of slotElements) {
        if (slots.length >= maxSlots) {
          logger.info('Reached maxSlots limit', { maxSlots });
          break;
        }

        // Try to extract slot information from text
        // Expected patterns:
        // - "Segunda-feira 13/01 - 10:00-12:00 - €3,50"
        // - "14:00 - 16:00 Disponível"
        // - Day + time + price/status

        // Find day name
        let dayName = '';
        let dayOfWeek = -1;
        for (let i = 0; i < PORTUGUESE_DAY_NAMES.length; i++) {
          if (text.includes(PORTUGUESE_DAY_NAMES[i] ?? '')) {
            dayName = PORTUGUESE_DAY_NAMES[i] ?? '';
            dayOfWeek = i;
            break;
          }
        }

        // Find date (DD/MM or DD/MM/YYYY)
        const dateMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?/);
        let date: Date | null = null;

        if (dateMatch) {
          const day = parseInt(dateMatch[1] ?? '0', 10);
          const month = parseInt(dateMatch[2] ?? '0', 10) - 1;
          const year = dateMatch[3] ? parseInt(dateMatch[3], 10) : new Date().getFullYear();
          date = new Date(year, month, day);

          if (dayOfWeek === -1) {
            dayOfWeek = date.getDay();
          }
        } else if (dayName) {
          // Try to infer date from day name
          date = parseSlotDate(dayName);
          if (date) {
            dayOfWeek = date.getDay();
          }
        }

        if (!date) {
          logger.debug('Could not parse date from slot element', { text });
          continue;
        }

        // Track days checked
        const dateKey = date.toISOString().split('T')[0];
        if (dateKey && !seenDates.has(dateKey)) {
          seenDates.add(dateKey);
          daysChecked++;
        }

        // Find time range (HH:MM - HH:MM or HH:MM-HH:MM)
        const timeMatch = text.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
        if (!timeMatch) {
          logger.debug('Could not parse time from slot element', { text });
          continue;
        }

        const startHour = timeMatch[1] ?? '00';
        const startMin = timeMatch[2] ?? '00';
        const endHour = timeMatch[3] ?? '00';
        const endMin = timeMatch[4] ?? '00';

        const startTime = `${startHour.padStart(2, '0')}:${startMin}`;
        const endTime = `${endHour.padStart(2, '0')}:${endMin}`;

        // Parse status
        const status = parseSlotStatus(text);

        // Parse delivery cost
        const { cost, freeAboveThreshold, threshold } = parseDeliveryCost(text);

        // Parse delivery type
        const deliveryType = parseDeliveryType(text);

        // Create slot
        const slot: DeliverySlot = {
          date,
          dayOfWeek,
          startTime,
          endTime,
          status,
          deliveryCost: cost,
          freeAboveThreshold,
          freeDeliveryThreshold: threshold,
          deliveryType,
        };

        slots.push(slot);
        logger.debug('Extracted slot', { slot, text });
      }

      // Look for minimum order value in page text
      let minimumOrder: number | undefined;
      try {
        const bodyText = await page.textContent('body', { timeout: 2000 }).catch(() => null);
        if (bodyText) {
          const match = bodyText.match(/mínima?:?\s*€?\s*(\d+(?:[.,]\d+)?)/i);
          if (match && match[1]) {
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
