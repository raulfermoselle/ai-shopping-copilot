/**
 * Substitution Agent Implementation
 *
 * Handles product substitutions by:
 * - Checking item availability in cart
 * - Finding suitable replacements for unavailable items
 * - Ranking substitutes by similarity (brand, size, price, category)
 * - Learning from user decisions to improve future recommendations
 * - Presenting options in review pack
 *
 * CRITICAL: This agent NEVER places orders or modifies the cart.
 * It only reads availability and searches for substitutes.
 * All actions are read-only for safety.
 */

import type { AgentContext, AgentResult } from '../../types/agent.js';
import type { ToolContext, ToolConfig } from '../../types/tool.js';
import type {
  SubstitutionWorkerConfig,
  SubstitutionWorkerInput,
  SubstitutionWorkerOutput,
  AvailabilityResult,
  SubstitutionResult,
  SubstituteCandidate,
  RankedSubstitute,
  SubstituteScore,
} from './types.js';
import { SubstitutionWorkerConfigSchema } from './types.js';

// Import Substitution tools
import {
  checkAvailabilityTool,
  searchProductsTool,
  navigateToReplacementsPageTool,
  generateSearchQueries,
} from './tools/index.js';
// extractProductInfoTool reserved for Phase 2+ detailed product info extraction

// Import LLM enhancer
import {
  SubstitutionLLMEnhancer,
  createSubstitutionLLMEnhancer,
  type SubstitutionLLMEnhancerConfig,
} from './llm-enhancer.js';

// Import learning module
import type {
  SubstitutionLearningStore,
  LearningConfig,
  RankingAdjustmentResult,
} from './learning/index.js';
import {
  createEmptyLearningStore,
  createDefaultLearningConfig,
  adjustScore,
  type OriginalProduct,
  type SubstituteCandidate as LearningSubstituteCandidate,
} from './learning/index.js';

// =============================================================================
// Substitution Result Types
// =============================================================================

/**
 * Successful Substitution result data.
 */
export interface SubstitutionResultData {
  /** Availability results for all items */
  availabilityResults: AvailabilityResult[];
  /** Substitution results for unavailable items */
  substitutionResults: SubstitutionResult[];
  /** Summary statistics */
  summary: {
    totalItems: number;
    availableItems: number;
    unavailableItems: number;
    itemsWithSubstitutes: number;
    itemsWithoutSubstitutes: number;
  };
  /** When the check was completed */
  completedAt: Date;
}

/**
 * Substitution agent result.
 */
export interface SubstitutionAgentResult extends AgentResult {
  data?: SubstitutionResultData;
}

// =============================================================================
// Input Item Type
// =============================================================================

/**
 * Item to check availability for
 * Uses `| undefined` for optional properties to satisfy exactOptionalPropertyTypes
 */
interface InputItem {
  productId: string | undefined;
  name: string;
  productUrl: string | undefined;
  brand: string | undefined;
  size: string | undefined;
  unitPrice: number | undefined;
  quantity: number;
}

// =============================================================================
// Substitution Agent
// =============================================================================

/**
 * Substitution Agent
 *
 * Responsible for:
 * 1. Checking availability of cart items
 * 2. Finding substitutes for unavailable items
 * 3. Ranking substitutes by similarity
 * 4. Applying learned user preferences to bias rankings
 * 5. Returning results for Coordinator
 *
 * SAFETY: This agent is READ-ONLY. It never modifies cart or places orders.
 */
export class Substitution {
  private readonly config: SubstitutionWorkerConfig;
  private readonly screenshotDir: string;
  private screenshots: string[] = [];

  /** Learning store for user preference tracking */
  private learningStore: SubstitutionLearningStore;
  /** Configuration for the learning system */
  private learningConfig: LearningConfig;
  /** Whether learning is enabled */
  private learningEnabled: boolean;

  /** LLM enhancer for value-based ranking (optional) */
  private llmEnhancer: SubstitutionLLMEnhancer | null = null;

