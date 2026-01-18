/**
 * LLM-Powered Substitution Enhancer
 *
 * Enhances substitution ranking decisions with LLM reasoning.
 * Follows the StockPruner pattern: "heuristics first, LLM optional."
 *
 * Flow:
 * 1. Heuristics rank substitutes (fast, free)
 * 2. Build value analytics for candidates
 * 3. Decide if LLM enhancement needed (close scores, price concerns)
 * 4. Single LLM call with rich context
 * 5. Merge LLM insights with heuristic rankings
 *
 * Value Heuristics:
 * - Store brand preference (Auchan/Polegar)
 * - Price-per-unit optimization (€/kg, €/L)
 * - Price tolerance enforcement (max 20%)
 */

import type { LLMClient, Message, ToolUseContent } from '../../llm/types.js';
import {
  createLLMClient,
  isLLMAvailable,
  LLMClientError,
  makeSubstitutionDecisionTool,
  generateSearchQueriesToolDef,
} from '../../llm/index.js';
import type { RankedSubstitute, SubstituteCandidate, SubstituteScore } from './types.js';
import type {
  SubstitutionContext,
  SubstituteCandidateWithAnalytics,
  OriginalProductContext,
  ValueComparison,
} from './analytics/types.js';
import {
  buildSubstitutionSystemPrompt,
  buildSubstitutionUserPrompt,
  buildQueryGenerationPrompt,
  shouldInvokeLLM,
  prepareSubstitutesForPrompt,
  DEFAULT_FILTER_CONFIG,
  buildValueAnalytics,
  buildOriginalAnalytics,
  compareValues,
} from './analytics/index.js';

// =============================================================================
// Configuration
// =============================================================================

/**
 * LLM Enhancer configuration for Substitution agent.
 */
export interface SubstitutionLLMEnhancerConfig {
  /** Whether LLM enhancement is enabled */
  enabled: boolean;
  /** Anthropic API key */
  apiKey?: string;
  /** Score threshold below which to invoke LLM */
  uncertaintyThreshold: number;
  /** Score gap threshold - invoke LLM if top scores are close */
  closeScoreGap: number;
  /** Categories that always get LLM review */
  sensitiveCategories: string[];
  /** Whether to fall back to heuristics if LLM fails */
  fallbackToHeuristics: boolean;
  /** Maximum candidates to send to LLM per item */
  maxCandidatesPerCall: number;
  /** Request timeout in milliseconds */
  timeoutMs: number;
  /** Price tolerance (max acceptable increase, e.g., 0.2 = 20%) */
  priceTolerance: number;
}

/**
 * Default configuration.
 */
export const DEFAULT_SUBSTITUTION_LLM_CONFIG: SubstitutionLLMEnhancerConfig = {
  enabled: true,
  uncertaintyThreshold: 0.65,
  closeScoreGap: 0.10,
  sensitiveCategories: ['baby', 'pet', 'dietary'],
  fallbackToHeuristics: true,
  maxCandidatesPerCall: 5,
  timeoutMs: 30000,
  priceTolerance: 0.20,
};

// =============================================================================
// Enhanced Decision Types
// =============================================================================

/**
 * Recommendation level from LLM.
 */
export type RecommendationLevel =
  | 'strongly_recommend'
  | 'recommend'
  | 'acceptable'
  | 'poor'
  | 'reject';

/**
 * Value rating from LLM.
 */
export type ValueRating = 'excellent' | 'good' | 'acceptable' | 'poor';

/**
 * Enhanced substitution decision from LLM.
 */
export interface EnhancedSubstituteDecision {
  /** The candidate this decision is for */
  candidate: SubstituteCandidate;
  /** Original heuristic score */
  heuristicScore: SubstituteScore;
  /** LLM recommendation level */
  recommendation: RecommendationLevel;
  /** LLM-adjusted overall score */
  adjustedScore: number;
  /** LLM confidence in this recommendation */
  llmConfidence: number;
  /** LLM-generated reasoning */
  llmReasoning: string;
  /** Value analysis insights */
  valueInsights: {
    pricePerUnitAssessment?: string;
    storeBrandNote?: string;
    valueRating: ValueRating;
  };
  /** Safety flags (dietary, allergy concerns) */
  safetyFlags?: string[];
  /** Whether this decision was enhanced by LLM */
  wasLLMEnhanced: boolean;
  /** Original heuristic decision (before LLM enhancement) */
  originalDecision?: {
    score: SubstituteScore;
    reason: string;
  };
  /** Value comparison with original */
  valueComparison: ValueComparison;
}

