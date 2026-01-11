/**
 * SlotScout Agent Implementation
 *
 * Scouts delivery slot options by:
 * - Navigating to delivery slot selection page
 * - Extracting available slots from the UI
 * - Grouping slots by day
 * - Scoring and ranking slots based on user preferences
 * - Returning to cart (never completing checkout)
 *
 * CRITICAL: Never proceeds with checkout. Always returns to cart after scouting.
 */

import type { AgentContext, AgentResult } from '../../types/agent.js';
import type { ToolContext, ToolConfig } from '../../types/tool.js';
import type {
  SlotScoutConfig,
  SlotScoutInput,
  DeliverySlot,
  DaySlotGroup,
  RankedSlot,
} from './types.js';
import { SlotScoutConfigSchema } from './types.js';
import { getPortugueseDayName } from './types.js';
import { rankSlots } from './scoring.js';

// Import SlotScout tools
import { navigateToSlotsTool, extractSlotsTool } from './tools/index.js';

// =============================================================================
// SlotScout Result Types
// =============================================================================

/**
 * Successful SlotScout result data.
 */
export interface SlotScoutResultData {
  /** All available slots by day */
  slotsByDay: DaySlotGroup[];
  /** Top ranked slots */
  rankedSlots: RankedSlot[];
  /** Summary statistics */
  summary: {
    daysChecked: number;
    totalSlots: number;
    availableSlots: number;
    earliestAvailable?: Date;
    cheapestDelivery?: number;
    freeDeliveryAvailable: boolean;
  };
  /** Minimum cart value for delivery (if applicable) */
  minimumOrder?: number;
  /** URL where slots were found */
  sourceUrl?: string;
  /** When the scout was completed */
  scoutedAt: Date;
}

/**
 * SlotScout agent result.
 */
export interface SlotScoutResult extends AgentResult {
  data?: SlotScoutResultData;
}

// =============================================================================
// SlotScout Agent
// =============================================================================

/**
 * SlotScout Agent
 *
 * Responsible for:
 * 1. Navigating to delivery slot selection
 * 2. Extracting available slots
 * 3. Grouping slots by day
 * 4. Scoring and ranking slots
 * 5. Returning to cart
 *
 * Uses heuristic selectors until checkout selector registry is created.
 */
export class SlotScout {
  private readonly config: SlotScoutConfig;
  private readonly screenshotDir: string;
  private screenshots: string[] = [];

  constructor(config: Partial<SlotScoutConfig> = {}) {
    this.config = SlotScoutConfigSchema.parse(config);
    this.screenshotDir = 'screenshots';
  }

  /**
   * Create a ToolContext from AgentContext for tool execution.
   */
  private createToolContext(context: AgentContext): ToolContext {
    const { page, logger } = context;

    const toolConfig: ToolConfig = {
      navigationTimeout: this.config.pageTimeout,
      elementTimeout: 10000,
      screenshotDir: this.screenshotDir,
    };

    return {
      page,
      logger,
      screenshot: async (name: string): Promise<string> => {
        const timestamp = Date.now();
        const filename = `${name}-${timestamp}.png`;
        const filepath = `${this.screenshotDir}/${filename}`;
        await page.screenshot({ path: filepath });
        this.screenshots.push(filepath);
        return filepath;
      },
      config: toolConfig,
    };
  }