  constructor(
    config: Partial<SubstitutionWorkerConfig> = {},
    options?: {
      learningStore?: SubstitutionLearningStore;
      learningConfig?: Partial<LearningConfig>;
      enableLearning?: boolean;
      householdId?: string;
    }
  ) {
    this.config = SubstitutionWorkerConfigSchema.parse(config);
    this.screenshotDir = 'screenshots';

    // Initialize learning system
    const householdId = options?.householdId ?? 'default';
    this.learningStore = options?.learningStore ?? createEmptyLearningStore(householdId);
    this.learningConfig = {
      ...createDefaultLearningConfig(),
      ...options?.learningConfig,
    };
    this.learningEnabled = options?.enableLearning ?? true;
  }

  /**
   * Get the current learning store.
   * Use this to persist the store between sessions.
   */
  getLearningStore(): SubstitutionLearningStore {
    return this.learningStore;
  }

  /**
   * Set the learning store (e.g., after loading from persistence).
   */
  setLearningStore(store: SubstitutionLearningStore): void {
    this.learningStore = store;
  }

  /**
   * Get the learning configuration.
   */
  getLearningConfig(): LearningConfig {
    return this.learningConfig;
  }

  /**
   * Enable or disable learning-based ranking adjustments.
   */
  setLearningEnabled(enabled: boolean): void {
    this.learningEnabled = enabled;
  }

  /**
   * Check if learning is enabled.
   */
  isLearningEnabled(): boolean {
    return this.learningEnabled;
  }

  /**
   * Enable LLM enhancement for value-based substitute ranking.
   * This uses Claude to analyze substitutes with value heuristics:
   * - Store brand preference (Auchan/Polegar)
   * - Price-per-unit optimization (€/kg, €/L)
   * - Price tolerance enforcement (max 20% increase)
   */
  enableLLMEnhancement(config: Partial<SubstitutionLLMEnhancerConfig>): void {
    this.llmEnhancer = createSubstitutionLLMEnhancer(config);
  }

  /**
   * Disable LLM enhancement.
   */
  disableLLMEnhancement(): void {
    this.llmEnhancer = null;
  }

  /**
   * Check if LLM enhancement is enabled and available.
   */
  isLLMEnhancementAvailable(): boolean {
    return this.llmEnhancer?.isAvailable() ?? false;
  }

  /**
   * Get the LLM enhancer (for direct access if needed).
   */
  getLLMEnhancer(): SubstitutionLLMEnhancer | null {
    return this.llmEnhancer;
  }

