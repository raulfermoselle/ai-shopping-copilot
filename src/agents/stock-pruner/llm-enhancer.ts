/**
 * LLM-Powered StockPruner Enhancer (v2 - Analytics-Driven)
 *
 * Uses rich statistical analytics and holistic cart context for LLM reasoning.
 * The LLM sees the FULL picture: all cart items, bundles, and statistical patterns.
 *
 * Flow:
 * 1. Build analytics from purchase history (once, cached)
 * 2. Heuristics run on cart items
 * 3. Single LLM call with rich context (all items, analytics, bundles)
 * 4. LLM reasons holistically about the cart
 *
 * Key improvements over v1:
 * - Single LLM call instead of conversation loop
 * - Rich statistical context (mean, stddev, z-scores, trends)
 * - Bundle detection for item relationships
 * - Full cart visibility for holistic reasoning
 */

import type { LLMClient, Message, ToolUseContent } from '../../llm/types.js';
import {
  createLLMClient,
  isLLMAvailable,
  LLMClientError,
  makePruneDecisionTool,
} from '../../llm/index.js';
import type { PruneDecision, ProductCategory } from './types.js';
import {
  ProductAnalyticsEngine,
  createAnalyticsEngine,
  buildAnalyticsSystemPrompt,
  buildRichBatchPrompt,
  prepareItemsForPrompt,
  normalizeProductName,
} from './analytics/index.js';
import type { PurchaseRecord, AnalyticsSummary } from './analytics/index.js';

// =============================================================================
// Tool Call Types
// =============================================================================

/**
 * Input shape from make_prune_decision tool calls.
 */
interface MakePruneDecisionInput {
  productName: string;
  shouldPrune: boolean;
  confidence: number;
  reason: string;
  isHighConsequence: boolean;
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * LLM Enhancer configuration.
 */
export interface LLMEnhancerConfig {
  /** Whether LLM enhancement is enabled */
  enabled: boolean;
  /** Anthropic API key */
  apiKey?: string;
  /** Confidence threshold below which to call LLM (default: 0.7) */
  uncertaintyThreshold: number;
  /** Categories that always get LLM review */
  highConsequenceCategories: ProductCategory[];
  /** Whether to fall back to heuristics if LLM fails */
  fallbackToHeuristics: boolean;
  /** Maximum items to send to LLM (batches if more) */
  maxItemsPerCall: number;
  /** Request timeout in milliseconds */
  timeoutMs: number;
}

/**
 * Default LLM enhancer configuration.
 */
export const DEFAULT_LLM_ENHANCER_CONFIG: LLMEnhancerConfig = {
  enabled: true,
  uncertaintyThreshold: 0.7,
  highConsequenceCategories: [
    'baby-care' as ProductCategory,
    'pet-supplies' as ProductCategory,
  ],
  fallbackToHeuristics: true,
  maxItemsPerCall: 25, // Larger batches now that we have rich context
  timeoutMs: 60000, // Longer timeout for holistic analysis
};

// =============================================================================
// Enhanced Decision Types
// =============================================================================

/**
 * Extended prune decision with LLM enhancement.
 */
export interface EnhancedPruneDecision extends PruneDecision {
  /** LLM-generated reasoning (if enhanced) */
  llmReasoning?: string;
  /** LLM's confidence adjustment from heuristic */
  llmConfidenceAdjustment?: number;
  /** Safety flags for high-consequence items */
  safetyFlags?: string[];
  /** Whether this decision was enhanced by LLM */
  wasLLMEnhanced: boolean;
  /** Original heuristic decision (before LLM enhancement) */
  originalDecision?: {
    prune: boolean;
    confidence: number;
    reason: string;
  };
}

/**
 * Result of LLM enhancement.
 */
export interface LLMEnhancementResult {
  /** Enhanced decisions */
  decisions: EnhancedPruneDecision[];
  /** Items that were sent to LLM */
  itemsEnhanced: number;
  /** Items that fell back to heuristics */
  itemsFallback: number;
  /** Whether any LLM errors occurred */
  hadErrors: boolean;
  /** Error message if any */
  errorMessage?: string;
  /** Token usage stats */
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
  /** Analytics summary (for debugging/display) */
  analyticsSummary?: AnalyticsSummary;
}

// =============================================================================
// LLM Enhancer Class
// =============================================================================

/**
 * LLM-powered enhancer for StockPruner decisions.
 */
export class LLMEnhancer {
  private client: LLMClient | null = null;
  private config: LLMEnhancerConfig;
  private analyticsEngine: ProductAnalyticsEngine;
  private logger: {
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
  };