/**
 * Result of LLM enhancement for a substitution search.
 */
export interface SubstitutionLLMEnhancementResult {
  /** Original product */
  originalProduct: OriginalProductContext;
  /** Enhanced decisions (best first) */
  decisions: EnhancedSubstituteDecision[];
  /** Whether LLM was invoked */
  llmInvoked: boolean;
  /** Reason LLM was or wasn't invoked */
  llmInvocationReason: string;
  /** Any errors that occurred */
  hadErrors: boolean;
  /** Error message if any */
  errorMessage?: string;
  /** Token usage if LLM was invoked */
  tokenUsage?: { inputTokens: number; outputTokens: number };
}

/**
 * Input for LLM tool call processing.
 */
interface MakeSubstitutionDecisionInput {
  candidateName: string;
  recommendation: RecommendationLevel;
  confidence: number;
  valueRating: ValueRating;
  reasoning: string;
  pricePerUnitAssessment?: string;
  storeBrandNote?: string;
  safetyFlags?: string[];
}

// =============================================================================
// LLM Enhancer Class
// =============================================================================

/**
 * LLM-powered enhancer for Substitution decisions.
 */
export class SubstitutionLLMEnhancer {
  private client: LLMClient | null = null;
  private config: SubstitutionLLMEnhancerConfig;
  private logger: {
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
    debug: (msg: string, meta?: Record<string, unknown>) => void;
  };