  /**
   * Create a ToolContext from AgentContext for tool execution.
   */
  private createToolContext(context: AgentContext): ToolContext {
    const { page, logger } = context;

    const toolConfig: ToolConfig = {
      navigationTimeout: 30000,
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
   * Run the Substitution agent.
   *
   * @param context - Agent execution context
   * @param input - Items to check and configuration
   * @returns Substitution result with availability and substitutes
   */
  async run(context: AgentContext, input?: SubstitutionWorkerInput): Promise<SubstitutionAgentResult> {
    const { logger, sessionId } = context;
    const logs: string[] = [];
    const toolContext = this.createToolContext(context);

    // Reset screenshots for this run
    this.screenshots = [];

    try {
      logger.info('Substitution agent starting', {
        config: this.config,
        itemCount: input?.items?.length ?? 0,
      });
      logs.push('Substitution agent started');

      // Validate input
      if (!input?.items || input.items.length === 0) {
        logger.warn('No items provided to check');
        return {
          success: true,
          data: {
            availabilityResults: [],
            substitutionResults: [],
            summary: {
              totalItems: 0,
              availableItems: 0,
              unavailableItems: 0,
              itemsWithSubstitutes: 0,
              itemsWithoutSubstitutes: 0,
            },
            completedAt: new Date(),
          },
          logs: [...logs, 'No items to check'],
        };
      }

      // Merge config with input overrides (use base config values as defaults)
      const inputConfig = input.config ?? {};
      const effectiveConfig: SubstitutionWorkerConfig = {
        maxSubstitutesPerItem: inputConfig.maxSubstitutesPerItem ?? this.config.maxSubstitutesPerItem,
        defaultMaxPriceIncrease: inputConfig.defaultMaxPriceIncrease ?? this.config.defaultMaxPriceIncrease,
        availabilityCheckTimeout: inputConfig.availabilityCheckTimeout ?? this.config.availabilityCheckTimeout,
        searchTimeout: inputConfig.searchTimeout ?? this.config.searchTimeout,
        brandWeight: inputConfig.brandWeight ?? this.config.brandWeight,
        sizeWeight: inputConfig.sizeWeight ?? this.config.sizeWeight,
        priceWeight: inputConfig.priceWeight ?? this.config.priceWeight,
        categoryWeight: inputConfig.categoryWeight ?? this.config.categoryWeight,
      };

      // Step 1: Check availability for all items
      logger.info('Checking item availability', { count: input.items.length });
      logs.push(`Checking availability for ${input.items.length} items`);

      // Map input items to InputItem format (convert optional to | undefined)
      const mappedItems: InputItem[] = input.items.map((item) => ({
        productId: item.productId ?? undefined,
        name: item.name,
        productUrl: item.productUrl ?? undefined,
        brand: item.brand ?? undefined,
        size: item.size ?? undefined,
        unitPrice: item.unitPrice ?? undefined,
        quantity: item.quantity,
      }));

      const availabilityResults = await this.checkAllAvailability(
        toolContext,
        mappedItems,
        effectiveConfig.availabilityCheckTimeout
      );

      const availableItems = availabilityResults.filter(
        (r) => r.status === 'available' || r.status === 'low_stock'
      );
      const unavailableItems = availabilityResults.filter(
        (r) => r.status === 'out_of_stock' || r.status === 'discontinued'
      );

      logs.push(`Availability: ${availableItems.length} available, ${unavailableItems.length} unavailable`);
      logger.info('Availability check completed', {
        available: availableItems.length,
        unavailable: unavailableItems.length,
      });

      // Step 2: Find substitutes for unavailable items
      const substitutionResults: SubstitutionResult[] = [];
      let itemsWithSubstitutes = 0;
      let itemsWithoutSubstitutes = 0;

      if (unavailableItems.length > 0) {
        logger.info('Searching for substitutes', { count: unavailableItems.length });
        logs.push(`Searching for substitutes for ${unavailableItems.length} items`);

        for (const unavailableItem of unavailableItems) {
          // Find original input item for additional context
          const foundItem = input.items.find(
            (item) =>
              item.productId === unavailableItem.productId ||
              item.name.toLowerCase() === unavailableItem.productName.toLowerCase()
          );

          // Map to InputItem format if found
          const originalInput: InputItem | undefined = foundItem
            ? {
                productId: foundItem.productId ?? undefined,
                name: foundItem.name,
                productUrl: foundItem.productUrl ?? undefined,
                brand: foundItem.brand ?? undefined,
                size: foundItem.size ?? undefined,
                unitPrice: foundItem.unitPrice ?? undefined,
                quantity: foundItem.quantity,
              }
            : undefined;

          const substitutionResult = await this.findSubstitutes(
            toolContext,
            unavailableItem,
            originalInput,
            effectiveConfig
          );

          substitutionResults.push(substitutionResult);

          if (substitutionResult.hasSubstitutes) {
            itemsWithSubstitutes++;
          } else {
            itemsWithoutSubstitutes++;
          }
        }

        logs.push(
          `Found substitutes for ${itemsWithSubstitutes} items, ${itemsWithoutSubstitutes} without substitutes`
        );
      }

      // Step 3: Build output
      const output: SubstitutionWorkerOutput = {
        availabilityResults,
        substitutionResults,
        summary: {
          totalItems: input.items.length,
          availableItems: availableItems.length,
          unavailableItems: unavailableItems.length,
          itemsWithSubstitutes,
          itemsWithoutSubstitutes,
        },
        completedAt: new Date(),
      };

      logger.info('Substitution agent completed', {
        sessionId,
        summary: output.summary,
      });

      return {
        success: true,
        data: output,
        logs,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Substitution agent failed', { error: err.message });
      logs.push(`Error: ${err.message}`);

      return {
        success: false,
        error: err,
        logs,
      };
    }
  }

  // ===========================================================================
  // Private Methods - Availability Checking
  // ===========================================================================

  /**
   * Check availability for all items.
   */
  private async checkAllAvailability(
    toolContext: ToolContext,
    items: InputItem[],
    timeout: number
  ): Promise<AvailabilityResult[]> {
    const results: AvailabilityResult[] = [];

    for (const item of items) {
      const result = await checkAvailabilityTool.execute(
        {
          productId: item.productId,
          productName: item.name,
          productUrl: item.productUrl,
          timeout,
        },
        toolContext
      );

      if (result.success && result.data) {
        results.push(result.data.availability);
      } else {
        // Create unknown availability result on failure
        results.push({
          productId: item.productId || '',
          productName: item.name,
          productUrl: item.productUrl,
          status: 'unknown',
          checkedAt: new Date(),
          note: result.error?.message,
        });
      }
    }

    return results;
  }

  // ===========================================================================
  // Private Methods - Substitute Finding
  // ===========================================================================

  /**
   * Find substitutes for an unavailable item.
   *
   * Two-phase strategy:
   * 1. First, try Auchan's "Substituir" link (preferred - curated suggestions)
   * 2. If that fails, fall back to search query (with optional LLM-powered query generation)
   */
  private async findSubstitutes(
    toolContext: ToolContext,
    unavailableItem: AvailabilityResult,
    originalInput: InputItem | undefined,
    config: SubstitutionWorkerConfig
  ): Promise<SubstitutionResult> {
    const searchedAt = new Date();
    let candidates: SubstituteCandidate[] = [];
    let searchQuery = '';
    let sourceMethod: 'replacement_link' | 'search' | 'llm_search' = 'search';

    // ===========================================================================
    // Phase 1: Try Auchan's "Substituir" link (preferred)
    // ===========================================================================
    // Note: This requires the replacement URL to be extracted from the cart.
    // For now, we can check if the product has a known category URL.
    // Full integration requires check-availability.ts to extract the Substituir link.

    const hasReplacementUrl = false; // TODO: Extract from checkAvailabilityTool in future
    const replacementUrl = undefined; // Will come from AvailabilityResult.replacementUrl

    if (hasReplacementUrl && replacementUrl) {
      toolContext.logger.info('Trying Auchan replacement suggestions', {
        productId: unavailableItem.productId,
        productName: unavailableItem.productName,
      });

      const replacementResult = await navigateToReplacementsPageTool.execute(
        {
          productId: unavailableItem.productId,
          productName: unavailableItem.productName,
          replacementUrl: replacementUrl,
          maxResults: config.maxSubstitutesPerItem * 2,
          availableOnly: true,
          timeout: config.searchTimeout,
        },
        toolContext
      );

      if (replacementResult.success && replacementResult.data && replacementResult.data.products.length > 0) {
        candidates = replacementResult.data.products.filter(
          (p) => p.productId !== unavailableItem.productId && p.available
        );
        sourceMethod = 'replacement_link';

        toolContext.logger.info('Found candidates via replacement link', {
          productName: unavailableItem.productName,
          candidatesFound: candidates.length,
          categoryUrl: replacementResult.data.categoryUrl,
        });
      }
    }

    // ===========================================================================
    // Phase 2: Fall back to search if no replacement link or no results
    // ===========================================================================
    if (candidates.length === 0) {
      // Build search query from product name
      searchQuery = this.buildSearchQuery(unavailableItem.productName);

      toolContext.logger.info('Searching for substitutes', {
        originalName: unavailableItem.productName,
        searchQuery,
      });

      // Search for products
      const searchResult = await searchProductsTool.execute(
        {
          query: searchQuery,
          maxResults: config.maxSubstitutesPerItem * 2, // Get extra for filtering
          availableOnly: true,
          timeout: config.searchTimeout,
        },
        toolContext
      );

      if (searchResult.success && searchResult.data && searchResult.data.products.length > 0) {
        candidates = searchResult.data.products.filter(
          (p) => p.productId !== unavailableItem.productId && p.available
        );
      }

      // ===========================================================================
      // Phase 2b: LLM-powered query generation (fallback if simple search fails)
      // ===========================================================================
      if (candidates.length === 0 && this.llmEnhancer?.isAvailable()) {
        toolContext.logger.info('Simple search failed, trying LLM query generation', {
          productName: unavailableItem.productName,
          previousQuery: searchQuery,
        });

        const llmClient = this.llmEnhancer.getClient();
        if (llmClient) {
          const queryResult = await generateSearchQueries(
            {
              productName: unavailableItem.productName,
              ...(originalInput?.brand !== undefined && { brand: originalInput.brand }),
              previousQuery: searchQuery,
              previousResultCount: 0,
            },
            llmClient
          );

          // Try each LLM-generated query until we find results
          for (const llmQuery of queryResult.queries) {
            if (llmQuery === searchQuery) continue; // Skip if same as original

            toolContext.logger.info('Trying LLM-generated query', { query: llmQuery });

            const llmSearchResult = await searchProductsTool.execute(
              {
                query: llmQuery,
                maxResults: config.maxSubstitutesPerItem * 2,
                availableOnly: true,
                timeout: config.searchTimeout,
              },
              toolContext
            );

            if (llmSearchResult.success && llmSearchResult.data && llmSearchResult.data.products.length > 0) {
              candidates = llmSearchResult.data.products.filter(
                (p) => p.productId !== unavailableItem.productId && p.available
              );
              searchQuery = llmQuery;
              sourceMethod = 'llm_search';
              break;
            }
          }
        }
      }
    }

    // ===========================================================================
    // No candidates found
    // ===========================================================================
    if (candidates.length === 0) {
      toolContext.logger.info('No substitutes found', {
        productName: unavailableItem.productName,
        searchQuery,
      });

      return {
        originalProduct: {
          productId: unavailableItem.productId,
          name: unavailableItem.productName,
        },
        originalAvailability: unavailableItem.status,
        substitutes: [],
        hasSubstitutes: false,
        searchQuery,
        searchedAt,
      };
    }

    // ===========================================================================
    // Rank candidates
    // ===========================================================================
    const rankedSubstitutes = this.rankSubstitutes(
      candidates,
      unavailableItem,
      originalInput,
      config
    );

    // Take top N
    const topSubstitutes = rankedSubstitutes.slice(0, config.maxSubstitutesPerItem);

    toolContext.logger.info('Substitutes found and ranked', {
      productName: unavailableItem.productName,
      candidatesFound: candidates.length,
      topSubstitutes: topSubstitutes.length,
      sourceMethod,
    });

    return {
      originalProduct: {
        productId: unavailableItem.productId,
        name: unavailableItem.productName,
      },
      originalAvailability: unavailableItem.status,
      substitutes: topSubstitutes,
      hasSubstitutes: topSubstitutes.length > 0,
      searchQuery,
      searchedAt,
    };
  }

  /**
   * Build a search query from product name.
   * Removes brand and size to get more general results.
   */
  private buildSearchQuery(productName: string): string {
    // Remove common size patterns
    let query = productName
      .replace(/\d+(?:,\d+)?\s*(?:g|kg|ml|l|cl|un|unidades)/gi, '')
      .replace(/\d+\s*x\s*\d+/gi, '') // "6 x 33cl"
      .trim();

    // Remove extra whitespace
    query = query.replace(/\s+/g, ' ').trim();

    // If query is too short, use original name
    if (query.length < 3) {
      return productName;
    }

    return query;
  }

  /**
   * Rank substitute candidates by similarity to original.
   * If learning is enabled, applies adjustments based on user history.
   */
  private rankSubstitutes(
    candidates: SubstituteCandidate[],
    unavailableItem: AvailabilityResult,
    originalInput: InputItem | undefined,
    config: SubstitutionWorkerConfig
  ): RankedSubstitute[] {
    const originalPrice = originalInput?.unitPrice ?? 0;
    const originalBrand = originalInput?.brand?.toLowerCase();
    const originalSize = originalInput?.size?.toLowerCase();

    // Build original product info for learning
    // Use spread to conditionally include optional properties (exactOptionalPropertyTypes compliance)
    const originalProduct: OriginalProduct | undefined = originalInput
      ? {
          productId: originalInput.productId ?? unavailableItem.productId,
          name: originalInput.name,
          category: this.detectCategory(originalInput.name),
          unitPrice: originalInput.unitPrice ?? 0,
          ...(originalInput.brand !== undefined && { brand: originalInput.brand }),
          ...(originalInput.size !== undefined && { size: originalInput.size }),
        }
      : undefined;

    const ranked: RankedSubstitute[] = [];

    for (const candidate of candidates) {
      // Calculate individual scores
      const brandSimilarity = this.calculateBrandSimilarity(
        candidate.brand?.toLowerCase(),
        originalBrand
      );

      const sizeSimilarity = this.calculateSizeSimilarity(
        candidate.size?.toLowerCase(),
        originalSize
      );

      const priceSimilarity = this.calculatePriceSimilarity(
        candidate.unitPrice,
        originalPrice
      );

      const categoryMatch = this.calculateCategoryMatch(
        candidate.name.toLowerCase(),
        unavailableItem.productName.toLowerCase()
      );

      // Calculate weighted overall score (base score)
      let overall =
        brandSimilarity * config.brandWeight +
        sizeSimilarity * config.sizeWeight +
        priceSimilarity * config.priceWeight +
        categoryMatch * config.categoryWeight;

      // Apply learning adjustments if enabled
      let learningAdjustment: RankingAdjustmentResult | undefined;
      if (this.learningEnabled && originalProduct) {
        // Build candidate object with conditional optional properties (exactOptionalPropertyTypes compliance)
        const learningCandidate: LearningSubstituteCandidate = {
          productId: candidate.productId,
          name: candidate.name,
          unitPrice: candidate.unitPrice,
          baseScore: overall,
          ...(candidate.brand !== undefined && { brand: candidate.brand }),
          ...(candidate.size !== undefined && { size: candidate.size }),
        };

        learningAdjustment = adjustScore(
          learningCandidate,
          originalProduct,
          this.learningStore,
          this.learningConfig
        );

        // Use the adjusted score
        overall = learningAdjustment.adjustedScore;
      }

      const score: SubstituteScore = {
        brandSimilarity,
        sizeSimilarity,
        priceSimilarity,
        categoryMatch,
        // Include learning-based userPreference if we have adjustment
        userPreference: learningAdjustment
          ? 0.5 + learningAdjustment.totalAdjustment * 2 // Map -0.25..+0.25 to 0..1
          : undefined,
        overall,
      };

      // Generate reason for this substitute (include learning insights)
      let reason = this.generateSubstituteReason(candidate, score, originalInput);
      if (learningAdjustment && learningAdjustment.reasoning.length > 0 && learningAdjustment.confidence > 0.3) {
        const learningReason = learningAdjustment.reasoning[0];
        if (learningReason && !learningReason.includes('No learning signals')) {
          reason = `${reason}. ${learningReason}`;
        }
      }

      // Calculate price delta
      const priceDelta = candidate.unitPrice - originalPrice;

      ranked.push({
        candidate,
        score,
        reason,
        priceDelta,
      });
    }

    // Sort by overall score descending
    ranked.sort((a, b) => b.score.overall - a.score.overall);

    return ranked;
  }

  /**
   * Simple category detection from product name for learning context.
   * This is a lightweight version - full categorization would use more sophisticated methods.
   */
  private detectCategory(productName: string): string {
    const name = productName.toLowerCase();

    // Common Portuguese grocery categories
    const categoryPatterns: Array<[string, string[]]> = [
      ['dairy', ['leite', 'queijo', 'iogurte', 'manteiga', 'nata']],
      ['meat', ['carne', 'frango', 'porco', 'vaca', 'peru', 'fiambre']],
      ['fish', ['peixe', 'bacalhau', 'salmao', 'atum', 'camarao']],
      ['produce', ['fruta', 'legume', 'vegetais', 'alface', 'tomate', 'batata']],
      ['bakery', ['pao', 'bolacha', 'biscoito', 'bolo', 'croissant']],
      ['beverages', ['agua', 'sumo', 'cerveja', 'vinho', 'refrigerante', 'coca']],
      ['cleaning', ['detergente', 'lixivia', 'limpa', 'desinfetante']],
      ['hygiene', ['champô', 'shampoo', 'sabonete', 'pasta', 'dental', 'papel']],
      ['pantry', ['arroz', 'massa', 'azeite', 'oleo', 'conserva', 'molho']],
      ['snacks', ['batatas', 'chips', 'chocolate', 'doce', 'gomas']],
      ['frozen', ['congelado', 'gelado', 'frozen']],
      ['baby', ['bebé', 'bebe', 'fralda', 'papa']],
      ['pet', ['cão', 'gato', 'animal', 'ração']],
    ];

    for (const [category, keywords] of categoryPatterns) {
      for (const keyword of keywords) {
        if (name.includes(keyword)) {
          return category;
        }
      }
    }

    return 'other';
  }

  /**
   * Calculate brand similarity score.
   */
  private calculateBrandSimilarity(
    candidateBrand: string | undefined,
    originalBrand: string | undefined
  ): number {
    if (!candidateBrand || !originalBrand) {
      return 0.5; // Neutral if brand unknown
    }

    if (candidateBrand === originalBrand) {
      return 1.0; // Exact match
    }

    // Partial match (one contains the other)
    if (
      candidateBrand.includes(originalBrand) ||
      originalBrand.includes(candidateBrand)
    ) {
      return 0.7;
    }

    return 0.3; // Different brand
  }

  /**
   * Calculate size similarity score.
   */
  private calculateSizeSimilarity(
    candidateSize: string | undefined,
    originalSize: string | undefined
  ): number {
    if (!candidateSize || !originalSize) {
      return 0.5; // Neutral if size unknown
    }

    if (candidateSize === originalSize) {
      return 1.0; // Exact match
    }

    // Try to extract numeric values for comparison
    const candidateValue = this.extractNumericSize(candidateSize);
    const originalValue = this.extractNumericSize(originalSize);

    if (candidateValue !== null && originalValue !== null && originalValue > 0) {
      const ratio = candidateValue / originalValue;
      // Score based on how close the ratio is to 1
      if (ratio >= 0.9 && ratio <= 1.1) return 0.9; // Within 10%
      if (ratio >= 0.7 && ratio <= 1.3) return 0.7; // Within 30%
      if (ratio >= 0.5 && ratio <= 1.5) return 0.5; // Within 50%
      return 0.3; // Very different
    }

    // String similarity fallback
    if (
      candidateSize.includes(originalSize) ||
      originalSize.includes(candidateSize)
    ) {
      return 0.6;
    }

    return 0.3;
  }

  /**
   * Extract numeric value from size string (e.g., "500g" -> 500).
   */
  private extractNumericSize(size: string): number | null {
    // Normalize to grams/ml for comparison
    const match = size.match(/(\d+(?:,\d+)?)\s*(g|kg|ml|l|cl)/i);
    if (!match?.[1] || !match[2]) return null;

    let value = parseFloat(match[1].replace(',', '.'));
    const unit = match[2].toLowerCase();

    // Convert to base unit (g or ml)
    switch (unit) {
      case 'kg':
        value *= 1000;
        break;
      case 'l':
        value *= 1000;
        break;
      case 'cl':
        value *= 10;
        break;
    }

    return value;
  }

  /**
   * Calculate price similarity score.
   */
  private calculatePriceSimilarity(
    candidatePrice: number,
    originalPrice: number
  ): number {
    if (originalPrice === 0) {
      return 0.5; // Neutral if price unknown
    }

    if (candidatePrice === originalPrice) {
      return 1.0; // Exact match
    }

    // Calculate price ratio
    const ratio = candidatePrice / originalPrice;

    // Score based on price difference
    if (ratio <= 1.0) {
      // Cheaper or same - good
      return Math.max(0.7, 1 - (1 - ratio) * 0.5);
    }

    // More expensive - penalize
    if (ratio <= 1.1) return 0.8; // Up to 10% more
    if (ratio <= 1.2) return 0.6; // Up to 20% more
    if (ratio <= 1.3) return 0.4; // Up to 30% more
    return 0.2; // More than 30% more expensive
  }

  /**
   * Calculate category match score based on name similarity.
   */
  private calculateCategoryMatch(
    candidateName: string,
    originalName: string
  ): number {
    // Tokenize names
    const candidateTokens = new Set(
      candidateName.split(/\s+/).filter((t) => t.length > 2)
    );
    const originalTokens = new Set(
      originalName.split(/\s+/).filter((t) => t.length > 2)
    );

    if (originalTokens.size === 0) return 0.5;

    // Count matching tokens
    let matches = 0;
    for (const token of originalTokens) {
      if (candidateTokens.has(token)) {
        matches++;
      }
    }

    // Score based on overlap
    const overlapRatio = matches / originalTokens.size;

    if (overlapRatio >= 0.7) return 1.0;
    if (overlapRatio >= 0.5) return 0.8;
    if (overlapRatio >= 0.3) return 0.6;
    if (overlapRatio > 0) return 0.4;
    return 0.2;
  }

  /**
   * Generate a human-readable reason for why this substitute was chosen.
   */
  private generateSubstituteReason(
    candidate: SubstituteCandidate,
    score: SubstituteScore,
    originalInput: InputItem | undefined
  ): string {
    const reasons: string[] = [];

    // Brand
    if (score.brandSimilarity >= 0.9) {
      reasons.push('Same brand');
    } else if (score.brandSimilarity >= 0.7) {
      reasons.push('Similar brand');
    }

    // Size
    if (score.sizeSimilarity >= 0.9) {
      reasons.push('Same size');
    } else if (score.sizeSimilarity >= 0.7) {
      reasons.push('Similar size');
    }

    // Price
    if (originalInput?.unitPrice) {
      const priceDiff = candidate.unitPrice - originalInput.unitPrice;
      if (priceDiff <= 0) {
        reasons.push('Same or lower price');
      } else if (priceDiff <= originalInput.unitPrice * 0.1) {
        reasons.push('Slightly more expensive');
      }
    }

    // Category match
    if (score.categoryMatch >= 0.8) {
      reasons.push('Very similar product');
    } else if (score.categoryMatch >= 0.6) {
      reasons.push('Similar product type');
    }

    // Overall quality
    if (score.overall >= 0.8) {
      reasons.unshift('Excellent match');
    } else if (score.overall >= 0.6) {
      reasons.unshift('Good match');
    } else {
      reasons.unshift('Possible alternative');
    }

    return reasons.join('. ');
  }
}

/**
 * Create a Substitution instance with configuration.
 *
 * @param config - Worker configuration (scoring weights, timeouts, etc.)
 * @param options - Learning options (store, config, enable/disable)
 * @returns Configured Substitution instance
 *
 * @example
 * // Basic usage
 * const sub = createSubstitution();
 *
 * // With learning enabled and existing store
 * const sub = createSubstitution({}, {
 *   learningStore: loadedStore,
 *   householdId: 'family-123',
 *   enableLearning: true,
 * });
 *
 * // Disable learning
 * const sub = createSubstitution({}, { enableLearning: false });
 */
export function createSubstitution(
  config?: Partial<SubstitutionWorkerConfig>,
  options?: {
    learningStore?: SubstitutionLearningStore;
    learningConfig?: Partial<LearningConfig>;
    enableLearning?: boolean;
    householdId?: string;
  }
): Substitution {
  return new Substitution(config, options);
}