  /**
   * Run the SlotScout agent.
   *
   * @param context - Agent execution context
   * @param input - Slot scout input with preferences
   * @returns SlotScout result with ranked slots
   */
  async run(context: AgentContext, input: SlotScoutInput = {}): Promise<SlotScoutResult> {
    const { logger } = context;
    const logs: string[] = [];
    const toolContext = this.createToolContext(context);

    // Reset screenshots for this run
    this.screenshots = [];

    // Merge config from input (use defaults from this.config for any undefined values)
    const effectiveConfig: SlotScoutConfig = {
      daysAhead: input.config?.daysAhead ?? this.config.daysAhead,
      maxSlots: input.config?.maxSlots ?? this.config.maxSlots,
      pageTimeout: input.config?.pageTimeout ?? this.config.pageTimeout,
      weights: input.config?.weights ?? this.config.weights,
    };

    const preferences = input.preferences;

    try {
      logger.info('SlotScout starting', {
        config: effectiveConfig,
        hasPreferences: !!preferences,
      });
      logs.push('SlotScout started');

      // Step 1: Navigate to delivery slot selection
      const navigationResult = await this.navigateToSlots(
        toolContext,
        effectiveConfig,
        input.cartTotal
      );

      if (!navigationResult.success) {
        throw new Error(navigationResult.error ?? 'Navigation to slots failed');
      }

      logs.push(`Navigated to slot selection: ${navigationResult.url}`);

      // Step 2: Extract all available slots
      const extractionResult = await this.extractAllSlots(
        toolContext,
        effectiveConfig
      );

      if (!extractionResult.success) {
        throw new Error(extractionResult.error ?? 'Slot extraction failed');
      }

      const { slots, daysChecked, minimumOrder, sourceUrl } = extractionResult;
      logs.push(`Extracted ${slots.length} slots from ${daysChecked} days`);

      // Step 3: Group slots by day
      const slotsByDay = this.groupSlotsByDay(slots);
      logs.push(`Grouped into ${slotsByDay.length} days`);

      // Step 4: Rank slots by preferences
      const rankedSlots = rankSlots(slots, preferences, effectiveConfig);
      logs.push(`Ranked ${rankedSlots.length} slots`);

      // Limit to maxSlots
      const topRankedSlots = rankedSlots.slice(0, effectiveConfig.maxSlots);

      // Step 5: Generate summary
      const summary = this.generateSummary(slots, slotsByDay);
      logs.push(
        `Summary: ${summary.availableSlots}/${summary.totalSlots} available slots`
      );

      // Step 6: Return to cart (CRITICAL - never complete checkout)
      await this.returnToCart(toolContext);
      logs.push('Returned to cart');

      logger.info('SlotScout completed successfully', {
        totalSlots: summary.totalSlots,
        availableSlots: summary.availableSlots,
        topScore: topRankedSlots[0]?.score.overall,
      });

      const resultData: SlotScoutResultData = {
        slotsByDay,
        rankedSlots: topRankedSlots,
        summary,
        scoutedAt: new Date(),
      };

      // Add optional fields only if defined
      const finalMinimumOrder = minimumOrder ?? navigationResult.minimumOrder;
      if (finalMinimumOrder !== undefined) {
        resultData.minimumOrder = finalMinimumOrder;
      }
      if (sourceUrl !== undefined) {
        resultData.sourceUrl = sourceUrl;
      }

      return {
        success: true,
        data: resultData,
        logs,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('SlotScout failed', { error: err.message });
      logs.push(`Error: ${err.message}`);

      // Try to return to cart even on error
      try {
        await this.returnToCart(toolContext);
        logs.push('Returned to cart after error');
      } catch (returnErr) {
        logger.error('Failed to return to cart after error', {
          error: returnErr instanceof Error ? returnErr.message : String(returnErr),
        });
        logs.push('WARNING: Could not return to cart automatically');
      }

      return {
        success: false,
        error: err,
        logs,
      };
    }
  }

  // ===========================================================================
  // Private Methods - Tool integrations
  // ===========================================================================

  /**
   * Navigate to delivery slot selection page using NavigateToSlotsTool.
   */
  private async navigateToSlots(
    toolContext: ToolContext,
    config: SlotScoutConfig,
    cartTotal?: number
  ): Promise<{
    success: boolean;
    url: string;
    minimumOrder?: number;
    error?: string;
  }> {
    const navInput: {
      waitForLoad: boolean;
      timeout: number;
      cartTotal?: number;
    } = {
      waitForLoad: true,
      timeout: config.pageTimeout,
    };
    if (cartTotal !== undefined) {
      navInput.cartTotal = cartTotal;
    }

    const result = await navigateToSlotsTool.execute(navInput, toolContext);

    if (!result.success || !result.data) {
      return {
        success: false,
        url: '',
        error: result.error?.message ?? 'Navigation failed',
      };
    }

    const navResult: {
      success: boolean;
      url: string;
      minimumOrder?: number;
    } = {
      success: true,
      url: result.data.url,
    };
    if (result.data.minimumOrder !== undefined) {
      navResult.minimumOrder = result.data.minimumOrder;
    }

    return navResult;
  }

  /**
   * Extract all delivery slots from the page using ExtractSlotsTool.
   */
  private async extractAllSlots(
    toolContext: ToolContext,
    config: SlotScoutConfig
  ): Promise<{
    success: boolean;
    slots: DeliverySlot[];
    daysChecked: number;
    minimumOrder?: number;
    sourceUrl?: string;
    error?: string;
  }> {
    const result = await extractSlotsTool.execute(
      {
        daysAhead: config.daysAhead,
        maxSlots: config.maxSlots * 2, // Extract more, filter later
        captureScreenshots: true,
      },
      toolContext
    );

    if (!result.success || !result.data) {
      return {
        success: false,
        slots: [],
        daysChecked: 0,
        error: result.error?.message ?? 'Extraction failed',
      };
    }

    const extractResult: {
      success: boolean;
      slots: DeliverySlot[];
      daysChecked: number;
      minimumOrder?: number;
      sourceUrl?: string;
    } = {
      success: true,
      slots: result.data.slots,
      daysChecked: result.data.daysChecked,
    };
    if (result.data.minimumOrder !== undefined) {
      extractResult.minimumOrder = result.data.minimumOrder;
    }
    if (result.data.sourceUrl !== undefined) {
      extractResult.sourceUrl = result.data.sourceUrl;
    }

    return extractResult;
  }

  /**
   * Group slots by date.
   */
  private groupSlotsByDay(slots: DeliverySlot[]): DaySlotGroup[] {
    // Group by date string
    const grouped = new Map<string, DeliverySlot[]>();

    for (const slot of slots) {
      const dateString = slot.date.toISOString().split('T')[0];
      if (!dateString) continue;

      const existing = grouped.get(dateString) ?? [];
      existing.push(slot);
      grouped.set(dateString, existing);
    }

    // Convert to DaySlotGroup array
    const groups: DaySlotGroup[] = [];

    for (const [dateString, daySlots] of grouped.entries()) {
      if (daySlots.length === 0) continue;

      const firstSlot = daySlots[0];
      if (!firstSlot) continue;

      const date = firstSlot.date;
      const dayName = getPortugueseDayName(firstSlot.dayOfWeek);

      const availableCount = daySlots.filter(
        (s) => s.status === 'available' || s.status === 'limited'
      ).length;

      groups.push({
        dateString,
        date,
        dayName,
        slots: daySlots,
        availableCount,
        hasAvailability: availableCount > 0,
      });
    }

    // Sort by date
    groups.sort((a, b) => a.date.getTime() - b.date.getTime());

    return groups;
  }

  /**
   * Generate summary statistics.
   */
  private generateSummary(
    slots: DeliverySlot[],
    slotsByDay: DaySlotGroup[]
  ): {
    daysChecked: number;
    totalSlots: number;
    availableSlots: number;
    earliestAvailable?: Date;
    cheapestDelivery?: number;
    freeDeliveryAvailable: boolean;
  } {
    const availableSlots = slots.filter(
      (s) => s.status === 'available' || s.status === 'limited'
    );

    const earliestAvailable = availableSlots.length > 0 ? availableSlots[0]?.date : undefined;

    const slotsWithCost = slots.filter((s) => s.deliveryCost !== undefined);
    const cheapestDelivery =
      slotsWithCost.length > 0
        ? Math.min(...slotsWithCost.map((s) => s.deliveryCost ?? Infinity))
        : undefined;

    const freeDeliveryAvailable = slots.some(
      (s) => s.deliveryCost === 0 || s.freeAboveThreshold
    );

    const summaryResult: {
      daysChecked: number;
      totalSlots: number;
      availableSlots: number;
      earliestAvailable?: Date;
      cheapestDelivery?: number;
      freeDeliveryAvailable: boolean;
    } = {
      daysChecked: slotsByDay.length,
      totalSlots: slots.length,
      availableSlots: availableSlots.length,
      freeDeliveryAvailable,
    };

    if (earliestAvailable !== undefined) {
      summaryResult.earliestAvailable = earliestAvailable;
    }
    if (cheapestDelivery !== undefined) {
      summaryResult.cheapestDelivery = cheapestDelivery;
    }

    return summaryResult;
  }

  /**
   * Return to cart page.
   * CRITICAL: Ensures we don't accidentally complete checkout.
   */
  private async returnToCart(toolContext: ToolContext): Promise<void> {
    const { page, logger } = toolContext;

    logger.info('Returning to cart page');

    // Try to navigate back to cart
    const cartUrl = 'https://www.auchan.pt/pt/carrinho-compras';

    try {
      await page.goto(cartUrl, {
        timeout: 15000,
        waitUntil: 'domcontentloaded',
      });

      await page.waitForLoadState('domcontentloaded', { timeout: 5000 });

      const finalUrl = page.url();
      logger.info('Returned to cart', { url: finalUrl });

      if (!finalUrl.includes('carrinho-compras')) {
        logger.warn('Return to cart may have failed', { finalUrl });
      }
    } catch (err) {
      logger.error('Failed to return to cart', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw new Error('Could not return to cart after slot scouting');
    }
  }
}

/**
 * Create a SlotScout instance with configuration.
 */
export function createSlotScout(config?: Partial<SlotScoutConfig>): SlotScout {
  return new SlotScout(config);
}