  constructor(
    config: Partial<SubstitutionLLMEnhancerConfig> = {},
    logger?: {
      info: (msg: string, meta?: Record<string, unknown>) => void;
      warn: (msg: string, meta?: Record<string, unknown>) => void;
      error: (msg: string, meta?: Record<string, unknown>) => void;
      debug: (msg: string, meta?: Record<string, unknown>) => void;
    }
  ) {
    this.config = { ...DEFAULT_SUBSTITUTION_LLM_CONFIG, ...config };
    this.logger = logger ?? {
      info: (): void => {},
      warn: (): void => {},
      error: (): void => {},
      debug: (): void => {},
    };

    // Initialize LLM client if enabled and API key available
    if (this.config.enabled && isLLMAvailable(this.config.apiKey)) {
      try {
        this.client = createLLMClient(this.config.apiKey, {
          maxTokens: 2048,
          temperature: 0.3,
          timeoutMs: this.config.timeoutMs,
        });
        this.logger.info('Substitution LLM enhancer initialized');
      } catch (error) {
        this.logger.warn('Failed to initialize LLM client', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Check if LLM enhancement is available.
   */
  isAvailable(): boolean {
    return this.client !== null && this.client.isReady();
  }

  /**
   * Get the LLM client (for use by other tools like query generation).
   * Returns null if LLM is not available.
   */
  getClient(): LLMClient | null {
    return this.client;
  }

  /**
   * Enhance substitution rankings with LLM reasoning.
   */
  async enhance(
    rankedSubstitutes: RankedSubstitute[],
    original: OriginalProductContext
  ): Promise<SubstitutionLLMEnhancementResult> {
    // Build value analytics for all candidates
    const originalAnalytics = buildOriginalAnalytics(original);
    const candidatesWithAnalytics: SubstituteCandidateWithAnalytics[] = rankedSubstitutes.map(
      (ranked) => {
        const valueAnalytics = buildValueAnalytics(ranked.candidate);
        const valueComparison = compareValues(
          originalAnalytics,
          valueAnalytics,
          this.config.priceTolerance
        );

        return {
          candidate: ranked.candidate,
          valueAnalytics,
          valueComparison,
          heuristicScore: ranked.score,
          heuristicReason: ranked.reason,
        };
      }
    );

    // Check if LLM should be invoked
    const filterConfig = {
      ...DEFAULT_FILTER_CONFIG,
      uncertaintyThreshold: this.config.uncertaintyThreshold,
      closeScoreGap: this.config.closeScoreGap,
      sensitiveCategories: this.config.sensitiveCategories,
    };

    const shouldInvoke = shouldInvokeLLM(candidatesWithAnalytics, original, filterConfig);

    if (!shouldInvoke.invoke) {
      this.logger.info('LLM not invoked for substitution', {
        reason: shouldInvoke.reason,
        candidateCount: candidatesWithAnalytics.length,
      });

      return {
        originalProduct: original,
        decisions: candidatesWithAnalytics.map((c) =>
          this.buildDecisionFromHeuristics(c)
        ),
        llmInvoked: false,
        llmInvocationReason: shouldInvoke.reason,
        hadErrors: false,
      };
    }

    // Check if LLM is available
    if (!this.isAvailable()) {
      this.logger.info('LLM not available, using heuristic decisions only');

      return {
        originalProduct: original,
        decisions: candidatesWithAnalytics.map((c) =>
          this.buildDecisionFromHeuristics(c)
        ),
        llmInvoked: false,
        llmInvocationReason: 'LLM client not available',
        hadErrors: false,
      };
    }

    this.logger.info('Invoking LLM for substitution enhancement', {
      reason: shouldInvoke.reason,
      candidateCount: candidatesWithAnalytics.length,
    });

    // Prepare candidates for prompt
    const candidatesToReview = prepareSubstitutesForPrompt(
      rankedSubstitutes,
      candidatesWithAnalytics,
      this.config.maxCandidatesPerCall
    );

    // Build context
    const context: SubstitutionContext = {
      original,
      candidates: candidatesToReview,
      heuristicRanking: rankedSubstitutes,
      priceTolerance: this.config.priceTolerance,
    };

    // Build prompts
    const systemPrompt = buildSubstitutionSystemPrompt();
    const userPrompt = buildSubstitutionUserPrompt(context);

    try {
      // Call LLM with tool loop
      const result = await this.callLLMWithToolLoop(
        systemPrompt,
        userPrompt,
        candidatesToReview.length
      );

      // Process tool calls and merge with decisions
      const enhancedDecisions = this.processToolCalls(
        candidatesWithAnalytics,
        result.toolCalls
      );

      return {
        originalProduct: original,
        decisions: enhancedDecisions,
        llmInvoked: true,
        llmInvocationReason: shouldInvoke.reason,
        hadErrors: false,
        tokenUsage: result.tokenUsage,
      };
    } catch (error) {
      if (error instanceof LLMClientError && this.config.fallbackToHeuristics) {
        this.logger.warn('LLM call failed, falling back to heuristics', {
          error: error.message,
          code: error.code,
        });

        return {
          originalProduct: original,
          decisions: candidatesWithAnalytics.map((c) =>
            this.buildDecisionFromHeuristics(c)
          ),
          llmInvoked: true,
          llmInvocationReason: shouldInvoke.reason,
          hadErrors: true,
          errorMessage: error.message,
        };
      }
      throw error;
    }
  }

  /**
   * Generate smart search queries using LLM.
   */
  async generateSmartQueries(
    productName: string,
    brand?: string,
    category?: string,
    previousQuery?: string,
    previousResultCount?: number
  ): Promise<{ queries: string[]; reasoning?: string; wasLLMGenerated: boolean }> {
    if (!this.isAvailable()) {
      return {
        queries: [this.buildSimpleQuery(productName)],
        wasLLMGenerated: false,
      };
    }

    const prompt = buildQueryGenerationPrompt(
      productName,
      brand,
      category,
      previousQuery,
      previousResultCount
    );

    try {
      const result = await this.client!.invokeWithTools(
        [{ role: 'user', content: prompt }],
        [generateSearchQueriesToolDef]
      );

      // Extract queries from tool call
      const toolCall = result.toolCalls.find(
        (call) => call.name === 'generate_search_queries'
      );

      if (toolCall) {
        const input = toolCall.input as unknown as {
          queries: string[];
          reasoning: string;
        };
        return {
          queries: input.queries,
          reasoning: input.reasoning,
          wasLLMGenerated: true,
        };
      }

      // Fallback to simple query
      return {
        queries: [this.buildSimpleQuery(productName)],
        wasLLMGenerated: false,
      };
    } catch (error) {
      this.logger.warn('LLM query generation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        queries: [this.buildSimpleQuery(productName)],
        wasLLMGenerated: false,
      };
    }
  }

  /**
   * Build a simple query by removing size patterns.
   */
  private buildSimpleQuery(productName: string): string {
    let query = productName
      .replace(/\d+(?:,\d+)?\s*(?:g|kg|ml|l|cl|un|unidades)/gi, '')
      .replace(/\d+\s*x\s*\d+/gi, '')
      .trim();

    query = query.replace(/\s+/g, ' ').trim();

    if (query.length < 3) {
      return productName;
    }

    return query;
  }

  /**
   * Call LLM with tool loop to collect all decisions.
   */
  private async callLLMWithToolLoop(
    systemPrompt: string,
    userPrompt: string,
    expectedItems: number
  ): Promise<{
    toolCalls: ToolUseContent[];
    tokenUsage: { inputTokens: number; outputTokens: number };
  }> {
    if (!this.client) {
      throw new Error('LLM client not initialized');
    }

    const maxIterations = expectedItems + 3;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const allToolCalls: ToolUseContent[] = [];

    // Initialize conversation
    let messages: Message[] = [
      { role: 'user', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    // Conversation loop
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const result = await this.client.invokeWithTools(messages, [
        makeSubstitutionDecisionTool,
      ]);

      totalInputTokens += result.usage.inputTokens;
      totalOutputTokens += result.usage.outputTokens;

      // Collect tool calls
      const newToolCalls = result.toolCalls.filter(
        (call) => call.name === 'make_substitution_decision'
      );
      allToolCalls.push(...newToolCalls);

      this.logger.debug('LLM iteration', {
        iteration,
        newToolCalls: newToolCalls.length,
        totalToolCalls: allToolCalls.length,
        expectedItems,
        stopReason: result.stopReason,
      });

      // Check if complete
      if (
        allToolCalls.length >= expectedItems ||
        result.stopReason === 'end_turn'
      ) {
        break;
      }

      // Continue conversation if needed
      if (result.stopReason === 'tool_use' && result.toolCalls.length > 0) {
        const toolResults: Message = {
          role: 'user',
          content: result.toolCalls.map((call) => ({
            type: 'tool_result' as const,
            tool_use_id: call.id,
            content: 'Recorded. Continue with remaining candidates.',
          })),
        };

        messages = result.messages;
        messages.push(toolResults);

        const remainingCount = expectedItems - allToolCalls.length;
        messages.push({
          role: 'user',
          content: `Continue with the remaining ${remainingCount} candidates.`,
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
    return name.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Build decision from heuristics only (no LLM).
   */
  private buildDecisionFromHeuristics(
    candidate: SubstituteCandidateWithAnalytics
  ): EnhancedSubstituteDecision {
    const recommendation = this.scoreToRecommendation(
      candidate.heuristicScore.overall,
      candidate.valueComparison
    );

    return {
      candidate: candidate.candidate,
      heuristicScore: candidate.heuristicScore,
      recommendation,
      adjustedScore: candidate.heuristicScore.overall,
      llmConfidence: candidate.heuristicScore.overall,
      llmReasoning: candidate.heuristicReason,
      valueInsights: {
        valueRating: candidate.valueComparison.valueRating,
      },
      wasLLMEnhanced: false,
      valueComparison: candidate.valueComparison,
    };
  }

  /**
   * Convert score to recommendation level.
   */
  private scoreToRecommendation(
    score: number,
    valueComparison: ValueComparison
  ): RecommendationLevel {
    // Excellent value gets strong recommendation
    if (valueComparison.valueRating === 'excellent' && score >= 0.7) {
      return 'strongly_recommend';
    }

    if (score >= 0.8) {
      return 'strongly_recommend';
    } else if (score >= 0.7) {
      return 'recommend';
    } else if (score >= 0.5) {
      return 'acceptable';
    } else if (score >= 0.3) {
      return 'poor';
    }
    return 'reject';
  }

  /**
   * Process tool calls and merge with heuristic decisions.
   */
  private processToolCalls(
    originalCandidates: SubstituteCandidateWithAnalytics[],
    toolCalls: ToolUseContent[]
  ): EnhancedSubstituteDecision[] {
    // Filter for substitution decision calls
    const decisionCalls = toolCalls.filter(
      (call) => call.name === 'make_substitution_decision'
    );

    this.logger.info('Processing tool calls', {
      totalCalls: toolCalls.length,
      decisionCalls: decisionCalls.length,
      expectedItems: originalCandidates.length,
    });

    // Create a map of LLM decisions by normalized product name
    const llmDecisionMap = new Map<string, MakeSubstitutionDecisionInput>();

    for (const call of decisionCalls) {
      const input = call.input as unknown as MakeSubstitutionDecisionInput;
      const normalized = this.normalizeProductName(input.candidateName);
      llmDecisionMap.set(normalized, input);

      this.logger.debug('LLM decision received', {
        candidateName: input.candidateName,
        recommendation: input.recommendation,
        confidence: input.confidence,
      });
    }

    // Merge LLM insights with original candidates
    const enhanced: EnhancedSubstituteDecision[] = [];

    for (const candidate of originalCandidates) {
      const normalized = this.normalizeProductName(candidate.candidate.name);
      const llmDecision = llmDecisionMap.get(normalized);

      if (llmDecision) {
        // LLM provided enhancement
        const adjustedScore = this.recommendationToScore(
          llmDecision.recommendation,
          llmDecision.confidence,
          candidate.heuristicScore.overall
        );

        enhanced.push({
          candidate: candidate.candidate,
          heuristicScore: candidate.heuristicScore,
          recommendation: llmDecision.recommendation,
          adjustedScore,
          llmConfidence: llmDecision.confidence,
          llmReasoning: llmDecision.reasoning,
          valueInsights: {
            ...(llmDecision.pricePerUnitAssessment !== undefined && {
              pricePerUnitAssessment: llmDecision.pricePerUnitAssessment,
            }),
            ...(llmDecision.storeBrandNote !== undefined && {
              storeBrandNote: llmDecision.storeBrandNote,
            }),
            valueRating: llmDecision.valueRating,
          },
          ...(llmDecision.safetyFlags !== undefined && {
            safetyFlags: llmDecision.safetyFlags,
          }),
          wasLLMEnhanced: true,
          originalDecision: {
            score: candidate.heuristicScore,
            reason: candidate.heuristicReason,
          },
          valueComparison: candidate.valueComparison,
        });
      } else {
        // No LLM enhancement, use heuristics
        enhanced.push(this.buildDecisionFromHeuristics(candidate));
      }
    }

    // Sort by adjusted score descending
    enhanced.sort((a, b) => b.adjustedScore - a.adjustedScore);

    return enhanced;
  }

  /**
   * Convert recommendation to numeric score.
   */
  private recommendationToScore(
    recommendation: RecommendationLevel,
    llmConfidence: number,
    heuristicScore: number
  ): number {
    const recommendationScores: Record<RecommendationLevel, number> = {
      strongly_recommend: 0.95,
      recommend: 0.80,
      acceptable: 0.60,
      poor: 0.35,
      reject: 0.10,
    };

    const baseScore = recommendationScores[recommendation];

    // Blend with heuristic score weighted by confidence
    return baseScore * llmConfidence + heuristicScore * (1 - llmConfidence);
  }

  /**
   * Get usage statistics.
   */
  getUsageStats():
    | { totalInputTokens: number; totalOutputTokens: number; requestCount: number }
    | null {
    return this.client?.getUsageStats() ?? null;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a Substitution LLM enhancer instance.
 */
export function createSubstitutionLLMEnhancer(
  config: Partial<SubstitutionLLMEnhancerConfig> = {},
  logger?: {
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
    debug: (msg: string, meta?: Record<string, unknown>) => void;
  }
): SubstitutionLLMEnhancer {
  return new SubstitutionLLMEnhancer(config, logger);
}