  constructor(
    config: Partial<LLMEnhancerConfig> = {},
    logger?: {
      info: (msg: string, meta?: Record<string, unknown>) => void;
      warn: (msg: string, meta?: Record<string, unknown>) => void;
      error: (msg: string, meta?: Record<string, unknown>) => void;
    },
  ) {
    this.config = { ...DEFAULT_LLM_ENHANCER_CONFIG, ...config };
    this.analyticsEngine = createAnalyticsEngine();
    this.logger = logger ?? {
      info: (): void => {},
      warn: (): void => {},
      error: (): void => {},
    };

    // Initialize LLM client if enabled and API key available
    if (this.config.enabled && isLLMAvailable(this.config.apiKey)) {
      try {
        this.client = createLLMClient(this.config.apiKey, {
          maxTokens: 4096, // More tokens for detailed reasoning
          temperature: 0.3,
          timeoutMs: this.config.timeoutMs,
        });
        this.logger.info('LLM enhancer initialized');
      } catch (error) {
        this.logger.warn('Failed to initialize LLM client', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Build analytics from purchase history.
   * Should be called once before enhance() with the full purchase history.
   */
  buildAnalytics(purchaseRecords: PurchaseRecord[]): void {
    this.logger.info('Building product analytics', {
      recordCount: purchaseRecords.length,
    });

    this.analyticsEngine.buildFromHistory(purchaseRecords);

    this.logger.info('Analytics built', {
      productCount: this.analyticsEngine.productCount,
      orderCount: this.analyticsEngine.orderCount,
    });
  }

  /**
   * Check if LLM enhancement is available.
   */
  isAvailable(): boolean {
    return this.client !== null && this.client.isReady();
  }

  /**
   * Enhance heuristic decisions with LLM reasoning.
   *
   * @param heuristicDecisions - Decisions from heuristic pruner
   * @returns Enhanced decisions with LLM reasoning
   */
  async enhance(heuristicDecisions: PruneDecision[]): Promise<LLMEnhancementResult> {
    // If LLM not available, return original decisions as-is
    if (!this.isAvailable()) {
      this.logger.info('LLM not available, using heuristic decisions only');
      return {
        decisions: heuristicDecisions.map((d) => ({
          ...d,
          wasLLMEnhanced: false,
        })),
        itemsEnhanced: 0,
        itemsFallback: heuristicDecisions.length,
        hadErrors: false,
      };
    }

    // Build analytics summary for the cart
    const cartProductNames = heuristicDecisions.map((d) => d.productName);
    const analyticsSummary = this.analyticsEngine.buildSummary(cartProductNames);

    this.logger.info('Cart analytics summary', {
      totalItems: analyticsSummary.cartStats.totalItems,
      itemsWithHistory: analyticsSummary.cartStats.itemsWithHistory,
      detectedBundles: analyticsSummary.detectedBundles.length,
    });

    // Prepare items for prompt
    const { itemsToReview, itemsToKeep } = prepareItemsForPrompt(
      heuristicDecisions,
      analyticsSummary,
      this.config.uncertaintyThreshold,
    );

    if (itemsToReview.length === 0) {
      this.logger.info('No items need LLM review');
      return {
        decisions: heuristicDecisions.map((d) => ({
          ...d,
          wasLLMEnhanced: false,
        })),
        itemsEnhanced: 0,
        itemsFallback: heuristicDecisions.length,
        hadErrors: false,
        analyticsSummary,
      };
    }

    this.logger.info('Sending items to LLM for holistic analysis', {
      itemsToReview: itemsToReview.length,
      itemsAsContext: itemsToKeep.length,
    });

    // Build the rich batch prompt
    const systemPrompt = buildAnalyticsSystemPrompt();
    const userPrompt = buildRichBatchPrompt(itemsToReview, itemsToKeep, analyticsSummary);

    try {
      // Single LLM call with rich context
      const result = await this.callLLMWithToolLoop(
        systemPrompt,
        userPrompt,
        itemsToReview.length,
      );

      // Process tool calls and merge with decisions
      const enhancedDecisions = this.processToolCalls(
        heuristicDecisions,
        result.toolCalls,
      );

      return {
        decisions: enhancedDecisions,
        itemsEnhanced: enhancedDecisions.filter((d) => d.wasLLMEnhanced).length,
        itemsFallback: enhancedDecisions.filter((d) => !d.wasLLMEnhanced).length,
        hadErrors: false,
        tokenUsage: result.tokenUsage,
        analyticsSummary,
      };
    } catch (error) {
      if (error instanceof LLMClientError && this.config.fallbackToHeuristics) {
        this.logger.warn('LLM call failed, falling back to heuristics', {
          error: error.message,
          code: error.code,
        });

        return {
          decisions: heuristicDecisions.map((d) => ({
            ...d,
            wasLLMEnhanced: false,
          })),
          itemsEnhanced: 0,
          itemsFallback: heuristicDecisions.length,
          hadErrors: true,
          errorMessage: error.message,
          analyticsSummary,
        };
      }
      throw error;
    }
  }

  /**
   * Call LLM with tool loop to collect all decisions.
   */
  private async callLLMWithToolLoop(
    systemPrompt: string,
    userPrompt: string,
    expectedItems: number,
  ): Promise<{
    toolCalls: ToolUseContent[];
    tokenUsage: { inputTokens: number; outputTokens: number };
  }> {
    if (!this.client) {
      throw new Error('LLM client not initialized');
    }

    const maxIterations = expectedItems + 5;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const allToolCalls: ToolUseContent[] = [];

    // Initialize conversation
    let messages: Message[] = [
      { role: 'user', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    // Conversation loop - continue until all items have tool calls
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const result = await this.client.invokeWithTools(
        messages,
        [makePruneDecisionTool],
      );

      totalInputTokens += result.usage.inputTokens;
      totalOutputTokens += result.usage.outputTokens;

      // Collect tool calls from this turn
      const newToolCalls = result.toolCalls.filter(
        (call) => call.name === 'make_prune_decision',
      );
      allToolCalls.push(...newToolCalls);

      this.logger.info('LLM iteration', {
        iteration,
        newToolCalls: newToolCalls.length,
        totalToolCalls: allToolCalls.length,
        expectedItems,
        stopReason: result.stopReason,
      });

      // Check if we have all items or reached end of turn
      if (allToolCalls.length >= expectedItems || result.stopReason === 'end_turn') {
        break;
      }

      // If Claude stopped because it made a tool call, provide results and continue
      if (result.stopReason === 'tool_use' && result.toolCalls.length > 0) {
        const toolResults: Message = {
          role: 'user',
          content: result.toolCalls.map((call) => ({
            type: 'tool_result' as const,
            tool_use_id: call.id,
            content: 'Recorded. Continue with remaining items.',
          })),
        };

        messages = result.messages;
        messages.push(toolResults);

        const remainingCount = expectedItems - allToolCalls.length;
        messages.push({
          role: 'user',
          content: `Good progress. ${allToolCalls.length}/${expectedItems} done. Continue with the remaining ${remainingCount} items.`,
        });
      } else {
        break;
      }
    }

    return {
      toolCalls: allToolCalls,
      tokenUsage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      },
    };
  }

  /**
   * Normalize product name for matching.
   */
  private normalizeProductName(name: string): string {
    return normalizeProductName(name);
  }

  /**
   * Process tool calls and merge with heuristic decisions.
   */
  private processToolCalls(
    originalDecisions: PruneDecision[],
    toolCalls: ToolUseContent[],
  ): EnhancedPruneDecision[] {
    // Filter for make_prune_decision calls
    const pruneDecisionCalls = toolCalls.filter(
      (call) => call.name === 'make_prune_decision',
    );

    this.logger.info('Processing tool calls', {
      totalCalls: toolCalls.length,
      pruneDecisionCalls: pruneDecisionCalls.length,
      expectedItems: originalDecisions.length,
    });

    // Create a map of LLM decisions by normalized product name
    const llmDecisionMap = new Map<string, MakePruneDecisionInput>();

    for (const call of pruneDecisionCalls) {
      const input = call.input as unknown as MakePruneDecisionInput;
      const normalized = this.normalizeProductName(input.productName);
      llmDecisionMap.set(normalized, input);

      this.logger.info('LLM decision received', {
        productName: input.productName,
        shouldPrune: input.shouldPrune,
        confidence: input.confidence,
      });
    }

    // Merge LLM insights with original decisions
    const enhanced: EnhancedPruneDecision[] = [];

    for (const original of originalDecisions) {
      const normalized = this.normalizeProductName(original.productName);
      const llmDecision = llmDecisionMap.get(normalized);

      if (llmDecision) {
        // LLM provided enhancement
        const confidenceAdjustment = llmDecision.confidence - original.confidence;

        const enhancedDecision: EnhancedPruneDecision = {
          ...original,
          prune:
            llmDecision.confidence > original.confidence
              ? llmDecision.shouldPrune
              : original.prune,
          confidence: Math.max(llmDecision.confidence, original.confidence),
          reason: llmDecision.reason || original.reason,
          llmReasoning: llmDecision.reason,
          llmConfidenceAdjustment: confidenceAdjustment,
          wasLLMEnhanced: true,
          originalDecision: {
            prune: original.prune,
            confidence: original.confidence,
            reason: original.reason,
          },
        };

        if (llmDecision.isHighConsequence) {
          enhancedDecision.safetyFlags = ['High-consequence item'];
        }

        enhanced.push(enhancedDecision);
      } else {
        // No LLM enhancement, keep original
        enhanced.push({
          ...original,
          wasLLMEnhanced: false,
        });
      }
    }

    return enhanced;
  }

  /**
   * Get usage statistics.
   */
  getUsageStats(): { totalInputTokens: number; totalOutputTokens: number; requestCount: number } | null {
    return this.client?.getUsageStats() ?? null;
  }

  /**
   * Get analytics engine (for debugging/display).
   */
  getAnalyticsEngine(): ProductAnalyticsEngine {
    return this.analyticsEngine;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an LLM enhancer instance.
 */
export function createLLMEnhancer(
  config: Partial<LLMEnhancerConfig> = {},
  logger?: {
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
  },
): LLMEnhancer {
  return new LLMEnhancer(config, logger);
}

/**
 * Quick utility to enhance decisions if LLM is available.
 *
 * @param decisions - Heuristic decisions to enhance
 * @param purchaseRecords - Purchase history for analytics
 * @param apiKey - Anthropic API key
 * @param config - Optional configuration
 * @returns Enhanced decisions
 */
export async function enhanceWithLLM(
  decisions: PruneDecision[],
  purchaseRecords: PurchaseRecord[],
  apiKey: string | undefined,
  config: Partial<LLMEnhancerConfig> = {},
): Promise<LLMEnhancementResult> {
  const fullConfig: Partial<LLMEnhancerConfig> = { ...config };
  if (apiKey !== undefined) {
    fullConfig.apiKey = apiKey;
  }

  const enhancer = new LLMEnhancer(fullConfig);
  enhancer.buildAnalytics(purchaseRecords);
  return enhancer.enhance(decisions);
}
